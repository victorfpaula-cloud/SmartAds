import { criarClienteAdmin } from "@/lib/supabase/admin";
import { diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import {
  CONFIG_BOOST_PADRAO,
  configEfetiva,
  type ConfigBoostRede,
  type RegraBoostRede,
  type TipoEntregaBoost,
} from "@/lib/boostRede";

/** Padrão da rede + regras de uma empresa, já no formato do app. */
export async function carregarBoostDaRede(empresaId: string): Promise<{ config: ConfigBoostRede; regras: RegraBoostRede[] }> {
  const supabase = criarClienteAdmin();
  const [{ data: bruta }, { data: regras }] = await Promise.all([
    supabase.from("smartads_boost_rede_config").select("*").eq("empresa_id", empresaId).maybeSingle(),
    supabase
      .from("smartads_boost_rede_regras")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("data_inicio", { ascending: true }),
  ]);
  return {
    config: bruta
      ? {
          tipoEntrega: bruta.tipo_entrega as TipoEntregaBoost,
          orcamentoDiarioCentavos: bruta.orcamento_diario_centavos,
          duracaoDias: bruta.duracao_dias,
          boostsPorDia: bruta.boosts_por_dia,
        }
      : CONFIG_BOOST_PADRAO,
    regras: (regras ?? []).map((r) => ({
      id: r.id,
      nome: r.nome,
      dataInicio: r.data_inicio,
      dataFim: r.data_fim,
      tipoEntrega: r.tipo_entrega as TipoEntregaBoost,
      boostsPorDia: r.boosts_por_dia,
    })),
  };
}

export async function boostEfetivoDaConta(contaId: string) {
  const { data: conta } = await criarClienteAdmin()
    .from("smartads_contas_meta")
    .select("smartads_clientes(empresa_id)")
    .eq("id", contaId)
    .maybeSingle();
  const rel = (conta as any)?.smartads_clientes;
  const empresaId: string | null = (Array.isArray(rel) ? rel[0] : rel)?.empresa_id ?? null;
  if (!empresaId) return { empresaId: null, ...configEfetiva(CONFIG_BOOST_PADRAO, [], "") };
  const { config, regras } = await carregarBoostDaRede(empresaId);
  return { empresaId, ...configEfetiva(config, regras, diaEmSaoPaulo(new Date().toISOString())) };
}
