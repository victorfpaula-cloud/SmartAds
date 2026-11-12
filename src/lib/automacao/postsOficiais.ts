/** Identifica os "posts oficiais da rede" numa franquia: o mesmo conteúdo (vindo do Drive da
 * franqueadora) que as unidades publicam com a MESMA legenda, às vezes com dias de atraso e uma ou
 * outra palavra trocada (nome da cidade, @ da unidade).
 *
 * Regra: um post de uma unidade é oficial quando pelo menos MIN_OUTRAS_CONTAS outras contas do
 * Instagram da mesma franquia publicaram uma legenda praticamente igual (≥ SIMILARIDADE_MINIMA das
 * palavras em comum) num intervalo de até JANELA_DIAS dias. Post próprio da unidade (legenda
 * diferente) não bate com outra unidade, então não entra. Legenda curta demais (menos de
 * MIN_PALAVRAS palavras) não é comparada — evita confundir "Bom dia!" com post oficial. */

// 1 = basta outra conta da rede ter postado a mesma legenda (2 contas no total) pra já soltar o boost.
export const MIN_OUTRAS_CONTAS = 1;
export const SIMILARIDADE_MINIMA = 0.75;
export const JANELA_DIAS = 5;
export const MIN_PALAVRAS = 6;

export interface PostComLegenda {
  id: string;
  caption?: string | null;
  timestamp: string;
}

/** Palavras da legenda sem acento, @menções, links e emojis — o que sobra é o texto em si. */
export function palavrasDaLegenda(texto: string | null | undefined): Set<string> {
  const limpo = (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[\w.]+/g, " ")
    .replace(/[^a-z0-9#\s]/g, " ");
  return new Set(limpo.split(/\s+/).filter((p) => p.length >= 2));
}

/** Quanto da legenda MENOR aparece na maior (0 a 1) — tolera a unidade acrescentar uma linha. */
export function similaridadeLegendas(a: Set<string>, b: Set<string>): number {
  if (a.size < MIN_PALAVRAS || b.size < MIN_PALAVRAS) return 0;
  const [menor, maior] = a.size <= b.size ? [a, b] : [b, a];
  let comuns = 0;
  for (const p of menor) if (maior.has(p)) comuns++;
  // Divide pela maior quando a diferença de tamanho é grande, pra uma legenda curtinha não "caber"
  // dentro de qualquer texto longo.
  const base = maior.size > menor.size * 2 ? maior.size : menor.size;
  return comuns / base;
}

/** O post `alvo` (da conta `contaAlvo`) é oficial da rede? `outras` = posts recentes das OUTRAS
 * contas do Instagram da franquia, agrupados por conta. */
export function ehPostOficial(alvo: PostComLegenda, outras: Map<string, PostComLegenda[]>): boolean {
  const palavras = palavrasDaLegenda(alvo.caption);
  if (palavras.size < MIN_PALAVRAS) return false;
  const t = new Date(alvo.timestamp).getTime();
  let contas = 0;
  for (const posts of outras.values()) {
    const bate = posts.some(
      (p) =>
        Math.abs(new Date(p.timestamp).getTime() - t) <= JANELA_DIAS * 86_400_000 &&
        similaridadeLegendas(palavras, palavrasDaLegenda(p.caption)) >= SIMILARIDADE_MINIMA
    );
    if (bate && ++contas >= MIN_OUTRAS_CONTAS) return true;
  }
  return false;
}
