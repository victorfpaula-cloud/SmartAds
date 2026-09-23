import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  obterInsightsConta,
  listarPostsInstagram,
  obterResumoContaInstagram,
  obterInsightsContaInstagram,
} from "@/lib/meta/api";

export interface PacoteDadosDiagnostico {
  cliente: { id: string; nome: string; metaNegocio: string | null };
  conta: { id: string; metaAdAccountId: string; pageId: string; instagramBusinessId: string | null };
  pago: {
    ultimos30dias: { spend: number; impressions: number; clicks: number; ctr: number; cpc: number };
    campanhasAtivas: Array<{
      campanhaCriadaId: string | null;
      metaCampaignId: string | null;
      adsetId: string | null;
      nome: string;
      tipoModelo: string | null;
      spend: number;
      ctr: number;
      cpc: number;
    }>;
    tiposModeloComCampanhaAtiva: string[];
  };
  organico: {
    seguidores: number | null;
    totalPublicacoes: number | null;
    alcance30dias: number;
    visitasPerfil30dias: number | null;
    postsRecentes: Array<{ legenda: string | null; curtidas: number; comentarios: number; dataPublicacao: string }>;
  };
  rede: {
    // Mediana das outras unidades ativas — comparação só faz sentido tendo pelo menos uma outra.
    numeroDeUnidadesComparadas: number;
    medianaSpend30dias: number | null;
    medianaCtr30dias: number | null;
  };
  baseConhecimento: Array<{ titulo: string; conteudo: string }>;
}

/** Junta tudo que o Diagnóstico precisa pra uma conta: mídia paga (gasto/CTR, quais objetivos já
 * têm campanha ativa — cobertura de funil), orgânico do Instagram (engajamento por post,
 * seguidores, alcance), comparação com a mediana da rede (outras unidades ativas), e a base de
 * conhecimento (geral + específica dessa unidade). Falha de uma parte não derruba o pacote inteiro
 * — cada seção trata sua própria ausência de dado (achado já vivido em buscarLinhasResumo). */
