import { gerarTextoComGemini } from "@/lib/ia/gemini";

const TIPOS_VALIDOS = ["alcance", "engajamento", "cliques_link", "formulario", "visita_perfil"];

const PROMPT_SISTEMA = `Você ajuda a montar a sequência de etapas de uma Estratégia de tráfego pago (Meta
Ads) pra uma rede de franquias. Cada etapa é uma campanha com um objetivo (tipo) e uma duração em
dias, rodando uma depois da outra, sem sobreposição. Você recebe a duração total da campanha em
dias e o objetivo geral em texto livre.

Tipos de campanha válidos — use exatamente um destes valores em "tipoModelo":
"alcance" (reconhecimento/awareness, maximizar quantas pessoas veem),
"engajamento" (curtidas/comentários/compartilhamentos num post específico),
"cliques_link" (tráfego pro site),
"formulario" (geração de leads via formulário nativo da Meta),
"visita_perfil" (visitas ao perfil do Instagram).

Responda em JSON estrito, sem markdown, sem texto fora do JSON:
{
  "etapas": [
    { "nomeEtapa": "nome curto em português", "tipoModelo": "<um dos tipos válidos>", "duracaoDias": <inteiro> }
  ]
}

A soma de duracaoDias de todas as etapas tem que fechar EXATAMENTE a duração total informada.
Normalmente 2 a 4 etapas fazem sentido, sempre numa progressão lógica (ex: reconhecimento antes de
conversão, nunca o contrário). Nunca inclua uma etapa sem relação clara com o objetivo informado.`;

export interface EtapaSugerida {
  nomeEtapa: string;
  tipoModelo: string;
  duracaoDias: number;
}

/** Pede ao Gemini uma sequência de etapas pra uma Estratégia, dado o objetivo em texto livre e a
 * duração total desejada — usado pelo botão "Sugerir com IA" no construtor. Devolve `null` em
 * qualquer falha (Gemini fora do ar, resposta fora do formato) — tratado como "não deu pra
 * sugerir agora" por quem chama, nunca impede montar a estratégia manualmente. */
export async function sugerirEtapasEstrategia(
  objetivo: string,
  duracaoTotalDias: number
): Promise<EtapaSugerida[] | null> {
  let textoResposta: string | null;
  try {
    textoResposta = await gerarTextoComGemini(
      PROMPT_SISTEMA,
      `Objetivo geral: ${objetivo}\nDuração total: ${duracaoTotalDias} dias`
    );
  } catch {
    return null;
  }
  if (!textoResposta) return null;

  const bruto = textoResposta.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  try {
    const parseado = JSON.parse(bruto);
    if (!Array.isArray(parseado.etapas)) return null;

    const etapas = parseado.etapas
      .filter(
        (e: unknown): e is { nomeEtapa: string; tipoModelo: string; duracaoDias: number } => {
          const etapa = e as Record<string, unknown>;
          return (
            !!etapa &&
            typeof etapa.nomeEtapa === "string" &&
            typeof etapa.tipoModelo === "string" &&
            TIPOS_VALIDOS.includes(etapa.tipoModelo) &&
            typeof etapa.duracaoDias === "number" &&
            etapa.duracaoDias > 0
          );
        }
      )
      .map((e: { nomeEtapa: string; tipoModelo: string; duracaoDias: number }) => ({
        nomeEtapa: e.nomeEtapa,
        tipoModelo: e.tipoModelo,
        duracaoDias: Math.round(e.duracaoDias),
      }));

    return etapas.length > 0 ? etapas : null;
  } catch {
    return null;
  }
}
