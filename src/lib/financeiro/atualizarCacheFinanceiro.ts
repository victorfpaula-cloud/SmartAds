import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  obterSaldoConta,
  obterInsightsConta,
  obterFonteDePagamento,
  obterSituacaoConta,
  somarMovimentacaoFinanceiraDesde,
  listarRecargasDesde,
} from "@/lib/meta/api";
import { diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";

const HORA_SP = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });

/** Dias que ainda faltam no mês, contando a parte de hoje que ainda não passou (o gasto do mês já inclui
 * o que foi gasto hoje até agora). */
export function diasRestantesNoMes(agora: Date): { diasNoMes: number; restantes: number } {
  const [ano, mes, dia] = diaEmSaoPaulo(agora.toISOString()).split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const [h, m] = HORA_SP.format(agora).split(":").map(Number);
  const fracaoDoDia = (h * 60 + m) / 1440;
  return { diasNoMes, restantes: Math.max(diasNoMes - dia + (1 - fracaoDoDia), 0) };
}

export interface FinanceiroCacheLinha {
  saldoDisponivelCentavos: number | null;
  faturaEmAbertoCentavos: number | null;
  fontePagamentoTexto: string | null;
  gasto7diasCentavos: number;
  mediaDiariaCentavos: number;
  projecaoMensalCentavos: number;
  /** account_status da Meta (1 = ativa); null quando não deu pra ler. */
  statusConta: number | null;
  motivoDesativacao: number | null;
  contaPrePaga: boolean | null;
  /** Gasto real do mês corrente (insights this_month). */
  gastoMesCentavos: number | null;
  /** Recargas (Pix/boleto) do mês, somadas dia a dia a partir do log de atividades da Meta. */
  recargaMesCentavos: number | null;
  recargaContadaDesde: string | null;
  recargaErro: string | null;
  erro: string | null;
  calculadoEm: string;
}

/** Soma o que entrou (recargas) e o que foi cobrado desde `desde`; falha vira erro legível em vez
 * de derrubar a conta toda. */
