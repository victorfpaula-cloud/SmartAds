import { describe, expect, it } from "vitest";
import { montarRanking, pontas } from "@/lib/rankingRede";
import type { AnaliseTrafego, Metricas, UnidadeAnalise } from "@/lib/analiseTrafego";

const met = (gasto: number, fator: number): Metricas => ({
  gasto,
  alcance: Math.round(gasto * 100 * fator),
  impressoes: Math.round(gasto * 200 * fator),
  interacoes: Math.round(gasto * 10 * fator),
  curtidas: 0, comentarios: 0, salvamentos: 0, compartilhamentos: 0,
  visitasPerfil: Math.round(gasto * fator), cliques: 0, videoViews: 0, thruplays: 0, campanhas: 1,
});
const un = (id: string, gasto: number, fator: number, antFator = fator, erro: string | null = null): UnidadeAnalise => ({
  contaId: id, unidade: `DB - ${id}`, erro, boostLigado: true, boostDiario: 7,
  atual: { tudo: met(gasto, fator), boost: met(0, 1) },
  anterior: { tudo: met(gasto, antFator), boost: met(0, 1) },
});
const analise = (unidades: UnidadeAnalise[]): AnaliseTrafego => ({ calculadoEm: "", dias: 30, periodo: { desde: "2026-10-19", ate: "2026-11-17" }, unidades });

describe("ranking das unidades", () => {
  const a = analise([un("A", 300, 1.5, 1), un("B", 100, 1.4), un("C", 300, 0.6), un("D", 90, 0.7), un("E", 200, 1), un("F", 5, 1), un("G", 300, 1, 1, "falhou")]);
  const r = montarRanking(a, "tudo", new Map([["A", { total: 1100, ganho: 100, completo: true, desde: "2026-10-18" }]]));

  it("ordena pelo índice e deixa as sem dados no fim", () => {
    expect(r.linhas.slice(0, 5).map((l) => l.contaId)).toEqual(["A", "B", "E", "D", "C"]);
    expect(r.linhas.slice(5).every((l) => l.indice === null)).toBe(true);
    expect(r.linhas.find((l) => l.contaId === "F")?.semDados).toMatch(/pouco demais/);
    expect(r.linhas.find((l) => l.contaId === "G")?.semDados).toMatch(/Meta/);
  });

  it("classifica investimento × resultado pela mediana de verba e índice 100", () => {
    const q = Object.fromEntries(r.linhas.map((l) => [l.contaId, l.quadrante]));
    expect(q).toMatchObject({ A: "manter", B: "escalar", C: "rever", D: "base", F: null, G: null });
  });

  it("calcula participação, evolução e crescimento de seguidores", () => {
    const A = r.linhas.find((l) => l.contaId === "A")!;
    expect(Math.round(r.totalGasto)).toBe(995); // G (erro) fica fora do total
    expect(A.participacao).toBeCloseTo((300 / 995) * 100);
    expect(A.evolucao).toBeGreaterThan(0);
    expect(A.crescimentoSeguidores).toBeCloseTo(10);
  });

  it("pontas não repete itens em listas curtas", () => {
    expect(pontas([1, 2])).toEqual({ melhores: [1, 2], piores: [] });
    expect(pontas([1, 2, 3, 4, 5])).toEqual({ melhores: [1, 2, 3], piores: [5, 4] });
  });
});
