import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  obterSaldoConta,
  obterInsightsConta,
  obterFonteDePagamento,
  obterSituacaoConta,
  somarMovimentacaoFinanceiraDesde,
} from "@/lib/meta/api";
import { diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";

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
async function movimentacaoSegura(adAccountId: string, desde: Date) {
  try {
    return { ...(await somarMovimentacaoFinanceiraDesde(adAccountId, desde)), erro: null as string | null };
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

  try {
    const { data: cacheAnterior } = await supabase
      .from("smartads_financeiro_cache")
      .select(
        "saldo_disponivel_centavos, calculado_em, recarga_mes_centavos, recarga_mes_ref, recarga_contada_desde, recarga_calculada_em"
      )
      .eq("conta_id", contaId)
      .maybeSingle();

    const agora = new Date();
    const hoje = diaEmSaoPaulo(agora.toISOString());
    const mesAtual = hoje.slice(0, 7);
    const inicioDoMes = new Date(`${mesAtual}-01T00:00:00-03:00`);
    const mesmoMes = cacheAnterior?.recarga_mes_ref === mesAtual && cacheAnterior.recarga_calculada_em;

    // Recargas do mês: a Meta só guarda ~6 dias de atividades, então o total do mês é um ledger
    // próprio — soma só o que entrou desde a última leitura e vira o mês zerando.
    const movRecarga = await movimentacaoSegura(
      metaAdAccountId,
      mesmoMes ? new Date(cacheAnterior!.recarga_calculada_em as string) : inicioDoMes
    );
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
    if (saldoAnterior !== null && cacheAnterior?.calculado_em) {
      const movSaldo = await movimentacaoSegura(metaAdAccountId, new Date(cacheAnterior.calculado_em));
      saldoIncrementalCentavos = movSaldo.erro
        ? saldoAnterior
        : saldoAnterior + movSaldo.totalFundingCentavos - movSaldo.totalChargeCentavos;
    }

    let erroFonte: string | null = null;
    const [saldo, insights, insightsMes, fonte, situacao] = await Promise.all([
      obterSaldoConta(metaAdAccountId),
      obterInsightsConta(metaAdAccountId, { nivel: "account", datePreset: "last_7d", porDia: false }),
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
    const spend7dReais = Number(insights[0]?.spend ?? 0);
    const gasto7diasCentavos = Math.round(spend7dReais * 100);
    const mediaDiariaCentavos = Math.round(gasto7diasCentavos / 7);
    const gastoMesCentavos = insightsMes ? Math.round(Number(insightsMes[0]?.spend ?? 0) * 100) : null;

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
      projecaoMensalCentavos: mediaDiariaCentavos * 30,
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
    linha = {
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
      erro: e instanceof Error ? e.message : "Falha ao buscar dados financeiros na Meta.",
      calculadoEm: new Date().toISOString(),
    };
  }

  await supabase.from("smartads_financeiro_cache").upsert({
    conta_id: contaId,
    saldo_disponivel_centavos: linha.saldoDisponivelCentavos,
    fatura_em_aberto_centavos: linha.faturaEmAbertoCentavos,
    fonte_pagamento_texto: linha.fontePagamentoTexto,
    gasto_7d_centavos: linha.gasto7diasCentavos,
    media_diaria_centavos: linha.mediaDiariaCentavos,
    projecao_mensal_centavos: linha.projecaoMensalCentavos,
    status_conta: linha.statusConta,
    motivo_desativacao: linha.motivoDesativacao,
    conta_pre_paga: linha.contaPrePaga,
    gasto_mes_centavos: linha.gastoMesCentavos,
    ...(linha.erro
      ? {}
      : {
          recarga_mes_centavos: linha.recargaMesCentavos,
          recarga_mes_ref: diaEmSaoPaulo(linha.calculadoEm).slice(0, 7),
          recarga_contada_desde: linha.recargaContadaDesde,
          recarga_calculada_em: linha.recargaErro ? undefined : linha.calculadoEm,
        }),
    recarga_erro: linha.recargaErro,
    erro: linha.erro,
    calculado_em: linha.calculadoEm,
  });

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
      calculado_em: new Date().toISOString(),
    },
    { onConflict: "conta_id", ignoreDuplicates: false }
  );
}
