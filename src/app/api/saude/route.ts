import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsConta, obterOrcamentoDiarioAtivo } from "@/lib/meta/api";
import { calcularSaudeConta } from "@/lib/saude";
import { detectarAnomalia, janelasDeComparacao, type Anomalia } from "@/lib/anomalia";
import { obterBoostInsightsPorConta, obterCampanhaMaeAtivaPorConta } from "@/lib/inicio/boostInsights";

export const dynamic = "force-dynamic";

// Cache do selo por 1h — não precisa ser em tempo real (é só um sinal de "olha aqui", não um
// número que alguém vai conferir centavo a centavo), e evita bater na Meta toda vez que a tela
// inicial é aberta.
const VALIDADE_MS = 60 * 60 * 1000;

interface SaudeContaResultado {
  contaId: string;
  status: string;
  motivo: string;
  anomalia: Anomalia | null;
  campanhasAtivas: number | null;
  gasto30dCentavos: number | null;
  orcamentoDiarioAtivoCentavos: number | null;
}

/** Selo de saúde + números da dashboard inicial (campanhas com atividade nos últimos 30 dias,
 * quanto foi gasto nesse período, e pra conta com boost automático ligado, o orçamento diário
 * comprometido em campanhas ativas) — MESMO cache de 1h pra tudo isso, calculados juntos porque as
 * chamadas à Meta que um precisa são baratas de somar à do outro. Recalcula primeiro as contas
 * que estão com cache velho ou nunca calculadas. Uma conta com erro individual (token revogado,
 * conta pausada etc.) não derruba as outras — some da resposta, o front mantém o valor anterior
 * ou mostra "sem dados".
 *
 * O selo de saúde compara o período atual com o anterior (ver src/lib/anomalia.ts) — quando algo
 * foge do normal, essa comparação vence o limiar simples (src/lib/saude.ts) porque é mais
 * específica e acionável ("CTR caiu 45%" diz mais que "CTR baixo"). Já "campanhasAtivas" é a
 * contagem de campanhas com QUALQUER atividade nos últimos 30 dias (mesma definição usada pra
 * filtrar a lista em /campanhas/conta/[contaId] — uma campanha pausada há 6 meses não conta).
 *
 * Os insights do boost automático (quantas campanhas do boost ainda estão no período, previsão de
 * gasto) e a Campanha-Mãe ativa vêm de fora desse cache — são consulta pura no Supabase (sem Meta),
 * então são recalculados a cada chamada, sem custo de rate limit. */
