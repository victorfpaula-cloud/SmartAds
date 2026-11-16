import { comRegistroDeCron } from "@/lib/cronRegistro";
import { NextResponse, type NextRequest } from "next/server";
import { avaliarRegras } from "@/lib/automacao/regras";
import { avaliarTestesAb } from "@/lib/automacao/testesAb";
import { executarPilotoAutomatico } from "@/lib/automacao/pilotoAutomatico";
import { avaliarPlanosExecucao } from "@/lib/automacao/planosExecucao";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Executa toda a automação do app: regras, testes A/B, piloto automático e planos de execução —
 * nessa ordem, porque uma regra pode pausar uma campanha que um teste A/B ou o piloto ainda iam
 * avaliar, e é melhor a pausa acontecer primeiro (mais conservador) do que o contrário. Chamado
 * pelo cron da Vercel (ver vercel.json), autenticado pelo header que a própria Vercel manda
 * automaticamente — ninguém mais consegue disparar isso batendo na URL. */
export const GET = comRegistroDeCron("automacao", async function (request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!segredoEsperado || autorizacao !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  // Cada rotina isolada: uma que falha não impede as outras de rodar.
  const falhas: string[] = [];
  for (const [nome, rotina] of [
    ["regras", avaliarRegras],
    ["testes A/B", avaliarTestesAb],
    ["piloto automático", executarPilotoAutomatico],
    ["planos de execução", avaliarPlanosExecucao],
  ] as const) {
    try {
      await rotina();
    } catch (e) {
      console.error(`Automação (${nome}) falhou:`, e);
      falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (falhas.length > 0) {
    // 500 pra o registro do cron marcar a falha e ela aparecer nos Alertas.
    return NextResponse.json({ erro: falhas.join(" | ").slice(0, 400), executadoEm: new Date().toISOString() }, { status: 500 });
  }
  return NextResponse.json({ ok: true, executadoEm: new Date().toISOString() });
});
