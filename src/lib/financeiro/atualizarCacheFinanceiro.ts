import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterSaldoConta, obterInsightsConta } from "@/lib/meta/api";

export interface FinanceiroCacheLinha {
  saldoDisponivelCentavos: number | null;
  faturaEmAbertoCentavos: number | null;
  gasto7diasCentavos: number;
  mediaDiariaCentavos: number;
  projecaoMensalCentavos: number;
  erro: string | null;
  calculadoEm: string;
}

/** Busca ao vivo na Meta os números financeiros de UMA conta e grava no cache
 * (smartads_financeiro_cache) — usado pelo cron diário (todas as contas, ver
 * atualizarCacheFinanceiroDeTodasAsContas) e por coletarFinanceiro.ts como fallback pontual só
 * quando uma conta nunca foi cacheada ainda (nunca numa visita repetida — cache já preenchido, mesmo
 * que velho, não dispara isso de novo). */
export async function atualizarCacheFinanceiroDaConta(
  contaId: string,
  metaAdAccountId: string
): Promise<FinanceiroCacheLinha> {
  const supabase = criarClienteAdmin();
  let linha: FinanceiroCacheLinha;

  try {
    const [saldo, insights] = await Promise.all([
      obterSaldoConta(metaAdAccountId),
      obterInsightsConta(metaAdAccountId, { nivel: "account", datePreset: "last_7d", porDia: false }),
    ]);
    const spend7dReais = Number(insights[0]?.spend ?? 0);
    const gasto7diasCentavos = Math.round(spend7dReais * 100);
    const mediaDiariaCentavos = Math.round(gasto7diasCentavos / 7);

    linha = {
      saldoDisponivelCentavos: saldo.saldoDisponivelCentavos,
      faturaEmAbertoCentavos: saldo.faturaEmAbertoCentavos,
      gasto7diasCentavos,
      mediaDiariaCentavos,
      projecaoMensalCentavos: mediaDiariaCentavos * 30,
      erro: null,
      calculadoEm: new Date().toISOString(),
    };
  } catch (e) {
    linha = {
      saldoDisponivelCentavos: null,
      faturaEmAbertoCentavos: null,
      gasto7diasCentavos: 0,
      mediaDiariaCentavos: 0,
      projecaoMensalCentavos: 0,
      erro: e instanceof Error ? e.message : "Falha ao buscar dados financeiros na Meta.",
      calculadoEm: new Date().toISOString(),
    };
  }

  await supabase.from("smartads_financeiro_cache").upsert({
    conta_id: contaId,
    saldo_disponivel_centavos: linha.saldoDisponivelCentavos,
    fatura_em_aberto_centavos: linha.faturaEmAbertoCentavos,
    gasto_7d_centavos: linha.gasto7diasCentavos,
    media_diaria_centavos: linha.mediaDiariaCentavos,
    projecao_mensal_centavos: linha.projecaoMensalCentavos,
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
