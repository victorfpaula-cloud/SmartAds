import type { LinhaInsight } from "@/lib/meta/api";

export interface Anomalia {
  metrica: "ctr" | "cpc" | "spend";
  rotulo: string;
  valorAtual: number;
  valorAnterior: number;
  deltaPercentual: number;
  mensagem: string;
}

// % de variação pra considerar relevante o suficiente pra virar aviso — abaixo disso é ruído
// normal de semana a semana, não vale interromper o dono com isso.
const LIMIAR_CTR_CPC = 35;
const LIMIAR_GASTO = 80;

function calcularDelta(atual: number, anterior: number): number | null {
  if (anterior === 0) return null; // não dá pra calcular variação percentual a partir de zero
  return ((atual - anterior) / anterior) * 100;
}

/** Compara o período atual com o anterior (mesmo tamanho de janela, ex: 7 dias vs os 7 dias
 * antes) pra achar UMA anomalia acionável — pura matemática, sem IA. Prioridade: CTR caindo é o
 * sinal mais direto de criativo cansado/público errado, depois CPC subindo (mais caro por
 * clique), depois gasto disparando sem explicação. Retorna só a primeira que encontrar (uma
 * conta não precisa de 3 avisos ao mesmo tempo) — `null` quando nada foge do normal, ou quando
 * não tem gasto num dos dois períodos (comparação não faz sentido pra conta nova ou pausada). */
export function detectarAnomalia(atual: LinhaInsight[], anterior: LinhaInsight[]): Anomalia | null {
  const a = atual[0];
  const b = anterior[0];

  const gastoAtual = Number(a?.spend ?? 0);
  const gastoAnterior = Number(b?.spend ?? 0);
  if (gastoAtual === 0 || gastoAnterior === 0) return null;

  const ctrAtual = Number(a?.ctr ?? 0);
  const ctrAnterior = Number(b?.ctr ?? 0);
  const deltaCtr = calcularDelta(ctrAtual, ctrAnterior);
  if (deltaCtr !== null && deltaCtr <= -LIMIAR_CTR_CPC) {
    return {
      metrica: "ctr",
      rotulo: "CTR",
      valorAtual: ctrAtual,
      valorAnterior: ctrAnterior,
      deltaPercentual: deltaCtr,
      mensagem: `CTR caiu ${Math.abs(deltaCtr).toFixed(0)}% (de ${ctrAnterior.toFixed(2)}% pra ${ctrAtual.toFixed(2)}%) comparado à semana anterior.`,
    };
  }

  const cpcAtual = Number(a?.cpc ?? 0);
  const cpcAnterior = Number(b?.cpc ?? 0);
  const deltaCpc = calcularDelta(cpcAtual, cpcAnterior);
  if (deltaCpc !== null && deltaCpc >= LIMIAR_CTR_CPC) {
    return {
      metrica: "cpc",
      rotulo: "custo por clique",
      valorAtual: cpcAtual,
      valorAnterior: cpcAnterior,
      deltaPercentual: deltaCpc,
      mensagem: `Custo por clique subiu ${deltaCpc.toFixed(0)}% (de R$ ${cpcAnterior.toFixed(2)} pra R$ ${cpcAtual.toFixed(2)}) comparado à semana anterior.`,
    };
  }

  const deltaGasto = calcularDelta(gastoAtual, gastoAnterior);
  if (deltaGasto !== null && deltaGasto >= LIMIAR_GASTO) {
    return {
      metrica: "spend",
      rotulo: "gasto",
      valorAtual: gastoAtual,
      valorAnterior: gastoAnterior,
      deltaPercentual: deltaGasto,
      mensagem: `Gasto subiu ${deltaGasto.toFixed(0)}% (de R$ ${gastoAnterior.toFixed(2)} pra R$ ${gastoAtual.toFixed(2)}) comparado à semana anterior.`,
    };
  }

  return null;
}

/** As duas janelas de 7 dias a comparar — dias corridos completos (não inclui hoje, que ainda
 * está em andamento). Datas customizadas (não um date_preset da Meta, que não tem "os 7 dias
 * antes do last_7d" pronto) — ver intervalo em obterInsightsConta. */
export function janelasDeComparacao(): {
  atual: { desde: string; ate: string };
  anterior: { desde: string; ate: string };
} {
  const paraISO = (d: Date) => d.toISOString().slice(0, 10);
  const subtrairDias = (d: Date, dias: number) => {
    const copia = new Date(d);
    copia.setUTCDate(copia.getUTCDate() - dias);
    return copia;
  };

  const ontem = subtrairDias(new Date(), 1);
  const inicioAtual = subtrairDias(ontem, 6);
  const fimAnterior = subtrairDias(inicioAtual, 1);
  const inicioAnterior = subtrairDias(fimAnterior, 6);

  return {
    atual: { desde: paraISO(inicioAtual), ate: paraISO(ontem) },
    anterior: { desde: paraISO(inicioAnterior), ate: paraISO(fimAnterior) },
  };
}
