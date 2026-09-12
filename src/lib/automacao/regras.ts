import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  obterInsightsConta,
  pausarCampanha,
  obterOrcamentoConjunto,
  definirOrcamentoConjunto,
  type LinhaInsight,
} from "@/lib/meta/api";
import { registrarExecucao } from "./log";

type Metrica = "ctr" | "cpc" | "cpm" | "frequencia" | "gasto";

const ROTULO_METRICA: Record<Metrica, string> = {
  ctr: "CTR",
  cpc: "custo por clique",
  cpm: "CPM",
  frequencia: "frequência",
  gasto: "gasto",
};

function calcularMetrica(insight: LinhaInsight | undefined, metrica: Metrica): number {
  if (!insight) return 0;
  if (metrica === "frequencia") {
    const impressoes = Number(insight.impressions ?? 0);
    const alcance = Number(insight.reach ?? 0);
    return alcance > 0 ? impressoes / alcance : 0;
  }
  if (metrica === "gasto") return Number(insight.spend ?? 0);
  return Number(insight[metrica] ?? 0);
}

function intervaloDaJanela(dias: number): { desde: string; ate: string } {
  const paraISO = (d: Date) => d.toISOString().slice(0, 10);
  const ontem = new Date();
  ontem.setUTCDate(ontem.getUTCDate() - 1);
  const inicio = new Date(ontem);
  inicio.setUTCDate(inicio.getUTCDate() - (dias - 1));
  return { desde: paraISO(inicio), ate: paraISO(ontem) };
}

/** Roda todas as regras ativas — chamada pelo cron (ver /api/cron/automacao). Cada regra:
 * 1. Respeita o cooldown (não dispara de novo antes de X horas da última vez).
 * 2. Busca os insights da(s) campanha(s) alvo na janela configurada.
 * 3. Só considera disparar se o gasto no período bateu o mínimo (evita agir em cima de poucas
 *    horas de dado).
 * 4. Compara a métrica com o limite; se bateu a condição, executa a ação e registra no log —
 *    sempre, sucesso ou falha, pra nunca ficar "will it, won't it" sobre o que a regra fez. */
export async function avaliarRegras() {
  const supabase = criarClienteAdmin();
  const { data: regras } = await supabase
    .from("smartads_regras_automacao")
    .select("*, smartads_contas_meta(meta_ad_account_id)")
    .eq("ativa", true);

  for (const regra of regras ?? []) {
    if (regra.ultimo_disparo_em) {
      const horasDesde = (Date.now() - new Date(regra.ultimo_disparo_em).getTime()) / 3_600_000;
      if (horasDesde < regra.cooldown_horas) continue;
    }

    const adAccountId = (regra as any).smartads_contas_meta?.meta_ad_account_id;
    if (!adAccountId) continue;

    const { data: campanhasAlvo } = regra.campanha_id
      ? await supabase.from("smartads_campanhas_criadas").select("*").eq("id", regra.campanha_id)
      : await supabase.from("smartads_campanhas_criadas").select("*").eq("conta_id", regra.conta_id);

    if (!campanhasAlvo?.length) continue;

    let insights: LinhaInsight[];
    try {
      insights = await obterInsightsConta(adAccountId, {
        nivel: "campaign",
        intervalo: intervaloDaJanela(regra.janela_dias),
        porDia: false,
      });
    } catch {
      continue; // conta desconectada/erro pontual — tenta de novo na próxima execução do cron
    }

    for (const campanha of campanhasAlvo) {
      const insight = insights.find((i) => i.campaign_id === campanha.meta_campaign_id);
      const gasto = Number(insight?.spend ?? 0) * 100; // spend vem em reais, gasto_minimo em centavos

      if (gasto < regra.gasto_minimo_centavos) continue;

      const metrica = regra.metrica as Metrica;
      const valorAtual = calcularMetrica(insight, metrica);
      const disparou =
        regra.operador === "maior_que" ? valorAtual > regra.valor_limite : valorAtual < regra.valor_limite;

      if (!disparou) continue;

      const rotulo = ROTULO_METRICA[metrica];
      const comparacao = regra.operador === "maior_que" ? "acima de" : "abaixo de";
      const contexto = `${rotulo} de ${valorAtual.toFixed(2)}, ${comparacao} o limite de ${regra.valor_limite} configurado na regra "${regra.nome}".`;

      try {
        if (regra.acao === "pausar") {
          await pausarCampanha(campanha.meta_campaign_id);
          await registrarExecucao({
            tipo: "regra",
            regraId: regra.id,
            campanhaId: campanha.id,
            descricao: `Campanha "${campanha.config_criacao?.nomeCampanha ?? campanha.meta_campaign_id}" pausada — ${contexto}`,
            dados: { metrica, valorAtual, valorLimite: regra.valor_limite },
            sucesso: true,
          });
        } else {
          if (!campanha.meta_adset_id) {
            throw new Error("Campanha sem conjunto de anúncios rastreado localmente.");
          }
          const orcamentoAtual = await obterOrcamentoConjunto(campanha.meta_adset_id);
          if (!orcamentoAtual) throw new Error("Não foi possível ler o orçamento atual do conjunto.");

          const percentual = regra.acao_percentual ?? 10;
          const fator = regra.acao === "aumentar_orcamento" ? 1 + percentual / 100 : 1 - percentual / 100;
          const novoValor = Math.max(1, Math.round(orcamentoAtual.valorCentavos * fator));

          await definirOrcamentoConjunto(campanha.meta_adset_id, orcamentoAtual.tipo, novoValor);
          await registrarExecucao({
            tipo: "regra",
            regraId: regra.id,
            campanhaId: campanha.id,
            descricao: `Orçamento de "${campanha.config_criacao?.nomeCampanha ?? campanha.meta_campaign_id}" ${regra.acao === "aumentar_orcamento" ? "aumentado" : "reduzido"} ${percentual}% (de R$ ${(orcamentoAtual.valorCentavos / 100).toFixed(2)} pra R$ ${(novoValor / 100).toFixed(2)}) — ${contexto}`,
            dados: { metrica, valorAtual, valorLimite: regra.valor_limite, orcamentoAnterior: orcamentoAtual.valorCentavos, orcamentoNovo: novoValor },
            sucesso: true,
          });
        }

        await supabase
          .from("smartads_regras_automacao")
          .update({ ultimo_disparo_em: new Date().toISOString() })
          .eq("id", regra.id);
      } catch (erro) {
        await registrarExecucao({
          tipo: "regra",
          regraId: regra.id,
          campanhaId: campanha.id,
          descricao: `Falha ao executar a regra "${regra.nome}" em "${campanha.config_criacao?.nomeCampanha ?? campanha.meta_campaign_id}".`,
          dados: { metrica, valorAtual, valorLimite: regra.valor_limite },
          sucesso: false,
          erroMensagem: erro instanceof Error ? erro.message : "Falha desconhecida.",
        });
      }
    }
  }
}
