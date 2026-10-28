import { criarClienteAdmin } from "@/lib/supabase/admin";
import { atualizarCacheFinanceiroDaConta, diasRestantesNoMes } from "@/lib/financeiro/atualizarCacheFinanceiro";
import { diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";

export interface ContaFinanceiro {
  contaId: string;
  contaNome: string;
  clienteId: string;
  clienteNome: string;
  empresaId: string | null;
  empresaNome: string;
  empresaTipo: "individual" | "franquia" | null;
  metaAdAccountId: string;
  saldoDisponivelCentavos: number | null;
  faturaEmAbertoCentavos: number | null;
  fontePagamentoTexto: string | null;
  gasto7diasCentavos: number;
  mediaDiariaCentavos: number;
  projecaoMensalCentavos: number;
  investimentoPlanejadoCentavos: number;
  ajusteOrcamentoSugeridoCentavos: number;
  linkAdicionarCredito: string;
  atualizadoEm: string | null;
  erro: string | null;
  statusConta: number | null;
  motivoDesativacao: number | null;
  contaPrePaga: boolean | null;
  gastoMesCentavos: number | null;
  recargaMesCentavos: number | null;
  recargaContadaDesde: string | null;
  recargaErro: string | null;
  orcamentoMensalCentavos: number;
  boostAutomaticoAtivo: boolean;
  boostOrcamentoDiarioCentavos: number | null;
  boostDuracaoDias: number;
  /** Quantos posts por dia o boost pode turbinar (1 a 10; 10 = todos). */
  boostPostsPorDia: number;
  /** 1 (engajamento ou alcance) ou 2 (as duas campanhas no mesmo post). */
  boostCampanhasPorPost: number;
}

/** Duas contas locais podem apontar pra MESMA conta de anúncio na Meta (ex.: a conta geral da rede
 * cadastrada em dois clientes) — nos totais ela só pode contar uma vez. */
export function unicasPorContaDeAnuncio(contas: ContaFinanceiro[]): ContaFinanceiro[] {
  // Entre duas contas locais da mesma conta de anúncio, fica a que tem mais informação (saldo conhecido,
  // sem erro, leitura mais recente) — não simplesmente a primeira da lista.
  const nota = (c: ContaFinanceiro) =>
    (c.saldoDisponivelCentavos !== null ? 4 : 0) + (c.erro ? 0 : 2) + (c.atualizadoEm ? 1 : 0);
  const melhor = new Map<string, ContaFinanceiro>();
  for (const c of contas) {
    const atual = melhor.get(c.metaAdAccountId);
    if (!atual || nota(c) > nota(atual) || (nota(c) === nota(atual) && (c.atualizadoEm ?? "") > (atual.atualizadoEm ?? ""))) {
      melhor.set(c.metaAdAccountId, c);
    }
  }
  return contas.filter((c) => melhor.get(c.metaAdAccountId) === c);
}

export interface PlanejamentoConta {
  /** Teto do que o boost pode gastar no mês: custo de um boost × posts por dia × dias do mês. */
  boostReservadoMensalCentavos: number;
}

/** Planejamento do mês por conta, em cima do que já está no cache (sem bater na Meta). "Boost reservado"
 * é um teto: assume um boost novo todo dia, com o limite de posts por dia configurado na conta (10 =
 * "todos" conta como 3, pra não inflar). */
export function calcularPlanejamento(conta: ContaFinanceiro, hoje: Date = new Date()): PlanejamentoConta {
  const { diasNoMes } = diasRestantesNoMes(hoje);
  // Cada boost é uma campanha de `orçamento diário × duração` (3 ou 7 dias) por campanha criada no post.
  const orcamentoDiarioBoost = conta.boostAutomaticoAtivo ? conta.boostOrcamentoDiarioCentavos ?? 0 : 0;
  const custoPorBoost = orcamentoDiarioBoost * (conta.boostDuracaoDias || 3) * (conta.boostCampanhasPorPost || 1);
  const postsPorDia = Math.min(conta.boostPostsPorDia || 1, 3);
  return { boostReservadoMensalCentavos: custoPorBoost * postsPorDia * diasNoMes };
}

/** Junta o financeiro de cada conta ativa: saldo (disponível ou fatura em aberto, ver
 * SaldoContaMeta em src/lib/meta/api.ts) e ritmo de gasto dos últimos 7 dias, direto do cache
 * calculado 1x/dia (smartads_financeiro_cache) — NUNCA bate na Meta ao vivo numa visita normal à
 * tela, só quando a conta nunca foi cacheada nem uma vez (conta recém-cadastrada, antes do cron
 * rodar pela primeira vez). Também soma quanto já está planejado mas ainda não começou a gastar
 * (etapas de Plano de Execução aguardando + ajustes de orçamento sugeridos pelo Diagnóstico ainda
 * não decididos) — isso sim é sempre ao vivo, é consulta só no Supabase, não na Meta. */
export async function coletarFinanceiro(empresaId?: string): Promise<ContaFinanceiro[]> {
  const supabase = criarClienteAdmin();

  let consultaClientes = supabase
    .from("smartads_clientes")
    .select("id, nome, ativo, smartads_empresas(id, nome, tipo), smartads_contas_meta(*)")
    .eq("ativo", true)
    .order("nome");
  if (empresaId) consultaClientes = consultaClientes.eq("empresa_id", empresaId);

  const [{ data: clientes }, { data: cache }] = await Promise.all([
    consultaClientes,
    supabase
      .from("smartads_financeiro_cache")
      .select(
        "conta_id, saldo_disponivel_centavos, fatura_em_aberto_centavos, fonte_pagamento_texto, gasto_7d_centavos, media_diaria_centavos, projecao_mensal_centavos, erro, calculado_em, status_conta, motivo_desativacao, conta_pre_paga, gasto_mes_centavos, gasto_mes_ref, recarga_mes_centavos, recarga_mes_ref, recarga_contada_desde, recarga_erro"
      ),
  ]);

  const contas = (clientes ?? []).flatMap((cliente: any) =>
    ((cliente.smartads_contas_meta ?? []) as any[])
      .filter((c) => c.ativo)
      .map((conta) => ({ cliente, conta }))
  );

  const cachePorConta = new Map((cache ?? []).map((linha) => [linha.conta_id, linha]));
  const mesAtualSP = diaEmSaoPaulo(new Date().toISOString()).slice(0, 7);

  // Investimento planejado ainda não iniciado: soma, por conta, de investimento_total_centavos *
  // percentual_orcamento/100 de cada etapa de Plano de Execução que ainda não terminou.
  const { data: etapasPendentes } = await supabase
    .from("smartads_plano_etapas")
    .select(
      "status, smartads_planos_execucao(conta_id, investimento_total_centavos), smartads_estrategia_etapas(percentual_orcamento)"
    )
    .in("status", ["aguardando", "pronta_para_disparar", "aguardando_admin"]);

  const planejadoPorConta = new Map<string, number>();
  for (const etapa of (etapasPendentes ?? []) as any[]) {
    const plano = etapa.smartads_planos_execucao;
    const estrategiaEtapa = etapa.smartads_estrategia_etapas;
    if (!plano || !estrategiaEtapa) continue;
    const valor = Math.round((plano.investimento_total_centavos * estrategiaEtapa.percentual_orcamento) / 100);
    planejadoPorConta.set(plano.conta_id, (planejadoPorConta.get(plano.conta_id) ?? 0) + valor);
  }

  // Ajustes de orçamento que o Diagnóstico sugeriu e ainda não foram decididos (aprovar aplica na
  // hora, então só "pendente" representa dinheiro que ainda pode vir a sair ou não).
  const { data: sugestoesPendentes } = await supabase
    .from("smartads_sugestoes")
    .select("conta_id, dados")
    .eq("status", "pendente")
    .eq("tipo", "ajustar_orcamento");

  const ajustePorConta = new Map<string, number>();
  for (const s of sugestoesPendentes ?? []) {
    if (!s.conta_id) continue;
    const valor = Number((s.dados as any)?.valorCentavos ?? 0);
    if (!valor) continue;
    ajustePorConta.set(s.conta_id, (ajustePorConta.get(s.conta_id) ?? 0) + valor);
  }

  return Promise.all(
    contas.map(async ({ cliente, conta }): Promise<ContaFinanceiro> => {
      const idNumerico = conta.meta_ad_account_id.replace(/^act_/, "");
      let linhaCache = cachePorConta.get(conta.id);

      // Só bate na Meta aqui se essa conta NUNCA foi cacheada — depois disso é sempre o cron que
      // atualiza (ver atualizarCacheFinanceiro.ts), mesmo que o cache esteja com um dia de idade.
      if (!linhaCache) {
        const resultado = await atualizarCacheFinanceiroDaConta(conta.id, conta.meta_ad_account_id);
        linhaCache = {
          conta_id: conta.id,
          saldo_disponivel_centavos: resultado.saldoDisponivelCentavos,
          fatura_em_aberto_centavos: resultado.faturaEmAbertoCentavos,
          fonte_pagamento_texto: resultado.fontePagamentoTexto,
          gasto_7d_centavos: resultado.gasto7diasCentavos,
          media_diaria_centavos: resultado.mediaDiariaCentavos,
          projecao_mensal_centavos: resultado.projecaoMensalCentavos,
          erro: resultado.erro,
          calculado_em: resultado.calculadoEm,
          status_conta: resultado.statusConta,
          motivo_desativacao: resultado.motivoDesativacao,
          conta_pre_paga: resultado.contaPrePaga,
          gasto_mes_centavos: resultado.gastoMesCentavos,
          gasto_mes_ref: resultado.gastoMesCentavos !== null ? mesAtualSP : null,
          recarga_mes_ref: mesAtualSP,
          recarga_mes_centavos: resultado.recargaMesCentavos,
          recarga_contada_desde: resultado.recargaContadaDesde,
          recarga_erro: resultado.recargaErro,
        };
      }

      return {
        contaId: conta.id,
        contaNome: conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id,
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        empresaId: cliente.smartads_empresas?.id ?? null,
        empresaNome: cliente.smartads_empresas?.nome ?? "—",
        empresaTipo: cliente.smartads_empresas?.tipo ?? null,
        metaAdAccountId: conta.meta_ad_account_id,
        saldoDisponivelCentavos: linhaCache.saldo_disponivel_centavos ?? null,
        faturaEmAbertoCentavos: linhaCache.fatura_em_aberto_centavos ?? null,
        fontePagamentoTexto: linhaCache.fonte_pagamento_texto ?? null,
        gasto7diasCentavos: linhaCache.gasto_7d_centavos ?? 0,
        mediaDiariaCentavos: linhaCache.media_diaria_centavos ?? 0,
        projecaoMensalCentavos: linhaCache.projecao_mensal_centavos ?? 0,
        investimentoPlanejadoCentavos: planejadoPorConta.get(conta.id) ?? 0,
        ajusteOrcamentoSugeridoCentavos: ajustePorConta.get(conta.id) ?? 0,
        // Não existe API pública da Meta pra criar a cobrança Pix por fora — quem gera o QR code é
        // o próprio Gerenciador de Anúncios. Esse link já abre direto na tela de faturamento da
        // conta certa (onde "Fundos" também aparece), poupando o trabalho de achar a conta certa
        // entre várias.
        linkAdicionarCredito: `https://www.facebook.com/ads/manager/account_settings/account_billing/?act=${idNumerico}`,
        atualizadoEm: linhaCache.calculado_em ?? null,
        erro: linhaCache.erro ?? null,
        statusConta: linhaCache.status_conta ?? null,
        motivoDesativacao: linhaCache.motivo_desativacao ?? null,
        contaPrePaga: linhaCache.conta_pre_paga ?? null,
        // Número de mês só vale se for do mês corrente (entre a virada do mês e o cron, ainda é o do mês passado).
        gastoMesCentavos: linhaCache.gasto_mes_ref === mesAtualSP ? linhaCache.gasto_mes_centavos ?? null : null,
        recargaMesCentavos: linhaCache.recarga_mes_ref === mesAtualSP ? linhaCache.recarga_mes_centavos ?? null : null,
        recargaContadaDesde: linhaCache.recarga_contada_desde ?? null,
        recargaErro: linhaCache.recarga_erro ?? null,
        orcamentoMensalCentavos: conta.orcamento_mensal_centavos ?? 50000,
        boostAutomaticoAtivo: Boolean(conta.boost_automatico_ativo),
        boostOrcamentoDiarioCentavos: conta.boost_automatico_orcamento_centavos ?? null,
        boostDuracaoDias: conta.boost_automatico_duracao_dias ?? 3,
        boostPostsPorDia: conta.boost_posts_por_dia ?? 1,
        boostCampanhasPorPost: conta.boost_tipo_entrega === "ambos" ? 2 : 1,
      };
    })
  );
}
