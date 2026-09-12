// Wrapper de baixo nível pra chamar o Gemini — MESMO padrão já usado no chatbot-direct
// (src/lib/gemini.ts): fetch cru na API REST, sem SDK, porque é só isso que os recursos de IA do
// SmartAds precisam (nenhuma conversa com histórico, só "aqui estão os dados, escreva um texto").
//
// Modelo mais leve por padrão (ver .env.example) — os recursos aqui são resumos curtos, não vale
// pagar o preço de um modelo maior pra isso.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";

export class ErroGeminiNaoConfigurado extends Error {
  constructor() {
    super("GEMINI_API_KEY não configurada.");
    this.name = "ErroGeminiNaoConfigurado";
  }
}

/** Gera texto a partir de um prompt do sistema (instrução fixa) + prompt do usuário (os dados da
 * vez). Retorna `null` em qualquer falha (API fora do ar, resposta vazia etc.) — os recursos que
 * chamam essa função tratam isso como "não deu pra gerar agora", nunca quebram a tela por causa
 * disso (ver src/lib/ia/resumoRelatorio.ts). */
export async function gerarTextoComGemini(
  promptDoSistema: string,
  promptDoUsuario: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new ErroGeminiNaoConfigurado();
  }

  const resposta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: promptDoSistema }] },
        contents: [{ role: "user", parts: [{ text: promptDoUsuario }] }],
      }),
      cache: "no-store",
    }
  );

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => "");
    console.error(`Falha ao chamar o Gemini (status ${resposta.status}):`, corpoErro);
    return null;
  }

  const dados = await resposta.json();
  const texto = dados?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof texto === "string" ? texto.trim() : null;
}
