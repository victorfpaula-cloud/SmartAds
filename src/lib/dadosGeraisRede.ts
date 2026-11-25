import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsRelatorio, type LinhaInsightRelatorio } from "@/lib/meta/api";
import { comContaMeta } from "@/lib/meta/conexao";
import { listarContasDaRede } from "@/lib/saudeRede";
import { ehContaCentralDaRede, somarLinhas } from "@/lib/analiseTrafego";
import { adicionarDias, diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import { mapearEmLotes } from "@/lib/lotes";

/** Volume de trabalho feito pelo SmartAds na franquia no período: só as campanhas criadas pelo
 * próprio SmartAds (campanhas criadas fora dele, como as de formulário da expansão, não entram em
 * nenhum número). Somadas entre as unidades; a conta central (Principal/Expansão) só entra pelas
 * campanhas que o SmartAds criou nela. */
export interface DadosGeraisRede {
  periodo: { dias: number; desde: string; ate: string };
  unidades: number;
  unidadesSemLeitura: number;
  /** Campanhas criadas pelo SmartAds no período. */
  campanhasCriadas: number;
  investido: number;
  curtidas: number;
  alcance: number;
  visualizacoes: number;
  engajamentos: number;
  calculadoEm: string;
}

const LIMITE_MS = 45_000;

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

  const arred = (n: number) => Math.round(n * 100) / 100;
  return {
    periodo: { dias, desde, ate },
    unidades: contas.length,
    unidadesSemLeitura: semLeitura,
    campanhasCriadas: idsDaContaPorCampanha.size,
    investido: arred(m.gasto),
    curtidas: Math.round(m.curtidas),
    alcance: Math.round(m.alcance),
    visualizacoes: Math.round(m.impressoes),
    engajamentos: Math.round(m.interacoes),
    calculadoEm: new Date().toISOString(),
  };
}
