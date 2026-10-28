/** Converte o que a pessoa digitou ("1.000", "1.234,56", "500", "500,5") em centavos. Aceita ponto como
 * separador de milhar e vírgula como decimal (formato brasileiro); devolve null se não for número. */
export function reaisDigitadosParaCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/[R$\s]/g, "");
  if (!limpo) return null;
  let normalizado: string;
  if (limpo.includes(",")) {
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    normalizado = limpo.replace(/\./g, ""); // "1.000" = mil, não 1
  } else {
    normalizado = limpo;
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