export async function GET() {
  const supabase = criarClienteAdmin();

  const [{ data: contas, error: erroContas }, { data: cache }] = await Promise.all([
    supabase
      .from("smartads_contas_meta")
      .select("id, meta_ad_account_id, boost_automatico_ativo")
      .eq("ativo", true),
    supabase.from("smartads_saude_contas").select("*"),
  ]);

  if (erroContas) {
    return NextResponse.json({ erro: erroContas.message }, { status: 500 });
  }

  const cachePorConta = new Map((cache ?? []).map((linha) => [linha.conta_id, linha]));
  const agora = Date.now();
  const janelas = janelasDeComparacao();

  const [boostPorConta, campanhaMaePorConta] = await Promise.all([
    obterBoostInsightsPorConta((contas ?? []).map((c) => c.id)),
    obterCampanhaMaeAtivaPorConta((contas ?? []).map((c) => c.id)),
  ]);

  const resultados = await Promise.all(
    (contas ?? []).map(async (conta): Promise<SaudeContaResultado | null> => {
      const cacheDaConta = cachePorConta.get(conta.id);
      const cacheValido =
        cacheDaConta && agora - new Date(cacheDaConta.calculado_em).getTime() < VALIDADE_MS;

      if (cacheValido) {
        return {
          contaId: conta.id,
          status: cacheDaConta.status,
          motivo: cacheDaConta.motivo,
          anomalia: cacheDaConta.anomalia ?? null,
          campanhasAtivas: cacheDaConta.campanhas_ativas ?? null,
          gasto30dCentavos: cacheDaConta.gasto_30d_centavos ?? null,
          orcamentoDiarioAtivoCentavos: cacheDaConta.orcamento_diario_ativo_centavos ?? null,
        };
      }

      try {
        const [atual, anterior, campanhas30d, orcamentoDiarioAtivoCentavos] = await Promise.all([
          obterInsightsConta(conta.meta_ad_account_id, {
            nivel: "account",
            intervalo: janelas.atual,
            porDia: false,
          }),
          obterInsightsConta(conta.meta_ad_account_id, {
            nivel: "account",
            intervalo: janelas.anterior,
            porDia: false,
          }),
          obterInsightsConta(conta.meta_ad_account_id, {
            nivel: "campaign",
            datePreset: "last_30d",
            porDia: false,
          }),
          // Só pra conta com boost ligado — é o único lugar que usa esse número, não vale a chamada
          // extra pras demais.
          conta.boost_automatico_ativo ? obterOrcamentoDiarioAtivo(conta.meta_ad_account_id) : Promise.resolve(null),
        ]);

        const anomalia = detectarAnomalia(atual, anterior);
        const saude = anomalia
          ? { status: "atencao" as const, motivo: anomalia.mensagem }
          : calcularSaudeConta(atual);

        const campanhasAtivas = campanhas30d.length;
        const gasto30dCentavos = Math.round(
          campanhas30d.reduce((soma, c) => soma + Number(c.spend ?? 0), 0) * 100
        );

        await supabase.from("smartads_saude_contas").upsert({
          conta_id: conta.id,
          status: saude.status,
          motivo: saude.motivo,
          anomalia,
          campanhas_ativas: campanhasAtivas,
          gasto_30d_centavos: gasto30dCentavos,
          orcamento_diario_ativo_centavos: orcamentoDiarioAtivoCentavos,
          calculado_em: new Date().toISOString(),
        });

        return { contaId: conta.id, ...saude, anomalia, campanhasAtivas, gasto30dCentavos, orcamentoDiarioAtivoCentavos };
      } catch {
        // Meta desconectada, conta com erro, etc. — mantém o cache antigo se tiver, senão some da
        // resposta (o front trata "sem entrada" como "sem dados ainda").
        return cacheDaConta
          ? {
              contaId: conta.id,
              status: cacheDaConta.status,
              motivo: cacheDaConta.motivo,
              anomalia: cacheDaConta.anomalia ?? null,
              campanhasAtivas: cacheDaConta.campanhas_ativas ?? null,
              gasto30dCentavos: cacheDaConta.gasto_30d_centavos ?? null,
              orcamentoDiarioAtivoCentavos: cacheDaConta.orcamento_diario_ativo_centavos ?? null,
            }
          : null;
      }
    })
  );

  const saude: Record<
    string,
    {
      status: string;
      motivo: string;
      anomalia: Anomalia | null;
      campanhasAtivas: number | null;
      gasto30dCentavos: number | null;
      orcamentoDiarioAtivoCentavos: number | null;
      boostCampanhasAtivas: number;
      boostPrevisaoGastoCentavos: number;
      boostOrcamentoDiarioCentavos: number;
      campanhaMaeAtivaNome: string | null;
    }
  > = {};
  for (const resultado of resultados) {
    if (resultado) {
      const boost = boostPorConta.get(resultado.contaId);
      saude[resultado.contaId] = {
        status: resultado.status,
        motivo: resultado.motivo,
        anomalia: resultado.anomalia,
        campanhasAtivas: resultado.campanhasAtivas,
        gasto30dCentavos: resultado.gasto30dCentavos,
        orcamentoDiarioAtivoCentavos: resultado.orcamentoDiarioAtivoCentavos,
        boostCampanhasAtivas: boost?.campanhasAtivas ?? 0,
        boostPrevisaoGastoCentavos: boost?.previsaoGastoCentavos ?? 0,
        boostOrcamentoDiarioCentavos: boost?.orcamentoDiarioCentavos ?? 0,
        campanhaMaeAtivaNome: campanhaMaePorConta.get(resultado.contaId) ?? null,
      };
    }
  }

  return NextResponse.json({ saude });
}
