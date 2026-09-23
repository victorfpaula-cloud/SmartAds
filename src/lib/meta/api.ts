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
  opcoes: {
    metodo?: Metodo;
    corpo?: Record<string, unknown>;
    query?: Record<string, unknown>;
    /** Usa esse token em vez do token de usuário salvo — só pra chamadas que exigem token de
     * Página (ver obterTokenDePagina). */
    tokenExplicito?: string;
  } = {}
): Promise<T> {
  const token = opcoes.tokenExplicito ?? (await obterTokenValido());
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

export interface SaldoContaMeta {
  /** TENTATIVA ANTERIOR (revertida): calcular isso como `spend_cap - amount_spent` — formato que
   * ferramentas de terceiros documentam pra outro tipo de conta pré-paga. Testado contra as contas
   * reais da Dona Baunilha e deu número NEGATIVO e sem sentido (ex: -R$16.000): `amount_spent` é o
   * gasto acumulado da conta DESDE SEMPRE (nunca zera) e o `spend_cap` dessas contas é um limite
   * antigo que não sobe a cada recarga de Fundos via Pix — então a subtração não representa fundo
   * disponível nenhum. Voltou a ser sempre `null`: a Meta genuinely não expõe "Fundos disponíveis"
   * por nenhum campo da API pública (confirmado por buscas extensivas na documentação e no catálogo
   * de campos do Windsor.ai) — esse número só existe hoje dentro do Gerenciador de Anúncios. */
  saldoDisponivelCentavos: number | null;
  /** O campo `balance` da Meta NÃO é "quanto você tem disponível pra gastar" — é o valor JÁ
   * ACUMULADO desde a última cobrança, que vai virar a PRÓXIMA fatura (confirmado direto na
   * documentação de campo da Meta: "Bill amount due for this Ad Account"). Não é o fundo pré-pago
   * (Pix/boleto) disponível — só dá pra ver esse número direto no Gerenciador de Anúncios. */
  faturaEmAbertoCentavos: number | null;
  /** Gasto acumulado da conta desde sempre (lifetime), em centavos — a Meta devolve isso em
   * centavos, diferente do campo `spend` dos insights (que já vem em reais). */
  gastoAcumuladoCentavos: number;
  spendCapCentavos: number | null;
  moeda: string;
}

/** Fatura em aberto (o que já acumulou desde a última cobrança e vai ser cobrado a seguir) da
 * própria conta de anúncio na Meta — NÃO é o fundo disponível pra gastar (ver comentário de
 * SaldoContaMeta.saldoDisponivelCentavos: já tentamos calcular isso e deu errado). */
export async function obterSaldoConta(adAccountId: string): Promise<SaldoContaMeta> {
  const dados = await chamar<{
    balance?: string;
    amount_spent?: string;
    spend_cap?: string;
    currency?: string;
  }>(adAccountId, { query: { fields: "balance,amount_spent,spend_cap,currency" } });

  return {
    saldoDisponivelCentavos: null,
    faturaEmAbertoCentavos: dados.balance != null ? Number(dados.balance) : null,
    gastoAcumuladoCentavos: Number(dados.amount_spent ?? 0),
    spendCapCentavos: dados.spend_cap != null ? Number(dados.spend_cap) : null,
    moeda: dados.currency ?? "BRL",
  };
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
  // Engajamento orgânico — vem direto no objeto da mídia, sem precisar do edge /insights. Usado
  // pelo Diagnóstico como SINAL de qual criativo/formato priorizar em anúncio pago, nunca como
  // recomendação de conteúdo orgânico isolada (ver src/lib/diagnostico).
  like_count?: number;
  comments_count?: number;
}

/** Posts recentes de uma conta do Instagram — alimenta o seletor "usar publicação existente" nos
 * modelos Engajamento e Alcance, e o Diagnóstico (engajamento orgânico por post). */
export async function listarPostsInstagram(instagramBusinessId: string): Promise<PostInstagram[]> {
  const dados = await chamar<{ data: PostInstagram[] }>(`${instagramBusinessId}/media`, {
    query: {
      fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
      limit: 30,
    },
  });
  return dados.data;
}

/** Um post específico — usado quando "usar publicação existente" precisa buscar de novo a
 * imagem/legenda no momento de publicar (ver criarCriativoAPartirDePost em route.ts). */
export async function obterPostInstagram(mediaId: string): Promise<PostInstagram> {
  return chamar<PostInstagram>(mediaId, {
    query: { fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp" },
  });
}

export interface ContaInstagramResumo {
  followers_count?: number;
  media_count?: number;
}

/** Seguidores e total de publicações da conta — usado pelo Diagnóstico como ponto de partida do
 * lado orgânico (crescimento de seguidor entra comparando essa leitura ao longo do tempo, já que
 * a Meta não devolve histórico de seguidores num único campo). */
export async function obterResumoContaInstagram(instagramBusinessId: string): Promise<ContaInstagramResumo> {
  return chamar<ContaInstagramResumo>(instagramBusinessId, {
    query: { fields: "followers_count,media_count" },
  });
}

export interface LinhaInsightInstagram {
  name: string;
  period: string;
  values: Array<{ value: number; end_time?: string }>;
}

/** Alcance orgânico e visitas ao perfil no período — sinal de quão bem a conta anda performando
 * sem mídia paga nenhuma envolvida, pro Diagnóstico cruzar com o desempenho pago. `reach` é a
 * métrica mais estável entre versões da API; `profile_views` pode não estar disponível em toda
 * conta (a chamada segue mesmo se uma métrica falhar — trata como ausente, não quebra o
 * diagnóstico inteiro por causa de uma métrica só). */
export async function obterInsightsContaInstagram(
  instagramBusinessId: string,
  diasAtras = 30
): Promise<{ reach: number; profileViews: number | null }> {
  try {
    const dados = await chamar<{ data: LinhaInsightInstagram[] }>(`${instagramBusinessId}/insights`, {
      query: {
        metric: "reach,profile_views",
        period: "day",
        metric_type: "total_value",
        since: Math.floor((Date.now() - diasAtras * 86_400_000) / 1000),
        until: Math.floor(Date.now() / 1000),
      },
    });
    const reach = dados.data.find((linha) => linha.name === "reach")?.values?.[0]?.value ?? 0;
    const profileViewsLinha = dados.data.find((linha) => linha.name === "profile_views");
    return { reach, profileViews: profileViewsLinha?.values?.[0]?.value ?? null };
  } catch {
    // Conta sem permissão/histórico suficiente pra insights — Diagnóstico segue só com o que tem.
    return { reach: 0, profileViews: null };
  }
}

/** Token de acesso da própria Página — contas que migraram pra "nova experiência de Páginas" da
 * Meta exigem token de Página (não o token de usuário comum) pra ler o feed de posts dela
 * (achado em 13/09/2026: "é necessário um token de acesso à Página para esta ligação na nova
 * experiência de Páginas"). Deriva na hora a partir do token de usuário já salvo — não precisa
 * guardar nada novo no banco nem renovar nada à parte, já que herda a validade do token de
 * usuário original. */
export async function obterTokenDePagina(pageId: string): Promise<string | null> {
  const dados = await chamar<{ data: Array<{ id: string; access_token: string }> }>("me/accounts", {
    query: { fields: "id,access_token", limit: 500 },
  });
  return dados.data.find((pagina) => pagina.id === pageId)?.access_token ?? null;
}

/** Procura, entre os posts recentes da Página, um publicado bem perto do horário do post do
 * Instagram selecionado em "usar publicação existente" — cobre o caso comum (principalmente
 * Reels) em que a própria Meta replica automaticamente o conteúdo do Instagram pra Página
 * quando o cross-post tá ligado na conta. Sem achar esse post da Página não tem como turbinar o
 * post de verdade: testado direto contra a API real em 23/09/2026 (via ação boost_post do
 * Windsor.ai) que a Meta rejeita o ID do Instagram como referência de "post existente" pra criar
 * anúncio, mas aceita o ID do post da Página normalmente. Janela apertada (10 min) porque
 * cross-post acontece quase simultâneo à publicação original; fora dela, melhor não arriscar
 * casar com o post errado — devolve null e quem chamar cai no caminho de recriar o conteúdo como
 * anúncio novo (ver route.ts). */
export async function encontrarPostDaPaginaCorrespondente(
  pageId: string,
  tokenPagina: string,
  timestampPostInstagram: string
): Promise<string | null> {
  const alvo = new Date(timestampPostInstagram).getTime();
  const janelaMs = 10 * 60 * 1000;
  const desde = new Date(alvo - janelaMs).toISOString().slice(0, 10);
  const ate = new Date(alvo + janelaMs).toISOString().slice(0, 10);

  const dados = await chamar<{ data: Array<{ id: string; created_time: string }> }>(`${pageId}/posts`, {
    tokenExplicito: tokenPagina,
    query: { fields: "id,created_time", since: desde, until: ate, limit: 50 },
  });

  let melhor: { id: string; diffMs: number } | null = null;
  for (const post of dados.data) {
    const diffMs = Math.abs(new Date(post.created_time).getTime() - alvo);
    if (diffMs <= janelaMs && (!melhor || diffMs < melhor.diffMs)) {
      melhor = { id: post.id, diffMs };
    }
  }
  return melhor?.id ?? null;
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
    // Passou a ser obrigatório sinalizar explicitamente se o público Advantage (expansão
    // automática de público pela própria Meta) está ligado — "0" porque o SmartAds sempre
    // trabalha com o público definido manualmente na tela (localizações + interesses), sem
    // deixar a Meta expandir sozinha por cima (achado em 12/09/2026 publicando uma campanha de
    // verdade: "sinalização de público Advantage é obrigatória").
    targeting_automation: { advantage_audience: 0 },
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

/** Campanha nasce ATIVA — pedido explícito do dono do produto (antes nascia pausada por
 * segurança; decisão revertida em 12/09/2026 depois de testar o fluxo em produção). */
export async function criarCampanha(adAccountId: string, params: CriarCampanhaParams): Promise<{ id: string }> {
  return chamar(`${adAccountId}/campaigns`, {
    metodo: "POST",
    corpo: {
      name: params.name,
      objective: params.objective,
      status: "ACTIVE",
      special_ad_categories: [],
      // Campo da CAMPANHA, não do conjunto de anúncios (a primeira tentativa colocou no
      // conjunto e o erro continuou idêntico). Controla se os conjuntos dentro dela podem
      // compartilhar orçamento entre si; "false" porque o SmartAds sempre dá um
      // orçamento fixo e independente pra cada conjunto (ABO), nunca deixa a Meta realocar
      // sozinha. Obrigatório desde que a conta não usa orçamento no nível da campanha (achado em
      // 12/09/2026 publicando uma campanha de verdade).
      is_adset_budget_sharing_enabled: false,
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
    status: "ACTIVE",
    // Passou a ser obrigatório informar a estratégia de lance explicitamente — antes a Meta
    // assumia esse padrão sozinha sem precisar declarar nada (achado em 12/09/2026 publicando
    // uma campanha de verdade: "valor ou restrições de lance são obrigatórios"). Mantém o
    // comportamento de sempre: deixa a Meta buscar o menor custo por resultado, sem teto de
    // lance manual — a opção mais simples e a que o SmartAds sempre pretendeu usar.
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
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

/** Orçamento atual do conjunto — usado pelas regras de automação que ajustam por PORCENTAGEM
 * (precisam saber o valor de partida antes de calcular o novo). */
export async function obterOrcamentoConjunto(
  adsetId: string
): Promise<{ tipo: "diario" | "vitalicio"; valorCentavos: number } | null> {
  const dados = await chamar<{ daily_budget?: string; lifetime_budget?: string }>(adsetId, {
    query: { fields: "daily_budget,lifetime_budget" },
  });
  if (dados.daily_budget) return { tipo: "diario", valorCentavos: Number(dados.daily_budget) };
  if (dados.lifetime_budget) return { tipo: "vitalicio", valorCentavos: Number(dados.lifetime_budget) };
  return null;
}

// ============================================================================
// Criativo e anúncio
// ============================================================================

/** Anúncio a partir de um post que JÁ existe na Página (achado via encontrarPostDaPaginaCorrespondente)
 * — usa object_story_id direto, sem call_to_action nem link nenhum. Validado direto contra a API
 * real em 23/09/2026 (via ação boost_post do Windsor.ai): isso funciona exatamente assim quando o
 * conjunto de anúncios tem destination_type ON_POST + promoted_object com o page_id (ver route.ts)
 * — a Meta não pede mais nada além disso, e o engajamento acumula no post de verdade, não num
 * post novo. Nenhuma das tentativas anteriores com source_instagram_media_id funcionava porque a
 * Meta nunca reconhece o ID do Instagram como "post existente" pra esse fim — só o ID do post da
 * própria Página. */
export async function criarCriativoDoPostDaPagina(
  adAccountId: string,
  params: { objectStoryId: string; name: string }
): Promise<{ id: string }> {
  return chamar(`${adAccountId}/adcreatives`, {
    metodo: "POST",
    corpo: { name: params.name, object_story_id: params.objectStoryId },
  });
}

/** Anúncio novo ("dark post" — não aparece no feed orgânico, só roda como anúncio), com imagem e
 * link opcional (usado em Cliques no Link) ou sem link (Engajamento/Alcance/Visita ao perfil). */
export async function criarCriativoNovo(
  adAccountId: string,
  params: {
    name: string;
    pageId: string;
    instagramUserId?: string;
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
        instagram_user_id: params.instagramUserId,
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
      status: "ACTIVE",
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
  "id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time";

export interface CampanhaMeta {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  start_time?: string;
  stop_time?: string;
}

export interface PaginaCampanhas {
  campanhas: CampanhaMeta[];
  proximoCursor: string | null;
}

/** Paginado (padrão 10 por página) — contas com muitas campanhas (dezenas ou centenas) travavam
 * a tela "Campanhas no ar" carregando tudo de uma vez só. Passa `after` (cursor devolvido na
 * página anterior) pra buscar a próxima leva. */
export async function listarCampanhas(
  adAccountId: string,
  opcoes: { limit?: number; after?: string } = {}
): Promise<PaginaCampanhas> {
  const dados = await chamar<{ data: CampanhaMeta[]; paging?: { cursors?: { after?: string }; next?: string } }>(
    `${adAccountId}/campaigns`,
    { query: { fields: CAMPOS_CAMPANHA, limit: opcoes.limit ?? 10, after: opcoes.after } }
  );
  return {
    campanhas: dados.data,
    proximoCursor: dados.paging?.next ? dados.paging.cursors?.after ?? null : null,
  };
}

// ============================================================================
// Ledger incremental do saldo disponível — a Meta não expõe "Fundos disponíveis" em nenhum campo
// (confirmado: nem balance, nem spend_cap, nem funding_source_details) e o log de atividades da
// conta (/activities) só guarda uns 6 dias de histórico pra trás (confirmado ao vivo: paginação
// parou sozinha depois de 1 página só, bem longe do gasto acumulado da conta desde sempre). Então
// reconstruir o saldo inteiro do zero não dá — mas dá pra MANTER um saldo próprio: a pessoa digita
// o valor real (visto no Gerenciador) uma vez, e a cada dia esse valor é ajustado somando só o que
// aconteceu DESDE o último cálculo (janela curta, sempre dentro da retenção de ~6 dias).
// ============================================================================

/** Cada evento de dinheiro entrando/saindo da conta, com o valor já extraído do extra_data.
 * `funding_event_successful` = Pix/boleto caindo na conta; `ad_account_billing_charge` = cobrança
 * automática (quase diária) que desconta do saldo. */
async function somarMovimentacaoFinanceiraDesde(
  adAccountId: string,
  desde: Date
): Promise<{ totalFundingCentavos: number; totalChargeCentavos: number }> {
  let totalFundingCentavos = 0;
  let totalChargeCentavos = 0;
  let after: string | undefined;

  // A Meta não filtra esse edge por event_type (testado com o parâmetro solto e com `filters`,
  // nenhum funcionou) — vem sempre em ordem do mais recente pro mais antigo, então pagina só até
  // passar de `desde`; como a janela é curta (1 dia normalmente), quase sempre para na 1ª página.
  for (let pagina = 0; pagina < 10; pagina++) {
    const dados = await chamar<{
      data: Array<{ event_type: string; event_time: string; extra_data?: string }>;
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`${adAccountId}/activities`, { query: { limit: 100, fields: "event_type,event_time,extra_data", after } });

    let passouDoLimite = false;
    for (const item of dados.data) {
      if (new Date(item.event_time).getTime() <= desde.getTime()) {
        passouDoLimite = true;
        break;
      }
      if (!item.extra_data) continue;
      if (item.event_type === "funding_event_successful") {
        const extra = JSON.parse(item.extra_data);
        if (typeof extra.amount === "number") totalFundingCentavos += extra.amount;
      } else if (item.event_type === "ad_account_billing_charge") {
        const extra = JSON.parse(item.extra_data);
        if (typeof extra.new_value === "number") totalChargeCentavos += extra.new_value;
      }
    }

    if (passouDoLimite || !dados.paging?.next || !dados.paging.cursors?.after) break;
    after = dados.paging.cursors.after;
  }

  return { totalFundingCentavos, totalChargeCentavos };
}

/** Novo saldo disponível = saldo anterior + o que entrou - o que foi cobrado, desde a última vez
 * que isso foi calculado. `null` quando ainda não tem um saldo anterior (conta nova, ninguém
 * digitou o valor inicial ainda) — quem chama decide o que fazer nesse caso (não dá pra "estimar"
 * um ponto de partida sem informação real, é exatamente esse o problema que motivou esse desenho). */
export async function calcularSaldoIncremental(
  adAccountId: string,
  saldoAnteriorCentavos: number | null,
  calculadoAnteriormenteEm: Date | null
): Promise<number | null> {
  if (saldoAnteriorCentavos === null || calculadoAnteriormenteEm === null) return null;
  const { totalFundingCentavos, totalChargeCentavos } = await somarMovimentacaoFinanceiraDesde(
    adAccountId,
    calculadoAnteriormenteEm
  );
  return saldoAnteriorCentavos + totalFundingCentavos - totalChargeCentavos;
}
