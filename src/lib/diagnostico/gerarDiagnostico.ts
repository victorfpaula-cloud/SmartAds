import { gerarTextoComGemini } from "@/lib/ia/gemini";
import type { PacoteDadosDiagnostico } from "./coletarDados";

const PROMPT_SISTEMA = `Você é o estrategista de tráfego pago (Meta Ads) de uma agência que administra
várias unidades de uma MESMA rede franqueada, todas usando o mesmo tipo de campanha padronizada.
Vai receber um pacote em JSON com: desempenho pago dos últimos 30 dias (gasto, CTR, CPC, quais
campanhas estão ativas e com que objetivo), sinais orgânicos do Instagram (engajamento por post,
seguidores, alcance), a mediana das OUTRAS unidades da rede (pra comparação), a meta de negócio
dessa unidade (se houver) e uma base de conhecimento com boas práticas do setor.

REGRA MAIS IMPORTANTE, sem exceção: toda sugestão que você propuser tem que ser uma ação de MÍDIA
PAGA/TRÁFEGO — nova campanha, ajuste de orçamento, pausar campanha, ou turbinar um post que já
performou bem organicamente. Dado orgânico é só SINAL pra decidir qual criativo/formato priorizar
numa campanha paga — NUNCA vire uma recomendação de conteúdo orgânico isolada (nunca diga "poste
mais disso" sem amarrar numa ação paga concreta).

Responda em JSON estrito, sem markdown, sem texto fora do JSON, no formato:
{
  "diagnostico": "texto corrido em português do Brasil, 4-8 frases, direto, sem jargão técnico
    demais — cobrindo: panorama atual, comparação com a mediana da rede, e cobertura de funil
    (falta algum objetivo importante sem campanha ativa?)",
  "sugestoes": [
    {
      "tipo": "nova_campanha" | "ajustar_orcamento" | "pausar_campanha" | "turbinar_post" | "outro",
      "titulo": "título curto da ação",
      "descricao": "por que essa ação, em 1-2 frases, sempre amarrada a mídia paga",
      "dados": { ...formato exato depende do tipo, sempre usando os IDs que vêm no JSON de entrada }
    }
  ]
}

Formato exato de "dados" por tipo (campos fora desse formato são ignorados na aplicação, então
siga à risca quando o tipo permitir):
- "ajustar_orcamento": { "adsetId": "<adsetId de uma campanha ativa>", "tipoOrcamento": "diario" ou
  "vitalicio" (mesmo tipo que a campanha já usa), "valorCentavos": <novo valor total em centavos> }
- "pausar_campanha": { "metaCampaignId": "<metaCampaignId de uma campanha ativa>" }
- "nova_campanha" e "turbinar_post": campos livres (não são aplicados automaticamente, só
  orientam o dono da agência a criar manualmente) — inclua o suficiente pra ele entender o que
  fazer sem precisar reler o diagnóstico inteiro.

No máximo 3 sugestões, só as mais relevantes. Se não houver nada de fato acionável, devolva
"sugestoes": [].`;

export interface ResultadoDiagnostico {
  diagnostico: string;
  sugestoes: Array<{
    tipo: "nova_campanha" | "ajustar_orcamento" | "pausar_campanha" | "turbinar_post" | "outro";
    titulo: string;
    descricao: string;
    dados: Record<string, unknown>;
  }>;
}

const TIPOS_VALIDOS = new Set(["nova_campanha", "ajustar_orcamento", "pausar_campanha", "turbinar_post", "outro"]);

/** Gera o diagnóstico + sugestões a partir do pacote de dados já coletado (ver coletarDados.ts).
 * Devolve `null` se o Gemini não estiver configurado, a chamada falhar, ou a resposta não vier no
 * formato esperado — tratado como "diagnóstico indisponível agora" por quem chama, nunca quebra a
 * geração pra tentar de novo mais tarde. */
export async function gerarDiagnostico(pacote: PacoteDadosDiagnostico): Promise<ResultadoDiagnostico | null> {
  let textoResposta: string | null;
  try {
    textoResposta = await gerarTextoComGemini(PROMPT_SISTEMA, JSON.stringify(pacote));
  } catch {
    return null;
  }
  if (!textoResposta) return null;

  // Gemini às vezes envolve o JSON num bloco ```json apesar da instrução — extrai só o miolo.
  const bruto = textoResposta.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  try {
    const parseado = JSON.parse(bruto);
    if (typeof parseado.diagnostico !== "string") return null;

    const sugestoes = Array.isArray(parseado.sugestoes)
      ? parseado.sugestoes
          .filter((s: unknown) => {
            const sugestao = s as Record<string, unknown>;
            return (
              sugestao &&
              typeof sugestao.tipo === "string" &&
              TIPOS_VALIDOS.has(sugestao.tipo) &&
              typeof sugestao.titulo === "string" &&
              typeof sugestao.descricao === "string"
            );
          })
          .map((s: any) => ({
            tipo: s.tipo,
            titulo: s.titulo,
            descricao: s.descricao,
            dados: typeof s.dados === "object" && s.dados !== null ? s.dados : {},
          }))
      : [];

    return { diagnostico: parseado.diagnostico, sugestoes };
  } catch {
    return null;
  }
}
