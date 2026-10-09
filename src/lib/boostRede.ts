import type { TipoModeloCampanha } from "@/lib/meta/tipos";

export type TipoEntregaBoost = "engajamento" | "alcance" | "ambos";

export const ROTULO_ENTREGA: Record<TipoEntregaBoost, string> = {
  engajamento: "Engajamento",
  alcance: "Alcance",
  ambos: "Engajamento + Alcance",
};

export const DESCRICAO_ENTREGA: Record<TipoEntregaBoost, string> = {
  engajamento: "Foca em curtidas, comentários e salvamentos no post.",
  alcance: "Foca em mostrar o post para o maior número de pessoas diferentes.",
  ambos: "Duas campanhas no mesmo post, cada uma com o orçamento diário completo (o gasto dobra).",
};

/** Campanhas que cada tipo de entrega cria no mesmo post. */
export function modelosDaEntrega(tipo: TipoEntregaBoost): Extract<TipoModeloCampanha, "engajamento" | "alcance">[] {
  return tipo === "ambos" ? ["engajamento", "alcance"] : [tipo];
}

export interface ConfigBoostRede {
  tipoEntrega: TipoEntregaBoost;
  orcamentoDiarioCentavos: number | null;
  duracaoDias: number | null;
  boostsPorDia: number;
}

export interface RegraBoostRede {
  id: string;
  nome: string;
  dataInicio: string; // AAAA-MM-DD
  dataFim: string;
  tipoEntrega: TipoEntregaBoost;
  boostsPorDia: number | null;
}

export const CONFIG_BOOST_PADRAO: ConfigBoostRede = {
  tipoEntrega: "engajamento",
  orcamentoDiarioCentavos: null,
  duracaoDias: null,
  boostsPorDia: 1,
};

/** Regra que vale no dia `hoje` (a criada por último ganha se houver sobreposição) aplicada por
 * cima do padrão da rede. */
export function configEfetiva(
  config: ConfigBoostRede,
  regras: RegraBoostRede[],
  hoje: string
): { config: ConfigBoostRede; regra: RegraBoostRede | null } {
  const regra =
    [...regras].reverse().find((r) => r.dataInicio <= hoje && hoje <= r.dataFim) ?? null;
  if (!regra) return { config, regra: null };
  return {
    regra,
    config: {
      ...config,
      tipoEntrega: regra.tipoEntrega,
      boostsPorDia: regra.boostsPorDia ?? config.boostsPorDia,
    },
  };
}

/** Quanto UM boost custa no máximo: orçamento diário × dias de duração × campanhas no post. */
export function custoPorBoostCentavos(orcamentoDiarioCentavos: number, duracaoDias: number, tipo: TipoEntregaBoost): number {
  return orcamentoDiarioCentavos * duracaoDias * modelosDaEntrega(tipo).length;
}

/** Estimativa do mês postando todo dia: um boost novo por dia (× boosts por dia, se vários). */
export function custoMensalEstimadoCentavos(
  orcamentoDiarioCentavos: number,
  duracaoDias: number,
  tipo: TipoEntregaBoost,
  boostsPorDia: number,
  diasNoMes = 30
): number {
  return custoPorBoostCentavos(orcamentoDiarioCentavos, duracaoDias, tipo) * boostsPorDia * diasNoMes;
}
