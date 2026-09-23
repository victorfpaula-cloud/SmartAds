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
