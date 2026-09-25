import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsConta, obterOrcamentoConjunto, definirOrcamentoConjunto, type LinhaInsight } from "@/lib/meta/api";
import { registrarExecucao } from "./log";
import { executarEmLotes } from "@/lib/lotes";

const COOLDOWN_HORAS = 24;

/** Realoca orçamento sozinho entre as campanhas do mesmo cliente (dentro da mesma conta de
 * anúncio — não mistura contas diferentes) — chamada pelo cron (ver /api/cron/automacao).
 *
 * Métrica usada pra comparar campanhas: custo por clique (CPC). Não é ROAS nem custo por
 * resultado — o app ainda não rastreia conversão (ver aviso de CAPI na tela de Contas); CPC é o
 * sinal de eficiência mais honesto disponível hoje com o que a Meta devolve sem isso configurado.
 *
 * Lógica: entre as campanhas com gasto suficiente no período, pega a de MENOR CPC (mais eficiente)
 * e a de MAIOR CPC (menos eficiente) e desloca uma fatia do orçamento de uma pra outra, dentro do
 * teto configurado — nunca tudo de uma vez. Precisa de pelo menos 2 campanhas qualificadas pra
 * fazer qualquer coisa. Um cooldown de 24h por cliente evita ficar ajustando a cada execução do
 * cron. */
export async function executarPilotoAutomatico() {
  const supabase = criarClienteAdmin();
  const { data: pilotos } = await supabase.from("smartads_piloto_automatico").select("*").eq("ativo", true);

  // Em lotes (executarEmLotes) — cada piloto é de um cliente diferente, totalmente independente
  // dos outros, então dá pra paralelizar em vez de avaliar um cliente de cada vez.
  await executarEmLotes(pilotos ?? [], async (piloto) => {
    if (piloto.ultimo_ajuste_em) {
      const horasDesde = (Date.now() - new Date(piloto.ultimo_ajuste_em).getTime()) / 3_600_000;
      if (horasDesde < COOLDOWN_HORAS) return;
    }

    const { data: contas } = await supabase
      .from("smartads_contas_meta")
      .select("id, meta_ad_account_id")
      .eq("cliente_id", piloto.cliente_id)
      .eq("ativo", true);

    for (const conta of contas ?? []) {
      const { data: campanhas } = await supabase
        .from("smartads_campanhas_criadas")
        .select("*")
        .eq("conta_id", conta.id)
        .not("meta_adset_id", "is", null);

      if (!campanhas || campanhas.length < 2) continue;

      let insights: LinhaInsight[];
      try {
        insights = await obterInsightsConta(conta.meta_ad_account_id, {
          nivel: "campaign",
          datePreset: "last_7d",
          porDia: false,
        });
      } catch {
        continue;
      }

      const qualificadas = campanhas
        .map((campanha) => {
          const insight = insights.find((i) => i.campaign_id === campanha.meta_campaign_id);
          const gastoCentavos = Number(insight?.spend ?? 0) * 100;
          const cpc = Number(insight?.cpc ?? 0);
          return { campanha, gastoCentavos, cpc };
        })
        .filter((c) => c.gastoCentavos >= piloto.gasto_minimo_centavos && c.cpc > 0);

      if (qualificadas.length < 2) continue;

      const maisEficiente = qualificadas.reduce((a, b) => (b.cpc < a.cpc ? b : a));
      const menosEficiente = qualificadas.reduce((a, b) => (b.cpc > a.cpc ? b : a));
      if (maisEficiente.campanha.id === menosEficiente.campanha.id) continue;

      try {
        const [orcamentoMenosEficiente, orcamentoMaisEficiente] = await Promise.all([
          obterOrcamentoConjunto(menosEficiente.campanha.meta_adset_id),
          obterOrcamentoConjunto(maisEficiente.campanha.meta_adset_id),
        ]);
        if (!orcamentoMenosEficiente || !orcamentoMaisEficiente) {
          throw new Error("Não foi possível ler o orçamento atual de um dos conjuntos.");
        }

        const fatorReducao = piloto.teto_realocacao_percentual / 100;
        const valorDeslocado = Math.round(orcamentoMenosEficiente.valorCentavos * fatorReducao);
        const novoOrcamentoMenosEficiente = Math.max(1, orcamentoMenosEficiente.valorCentavos - valorDeslocado);
        const novoOrcamentoMaisEficiente = orcamentoMaisEficiente.valorCentavos + valorDeslocado;

        await definirOrcamentoConjunto(
          menosEficiente.campanha.meta_adset_id,
          orcamentoMenosEficiente.tipo,
          novoOrcamentoMenosEficiente
        );
        await definirOrcamentoConjunto(
          maisEficiente.campanha.meta_adset_id,
          orcamentoMaisEficiente.tipo,
          novoOrcamentoMaisEficiente
        );

        const nomeMenosEficiente = menosEficiente.campanha.config_criacao?.nomeCampanha ?? menosEficiente.campanha.meta_campaign_id;
        const nomeMaisEficiente = maisEficiente.campanha.config_criacao?.nomeCampanha ?? maisEficiente.campanha.meta_campaign_id;

        await registrarExecucao({
          tipo: "piloto_automatico",
          campanhaId: menosEficiente.campanha.id,
          descricao: `Piloto automático moveu R$ ${(valorDeslocado / 100).toFixed(2)} de "${nomeMenosEficiente}" (CPC R$ ${menosEficiente.cpc.toFixed(2)}) pra "${nomeMaisEficiente}" (CPC R$ ${maisEficiente.cpc.toFixed(2)}).`,
          dados: {
            campanhaOrigemId: menosEficiente.campanha.id,
            campanhaDestinoId: maisEficiente.campanha.id,
            valorDeslocado,
            cpcOrigem: menosEficiente.cpc,
            cpcDestino: maisEficiente.cpc,
          },
          sucesso: true,
        });

        await supabase
          .from("smartads_piloto_automatico")
          .update({ ultimo_ajuste_em: new Date().toISOString() })
          .eq("cliente_id", piloto.cliente_id);
      } catch (erro) {
        await registrarExecucao({
          tipo: "piloto_automatico",
          campanhaId: menosEficiente.campanha.id,
          descricao: `Falha ao realocar orçamento entre campanhas do cliente pelo piloto automático.`,
          sucesso: false,
          erroMensagem: erro instanceof Error ? erro.message : "Falha desconhecida.",
        });
      }
    }
  });
}
