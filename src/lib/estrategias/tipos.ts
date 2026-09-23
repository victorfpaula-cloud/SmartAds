// Tipos do domínio de Estratégias (moldes reutilizáveis) e Planos de Execução (aplicação de um
// molde numa unidade/conta) — compartilhados entre telas e rotas de API.

import type { TipoModeloCampanha, Publico } from "@/lib/meta/tipos";

export interface EtapaEstrategia {
  id: string;
  ordem: number;
  nomeEtapa: string;
  tipoModelo: TipoModeloCampanha;
  percentualOrcamento: number;
  offsetDiasInicio: number;
  duracaoDias: number | null;
}

export interface Estrategia {
  id: string;
  nome: string;
  descricao: string | null;
  ativa: boolean;
  etapas: EtapaEstrategia[];
  criadoEm: string;
}

export type StatusPlanoExecucao = "planejado" | "em_andamento" | "concluido" | "pausado";

export type StatusEtapaPlano =
  | "aguardando"
  | "pronta_para_disparar"
  | "aguardando_admin"
  | "em_andamento"
  | "concluida"
  | "erro";

export interface EtapaPlanoExecucao {
  id: string;
  estrategiaEtapaId: string;
  campanhaId: string | null;
  status: StatusEtapaPlano;
  dataPrevistaInicio: string;
  observacao: string | null;
  // Embutido na leitura (join) pra tela não precisar de uma segunda busca — não existe como coluna.
  etapa?: EtapaEstrategia;
}

export interface PlanoExecucao {
  id: string;
  estrategiaId: string;
  clienteId: string;
  contaId: string;
  nome: string;
  publicoId: string | null;
  publico: Publico | null;
  incluirFacebook: boolean;
  investimentoTotalCentavos: number;
  dataInicio: string;
  metaNegocio: string | null;
  status: StatusPlanoExecucao;
  etapas: EtapaPlanoExecucao[];
  criadoEm: string;
}

export type StatusCampanhaMae = "ativa" | "encerrada";

/** O "padrão de campanha" da franqueadora — uma Estratégia (molde) + período fixo + faixa de
 * investimento permitida, disparada pra várias unidades de uma vez. Cada unidade participante vira
 * um PlanoExecucao com `campanhaMaeId` preenchido. O criativo NÃO mora aqui — cada etapa da
 * Estratégia usada tem o próprio (ver CampanhaMaeCriativo), porque etapas de objetivo diferente
 * (Alcance vs Engajamento) geralmente pedem criativos diferentes. */
export interface CampanhaMae {
  id: string;
  estrategiaId: string;
  nome: string;
  dataInicio: string;
  investimentoMinimoCentavos: number;
  investimentoMaximoCentavos: number;
  status: StatusCampanhaMae;
  criadoEm: string;
}

export type ModoCriativoCampanhaMae = "oficial_upload" | "livre_por_unidade";

/** Criativo de UMA etapa dentro de UMA Campanha-Mãe. `oficial_upload` trava o mesmo criativo pra
 * toda unidade nessa etapa; `livre_por_unidade` deixa cada unidade escolher o próprio na hora de
 * publicar (inclusive "usar publicação existente"), como já acontecia antes de existir Campanha-
 * Mãe. Os campos de criativo só vêm preenchidos quando `modo` é 'oficial_upload' E alguém já
 * definiu — pode ficar "a definir depois" por um tempo (ver aviso de criativo pendente). */
export interface CampanhaMaeCriativo {
  id: string;
  campanhaMaeId: string;
  estrategiaEtapaId: string;
  modo: ModoCriativoCampanhaMae;
  criativoTitulo: string | null;
  criativoMensagem: string | null;
  criativoImagemBase64: string | null;
  criativoCta: string | null;
}
