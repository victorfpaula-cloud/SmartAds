import { calcularSemaforo } from "@/lib/semaforo";
import { obterCampanhasAtivasRede } from "@/lib/campanhasRede";

export type NivelInsight = "critico" | "atencao" | "positivo";

export interface InsightUnidade {
  contaId: string;
  clienteNome: string;
  nivel: NivelInsight;
  motivos: string[];
}

const PESO_NIVEL: Record<NivelInsight, number> = { critico: 3, atencao: 2, positivo: 1 };

/** Insights automáticos da rede — cálculo direto (sem IA, sem chamada nova à Meta), cruzando o que
 * já temos cacheado: Semáforo (cor + motivo, ver src/lib/semaforo.ts) e Campanhas ativas da rede
 * (ver src/lib/campanhasRede.ts). Cada unidade some ou aparece com o pior nível entre os motivos que
 * ela acumulou — só entra na lista quem tem algo pra dizer, unidade sem nenhum sinal notável fica
 * de fora (a intenção é destacar o que precisa de olhar, não listar as 19 de novo). */
export async function obterInsightsRede(): Promise<InsightUnidade[]> {
  const [semaforo, campanhasRede] = await Promise.all([calcularSemaforo(), obterCampanhasAtivasRede()]);

  const contasComCampanhaAtiva = new Set(campanhasRede.campanhas.map((c) => c.contaId));
  const porConta = new Map<string, InsightUnidade>();

  function adicionar(contaId: string, clienteNome: string, nivel: NivelInsight, motivo: string) {
    const atual = porConta.get(contaId);
    if (!atual) {
      porConta.set(contaId, { contaId, clienteNome, nivel, motivos: [motivo] });
      return;
    }
    atual.motivos.push(motivo);
    if (PESO_NIVEL[nivel] > PESO_NIVEL[atual.nivel]) atual.nivel = nivel;
  }

  for (const unidade of semaforo) {
    if (unidade.cor === "vermelho") {
      adicionar(unidade.contaId, unidade.clienteNome, "critico", unidade.motivo);
    } else if (unidade.cor === "amarelo") {
      adicionar(unidade.contaId, unidade.clienteNome, "atencao", unidade.motivo);
    } else {
      adicionar(unidade.contaId, unidade.clienteNome, "positivo", `${unidade.motivo} Bom momento pra considerar aumentar o orçamento dela.`);
    }

    // "Sem campanha ativa AGORA" é um sinal diferente de "spend7dias zerado" (uma campanha pode ter
    // rodado nos últimos 7 dias e ter sido pausada só hoje) — só avisa de novo quando contradiz o
    // que o Semáforo já disse, pra não repetir o mesmo fato com outras palavras.
    if (!contasComCampanhaAtiva.has(unidade.contaId) && unidade.spend7dias > 0) {
      adicionar(
        unidade.contaId,
        unidade.clienteNome,
        "critico",
        "Sem nenhuma campanha ativa agora, apesar de ter tido gasto nos últimos 7 dias — confira se alguma foi pausada sem querer."
      );
    }
  }

  return [...porConta.values()].sort(
    (a, b) => PESO_NIVEL[b.nivel] - PESO_NIVEL[a.nivel] || a.clienteNome.localeCompare(b.clienteNome)
  );
}
