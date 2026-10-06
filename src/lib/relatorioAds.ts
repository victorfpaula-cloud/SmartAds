import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  obterInsightsRelatorio,
  obterInsightsContaInstagram,
  obterResumoContaInstagram,
  type LinhaInsightRelatorio,
} from "@/lib/meta/api";
import { comContaMeta } from "@/lib/meta/conexao";
import { adicionarDias, diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";

export const PERIODOS_RELATORIO_ADS = [15, 30, 60, 90] as const;

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
  instagram: { seguidores: number | null; alcance: number | null; visitasPerfil: number | null } | null;
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
 * consecutivas. Visitas ao perfil somam certo; o alcance, em períodos longos, pode contar a mesma
 * pessoa em mais de uma janela (o relatório avisa). */
async function insightsInstagramEmJanelas(igId: string, dias: number) {
  let reach = 0;
  let visitas: number | null = null;
  for (let fim = 0; fim < dias; fim += 30) {
    const janela = Math.min(30, dias - fim);
    const r = await obterInsightsContaInstagram(igId, fim + janela, fim);
    reach += r.reach;
    if (r.profileViews !== null) visitas = (visitas ?? 0) + r.profileViews;
  }
  return { reach, profileViews: visitas };
}

/** Relatório de tráfego (anúncios) de UMA conta no período — só números de resultado: alcance,
 * engajamento, cliques e visitas ao perfil, mais o investimento. Cada bloco que falha na Meta vira
 * um aviso em vez de derrubar o relatório inteiro; só os totais do período são obrigatórios. */
export async function gerarRelatorioAds(contaId: string, dias: number): Promise<DadosRelatorioAds> {
  const supabase = criarClienteAdmin();
  const { data: conta, error } = await supabase
    .from("smartads_contas_meta")
    .select(
      "id, meta_ad_account_id, meta_ad_account_nome, nome_exibicao, page_nome, instagram_business_id, instagram_username, smartads_clientes(nome)"
    )
    .eq("id", contaId)
    .single();
  if (error || !conta) throw new Error("Conta não encontrada.");

  const hoje = diaEmSaoPaulo(new Date().toISOString());
  const desde = adicionarDias(hoje, -(dias - 1));
  const adAccountId = conta.meta_ad_account_id as string;
  const avisos: string[] = [];

  return comContaMeta(contaId, async () => {
    const [totalAtual, porDia, porCampanha, igInsights, igResumo] = await Promise.allSettled([
      obterInsightsRelatorio(adAccountId, { nivel: "account", desde, ate: hoje }),
      obterInsightsRelatorio(adAccountId, { nivel: "account", desde, ate: hoje, porDia: true }),
      obterInsightsRelatorio(adAccountId, { nivel: "campaign", desde, ate: hoje }),
      conta.instagram_business_id ? insightsInstagramEmJanelas(conta.instagram_business_id, dias) : Promise.resolve(null),
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

    let instagram: DadosRelatorioAds["instagram"] = null;
    if (conta.instagram_business_id) {
      const ig = igInsights.status === "fulfilled" ? igInsights.value : null;
      const resumo = igResumo.status === "fulfilled" ? igResumo.value : null;
      instagram = {
        seguidores: resumo?.followers_count ?? null,
        alcance: ig ? ig.reach : null,
        visitasPerfil: ig ? ig.profileViews : null,
      };
      if (dias > 30) avisos.push("Alcance do Instagram em períodos longos soma janelas de 30 dias, então pode repetir a mesma pessoa.");
      if (igInsights.status === "rejected" || (ig && ig.reach === 0 && ig.profileViews === null)) {
        avisos.push("O Instagram não devolveu os números da conta nesse período.");
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
      totais: totaisDe(totalAtual.value[0]),
      instagram,
      serieDiaria,
      campanhas,
      avisos,
    };
  });
}