async function movimentacaoSegura(adAccountId: string, desde: Date, ate: Date) {
  try {
    return { ...(await somarMovimentacaoFinanceiraDesde(adAccountId, desde, ate)), erro: null as string | null };
  } catch (e) {
    return {
      totalFundingCentavos: 0,
      totalChargeCentavos: 0,
      erro: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Busca ao vivo na Meta os números financeiros de UMA conta e grava no cache
 * (smartads_financeiro_cache) — usado pelo cron diário (todas as contas, ver
 * atualizarCacheFinanceiroDeTodasAsContas) e por coletarFinanceiro.ts como fallback pontual só
 * quando uma conta nunca foi cacheada ainda (nunca numa visita repetida — cache já preenchido, mesmo
 * que velho, não dispara isso de novo).
 *
 * `saldoDisponivelCentavos` NÃO é buscado direto na Meta — ela não expõe esse número em nenhum
 * campo (ver comentários em src/lib/meta/api.ts: já tentamos balance, spend_cap e o log de
 * atividades completo, nenhum funcionou pra reconstruir do zero). Em vez disso, mantém um saldo
 * PRÓPRIO: parte do valor salvo na rodada anterior + o que entrou/saiu desde então (ledger
 * incremental, cabe na janela curta que a Meta retém). Enquanto ninguém digitar o valor inicial
 * real (ver PATCH /api/financeiro/saldo), fica `null` — nunca inventa um número de partida. */
export async function atualizarCacheFinanceiroDaConta(
  contaId: string,
  metaAdAccountId: string
): Promise<FinanceiroCacheLinha> {
  const supabase = criarClienteAdmin();
  let linha: FinanceiroCacheLinha;
  let saldoCalculadoEm: string | null = null;
  let gastoMesRef: string | null = null;

  try {
    const { data: cacheAnterior, error: erroLeitura } = await supabase
      .from("smartads_financeiro_cache")
      .select(
        "saldo_disponivel_centavos, calculado_em, saldo_calculado_em, recarga_mes_centavos, recarga_mes_ref, recarga_contada_desde, recarga_calculada_em"
      )
      .eq("conta_id", contaId)
      .maybeSingle();
    if (erroLeitura) throw new Error(`Leitura do cache falhou: ${erroLeitura.message}`);

    const agora = new Date();
    const hoje = diaEmSaoPaulo(agora.toISOString());
    const mesAtual = hoje.slice(0, 7);
    const inicioDoMes = new Date(`${mesAtual}-01T00:00:00-03:00`);
    const mesmoMes = cacheAnterior?.recarga_mes_ref === mesAtual && cacheAnterior.recarga_calculada_em;

    // Recargas do mês: a Meta só guarda ~6 dias de atividades, então o total do mês é um ledger
    // próprio — soma só o que entrou desde a última leitura e vira o mês zerando.
    const janelaRecarga = mesmoMes ? new Date(cacheAnterior!.recarga_calculada_em as string) : inicioDoMes;
    let movRecarga: { totalFundingCentavos: number; erro: string | null };
    try {
      // Só o que aconteceu até `agora`: o resto entra na próxima rodada (nunca nas duas).
      const recargas = (await listarRecargasDesde(metaAdAccountId, janelaRecarga)).filter(
        (r) => new Date(r.quando).getTime() <= agora.getTime()
      );
      movRecarga = { totalFundingCentavos: 0, erro: null };
      // Histórico permanente de aportes: cada recarga vira uma linha (única por evento) e o total do
      // mês só soma o que foi realmente gravado agora — rodar duas vezes nunca conta a mesma recarga em dobro.
      if (recargas.length > 0) {
        const { data: existentes } = await supabase
          .from("smartads_investimentos")
          .select("meta_event_key")
          .eq("conta_id", contaId)
          .in("meta_event_key", recargas.map((r) => r.chave));
        const jaGravadas = new Set((existentes ?? []).map((e) => e.meta_event_key));
        const novas = recargas.filter((r) => !jaGravadas.has(r.chave));
        if (novas.length > 0) {
          const { error: erroInsert } = await supabase.from("smartads_investimentos").insert(
            novas.map((r) => ({
              conta_id: contaId,
              data: diaEmSaoPaulo(r.quando),
              valor_centavos: r.valorCentavos,
              origem: "meta",
              meta_event_key: r.chave,
            }))
          );
          if (erroInsert) throw new Error(`Não gravei as recargas: ${erroInsert.message}`);
          movRecarga.totalFundingCentavos = novas.reduce((t, r) => t + r.valorCentavos, 0);
        }
      }
    } catch (e) {
      movRecarga = { totalFundingCentavos: 0, erro: e instanceof Error ? e.message : String(e) };
    }
    const recargaMesCentavos = movRecarga.erro
      ? mesmoMes
        ? cacheAnterior!.recarga_mes_centavos ?? null
        : null
      : (mesmoMes ? cacheAnterior!.recarga_mes_centavos ?? 0 : 0) + movRecarga.totalFundingCentavos;
    const recargaContadaDesde = mesmoMes
      ? cacheAnterior!.recarga_contada_desde ?? null
      : diaEmSaoPaulo(new Date(Math.max(inicioDoMes.getTime(), agora.getTime() - 6 * 86_400_000)).toISOString());

    // Saldo próprio (ledger a partir do valor digitado) — janela desde a última leitura do saldo.
    const saldoAnterior = cacheAnterior?.saldo_disponivel_centavos ?? null;
    let saldoIncrementalCentavos: number | null = null;
    if (saldoAnterior !== null && (cacheAnterior?.saldo_calculado_em || cacheAnterior?.calculado_em)) {
      const desdeSaldo = new Date((cacheAnterior.saldo_calculado_em ?? cacheAnterior.calculado_em) as string);
      const movSaldo = await movimentacaoSegura(metaAdAccountId, desdeSaldo, agora);
      if (movSaldo.erro) {
        // Não avança a data do saldo: a próxima rodada relê a mesma janela em vez de perder o movimento.
        saldoIncrementalCentavos = saldoAnterior;
        saldoCalculadoEm = (cacheAnterior.saldo_calculado_em ?? cacheAnterior.calculado_em) as string;
      } else {
        saldoIncrementalCentavos = saldoAnterior + movSaldo.totalFundingCentavos - movSaldo.totalChargeCentavos;
        saldoCalculadoEm = agora.toISOString();
      }
    }

    let erroFonte: string | null = null;
    const [saldo, insights, insightsMes, fonte, situacao] = await Promise.all([
      obterSaldoConta(metaAdAccountId),
      obterInsightsConta(metaAdAccountId, { nivel: "account", datePreset: "last_7d" }),
      obterInsightsConta(metaAdAccountId, { nivel: "account", datePreset: "this_month", porDia: false }).catch(
        () => null
      ),
      // Saldo que a própria Meta mostra na forma de pagamento da conta (ver FonteDePagamentoMeta).
      // Sem permissão/erro aqui, cai no saldo próprio de sempre em vez de derrubar a conta toda.
      obterFonteDePagamento(metaAdAccountId).catch((e) => {
        erroFonte = e instanceof Error ? e.message : String(e);
        return null;
      }),
      obterSituacaoConta(metaAdAccountId).catch(() => null),
    ]);
    // A Meta manda quando a conta é pré-paga e o texto traz o saldo; senão o saldo próprio
    // (valor digitado + movimentos), que nunca é inventado — fica null sem ponto de partida.
    const saldoDisponivelCentavos = fonte?.saldoDisponivelCentavos ?? saldoIncrementalCentavos;
    // Gasto dos últimos 7 dias fechados, dia a dia. A média divide só pelos dias desde o primeiro com
    // gasto: campanha com 2 dias de vida não pode ter o gasto diluído em 7.
    const diasComLinha = insights
      .filter((l) => l.date_start)
      .map((l) => ({ dia: l.date_start as string, centavos: Math.round(Number(l.spend ?? 0) * 100) }))
      .sort((a, b) => a.dia.localeCompare(b.dia));
    const gasto7diasCentavos = diasComLinha.reduce((t, d) => t + d.centavos, 0);
    const primeiroComGasto = diasComLinha.find((d) => d.centavos > 0);
    const ontem = diaEmSaoPaulo(new Date(agora.getTime() - 86_400_000).toISOString());
    const diasDeVida = primeiroComGasto
      ? Math.min(7, Math.max(1, Math.round((new Date(`${ontem}T00:00:00Z`).getTime() - new Date(`${primeiroComGasto.dia}T00:00:00Z`).getTime()) / 86_400_000) + 1))
      : 7;
    const mediaDiariaCentavos = Math.round(gasto7diasCentavos / diasDeVida);
    const gastoMesCentavos = insightsMes
      ? Math.round(insightsMes.reduce((t, l) => t + Number(l.spend ?? 0), 0) * 100)
      : null;
    gastoMesRef = gastoMesCentavos === null ? null : mesAtual;
    // Projeção do mês = o que já foi gasto + ritmo recente × o que ainda falta do mês.
    const { diasNoMes, restantes } = diasRestantesNoMes(agora);
    const projecaoMensalCentavos =
      gastoMesCentavos !== null
        ? Math.round(gastoMesCentavos + mediaDiariaCentavos * restantes)
        : Math.round(mediaDiariaCentavos * diasNoMes);
    if (fonte?.saldoDisponivelCentavos != null) saldoCalculadoEm = agora.toISOString();

    // Quando a Meta não devolve a forma de pagamento, diz o motivo provável em vez de um texto mudo.
    const semFormaDePagamento = situacao?.temFormaDePagamento === false;

    linha = {
      saldoDisponivelCentavos,
      faturaEmAbertoCentavos: saldo.faturaEmAbertoCentavos,
      fontePagamentoTexto: fonte
        ? fonte.texto ??
          (semFormaDePagamento
            ? "Conta sem forma de pagamento cadastrada na Meta"
            : "A Meta não mostra a forma de pagamento dessa conta pro login atual (confira as permissões/administração do portfólio)")
        : erroFonte
          ? `Erro ao ler da Meta: ${erroFonte}`
          : null,
      gasto7diasCentavos,
      mediaDiariaCentavos,
      projecaoMensalCentavos,
      statusConta: situacao?.status ?? null,
      motivoDesativacao: situacao?.motivoDesativacao ?? null,
      contaPrePaga: situacao?.prePaga ?? fonte?.prePaga ?? null,
      gastoMesCentavos,
      recargaMesCentavos,
      recargaContadaDesde,
      recargaErro: movRecarga.erro,
      erro: null,
      calculadoEm: agora.toISOString(),
    };
  } catch (e) {
    // Falha da Meta/banco: guarda só o motivo e preserva os números da última leitura boa (saldo
    // digitado, gasto, recargas) — nunca zera o que já estava certo.
    const mensagem = e instanceof Error ? e.message : "Falha ao buscar dados financeiros na Meta.";
    await supabase.from("smartads_financeiro_cache").upsert({ conta_id: contaId, erro: mensagem });
    return {
      saldoDisponivelCentavos: null,
      faturaEmAbertoCentavos: null,
      fontePagamentoTexto: null,
      gasto7diasCentavos: 0,
      mediaDiariaCentavos: 0,
      projecaoMensalCentavos: 0,
      statusConta: null,
      motivoDesativacao: null,
      contaPrePaga: null,
      gastoMesCentavos: null,
      recargaMesCentavos: null,
      recargaContadaDesde: null,
      recargaErro: null,
      erro: mensagem,
      calculadoEm: new Date().toISOString(),
    };
  }

  const { error: erroGravar } = await supabase.from("smartads_financeiro_cache").upsert({
    conta_id: contaId,
    saldo_disponivel_centavos: linha.saldoDisponivelCentavos,
    saldo_calculado_em: saldoCalculadoEm,
    fatura_em_aberto_centavos: linha.faturaEmAbertoCentavos,
    fonte_pagamento_texto: linha.fontePagamentoTexto,
    gasto_7d_centavos: linha.gasto7diasCentavos,
    media_diaria_centavos: linha.mediaDiariaCentavos,
    projecao_mensal_centavos: linha.projecaoMensalCentavos,
    status_conta: linha.statusConta,
    motivo_desativacao: linha.motivoDesativacao,
    conta_pre_paga: linha.contaPrePaga,
    gasto_mes_centavos: linha.gastoMesCentavos,
    gasto_mes_ref: gastoMesRef,
    // Mês novo com erro na leitura de recargas: zera a referência pra o mês anterior não vazar pro novo.
    ...(linha.recargaErro && linha.recargaMesCentavos === null
      ? { recarga_mes_centavos: null, recarga_mes_ref: null, recarga_calculada_em: null }
      : {
          recarga_mes_centavos: linha.recargaMesCentavos,
          recarga_mes_ref: diaEmSaoPaulo(linha.calculadoEm).slice(0, 7),
          recarga_contada_desde: linha.recargaContadaDesde,
          ...(linha.recargaErro ? {} : { recarga_calculada_em: linha.calculadoEm }),
        }),
    recarga_erro: linha.recargaErro,
    erro: null,
    calculado_em: linha.calculadoEm,
  });
  if (erroGravar) console.error("[financeiro] falha ao gravar o cache", contaId, erroGravar.message);

  return linha;
}

/** Recalcula o cache de TODAS as contas ativas — chamado 1x/dia pelo cron (ver
 * /api/cron/financeiro e vercel.json). Uma conta com erro individual (token revogado, conta
 * pausada) não derruba as outras. */
export async function atualizarCacheFinanceiroDeTodasAsContas(): Promise<{ contasAtualizadas: number }> {
  const supabase = criarClienteAdmin();
  const { data: contas } = await supabase
    .from("smartads_contas_meta")
    .select("id, meta_ad_account_id")
    .eq("ativo", true);

  const resultados = await Promise.allSettled(
    (contas ?? []).map((conta) => atualizarCacheFinanceiroDaConta(conta.id, conta.meta_ad_account_id))
  );

  return { contasAtualizadas: resultados.filter((r) => r.status === "fulfilled").length };
}

/** Grava o saldo disponível digitado à mão — seed inicial (primeira vez, sem cache nenhum ainda)
 * ou correção manual (algo saiu do previsto: reembolso, cupom, cobrança fora do padrão). A partir
 * daqui o ledger incremental (atualizarCacheFinanceiroDaConta) continua sozinho, somando só o que
 * mudar dali pra frente. */
export async function definirSaldoDisponivelManual(contaId: string, saldoCentavos: number): Promise<void> {
  const supabase = criarClienteAdmin();
  await supabase.from("smartads_financeiro_cache").upsert(
    {
      conta_id: contaId,
      saldo_disponivel_centavos: saldoCentavos,
      // O ledger passa a contar movimento só a partir de agora; o "atualizado em" do cache não muda.
      saldo_calculado_em: new Date().toISOString(),
    },
    { onConflict: "conta_id", ignoreDuplicates: false }
  );
}
