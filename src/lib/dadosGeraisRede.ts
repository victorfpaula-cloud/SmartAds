import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsRelatorio, type LinhaInsightRelatorio } from "@/lib/meta/api";
import { comContaMeta } from "@/lib/meta/conexao";
import { listarContasDaRede } from "@/lib/saudeRede";
import { ehContaCentralDaRede, somarLinhas } from "@/lib/analiseTrafego";
import { adicionarDias, diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import { mapearEmLotes } from "@/lib/lotes";
import { obterSerieSeguidoresInstagram } from "@/lib/meta/api";

/** Volume de trabalho feito pelo SmartAds na franquia no período: só as campanhas criadas pelo
 * próprio SmartAds (campanhas criadas fora dele, como as de formulário da expansão, não entram em
 * nenhum número). Somadas entre as unidades; a conta central (Principal/Expansão) só entra pelas
 * campanhas que o SmartAds criou nela. */
export interface DadosGeraisRede {
  periodo: { dias: number; desde: string; ate: string };
  /** Unidades ativas: as que têm o boost ligado. */
  unidades: number;
  unidadesSemLeitura: number;
  /** Campanhas criadas pelo SmartAds no período, por unidade (inclui as sem nenhuma). */
  campanhasPorUnidade: Array<{ unidade: string; campanhas: number }>;
  /** Seguidores que as unidades com boost ligado ganharam no período; null sem leitura de nenhuma. */
  seguidoresGanhos: { total: number | null; unidades: number; semLeitura: number };
  investido: number;
  curtidas: number;
  alcance: number;
  visualizacoes: number;
  engajamentos: number;
  calculadoEm: string;
}

const LIMITE_MS = 45_000;
/** A Meta informa o ganho diário de seguidores só dos últimos 30 dias. */
const JANELA_GANHO_DIARIO_DIAS = 30;

/** Campanhas de formulário da expansão: nunca entram nos dados gerais. */
export const ehCampanhaDeExpansao = (nome: string | null | undefined) => /expans[aã]o|\(form\)/i.test(nome ?? "");

export async function calcularDadosGeraisRede(empresaId: string, dias: number): Promise<DadosGeraisRede> {
  const inicio = Date.now();
  const contasTodas = await listarContasDaRede(empresaId);
  const usos = new Map<string, number>();
  for (const c of contasTodas) if (c.adAccountId) usos.set(c.adAccountId, (usos.get(c.adAccountId) ?? 0) + 1);
  // Principal e Expansão dividem a conta de anúncio: a Principal entra (só pelas campanhas do SmartAds).
  const contas = contasTodas.filter((c) => {
    if (!c.adAccountId) return false;
    if (/\bprincipal\b/i.test(c.unidade) && (usos.get(c.adAccountId) ?? 0) === 2) return true;
    return (usos.get(c.adAccountId) ?? 0) === 1 && !ehContaCentralDaRede(c.unidade);
  });

  const hoje = diaEmSaoPaulo(new Date().toISOString());
  const ate = adicionarDias(hoje, -1);
  const desde = adicionarDias(ate, -(dias - 1));

  // Campanhas criadas pelo SmartAds no período: só elas contam (o resto fica de fora).
  const supabase = criarClienteAdmin();
  const idsDaContaPorCampanha = new Map<string, string>();
  const campanhasDaConta = new Map<string, number>();
  const { data: criadas, error } = await supabase
    .from("smartads_campanhas_criadas")
    .select("meta_campaign_id, conta_id, config_criacao")
    .in("conta_id", contas.map((c) => c.contaId))
    .gte("created_at", `${desde}T00:00:00-03:00`)
    .not("meta_campaign_id", "is", null)
    .limit(5000);
  if (error) throw new Error("Não consegui ler as campanhas criadas pelo SmartAds.");
  for (const linha of criadas ?? []) {
    const nome = (linha.config_criacao as { nomeCampanha?: string } | null)?.nomeCampanha;
    if (ehCampanhaDeExpansao(nome)) continue;
    idsDaContaPorCampanha.set(linha.meta_campaign_id as string, linha.conta_id as string);
    campanhasDaConta.set(linha.conta_id as string, (campanhasDaConta.get(linha.conta_id as string) ?? 0) + 1);
  }

  const lidas = await mapearEmLotes(
    contas,
    async (c): Promise<LinhaInsightRelatorio[] | null> => {
      if (Date.now() - inicio > LIMITE_MS) return null;
      try {
        return await comContaMeta(c.contaId, () =>
          obterInsightsRelatorio(c.adAccountId as string, { nivel: "campaign", desde, ate })
        );
      } catch {
        return null;
      }
    },
    6
  );

  let semLeitura = 0;
  const linhasDoSmartAds: LinhaInsightRelatorio[] = [];
  lidas.forEach((linhas) => {
    if (linhas === null) {
      semLeitura++;
      return;
    }
    for (const l of linhas) {
      if (l.campaign_id && idsDaContaPorCampanha.has(l.campaign_id)) linhasDoSmartAds.push(l);
    }
  });
  const m = somarLinhas(linhasDoSmartAds).tudo;

  // Seguidores ganhos (orgânico + anúncios, bruto): a soma dos ganhos diários que a Meta informa, só
  // das páginas com boost ligado. A Meta só guarda 30 dias desse ganho diário, então períodos
  // maiores não têm esse número.
  const { data: boosts } = await supabase
    .from("smartads_contas_meta")
    .select("id, boost_automatico_ativo, page_id")
    .in("id", contas.map((c) => c.contaId))
    .eq("boost_automatico_ativo", true);
  const pagina = new Map((boosts ?? []).map((b) => [b.id as string, (b.page_id as string | null) ?? null]));
  const comBoost = contas.filter((c) => pagina.has(c.contaId));
  let seguidoresGanhos: DadosGeraisRede["seguidoresGanhos"] = { total: null, unidades: comBoost.length, semLeitura: 0 };
  if (dias <= JANELA_GANHO_DIARIO_DIAS) {
    const ganhos = await mapearEmLotes(
      comBoost.filter((c) => c.instagramId),
      async (c): Promise<number | null> => {
        if (Date.now() - inicio > LIMITE_MS) return null;
        try {
          const serie = await obterSerieSeguidoresInstagram(c.instagramId as string, pagina.get(c.contaId) ?? null);
          return serie
            .filter((p) => {
              const dia = adicionarDias(diaEmSaoPaulo(p.fimIso), -1);
              return dia >= desde && dia <= ate;
            })
            .reduce((soma, p) => soma + p.valor, 0);
        } catch {
          return null;
        }
      },
      6
    );
    const lidos = ganhos.filter((g): g is number => g !== null);
    seguidoresGanhos = {
      total: lidos.length > 0 ? Math.round(lidos.reduce((soma, g) => soma + g, 0)) : null,
      unidades: comBoost.length,
      semLeitura: comBoost.length - lidos.length,
    };
  }

  const campanhasPorUnidade = contas
    .map((c) => ({ unidade: c.unidade, campanhas: campanhasDaConta.get(c.contaId) ?? 0 }))
    .sort((a, b) => b.campanhas - a.campanhas || a.unidade.localeCompare(b.unidade));

  const arred = (n: number) => Math.round(n * 100) / 100;
  return {
    periodo: { dias, desde, ate },
    unidades: comBoost.length,
    unidadesSemLeitura: semLeitura,
    campanhasPorUnidade,
    seguidoresGanhos,
    investido: arred(m.gasto),
    curtidas: Math.round(m.curtidas),
    alcance: Math.round(m.alcance),
    visualizacoes: Math.round(m.impressoes),
    engajamentos: Math.round(m.interacoes),
    calculadoEm: new Date().toISOString(),
  };
}
