import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsRelatorio } from "@/lib/meta/api";
import { comContaMeta } from "@/lib/meta/conexao";
import { listarContasDaRede } from "@/lib/saudeRede";
import { ehContaCentralDaRede, somarLinhas } from "@/lib/analiseTrafego";
import { adicionarDias, diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import { mapearEmLotes } from "@/lib/lotes";

/** Volume de trabalho da franquia inteira no período: campanhas (boost e individuais), curtidas,
 * alcance, visualizações e investido. Soma as unidades (mesmo critério da Análise do tráfego: sem a
 * conta central Principal/Expansão e sem contas que dividem a mesma conta de anúncio). */
export interface DadosGeraisRede {
  periodo: { dias: number; desde: string; ate: string };
  unidades: number;
  unidadesSemLeitura: number;
  /** Campanhas que tiveram gasto no período (Meta). */
  rodaram: { total: number; boost: number; individuais: number };
  /** Campanhas criadas pelo SmartAds no período; null se a consulta falhar. */
  criadas: { total: number; boost: number; individuais: number } | null;
  investido: number;
  curtidas: number;
  alcance: number;
  visualizacoes: number;
  engajamentos: number;
  calculadoEm: string;
}

const LIMITE_MS = 45_000;

/** Campanhas de formulário da expansão (ficam na conta da Principal, mas não são da Principal). */
export const ehCampanhaDeExpansao = (nome: string | null | undefined) => /expans[aã]o|\(form\)/i.test(nome ?? "");

export async function calcularDadosGeraisRede(empresaId: string, dias: number): Promise<DadosGeraisRede> {
  const inicio = Date.now();
  const contasTodas = await listarContasDaRede(empresaId);
  const usos = new Map<string, number>();
  for (const c of contasTodas) if (c.adAccountId) usos.set(c.adAccountId, (usos.get(c.adAccountId) ?? 0) + 1);
  // A Principal divide a conta de anúncio com a Expansão: entra, mas sem as campanhas de Expansão
  // (ver ehCampanhaDeExpansao). A Expansão em si fica de fora, como as demais contas centrais.
  const contas = contasTodas.filter((c) => {
    if (!c.adAccountId) return false;
    if (/\bprincipal\b/i.test(c.unidade) && (usos.get(c.adAccountId) ?? 0) === 2) return true;
    return (usos.get(c.adAccountId) ?? 0) === 1 && !ehContaCentralDaRede(c.unidade);
  });

  const hoje = diaEmSaoPaulo(new Date().toISOString());
  const ate = adicionarDias(hoje, -1);
  const desde = adicionarDias(ate, -(dias - 1));

  const lidas = await mapearEmLotes(
    contas,
    async (c) => {
      if (Date.now() - inicio > LIMITE_MS) return null;
      try {
        const linhas = await comContaMeta(c.contaId, () =>
          obterInsightsRelatorio(c.adAccountId as string, { nivel: "campaign", desde, ate })
        );
        return somarLinhas(linhas.filter((l) => !ehCampanhaDeExpansao(l.campaign_name)));
      } catch {
        return null;
      }
    },
    6
  );

  const total = { campanhas: 0, boost: 0, gasto: 0, curtidas: 0, alcance: 0, impressoes: 0, engajamentos: 0 };
  let semLeitura = 0;
  for (const r of lidas) {
    if (!r) {
      semLeitura++;
      continue;
    }
    const m = r.tudo;
    total.gasto += m.gasto;
    total.curtidas += m.curtidas;
    total.alcance += m.alcance;
    total.impressoes += m.impressoes;
    total.engajamentos += m.interacoes;
    total.campanhas += m.campanhas;
    total.boost += r.boost.campanhas;
  }

  // Criadas pelo SmartAds no período (independe da leitura da Meta).
  let criadas: DadosGeraisRede["criadas"] = null;
  try {
    const supabase = criarClienteAdmin();
    const ids = contas.map((c) => c.contaId);
    const base = () =>
      supabase
        .from("smartads_campanhas_criadas")
        .select("id", { count: "exact", head: true })
        .in("conta_id", ids)
        .gte("created_at", `${desde}T00:00:00-03:00`)
        .not("config_criacao->>nomeCampanha", "ilike", "%expans%")
        .not("config_criacao->>nomeCampanha", "ilike", "%(form)%");
    const [todas, boost] = await Promise.all([base(), base().filter("config_criacao->>nomeCampanha", "ilike", "Boost%")]);
    if (!todas.error && !boost.error) {
      const t = todas.count ?? 0;
      const b = boost.count ?? 0;
      criadas = { total: t, boost: b, individuais: Math.max(0, t - b) };
    }
  } catch {
    criadas = null;
  }

  const arred = (n: number) => Math.round(n * 100) / 100;
  return {
    periodo: { dias, desde, ate },
    unidades: contas.length,
    unidadesSemLeitura: semLeitura,
    rodaram: { total: total.campanhas, boost: total.boost, individuais: Math.max(0, total.campanhas - total.boost) },
    criadas,
    investido: arred(total.gasto),
    curtidas: Math.round(total.curtidas),
    alcance: Math.round(total.alcance),
    visualizacoes: Math.round(total.impressoes),
    engajamentos: Math.round(total.engajamentos),
    calculadoEm: new Date().toISOString(),
  };
}
