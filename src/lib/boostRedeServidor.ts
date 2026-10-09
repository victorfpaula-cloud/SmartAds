import { criarClienteAdmin } from "@/lib/supabase/admin";
import { diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import { configEfetiva, type ConfigBoostRede, type RegraBoostRede, type TipoEntregaBoost } from "@/lib/boostRede";

/** Linha da conta (colunas boost_*) → configuração do boost dessa conta. */
export function configDaConta(conta: {
  boost_tipo_entrega?: string | null;
  boost_automatico_orcamento_centavos?: number | null;
  boost_automatico_duracao_dias?: number | null;
  boost_posts_por_dia?: number | null;
}): ConfigBoostRede {
  return {
    tipoEntrega: (conta.boost_tipo_entrega as TipoEntregaBoost) || "engajamento",
    orcamentoDiarioCentavos: conta.boost_automatico_orcamento_centavos ?? null,
    duracaoDias: conta.boost_automatico_duracao_dias ?? 3,
    boostsPorDia: conta.boost_posts_por_dia ?? 1,
  };
}

export function regraDeLinha(r: any): RegraBoostRede {
  return {
    id: r.id,
    nome: r.nome,
    dataInicio: r.data_inicio,
    dataFim: r.data_fim,
    tipoEntrega: r.tipo_entrega as TipoEntregaBoost,
    boostsPorDia: r.boosts_por_dia,
  };
}

/** Datas especiais de UMA conta. */
export async function carregarRegrasDaConta(contaId: string): Promise<RegraBoostRede[]> {
  const { data } = await criarClienteAdmin()
    .from("smartads_boost_rede_regras")
    .select("*")
    .eq("conta_id", contaId)
    .order("data_inicio", { ascending: true });
  return (data ?? []).map(regraDeLinha);
}

/** Boost que vale HOJE pra uma conta (config da conta + data especial em vigor). */
export async function boostEfetivoDaConta(contaId: string) {
  const { data: conta } = await criarClienteAdmin().from("smartads_contas_meta").select("*").eq("id", contaId).maybeSingle();
  const regras = await carregarRegrasDaConta(contaId);
  return configEfetiva(conta ? configDaConta(conta) : configDaConta({}), regras, diaEmSaoPaulo(new Date().toISOString()));
}
