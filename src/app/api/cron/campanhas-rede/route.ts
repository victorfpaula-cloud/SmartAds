import { NextResponse, type NextRequest } from "next/server";
import { recalcularCampanhasRede } from "@/lib/campanhasRede";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Roda 2x/dia (ver vercel.json) — mesma autenticação por CRON_SECRET do resto da automação. O
 * panorama de campanhas ativas em /campanhas só lê o cache que esse cron grava (ver
 * obterCampanhasAtivasRede em src/lib/campanhasRede.ts), nunca bate na Meta numa visita. */
export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!segredoEsperado || autorizacao !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const resultado = await recalcularCampanhasRede();
  return NextResponse.json({ ...resultado, executadoEm: new Date().toISOString() });
}
