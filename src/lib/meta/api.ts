import { BASE_URL, obterTokenValido } from "./token";
import { ErroGraphAPIException } from "./erros";
import type { Localizacao, Publico } from "./tipos";

type Metodo = "GET" | "POST" | "DELETE";

/**
 * Chamada de baixo nível à Graph API — todas as funções deste arquivo passam por aqui. Erros da
 * Meta viram `ErroGraphAPIException` (mensagem já traduzida pro português, ver erros.ts) em vez de
 * um JSON cru, pra qualquer rota que chamar essas funções só precisar mostrar `erro.message` direto
 * na tela.
 */
async function chamar<T = any>(
  caminho: string,
  opcoes: { metodo?: Metodo; corpo?: Record<string, unknown>; query?: Record<string, unknown> } = {}
): Promise<T> {
  const token = await obterTokenValido();
  const { metodo = "GET", corpo, query } = opcoes;

  const url = new URL(`${BASE_URL}/${caminho}`);
  url.searchParams.set("access_token", token);
  for (const [chave, valor] of Object.entries(query ?? {})) {
    if (valor === undefined) continue;
    url.searchParams.set(chave, typeof valor === "string" ? valor : JSON.stringify(valor));
  }

  const init: RequestInit = { method: metodo, cache: "no-store" };
  if (corpo && metodo !== "GET") {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(corpo);
  }

  const resposta = await fetch(url.toString(), init);
  const json = await resposta.json().catch(() => ({}));

  if (!resposta.ok || json.error) {
    throw new ErroGraphAPIException(json.error);
  }

  return json as T;
}

// ============================================================================
// Contas de anúncio, páginas e Instagram
// ============================================================================

export interface ContaDeAnuncioMeta {
  id: string; // "act_123..."
  name: string;
  account_status: number;
  business?: { id: string; name: string };
}

/** Todas as contas de anúncio que o usuário logado enxerga (de todas as Business Managers dele). */
export async function listarContasDeAnuncio(): Promise<ContaDeAnuncioMeta[]> {
  const dados = await chamar<{ data: ContaDeAnuncioMeta[] }>("me/adaccounts", {
    query: { fields: "id,name,account_status,business{id,name}", limit: 500 },
  });
  return dados.data;
}

export interface PaginaMeta {
  id: string;
  name: string;
  instagram_business_account?: { id: string; username?: string };
}

/** Páginas do Facebook que o usuário logado administra, com a conta do Instagram vinculada (se
 * houver) já embutida — é isso que preenche o seletor de página/Instagram na tela de contas. */
export async function listarPaginas(): Promise<PaginaMeta[]> {
  const dados = await chamar<{ data: PaginaMeta[] }>("me/accounts", {
    query: { fields: "id,name,instagram_business_account{id,username}", limit: 500 },
  });
  return dados.data;
}

export interface PostInstagram {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
}

/** Posts recentes de uma conta do Instagram — alimenta o seletor "usar publicação existente" nos
 * modelos Engajamento e Alcance. */
export async function listarPostsInstagram(instagramBusinessId: string): Promise<PostInstagram[]> {
  const dados = await chamar<{ data: PostInstagram[] }>(`${instagramBusinessId}/media`, {
    query: {
      fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
      limit: 30,
    },
  });
  return dados.data;
}

// ============================================================================
// Busca de localização e interesse (autocomplete do construtor de público)
// ============================================================================

export interface ResultadoBuscaLocalizacao {
  key: string;
  name: string;
  type: "city" | "region" | "country";
  country_code?: string;
  region?: string;
}

export async function buscarLocalizacoes(
  termo: string,
  tipos: Array<"city" | "region" | "country"> = ["city", "region", "country"]
): Promise<ResultadoBuscaLocalizacao[]> {
  if (termo.trim().length < 2) return [];
  const dados = await chamar<{ data: ResultadoBuscaLocalizacao[] }>("search", {
    query: { type: "adgeolocation", q: termo, location_types: tipos, limit: 12 },
  });
  return dados.data;
}

export interface ResultadoBuscaInteresse {
  id: string;
  name: string;
  audience_size_lower_bound?: number;
  audience_size_upper_bound?: number;
}

export async function buscarInteresses(termo: string): Promise<ResultadoBuscaInteresse[]> {
  if (termo.trim().length < 2) return [];
  const dados = await chamar<{ data: ResultadoBuscaInteresse[] }>("search", {
    query: { type: "adinterest", q: termo, limit: 12 },
  });
  return dados.data;
}

