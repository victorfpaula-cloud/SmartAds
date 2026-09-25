// Processa uma lista em lotes paralelos — nem 100% sequencial (1 item por vez, lento e escala mal
// com o catálogo de clientes) nem 100% paralelo (todos de uma vez, risco de estourar rate limit da
// Meta quando o catálogo crescer). Usado pelos crons que iteram contas (boost automático, stories,
// piloto automático, saúde) — o tempo de execução de cada um cresce linear com o número de contas,
// mas o limite de duração da function (maxDuration) é fixo.
const TAMANHO_LOTE_PADRAO = 5;

export async function mapearEmLotes<T, R>(
  itens: T[],
  tarefa: (item: T) => Promise<R>,
  tamanhoLote = TAMANHO_LOTE_PADRAO
): Promise<R[]> {
  const resultados: R[] = [];
  for (let i = 0; i < itens.length; i += tamanhoLote) {
    const lote = itens.slice(i, i + tamanhoLote);
    resultados.push(...(await Promise.all(lote.map(tarefa))));
  }
  return resultados;
}

export async function executarEmLotes<T>(
  itens: T[],
  tarefa: (item: T) => Promise<void>,
  tamanhoLote = TAMANHO_LOTE_PADRAO
): Promise<void> {
  await mapearEmLotes(itens, tarefa, tamanhoLote);
}
