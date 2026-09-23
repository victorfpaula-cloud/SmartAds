import { criarClienteAdmin } from "@/lib/supabase/admin";
import { atualizarCacheFinanceiroDaConta } from "@/lib/financeiro/atualizarCacheFinanceiro";

export interface ContaFinanceiro {
  contaId: string;
  contaNome: string;
  clienteId: string;
  clienteNome: string;
  empresaNome: string;
  metaAdAccountId: string;
  saldoDisponivelCentavos: number | null;
  faturaEmAbertoCentavos: number | null;
  gasto7diasCentavos: number;
  mediaDiariaCentavos: number;
  projecaoMensalCentavos: number;
  investimentoPlanejadoCentavos: number;
  ajusteOrcamentoSugeridoCentavos: number;
  linkAdicionarCredito: string;
  atualizadoEm: string | null;
  erro: string | null;
}

/** Junta o financeiro de cada conta ativa: saldo (disponível ou fatura em aberto, ver
 * SaldoContaMeta em src/lib/meta/api.ts) e ritmo de gasto dos últimos 7 dias, direto do cache
 * calculado 1x/dia (smartads_financeiro_cache) — NUNCA bate na Meta ao vivo numa visita normal à
 * tela, só quando a conta nunca foi cacheada nem uma vez (conta recém-cadastrada, antes do cron
 * rodar pela primeira vez). Também soma quanto já está planejado mas ainda não começou a gastar
 * (etapas de Plano de Execução aguardando + ajustes de orçamento sugeridos pelo Diagnóstico ainda
 * não decididos) — isso sim é sempre ao vivo, é consulta só no Supabase, não na Meta. */
export async function coletarFinanceiro(): Promise<ContaFinanceiro[]> {
  const supabase = criarClienteAdmin();

  const [{ data: clientes }, { data: cache }] = await Promise.all([
    supabase
      .from("smartads_clientes")
      .select("id, nome, ativo, smartads_empresas(nome), smartads_contas_meta(*)")
      .eq("ativo", true)
      .order("nome"),
    supabase.from("smartads_financeiro_cache").select("*"),
  ]);

  const contas = (clientes ?? []).flatMap((cliente: any) =>
    ((cliente.smartads_contas_meta ?? []) as any[])
      .filter((c) => c.ativo)
      .map((conta) => ({ cliente, conta }))
  );

  const cachePorConta = new Map((cache ?? []).map((linha) => [linha.conta_id, linha]));

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
          gasto_7d_centavos: resultado.gasto7diasCentavos,
          media_diaria_centavos: resultado.mediaDiariaCentavos,
          projecao_mensal_centavos: resultado.projecaoMensalCentavos,
          erro: resultado.erro,
          calculado_em: resultado.calculadoEm,
        };
      }

      return {
        contaId: conta.id,
        contaNome: conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id,
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        empresaNome: cliente.smartads_empresas?.nome ?? "—",
        metaAdAccountId: conta.meta_ad_account_id,
        saldoDisponivelCentavos: linhaCache.saldo_disponivel_centavos ?? null,
        faturaEmAbertoCentavos: linhaCache.fatura_em_aberto_centavos ?? null,
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
      };
    })
  );
}
