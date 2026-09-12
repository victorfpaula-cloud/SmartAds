import type { TipoModeloCampanha } from "./tipos";

/**
 * As 5 campanhas-modelo — o coração da simplificação do SmartAds. Cada uma pré-define o que a
 * Meta cobra (objective/optimization_goal/billing_event) pra esconder as dezenas de opções que
 * ninguém mexe; só os campos realmente variáveis (público, orçamento, criativo) ficam expostos na
 * tela de criação. Nada aqui é escolha do usuário — é sempre isso, pro tipo escolhido.
 *
 * `destinationType` de "visita_perfil" e `promotedObject` de "formulario" são os dois pontos que o
 * plano original já sinalizava como precisando de validação com uma campanha de teste real antes
 * do primeiro uso em produção (a Meta não documenta o enum completo desses campos).
 */
export interface ModeloCampanha {
  tipo: TipoModeloCampanha;
  nomeExibicao: string;
  objective: string;
  optimizationGoal: string;
  billingEvent: string;
  destinationType?: string;
  permiteUsarPostExistente: boolean;
  exigeFormulario: boolean;
  exigeLink: boolean;
}

export const MODELOS_CAMPANHA: Record<TipoModeloCampanha, ModeloCampanha> = {
  engajamento: {
    tipo: "engajamento",
    nomeExibicao: "Engajamento",
    objective: "OUTCOME_ENGAGEMENT",
    optimizationGoal: "POST_ENGAGEMENT",
    billingEvent: "IMPRESSIONS",
    destinationType: "ON_POST",
    permiteUsarPostExistente: true,
    exigeFormulario: false,
    exigeLink: false,
  },
  alcance: {
    tipo: "alcance",
    nomeExibicao: "Alcance",
    objective: "OUTCOME_AWARENESS",
    optimizationGoal: "REACH",
    billingEvent: "IMPRESSIONS",
    permiteUsarPostExistente: true,
    exigeFormulario: false,
    exigeLink: false,
  },
  formulario: {
    tipo: "formulario",
    nomeExibicao: "Formulário",
    objective: "OUTCOME_LEADS",
    optimizationGoal: "LEAD_GENERATION",
    billingEvent: "IMPRESSIONS",
    permiteUsarPostExistente: false,
    exigeFormulario: true,
    exigeLink: false,
  },
  visita_perfil: {
    tipo: "visita_perfil",
    nomeExibicao: "Visita ao perfil",
    objective: "OUTCOME_ENGAGEMENT",
    optimizationGoal: "PROFILE_VISIT", // TODO: validar exato com campanha de teste (ver comentário acima)
    billingEvent: "IMPRESSIONS",
    destinationType: "INSTAGRAM_PROFILE", // TODO: validar exato com campanha de teste
    permiteUsarPostExistente: false,
    exigeFormulario: false,
    exigeLink: false,
  },
  cliques_link: {
    tipo: "cliques_link",
    nomeExibicao: "Cliques no link",
    objective: "OUTCOME_TRAFFIC",
    optimizationGoal: "LINK_CLICKS",
    billingEvent: "IMPRESSIONS",
    destinationType: "WEBSITE",
    permiteUsarPostExistente: false,
    exigeFormulario: false,
    exigeLink: true,
  },
};
