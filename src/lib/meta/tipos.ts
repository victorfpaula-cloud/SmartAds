// Tipos do construtor de público (mapa + interesses) e do payload de criação de campanha —
// compartilhados entre as telas (client components) e as rotas de API (server).

export type TipoLocalizacao = "cidade" | "ponto" | "regiao" | "pais";

export interface LocalizacaoCidade {
  tipo: "cidade";
  chave: string; // "key" retornado pela busca da Meta (search?type=adgeolocation)
  nome: string;
  raioKm: number;
}

export interface LocalizacaoPonto {
  tipo: "ponto";
  latitude: number;
  longitude: number;
  raioKm: number;
  nome?: string; // rótulo livre, só pra exibição ("Ponto perto do shopping X")
}

export interface LocalizacaoRegiao {
  tipo: "regiao";
  chave: string;
  nome: string;
}

export interface LocalizacaoPais {
  tipo: "pais";
  codigo: string; // "BR"
  nome: string;
}

export type Localizacao = LocalizacaoCidade | LocalizacaoPonto | LocalizacaoRegiao | LocalizacaoPais;

export interface Interesse {
  id: string;
  nome: string;
}

export type Genero = "todos" | "homens" | "mulheres";

export interface Publico {
  localizacoes: Localizacao[];
  interesses?: Interesse[];
  idadeMin?: number; // padrão 18
  idadeMax?: number; // padrão 65 (Meta trata 65 como "65+")
  genero?: Genero;
}

export type TipoModeloCampanha =
  | "engajamento"
  | "alcance"
  | "formulario"
  | "visita_perfil"
  | "cliques_link";

export type TipoOrcamento = "diario" | "vitalicio";

export interface Orcamento {
  tipo: TipoOrcamento;
  valorCentavos: number;
  dataInicio?: string; // ISO, obrigatório quando vitalicio
  dataFim?: string; // ISO, obrigatório quando vitalicio
}
