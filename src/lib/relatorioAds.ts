import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  obterInsightsRelatorio,
  obterInsightsInstagramRelatorio,
  obterResumoContaInstagram,
  listarPostsInstagramDesde,
  type InsightsInstagramRelatorio,
  type LinhaInsightRelatorio,
} from "@/lib/meta/api";
import { comContaMeta } from "@/lib/meta/conexao";
import { adicionarDias, diaEmSaoPaulo, formatarDiaExibicao } from "@/lib/tempoSaoPaulo";

export const PERIODOS_RELATORIO_ADS = [15, 30, 45, 60, 90] as const;

export interface TotaisAds {
  gasto: number;
  impressoes: number;
  alcance: number;
  frequencia: number;
  cliques: number;
  cliquesNoLink: number;
  ctr: number;
  cpm: number;
  cpc: number;
  engajamentos: number;
  curtidas: number;
  comentarios: number;
  compartilhamentos: number;
  salvamentos: number;
  /** Visitas ao perfil atribuídas aos anúncios — null quando a Meta não devolve essa ação. */
  visitasPerfilAnuncios: number | null;
}

export interface DiaRelatorioAds {
  dia: string; // AAAA-MM-DD
  alcance: number;
  engajamentos: number;
  gasto: number;
}

export interface CampanhaRelatorioAds {
  nome: string;
  gasto: number;
  alcance: number;
  impressoes: number;
  engajamentos: number;
  cliquesNoLink: number;
}

export interface ItemOrganico {
  chave: string;
  rotulo: string;
  /** Total que a conta teve no Instagram (orgânico + o que veio dos anúncios); null = a Meta não
   * liberou esse número pra essa conta. */
  total: number | null;
  /** De onde veio o total: insights da conta, ou soma dos posts publicados no período. */
  origem: "conta" | "posts" | null;
  /** Parte atribuída aos anúncios NO INSTAGRAM, nunca maior que o total; null quando a Meta não informa. */
  trafego: number | null;
  /** O que os anúncios do Instagram informaram antes de limitar ao total (se maior, o total lido do
   * Instagram ficou abaixo do que os anúncios dizem ter entregue — ver aviso do relatório). */
  trafegoLido: number | null;
  /** total − tráfego (nunca negativo); null quando não dá pra separar. */
  organico: number | null;
}

