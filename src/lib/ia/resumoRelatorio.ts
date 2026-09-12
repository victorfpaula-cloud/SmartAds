import { gerarTextoComGemini } from "./gemini";
import type { LinhaResumo } from "@/lib/relatorios";

const PROMPT_SISTEMA = `Você é o assistente de uma agência de tráfego pago (Meta Ads) que administra
campanhas pra vários clientes ao mesmo tempo. Vai receber um resumo em JSON com gasto, impressões,
cliques e CTR dos últimos 30 dias de cada conta de cada cliente.

Escreva um parágrafo curto (4 a 6 frases), em português do Brasil, direto e sem enrolação,
destacando nessa ordem: (1) o panorama geral — gasto total somado; (2) qual cliente está com a
melhor performance e qual está com a pior (compare CTR entre eles); (3) se algum cliente aparece
com "erro" no JSON, avise que os dados dele não puderam ser buscados; (4) termine com UMA sugestão
prática e específica de ação (não genérica tipo "monitore os resultados").

Escreva como se estivesse explicando pro dono da agência num áudio de WhatsApp — direto, sem
markdown, sem emoji, sem listar os números linha por linha (ele já vê os números crus na tela logo
abaixo desse texto).`;

/** Gera o texto do resumo — devolve `null` se o Gemini não estiver configurado ou a chamada
 * falhar (tratado como "resumo indisponível agora", nunca quebra a tela). */
export async function gerarResumoRelatorio(linhas: LinhaResumo[]): Promise<string | null> {
  const validas = linhas.filter((l) => l.erro === undefined);
  if (validas.length === 0) return null;

  const dadosParaPrompt = linhas.map((linha) => ({
    cliente: linha.clienteNome,
    conta: linha.contaNome,
    gastoReais: linha.spend,
    impressoes: linha.impressions,
    cliques: linha.clicks,
    ctrPorcentagem: linha.ctr,
    erro: linha.erro,
  }));

  try {
    return await gerarTextoComGemini(PROMPT_SISTEMA, JSON.stringify(dadosParaPrompt));
  } catch {
    // ErroGeminiNaoConfigurado ou qualquer outra falha inesperada — o recurso é opcional, a tela
    // de Relatórios segue funcionando normalmente sem o resumo em texto.
    return null;
  }
}
