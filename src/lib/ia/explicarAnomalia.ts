import { gerarTextoComGemini } from "./gemini";
import type { Anomalia } from "@/lib/anomalia";

const PROMPT_SISTEMA = `Você é o assistente de uma agência de tráfego pago (Meta Ads). Vai receber,
em JSON, uma anomalia detectada numa conta de anúncio (uma métrica que mudou muito comparando a
semana atual com a anterior) — a métrica, os dois valores e a variação percentual, mais o nome do
cliente e da conta.

Escreva 2 a 3 frases curtas em português do Brasil: a causa mais provável (ex: fadiga de
criativo, mudança de público, sazonalidade, aumento de concorrência) e UMA ação prática e
específica pra esse caso. Sem markdown, sem emoji, direto — como um aviso rápido que o dono da
agência vai ler em segundos antes de decidir o que fazer.`;

/** Explicação em texto (Gemini) pra uma anomalia já detectada por matemática pura (ver
 * src/lib/anomalia.ts) — chamado só quando o dono clica em "Por quê?" na tela de Contas, nunca
 * automático. Devolve `null` em qualquer falha (Gemini não configurado, chamada falhou etc.) —
 * tratado como "explicação indisponível agora", não quebra a tela. */
export async function explicarAnomalia(
  anomalia: Anomalia,
  contexto: { clienteNome: string; contaNome: string }
): Promise<string | null> {
  try {
    return await gerarTextoComGemini(
      PROMPT_SISTEMA,
      JSON.stringify({ ...anomalia, cliente: contexto.clienteNome, conta: contexto.contaNome })
    );
  } catch {
    return null;
  }
}