// ============================================================================
// Públicos salvos já existentes na conta (reaproveitar o que o cliente já tinha no Gerenciador)
// ============================================================================

export interface PublicoSalvoMeta {
  id: string;
  name: string;
  targeting: Record<string, unknown>;
  approximate_count_upper_bound?: number;
}

export async function listarPublicosSalvosDaMeta(adAccountId: string): Promise<PublicoSalvoMeta[]> {
  const dados = await chamar<{ data: PublicoSalvoMeta[] }>(`${adAccountId}/saved_audiences`, {
    query: { fields: "id,name,targeting,approximate_count_upper_bound", limit: 100 },
  });
  return dados.data;
}

// ============================================================================
// Montagem do targeting a partir do público salvo do SmartAds
// ============================================================================

/**
 * Converte o público montado no SmartAds (localizações + interesses) pro formato `targeting` que
 * a Meta espera no conjunto de anúncios. Posicionamento é sempre Feed + Stories + Reels (decisão
 * do produto) — só a plataforma (Instagram só, ou + Facebook) é escolhida pelo usuário.
 *
 * Os enums exatos de posicionamento (`instagram_positions`/`facebook_positions`) foram os mais
 * usados/documentados no momento da escrita — validar contra uma campanha de teste real antes do
 * primeiro uso em produção, igual já previsto pra outros pontos da integração (destination_type de
 * "visita ao perfil", anexo de formulário de Leads).
 */
export function montarTargeting(publico: Publico, incluirFacebook: boolean): Record<string, unknown> {
  const geoLocations: Record<string, unknown[]> & { cities?: any[]; regions?: any[]; countries?: string[]; custom_locations?: any[] } = {};

  for (const localizacao of publico.localizacoes) {
    adicionarLocalizacao(geoLocations, localizacao);
  }

  const targeting: Record<string, unknown> = {
    geo_locations: geoLocations,
    age_min: publico.idadeMin ?? 18,
    age_max: publico.idadeMax ?? 65,
    publisher_platforms: incluirFacebook ? ["facebook", "instagram"] : ["instagram"],
    instagram_positions: ["stream", "story", "reels"],
  };

  if (incluirFacebook) {
    targeting.facebook_positions = ["feed", "story", "facebook_reels"];
  }

  if (publico.genero === "homens") targeting.genders = [1];
  if (publico.genero === "mulheres") targeting.genders = [2];

  if (publico.interesses?.length) {
    targeting.flexible_spec = [
      { interests: publico.interesses.map((interesse) => ({ id: interesse.id, name: interesse.nome })) },
    ];
  }

  return targeting;
}

function adicionarLocalizacao(destino: any, localizacao: Localizacao) {
  if (localizacao.tipo === "cidade") {
    destino.cities ??= [];
    destino.cities.push({ key: localizacao.chave, radius: localizacao.raioKm, distance_unit: "kilometer" });
  } else if (localizacao.tipo === "ponto") {
    destino.custom_locations ??= [];
    destino.custom_locations.push({
      latitude: localizacao.latitude,
      longitude: localizacao.longitude,
      radius: localizacao.raioKm,
      distance_unit: "kilometer",
    });
  } else if (localizacao.tipo === "regiao") {
    destino.regions ??= [];
    destino.regions.push({ key: localizacao.chave });
  } else if (localizacao.tipo === "pais") {
    destino.countries ??= [];
    destino.countries.push(localizacao.codigo);
  }
}

// ============================================================================
// Campanha
// ============================================================================

export interface CriarCampanhaParams {
  name: string;
  objective: string; // "OUTCOME_ENGAGEMENT" | "OUTCOME_AWARENESS" | "OUTCOME_LEADS" | "OUTCOME_TRAFFIC"
}

/** Toda campanha nasce PAUSADA, sempre — é revisão de segurança do produto, não um detalhe opcional. */
export async function criarCampanha(adAccountId: string, params: CriarCampanhaParams): Promise<{ id: string }> {
  return chamar(`${adAccountId}/campaigns`, {
    metodo: "POST",
    corpo: {
      name: params.name,
      objective: params.objective,
      status: "PAUSED",
      special_ad_categories: [],
    },
  });
}

export async function pausarCampanha(campaignId: string) {
  return chamar(campaignId, { metodo: "POST", corpo: { status: "PAUSED" } });
}

export async function ativarCampanha(campaignId: string) {
  return chamar(campaignId, { metodo: "POST", corpo: { status: "ACTIVE" } });
}