export interface DadosRelatorioAds {
  geradoEm: string;
  periodo: { dias: number; desde: string; ate: string };
  conta: {
    contaId: string;
    clienteNome: string;
    contaNome: string;
    adAccountId: string;
    paginaNome: string | null;
    instagramUsername: string | null;
  };
  totais: TotaisAds;
  /** Só a parte dos anúncios que rodou no Instagram (a base da divisão orgânico × tráfego). null quando
   * a Meta não devolveu a divisão por plataforma. */
  totaisInstagram: TotaisAds | null;
  /** Gasto e alcance por onde os anúncios rodaram (instagram, facebook...). */
  plataformas: Array<{ plataforma: string; gasto: number; alcance: number; impressoes: number }>;
  /** Números da conta do Instagram no período; novosSeguidores é só dos últimos 30 dias (limite da Meta). */
  instagram: {
    novosSeguidores: number | null;
    alcance: number | null;
    visitasPerfil: number | null;
    /** Seguidores agora e posts publicados no período (usados na Saúde da rede). */
    seguidores: number | null;
    postsPublicados: number | null;
  } | null;
  /** Só vem quando o relatório é pedido com a chave de orgânico ligada. */
  organico: ItemOrganico[] | null;
  serieDiaria: DiaRelatorioAds[];
  campanhas: CampanhaRelatorioAds[];
  /** Avisos honestos sobre o que não deu pra buscar (ex.: Instagram sem insights). */
  avisos: string[];
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function acao(linha: LinhaInsightRelatorio | undefined, tipos: string[]): number {
  if (!linha?.actions) return 0;
  return linha.actions.filter((a) => tipos.includes(a.action_type)).reduce((soma, a) => soma + num(a.value), 0);
}

function visitasPerfil(linha: LinhaInsightRelatorio | undefined): number | null {
  const achadas = (linha?.actions ?? []).filter(
    (a) => /profile_visit/i.test(a.action_type) || a.action_type === "instagram_profile_visits"
  );
  return achadas.length > 0 ? achadas.reduce((s, a) => s + num(a.value), 0) : null;
}

function totaisDe(linha: LinhaInsightRelatorio | undefined): TotaisAds {
  const impressoes = num(linha?.impressions);
  const gasto = num(linha?.spend);
  const cliquesNoLink = num(linha?.inline_link_clicks) || acao(linha, ["link_click"]);
  return {
    gasto,
    impressoes,
    alcance: num(linha?.reach),
    frequencia: num(linha?.frequency),
    cliques: num(linha?.clicks),
    cliquesNoLink,
    ctr: num(linha?.ctr),
    cpm: num(linha?.cpm) || (impressoes > 0 ? (gasto / impressoes) * 1000 : 0),
    cpc: num(linha?.cpc) || (cliquesNoLink > 0 ? gasto / cliquesNoLink : 0),
    engajamentos: acao(linha, ["post_engagement"]),
    curtidas: acao(linha, ["post_reaction"]),
    comentarios: acao(linha, ["comment"]),
    compartilhamentos: acao(linha, ["post"]),
    salvamentos: acao(linha, ["onsite_conversion.post_save"]),
    visitasPerfilAnuncios: visitasPerfil(linha),
  };
}

/** A Meta limita os insights do Instagram a 30 dias por chamada; períodos maiores somam janelas
 * consecutivas. Os totais de curtidas, visualizações etc. somam certo; o alcance, em períodos
 * longos, pode contar a mesma pessoa em mais de uma janela (o relatório avisa). */
async function insightsInstagramEmJanelas(igId: string, pageId: string | null, desde: string): Promise<InsightsInstagramRelatorio> {
  const total: InsightsInstagramRelatorio = { metricas: {}, novosSeguidores: null, erros: [] };
  // Mesmo recorte dos anúncios (do início do primeiro dia, horário de SP, até agora): sem isso o
  // Instagram contava "últimas N×24h" e os anúncios "N dias fechados", e a diferença (= orgânico)
  // saía distorcida em até um dia.
  let restante = (Date.now() - new Date(`${desde}T00:00:00-03:00`).getTime()) / 86_400_000;
  for (let fim = 0; restante > 0.01; ) {
    const janela = Math.min(30, restante);
    const parcial = await obterInsightsInstagramRelatorio(igId, pageId, janela, fim, fim === 0);
    for (const [k, v] of Object.entries(parcial.metricas)) total.metricas[k] = (total.metricas[k] ?? 0) + v;
    if (fim === 0) total.novosSeguidores = parcial.novosSeguidores;
    for (const e of parcial.erros) if (!total.erros.includes(e)) total.erros.push(e);
    fim += janela;
    restante -= janela;
  }
  return total;
}

/** Separa orgânico de tráfego: o Instagram informa o total; os anúncios informam o que eles mesmos
 * trouxeram; o orgânico é a diferença. Curtidas e comentários, quando a Meta não libera os insights
 * da conta, vêm da soma dos posts publicados no período (campos da própria mídia). */
function montarOrganico(
  ig: Record<string, number>,
  postsPeriodo: { curtidas: number; comentarios: number } | null,
  t: TotaisAds
): ItemOrganico[] {
  const definicoes: Array<[string, string, string, number | null, number | null]> = [
    ["views", "visualizacoes", "Visualizações", t.impressoes, null],
    ["reach", "alcance", "Alcance", t.alcance, null],
    ["likes", "curtidas", "Curtidas", t.curtidas, postsPeriodo?.curtidas ?? null],
    ["comments", "comentarios", "Comentários", t.comentarios, postsPeriodo?.comentarios ?? null],
    ["shares", "compartilhamentos", "Compartilhamentos", t.compartilhamentos, null],
    ["saves", "salvamentos", "Salvamentos", t.salvamentos, null],
    ["profile_views", "visitas", "Visitas ao perfil", t.visitasPerfilAnuncios, null],
  ];
  return definicoes.map(([metrica, chave, rotulo, trafegoLido, dosPosts]) => {
    const daConta = ig[metrica];
    const total = daConta !== undefined ? daConta : dosPosts;
    const origem: ItemOrganico["origem"] = daConta !== undefined ? "conta" : dosPosts !== null ? "posts" : null;
    // O Instagram informa o total (orgânico + anúncios) e os anúncios informam a parte deles; o
    // orgânico é a diferença. Se os anúncios disserem ter entregue mais do que o total lido, limita ao
    // total — assim orgânico + tráfego sempre fecha com o total mostrado.
    const trafego = trafegoLido === null ? null : total === null ? trafegoLido : Math.min(trafegoLido, total);
    return {
      chave,
      rotulo,
      total,
      origem,
      trafego,
      trafegoLido,
      organico: total === null || trafego === null ? null : Math.max(total - trafego, 0),
    };
  });
}

/** Grava a leitura de seguidores de hoje e devolve o ganho desde a leitura mais antiga dentro do
 * período (ou null se ainda não há leitura anterior). */
async function ganhoDeSeguidoresPorLeituras(
  contaId: string,
  seguidoresAgora: number,
  hoje: string,
  desde: string
): Promise<{ ganho: number; desdeDia: string } | null> {
  const supabase = criarClienteAdmin();
  await supabase
    .from("smartads_seguidores_snapshot")
    .upsert({ conta_id: contaId, dia: hoje, seguidores: seguidoresAgora }, { onConflict: "conta_id,dia" });
  const { data } = await supabase
    .from("smartads_seguidores_snapshot")
    .select("dia, seguidores")
    .eq("conta_id", contaId)
    .gte("dia", desde)
    .lt("dia", hoje)
    .order("dia", { ascending: true })
    .limit(1);
  const base = data?.[0];
  return base ? { ganho: seguidoresAgora - base.seguidores, desdeDia: base.dia } : null;
}

/** Relatório de tráfego (anúncios) de UMA conta no período — só números de resultado: alcance,
 * engajamento, cliques e visitas ao perfil, mais o investimento. Cada bloco que falha na Meta vira
 * um aviso em vez de derrubar o relatório inteiro; só os totais do período são obrigatórios. */
export async function gerarRelatorioAds(contaId: string, dias: number, comOrganico = false): Promise<DadosRelatorioAds> {
  const supabase = criarClienteAdmin();
  const { data: conta, error } = await supabase
    .from("smartads_contas_meta")
    .select(
      "id, meta_ad_account_id, meta_ad_account_nome, nome_exibicao, page_id, page_nome, instagram_business_id, instagram_username, smartads_clientes(nome)"
    )
    .eq("id", contaId)
    .single();
  if (error || !conta) throw new Error("Conta não encontrada.");

  const hoje = diaEmSaoPaulo(new Date().toISOString());
  const desde = adicionarDias(hoje, -(dias - 1));
  const adAccountId = conta.meta_ad_account_id as string;
  const avisos: string[] = [];

  return comContaMeta(contaId, async () => {
    const [totalAtual, porDia, porCampanha, porPlataforma, igInsights, igPosts, igResumo] = await Promise.allSettled([
      obterInsightsRelatorio(adAccountId, { nivel: "account", desde, ate: hoje }),
      obterInsightsRelatorio(adAccountId, { nivel: "account", desde, ate: hoje, porDia: true }),
      obterInsightsRelatorio(adAccountId, { nivel: "campaign", desde, ate: hoje }),
      obterInsightsRelatorio(adAccountId, { nivel: "account", desde, ate: hoje, breakdownPlataforma: true }),
      conta.instagram_business_id
        ? insightsInstagramEmJanelas(conta.instagram_business_id, (conta.page_id as string | null) ?? null, desde)
        : Promise.resolve(null),
      conta.instagram_business_id
        ? listarPostsInstagramDesde(conta.instagram_business_id, Math.floor(new Date(`${desde}T00:00:00-03:00`).getTime() / 1000))
        : Promise.resolve(null),
      conta.instagram_business_id ? obterResumoContaInstagram(conta.instagram_business_id) : Promise.resolve(null),
    ]);

    if (totalAtual.status === "rejected") {
      throw totalAtual.reason instanceof Error ? totalAtual.reason : new Error("Falha ao buscar os números na Meta.");
    }

    if (porDia.status === "rejected") avisos.push("Não deu pra buscar a evolução diária.");
    if (porCampanha.status === "rejected") avisos.push("Não deu pra buscar o detalhe por campanha.");

    const serieDiaria: DiaRelatorioAds[] =
      porDia.status === "fulfilled"
        ? porDia.value
            .filter((l) => l.date_start)
            .map((l) => ({
              dia: l.date_start as string,
              alcance: num(l.reach),
              engajamentos: acao(l, ["post_engagement"]),
              gasto: num(l.spend),
            }))
            .sort((a, b) => a.dia.localeCompare(b.dia))
        : [];

    const campanhas: CampanhaRelatorioAds[] =
      porCampanha.status === "fulfilled"
        ? porCampanha.value
            .map((l) => ({
              nome: l.campaign_name ?? "(sem nome)",
              gasto: num(l.spend),
              alcance: num(l.reach),
              impressoes: num(l.impressions),
              engajamentos: acao(l, ["post_engagement"]),
              cliquesNoLink: num(l.inline_link_clicks) || acao(l, ["link_click"]),
            }))
            .sort((a, b) => b.alcance - a.alcance)
        : [];

    const ig = igInsights.status === "fulfilled" ? igInsights.value : null;
    const posts = igPosts.status === "fulfilled" ? igPosts.value : null;
    const postsPeriodo = posts
      ? {
          curtidas: posts.reduce((soma, p) => soma + (p.like_count ?? 0), 0),
          comentarios: posts.reduce((soma, p) => soma + (p.comments_count ?? 0), 0),
        }
      : null;
    const seguidoresAgora = igResumo.status === "fulfilled" ? igResumo.value?.followers_count ?? null : null;

    let instagram: DadosRelatorioAds["instagram"] = null;
    if (conta.instagram_business_id) {
      let novosSeguidores = ig?.novosSeguidores ?? null;
      if (novosSeguidores === null && seguidoresAgora !== null) {
        try {
          const leitura = await ganhoDeSeguidoresPorLeituras(contaId, seguidoresAgora, hoje, desde);
          if (leitura) {
            novosSeguidores = leitura.ganho;
            if (leitura.desdeDia !== desde) {
              avisos.push(`Novos seguidores contados desde ${formatarDiaExibicao(leitura.desdeDia)}, a primeira leitura guardada no período.`);
            }
          } else {
            avisos.push("Comecei a guardar a leitura de seguidores hoje. A partir de amanhã o relatório mostra quantos você ganhou no período.");
          }
        } catch {
          /* sem snapshot — fica "—" */
        }
      } else if (dias > 30 && novosSeguidores !== null) {
        avisos.push("A Meta só informa novos seguidores dos últimos 30 dias.");
      }
      instagram = {
        novosSeguidores,
        alcance: ig?.metricas.reach ?? null,
        visitasPerfil: ig?.metricas.profile_views ?? null,
        seguidores: seguidoresAgora,
        postsPublicados: posts ? posts.length : null,
      };
      if (dias > 30 && ig && ig.metricas.reach !== undefined) {
        avisos.push("Alcance do Instagram em períodos longos soma janelas de 30 dias, então pode repetir a mesma pessoa.");
      }
      const semInsights = igInsights.status === "rejected" || (ig !== null && Object.keys(ig.metricas).length === 0);
      if (semInsights || (ig && ig.erros.length > 0)) {
        const motivo =
          igInsights.status === "rejected"
            ? igInsights.reason instanceof Error
              ? igInsights.reason.message
              : "erro desconhecido"
            : ig?.erros[0] ?? "";
        const resumido = motivo.length > 260 ? `${motivo.slice(0, 260)}…` : motivo;
        avisos.push(
          semInsights
            ? `O Instagram não liberou os números gerais da conta (alcance, visualizações, visitas...). Motivo da Meta: ${resumido}`
            : `Alguns números gerais do Instagram não vieram. Motivo da Meta: ${resumido}`
        );
        // Deixa o motivo real gravado pra eu poder ler depois sem depender dos logs da Vercel.
        try {
          await criarClienteAdmin()
            .from("smartads_cron_diagnostico")
            .insert({ cron: `relatorio-ads:${contaId}`, iniciado_em: new Date().toISOString(), erro: (ig?.erros ?? [motivo]).join(" | ").slice(0, 1500) });
        } catch {
          /* diagnóstico é só um extra */
        }
      }
    }

    const totaisAtuais = totaisDe(totalAtual.value[0]);
    // Anúncios que rodaram no Instagram × em outras plataformas (Facebook etc.): o total do Instagram só
    // inclui o que rodou nele, então a divisão orgânico × tráfego usa só essa parte.
    let totaisInstagram: TotaisAds | null = null;
    let plataformas: DadosRelatorioAds["plataformas"] = [];
    if (porPlataforma.status === "fulfilled") {
      plataformas = porPlataforma.value
        .filter((l) => l.publisher_platform)
        .map((l) => ({
          plataforma: l.publisher_platform as string,
          gasto: num(l.spend),
          alcance: num(l.reach),
          impressoes: num(l.impressions),
        }))
        .sort((a, b) => b.gasto - a.gasto);
      totaisInstagram = totaisDe(porPlataforma.value.find((l) => l.publisher_platform === "instagram"));
      const fora = plataformas.filter((p) => p.plataforma !== "instagram" && p.gasto > 0);
      if (fora.length > 0) {
        avisos.push(
          `Parte do investimento rodou fora do Instagram (${fora.map((p) => `${p.plataforma}: R$ ${p.gasto.toFixed(2).replace(".", ",")}`).join(", ")}) — a divisão orgânico × tráfego usa só o que rodou no Instagram.`
        );
      }
    } else {
      avisos.push("Não deu pra separar os anúncios por plataforma; a divisão orgânico × tráfego usa o total dos anúncios.");
    }
    let organico: ItemOrganico[] | null = null;
    if (comOrganico) {
      if (!conta.instagram_business_id) {
        avisos.push("Essa conta não tem Instagram conectado, então não dá pra separar o orgânico.");
      } else {
        organico = montarOrganico(ig?.metricas ?? {}, postsPeriodo, totaisInstagram ?? totaisAtuais);
        const limitados = organico.filter((i) => i.trafegoLido !== null && i.trafego !== null && i.trafegoLido > i.trafego);
        if (limitados.length > 0) {
          avisos.push(`Em ${limitados.map((i) => i.rotulo.toLowerCase()).join(", ")} os anúncios informam mais do que o total lido do Instagram; o tráfego foi limitado ao total.`);
        }
        if (organico.some((i) => i.origem === "posts")) {
          avisos.push("Curtidas e comentários do orgânico foram somados dos posts publicados no período.");
        }
        if (organico.some((i) => i.chave === "visitas" && i.trafego === null)) {
          avisos.push("A Meta não informa as visitas ao perfil vindas dos anúncios, então esse número não é dividido.");
        }
      }
    }

    const cliente = (conta as any).smartads_clientes;
    return {
      geradoEm: new Date().toISOString(),
      periodo: { dias, desde, ate: hoje },
      conta: {
        contaId,
        clienteNome: (Array.isArray(cliente) ? cliente[0]?.nome : cliente?.nome) ?? "",
        contaNome: conta.nome_exibicao || conta.meta_ad_account_nome || adAccountId,
        adAccountId,
        paginaNome: conta.page_nome ?? null,
        instagramUsername: conta.instagram_username ?? null,
      },
      totais: totaisAtuais,
      totaisInstagram,
      plataformas,
      organico,
      instagram,
      serieDiaria,
      campanhas,
      avisos,
    };
  });
}