export async function coletarDadosDiagnostico(clienteId: string, contaId: string): Promise<PacoteDadosDiagnostico> {
  const supabase = criarClienteAdmin();

  const { data: conta } = await supabase.from("smartads_contas_meta").select("*").eq("id", contaId).single();
  const { data: cliente } = await supabase.from("smartads_clientes").select("*").eq("id", clienteId).single();
  if (!conta || !cliente) throw new Error("Cliente ou conta não encontrada.");

  const [insightsConta, insightsCampanhas, posts, resumoIg, insightsIg] = await Promise.all([
    obterInsightsConta(conta.meta_ad_account_id, { nivel: "account", datePreset: "last_30d", porDia: false }).catch(
      () => []
    ),
    obterInsightsConta(conta.meta_ad_account_id, { nivel: "campaign", datePreset: "last_30d", porDia: false }).catch(
      () => []
    ),
    conta.instagram_business_id ? listarPostsInstagram(conta.instagram_business_id).catch(() => []) : [],
    conta.instagram_business_id
      ? obterResumoContaInstagram(conta.instagram_business_id).catch(() => ({}) as { followers_count?: number; media_count?: number })
      : Promise.resolve({} as { followers_count?: number; media_count?: number }),
    conta.instagram_business_id
      ? obterInsightsContaInstagram(conta.instagram_business_id, 30)
      : { reach: 0, profileViews: null },
  ]);

  const totalConta = insightsConta[0];
  const campanhasAtivas = insightsCampanhas.filter((c) => Number(c.spend ?? 0) > 0);

  // "Cobertura de funil" — cruza os nomes salvos localmente (config_criacao.tipoModelo) com as
  // campanhas que a Meta reporta gasto nos últimos 30 dias, pra saber quais objetivos a unidade
  // está de fato trabalhando agora, não só o que já existiu um dia.
  const { data: campanhasCriadas } = await supabase
    .from("smartads_campanhas_criadas")
    .select("id, meta_campaign_id, meta_adset_id, tipo_modelo")
    .eq("conta_id", contaId);

  const porMetaCampaignId = new Map((campanhasCriadas ?? []).map((c) => [c.meta_campaign_id, c]));
  const idsAtivos = new Set(campanhasAtivas.map((c) => c.campaign_id));
  const tiposAtivos = [
    ...new Set(
      (campanhasCriadas ?? [])
        .filter((c) => idsAtivos.has(c.meta_campaign_id))
        .map((c) => c.tipo_modelo)
    ),
  ];

  // Mediana da rede: mesmas métricas de TODAS as outras unidades ativas, pra saber se essa unidade
  // está acima/abaixo do padrão da rede — só existe insight aqui porque várias unidades usam o
  // MESMO molde de estratégia.
  const { data: outrasContas } = await supabase
    .from("smartads_contas_meta")
    .select("meta_ad_account_id")
    .eq("ativo", true)
    .neq("id", contaId);

  const metricasOutras = await Promise.all(
    (outrasContas ?? []).slice(0, 20).map((c) =>
      obterInsightsConta(c.meta_ad_account_id, { nivel: "account", datePreset: "last_30d", porDia: false })
        .then((r) => r[0])
        .catch(() => null)
    )
  );
  const validas = metricasOutras.filter((m): m is NonNullable<typeof m> => m !== null);
  const mediana = (valores: number[]) => {
    if (valores.length === 0) return null;
    const ordenado = [...valores].sort((a, b) => a - b);
    const meio = Math.floor(ordenado.length / 2);
    return ordenado.length % 2 === 0 ? (ordenado[meio - 1] + ordenado[meio]) / 2 : ordenado[meio];
  };

  const { data: baseConhecimento } = await supabase
    .from("smartads_base_conhecimento")
    .select("titulo, conteudo")
    .or(`cliente_id.is.null,cliente_id.eq.${clienteId}`);

  return {
    cliente: { id: cliente.id, nome: cliente.nome, metaNegocio: conta.meta_negocio ?? null },
    conta: {
      id: conta.id,
      metaAdAccountId: conta.meta_ad_account_id,
      pageId: conta.page_id,
      instagramBusinessId: conta.instagram_business_id,
    },
    pago: {
      ultimos30dias: {
        spend: Number(totalConta?.spend ?? 0),
        impressions: Number(totalConta?.impressions ?? 0),
        clicks: Number(totalConta?.clicks ?? 0),
        ctr: Number(totalConta?.ctr ?? 0),
        cpc: Number(totalConta?.cpc ?? 0),
      },
      campanhasAtivas: campanhasAtivas.map((c) => {
        const local = c.campaign_id ? porMetaCampaignId.get(c.campaign_id) : undefined;
        return {
          campanhaCriadaId: local?.id ?? null,
          metaCampaignId: c.campaign_id ?? null,
          adsetId: local?.meta_adset_id ?? null,
          nome: c.campaign_name ?? c.campaign_id ?? "",
          tipoModelo: local?.tipo_modelo ?? null,
          spend: Number(c.spend ?? 0),
          ctr: Number(c.ctr ?? 0),
          cpc: Number(c.cpc ?? 0),
        };
      }),
      tiposModeloComCampanhaAtiva: tiposAtivos,
    },
    organico: {
      seguidores: resumoIg.followers_count ?? null,
      totalPublicacoes: resumoIg.media_count ?? null,
      alcance30dias: insightsIg.reach,
      visitasPerfil30dias: insightsIg.profileViews,
      postsRecentes: posts.slice(0, 10).map((p) => ({
        legenda: p.caption ?? null,
        curtidas: p.like_count ?? 0,
        comentarios: p.comments_count ?? 0,
        dataPublicacao: p.timestamp,
      })),
    },
    rede: {
      numeroDeUnidadesComparadas: validas.length,
      medianaSpend30dias: mediana(validas.map((v) => Number(v.spend ?? 0))),
      medianaCtr30dias: mediana(validas.map((v) => Number(v.ctr ?? 0))),
    },
    baseConhecimento: baseConhecimento ?? [],
  };
}