// ============================================================================
// Conjunto de anúncios (ad set) — orçamento vive aqui (ABO: cada conjunto tem o seu próprio,
// mais simples de entender e de mostrar no painel do que orçamento no nível da campanha).
// ============================================================================

export interface CriarConjuntoParams {
  name: string;
  campaignId: string;
  optimizationGoal: string;
  billingEvent: string;
  destinationType?: string;
  promotedObject?: Record<string, unknown>;
  targeting: Record<string, unknown>;
  orcamentoCentavos: number;
  tipoOrcamento: "diario" | "vitalicio";
  dataInicio?: string; // ISO — obrigatório quando vitalicio
  dataFim?: string; // ISO — obrigatório quando vitalicio
}

export async function criarConjuntoDeAnuncios(
  adAccountId: string,
  params: CriarConjuntoParams
): Promise<{ id: string }> {
  const corpo: Record<string, unknown> = {
    name: params.name,
    campaign_id: params.campaignId,
    optimization_goal: params.optimizationGoal,
    billing_event: params.billingEvent,
    targeting: params.targeting,
    status: "PAUSED",
  };

  if (params.destinationType) corpo.destination_type = params.destinationType;
  if (params.promotedObject) corpo.promoted_object = params.promotedObject;

  if (params.tipoOrcamento === "diario") {
    corpo.daily_budget = params.orcamentoCentavos;
    // Data-fim é opcional no diário (a Meta aceita end_time mesmo sem lifetime_budget) — só define
    // quando o usuário quis um "contínuo até tal dia" em vez de "até eu pausar".
    if (params.dataFim) corpo.end_time = params.dataFim;
  } else {
    corpo.lifetime_budget = params.orcamentoCentavos;
    corpo.start_time = params.dataInicio;
    corpo.end_time = params.dataFim;
  }

  return chamar(`${adAccountId}/adsets`, { metodo: "POST", corpo });
}

export async function pausarConjunto(adsetId: string) {
  return chamar(adsetId, { metodo: "POST", corpo: { status: "PAUSED" } });
}

export async function ativarConjunto(adsetId: string) {
  return chamar(adsetId, { metodo: "POST", corpo: { status: "ACTIVE" } });
}

export async function definirOrcamentoConjunto(
  adsetId: string,
  tipoOrcamento: "diario" | "vitalicio",
  valorCentavos: number
) {
  const corpo = tipoOrcamento === "diario" ? { daily_budget: valorCentavos } : { lifetime_budget: valorCentavos };
  return chamar(adsetId, { metodo: "POST", corpo });
}

// ============================================================================
// Criativo e anúncio
// ============================================================================

/** Anúncio a partir de uma publicação já existente do Instagram (modelos Engajamento/Alcance,
 * opção "usar publicação existente"). */
export async function criarCriativoDePostExistente(
  adAccountId: string,
  params: { pageId: string; instagramActorId: string; sourceInstagramMediaId: string; name: string }
): Promise<{ id: string }> {
  return chamar(`${adAccountId}/adcreatives`, {
    metodo: "POST",
    corpo: {
      name: params.name,
      object_story_spec: {
        page_id: params.pageId,
        instagram_actor_id: params.instagramActorId,
        source_instagram_media_id: params.sourceInstagramMediaId,
      },
    },
  });
}

/** Anúncio novo ("dark post" — não aparece no feed orgânico, só roda como anúncio), com imagem e
 * link opcional (usado em Cliques no Link) ou sem link (Engajamento/Alcance/Visita ao perfil). */
export async function criarCriativoNovo(
  adAccountId: string,
  params: {
    name: string;
    pageId: string;
    instagramActorId?: string;
    imageHash?: string;
    videoId?: string;
    mensagem: string;
    titulo?: string;
    descricao?: string;
    link?: string;
    callToAction?: string;
    /** ID do formulário de Leads já existente no Meta Business Suite — usado só no modelo
     * Formulário. TODO: validar o encaixe exato (call_to_action.value.lead_gen_form_id) com uma
     * campanha de teste real antes do primeiro uso em produção, como já previsto no plano original. */
    leadGenFormId?: string;
  }
): Promise<{ id: string }> {
  const linkData: Record<string, unknown> = {
    message: params.mensagem,
    link: params.link ?? "https://www.instagram.com/", // exigido pela Meta mesmo sem destino externo real
  };
  if (params.imageHash) linkData.image_hash = params.imageHash;
  if (params.titulo) linkData.name = params.titulo;
  if (params.descricao) linkData.description = params.descricao;
  if (params.callToAction || params.leadGenFormId) {
    linkData.call_to_action = {
      type: params.callToAction ?? "SIGN_UP",
      value: {
        ...(params.link ? { link: params.link } : {}),
        ...(params.leadGenFormId ? { lead_gen_form_id: params.leadGenFormId } : {}),
      },
    };
  }

  return chamar(`${adAccountId}/adcreatives`, {
    metodo: "POST",
    corpo: {
      name: params.name,
      object_story_spec: {
        page_id: params.pageId,
        instagram_actor_id: params.instagramActorId,
        ...(params.videoId
          ? { video_data: { video_id: params.videoId, message: params.mensagem, call_to_action: linkData.call_to_action } }
          : { link_data: linkData }),
      },
    },
  });
}

