import { NextResponse, type NextRequest } from "next/server";
import { recalcularSemaforo } from "@/lib/semaforo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Roda 1x/dia (ver vercel.json) — mesma autenticação por CRON_SECRET do resto da automação. A
 * tela "Central da rede" só lê o cache que esse cron grava (ver calcularSemaforo em
 * src/lib/semaforo.ts), nunca bate na Meta numa visita. */
export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!segredoEsperado || autorizacao !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const resultado = await recalcularSemaforo();
  return NextResponse.json({ ...resultado, executadoEm: new Date().toISOString() });
}
