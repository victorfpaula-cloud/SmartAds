import type { LinhaInsight } from "@/lib/meta/api";

export type StatusSaude = "boa" | "atencao" | "sem_dados";

export interface SaudeConta {
  status: StatusSaude;
  motivo: string;
}

/** Selo de saúde por conta — matemática pura sobre os últimos 7 dias, sem IA (mais rápido, sem
 * custo de token, e não depende de nenhuma chave externa configurada).
 *
 * v1 propositalmente simples: limiares fixos em vez de comparar com a própria média histórica da
 * conta (isso pediria guardar uma série temporal, que ainda não existe). Ajustar os limiares
 * conforme a realidade dos clientes reais for aparecendo. */
export function calcularSaudeConta(insights: LinhaInsight[]): SaudeConta {
  const total = insights[0];
  const gasto = Number(total?.spend ?? 0);
  const cliques = Number(total?.clicks ?? 0);
  const impressoes = Number(total?.impressions ?? 0);
  const ctr = Number(total?.ctr ?? 0);

  if (!total || gasto === 0) {
    return {
      status: "sem_dados",
      motivo: "Sem gasto registrado nos últimos 7 dias.",
    };
  }

  if (impressoes > 500 && cliques === 0) {
    return {
      status: "atencao",
      motivo: `${impressoes.toLocaleString("pt-BR")} impressões e nenhum clique nos últimos 7 dias.`,
    };
  }

  if (ctr < 0.5) {
    return {
      status: "atencao",
      motivo: `CTR de ${ctr.toFixed(2)}% nos últimos 7 dias, abaixo do esperado.`,
    };
  }

  return {
    status: "boa",
    motivo: `CTR de ${ctr.toFixed(2)}% nos últimos 7 dias.`,
  };
}