export async function criarAnuncio(
  adAccountId: string,
  params: { name: string; adsetId: string; creativeId: string }
): Promise<{ id: string }> {
  return chamar(`${adAccountId}/ads`, {
    metodo: "POST",
    corpo: {
      name: params.name,
      adset_id: params.adsetId,
      creative: { creative_id: params.creativeId },
      status: "PAUSED",
    },
  });
}

export async function pausarAnuncio(adId: string) {
  return chamar(adId, { metodo: "POST", corpo: { status: "PAUSED" } });
}

export async function ativarAnuncio(adId: string) {
  return chamar(adId, { metodo: "POST", corpo: { status: "ACTIVE" } });
}

/** Sobe uma imagem pra biblioteca da conta e devolve o `image_hash` usado em `criarCriativoNovo`. */
export async function subirImagem(adAccountId: string, imagemBase64: string): Promise<string> {
  const resposta = await chamar<{ images: Record<string, { hash: string }> }>(`${adAccountId}/adimages`, {
    metodo: "POST",
    corpo: { bytes: imagemBase64 },
  });
  const [primeira] = Object.values(resposta.images);
  return primeira.hash;
}

// ============================================================================
// Exclusão (usada no rollback quando uma etapa de criação falha no meio do caminho)
// ============================================================================

export async function excluirObjeto(id: string) {
  return chamar(id, { metodo: "DELETE" });
}

// ============================================================================
// Insights (relatórios)
// ============================================================================

const CAMPOS_INSIGHTS =
  "campaign_id,campaign_name,adset_id,ad_id,spend,impressions,clicks,reach,cpm,cpc,ctr,account_id,account_name";

export interface LinhaInsight {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  account_id?: string;
  account_name?: string;
  date_start?: string;
  date_stop?: string;
}

export async function obterInsightsConta(
  adAccountId: string,
  opcoes: {
    nivel?: "account" | "campaign" | "adset" | "ad";
    datePreset?: string;
    /** Intervalo customizado (ex: "os 7 dias ANTES do last_7d", pra comparação período a
     * período) — a Meta não tem um date_preset pronto pra isso. Quando presente, tem prioridade
     * sobre `datePreset`. */
    intervalo?: { desde: string; ate: string };
    /** Sem isso, cada linha vem separada por dia (bom pro gráfico). Passar `false` agrega tudo
     * num único total por conta/campanha — usado no resumo do relatório, que quer só o total. */
    porDia?: boolean;
  } = {}
): Promise<LinhaInsight[]> {
  const dados = await chamar<{ data: LinhaInsight[] }>(`${adAccountId}/insights`, {
    query: {
      level: opcoes.nivel ?? "campaign",
      fields: CAMPOS_INSIGHTS,
      ...(opcoes.intervalo
        ? { time_range: { since: opcoes.intervalo.desde, until: opcoes.intervalo.ate } }
        : { date_preset: opcoes.datePreset ?? "last_7d" }),
      ...(opcoes.porDia === false ? {} : { time_increment: 1 }),
      limit: 500,
    },
  });
  return dados.data;
}

// ============================================================================
// Status/detalhe de campanhas (painel "campanhas no ar")
// ============================================================================

const CAMPOS_CAMPANHA =
  "id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining";

export interface CampanhaMeta {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
}

export async function listarCampanhas(adAccountId: string): Promise<CampanhaMeta[]> {
  const dados = await chamar<{ data: CampanhaMeta[] }>(`${adAccountId}/campaigns`, {
    query: { fields: CAMPOS_CAMPANHA, limit: 200 },
  });
  return dados.data;
}
