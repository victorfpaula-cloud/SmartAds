import { AsyncLocalStorage } from "node:async_hooks";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// O "Login do Facebook para Empresas" só deixa escolher UM portfólio por login, então contas de
// portfólios diferentes precisam de logins (tokens) diferentes — ver smartads_meta_conexoes. Este
// módulo decide QUAL token uma chamada à Graph API deve usar, sem cada função de api.ts precisar
// receber isso por parâmetro:
//
//  1. contexto explícito (comConexao/comContaMeta): quem já sabe a conta (criar campanha, ações do
//     painel, automações) roda o trabalho dentro dele — vale pra qualquer ID, inclusive os que não
//     dizem de qual conta são (campanha, conjunto, anúncio, mídia);
//  2. inferência pelo ID no caminho da chamada (conta de anúncio, Página, Instagram): a maioria das
//     leituras dos crons cai aqui e não precisa de nada;
//  3. nenhum dos dois: conexão principal (smartads_meta_status), como sempre foi.

type Contexto = { conexaoId: string | null };
const armazenamento = new AsyncLocalStorage<Contexto>();

/** Roda `fn` usando a conexão informada em TODA chamada à Meta feita dentro dela. null = principal. */
export function comConexao<T>(conexaoId: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  return armazenamento.run({ conexaoId: conexaoId ?? null }, fn);
}

const VALIDADE_MAPA_MS = 30_000;
let mapaCache: { carregadoEm: number; porAtivo: Map<string, string>; porConta: Map<string, string | null> } | null =
  null;

async function carregarMapa() {
  if (mapaCache && Date.now() - mapaCache.carregadoEm < VALIDADE_MAPA_MS) return mapaCache;

  const supabase = criarClienteAdmin();
  const { data } = await supabase
    .from("smartads_contas_meta")
    .select("id, meta_ad_account_id, page_id, instagram_business_id, conexao_id");

  const porAtivo = new Map<string, string>();
  const porConta = new Map<string, string | null>();
  for (const linha of data ?? []) {
    porConta.set(linha.id, linha.conexao_id ?? null);
    if (!linha.conexao_id) continue; // só as conexões extras importam — o resto cai na principal
    for (const ativo of [linha.meta_ad_account_id, linha.page_id, linha.instagram_business_id]) {
      if (ativo) porAtivo.set(String(ativo), linha.conexao_id);
    }
  }

  mapaCache = { carregadoEm: Date.now(), porAtivo, porConta };
  return mapaCache;
}

/** Descarta o cache — chamado depois de associar/editar uma conta, pra ela valer na hora. */
export function invalidarMapaDeConexoes() {
  mapaCache = null;
}

/** Conexão a usar numa chamada: contexto explícito > ID do primeiro trecho do caminho > principal. */
export async function resolverConexaoId(caminho: string): Promise<string | null> {
  const contexto = armazenamento.getStore();
  if (contexto) return contexto.conexaoId;

  const primeiroTrecho = caminho.split("/")[0];
  const { porAtivo } = await carregarMapa();
  return porAtivo.get(primeiroTrecho) ?? null;
}

/** Conexão de uma Página / conta de anúncio / Instagram específico (contexto explícito vence). */
export async function conexaoIdDoAtivo(ativoId: string): Promise<string | null> {
  const contexto = armazenamento.getStore();
  if (contexto) return contexto.conexaoId;
  const { porAtivo } = await carregarMapa();
  return porAtivo.get(ativoId) ?? null;
}

export async function conexaoIdDaConta(contaId: string): Promise<string | null> {
  let mapa = await carregarMapa();
  // Conta que acabou de ser criada por outra instância ainda não está no cache local — recarrega uma
  // vez antes de assumir a conexão principal, senão a primeira chamada usaria o token errado.
  if (!mapa.porConta.has(contaId)) {
    invalidarMapaDeConexoes();
    mapa = await carregarMapa();
  }
  return mapa.porConta.get(contaId) ?? null;
}

/** Roda `fn` com a conexão da conta (smartads_contas_meta.id) — pra quem só tem o id da conta e vai
 * mexer em campanha/conjunto/anúncio/mídia, IDs que não revelam de qual conta são. */
export async function comContaMeta<T>(contaId: string, fn: () => Promise<T>): Promise<T> {
  return comConexao(await conexaoIdDaConta(contaId), fn);
}
