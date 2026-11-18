import { calcularIndices, taxas, GASTO_MINIMO_SEMANA, type AnaliseTrafego, type Escopo, type Metricas, type Taxas } from "@/lib/analiseTrafego";

/** Ranking das unidades (puro — testável sem a Meta): quanto cada uma investe, quanto cada real
 * rende (índice da Análise do tráfego, 100 = mediana da rede), como isso mudou em relação ao período
 * anterior e onde ela cai no cruzamento investimento × resultado. */

export type Quadrante = "escalar" | "manter" | "rever" | "base";

export const QUADRANTES: Record<Quadrante, { titulo: string; resumo: string; acao: string }> = {
  escalar: {
    titulo: "Rende bem e investe pouco",
    resumo: "Cada real rende acima da mediana da rede, mas a verba está abaixo da mediana.",
    acao: "É onde mais verba dá mais retorno: vale propor aumento de orçamento.",
  },
  manter: {
    titulo: "Rende bem e investe bastante",
    resumo: "Verba acima da mediana e cada real rendendo acima da mediana.",
    acao: "Manter. Acompanhar a frequência para o público não cansar.",
  },
  rever: {
    titulo: "Investe bastante e rende abaixo",
    resumo: "Verba acima da mediana, mas cada real rende menos que a mediana da rede.",
    acao: "Rever criativos, posicionamento e público antes de colocar mais verba.",
  },
  base: {
    titulo: "Investe pouco e rende abaixo",
    resumo: "Verba e rendimento abaixo da mediana.",
    acao: "Arrumar o básico primeiro: frequência de posts, criativo e atendimento no direct.",
  },
};

export interface SeguidoresUnidade {
  total: number | null;
  ganho: number | null;
  /** false = o histórico guardado ainda não cobre o período inteiro. */
  completo: boolean;
  desde: string | null;
}

export interface LinhaRanking {
  contaId: string;
  unidade: string;
  erro: string | null;
  gasto: number;
  gastoDia: number;
  /** Fatia do investimento da rede no período (0–100). */
  participacao: number;
  gastoAnterior: number;
  m: Metricas;
  t: Taxas;
  indice: number | null;
  indiceAnterior: number | null;
  /** Pontos de índice ganhos/perdidos (só quando os dois períodos têm índice). */
  evolucao: number | null;
  quadrante: Quadrante | null;
  /** Abaixo do mínimo investido no período, sem métricas suficientes ou sem leitura na Meta. */
  semDados: string | null;
  seguidores: SeguidoresUnidade | null;
  /** Crescimento de seguidores no período, em % sobre o total do início. */
  crescimentoSeguidores: number | null;
}

export interface Ranking {
  dias: number;
  escopo: Escopo;
  minimoGasto: number;
  totalGasto: number;
  totalGastoAnterior: number;
  medianaGastoDia: number | null;
  linhas: LinhaRanking[];
}

function med(v: number[]): number | null {
  const s = [...v].sort((a, b) => a - b);
  if (s.length === 0) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function montarRanking(analise: AnaliseTrafego, escopo: Escopo, seguidores?: Map<string, SeguidoresUnidade>): Ranking {
  const dias = analise.dias ?? 7;
  const minimoGasto = GASTO_MINIMO_SEMANA * (dias / 7);
  const atual = calcularIndices(analise, escopo).indices;
  const anterior = calcularIndices({ ...analise, unidades: analise.unidades.map((u) => ({ ...u, atual: u.anterior })) }, escopo).indices;
  const idx = new Map(atual.map((i) => [i.contaId, i.indice]));
  const idxAnt = new Map(anterior.map((i) => [i.contaId, i.indice]));

  const validas = analise.unidades.filter((u) => !u.erro);
  const totalGasto = validas.reduce((t, u) => t + u.atual[escopo].gasto, 0);
  const totalGastoAnterior = validas.reduce((t, u) => t + u.anterior[escopo].gasto, 0);
  // Mediana de verba só entre quem tem índice — é a régua do cruzamento investimento × resultado.
  const medianaGastoDia = med(validas.filter((u) => idx.has(u.contaId)).map((u) => u.atual[escopo].gasto / dias));

  const linhas: LinhaRanking[] = analise.unidades.map((u) => {
    const m = u.atual[escopo];
    const indice = idx.get(u.contaId) ?? null;
    const indiceAnterior = idxAnt.get(u.contaId) ?? null;
    const gastoDia = m.gasto / dias;
    const seg = seguidores?.get(u.contaId) ?? null;
    const base = seg && seg.total !== null && seg.ganho !== null ? seg.total - seg.ganho : null;
    let quadrante: Quadrante | null = null;
    if (indice !== null && medianaGastoDia !== null) {
      const investeMais = gastoDia >= medianaGastoDia;
      quadrante = indice >= 100 ? (investeMais ? "manter" : "escalar") : investeMais ? "rever" : "base";
    }
    const semDados = u.erro
      ? /sem tempo/i.test(u.erro)
        ? "Não deu tempo de ler nesta atualização — clique em Atualizar agora."
        : "Sem leitura na Meta nesta atualização."
      : m.gasto < minimoGasto
        ? m.gasto > 0
          ? "Investiu pouco demais no período para comparar."
          : "Sem investimento no período."
        : indice === null
          ? "Pouco volume de resultados para comparar."
          : null;
    return {
      contaId: u.contaId,
      unidade: u.unidade,
      erro: u.erro,
      gasto: m.gasto,
      gastoDia,
      participacao: totalGasto > 0 ? (m.gasto / totalGasto) * 100 : 0,
      gastoAnterior: u.anterior[escopo].gasto,
      m,
      t: taxas(m, dias),
      indice,
      indiceAnterior,
      evolucao: indice !== null && indiceAnterior !== null ? indice - indiceAnterior : null,
      quadrante,
      semDados,
      seguidores: seg,
      crescimentoSeguidores: base && base > 0 && seg?.ganho != null ? (seg.ganho / base) * 100 : null,
    };
  });

  // Com índice primeiro (do maior pro menor); depois as sem dados, por investimento.
  linhas.sort((a, b) => {
    if (a.indice !== null && b.indice !== null) return b.indice - a.indice || b.gasto - a.gasto;
    if (a.indice !== null) return -1;
    if (b.indice !== null) return 1;
    return b.gasto - a.gasto;
  });

  return { dias, escopo, minimoGasto, totalGasto, totalGastoAnterior, medianaGastoDia, linhas };
}

/** Os N primeiros e os N últimos de uma lista, sem repetir quando a lista é curta. */
export function pontas<T>(lista: T[], n = 3): { melhores: T[]; piores: T[] } {
  const melhores = lista.slice(0, n);
  const piores = lista.length > n ? lista.slice(Math.max(n, lista.length - n)).reverse() : [];
  return { melhores, piores };
}
