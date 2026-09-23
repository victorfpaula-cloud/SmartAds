import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterSaldoConta, obterInsightsConta } from "@/lib/meta/api";

export interface ContaFinanceiro {
  contaId: string;
  contaNome: string;
  clienteId: string;
  clienteNome: string;
  empresaNome: string;
  metaAdAccountId: string;
  saldoCentavos: number | null;
  gasto7diasCentavos: number;
  mediaDiariaCentavos: number;
  projecaoMensalCentavos: number;
  diasRestantes: number | null;
  investimentoPlanejadoCentavos: number;
  ajusteOrcamentoSugeridoCentavos: number;
  linkAdicionarCredito: string;
  erro: string | null;
}

/** Junta o financeiro de cada conta ativa: saldo direto da Meta (o crédito de cada unidade cai
 * na própria conta dela lá, via Pix feito no Gerenciador de Anúncios — não existe "caixa" nosso
 * pra manter em sincronia), ritmo de gasto real dos últimos 7 dias, e quanto já está planejado
 * pra sair mas ainda não começou a gastar (etapas de Plano de Execução aguardando + ajustes de
 * orçamento sugeridos pelo Diagnóstico ainda não decididos). `saldoCentavos` vem `null` quando a
 * conta não é pré-paga na Meta (aí não existe esse conceito) — não é erro. */
export async function coletarFinanceiro(): Promise<ContaFinanceiro[]> {
  const supabase = criarClienteAdmin();

  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select("id, nome, ativo, smartads_empresas(nome), smartads_contas_meta(*)")
    .eq("ativo", true)
    .order("nome");

  const contas = (clientes ?? []).flatMap((cliente: any) =>
    ((cliente.smartads_contas_meta ?? []) as any[])
      .filter((c) => c.ativo)
      .map((conta) => ({ cliente, conta }))
  );

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
      let saldoCentavos: number | null = null;
      let spend7dReais = 0;
      let erro: string | null = null;

      try {
        const [saldo, insights] = await Promise.all([
          obterSaldoConta(conta.meta_ad_account_id),
          obterInsightsConta(conta.meta_ad_account_id, { nivel: "account", datePreset: "last_7d", porDia: false }),
        ]);
        saldoCentavos = saldo.saldoCentavos;
        spend7dReais = Number(insights[0]?.spend ?? 0);
      } catch (e) {
        erro = e instanceof Error ? e.message : "Falha ao buscar dados financeiros na Meta.";
      }

      const gasto7diasCentavos = Math.round(spend7dReais * 100);
      const mediaDiariaCentavos = Math.round(gasto7diasCentavos / 7);
      const projecaoMensalCentavos = mediaDiariaCentavos * 30;
      const diasRestantes =
        saldoCentavos != null && mediaDiariaCentavos > 0 ? Math.floor(saldoCentavos / mediaDiariaCentavos) : null;

      return {
        contaId: conta.id,
        contaNome: conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id,
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        empresaNome: cliente.smartads_empresas?.nome ?? "—",
        metaAdAccountId: conta.meta_ad_account_id,
        saldoCentavos,
        gasto7diasCentavos,
        mediaDiariaCentavos,
        projecaoMensalCentavos,
        diasRestantes,
        investimentoPlanejadoCentavos: planejadoPorConta.get(conta.id) ?? 0,
        ajusteOrcamentoSugeridoCentavos: ajustePorConta.get(conta.id) ?? 0,
        // Não existe API pública da Meta pra criar a cobrança Pix por fora — quem gera o QR code é
        // o próprio Gerenciador de Anúncios. Esse link já abre direto na tela de faturamento da
        // conta certa, então poupa o trabalho de achar a conta certa entre várias.
        linkAdicionarCredito: `https://www.facebook.com/ads/manager/account_settings/account_billing/?act=${idNumerico}`,
        erro,
      };
    })
  );
}
