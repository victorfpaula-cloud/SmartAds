import { NextResponse, type NextRequest } from "next/server";
import { coletarStoriesAtivos } from "@/lib/stories";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Roda 1x/dia perto da meia-noite de SP (ver vercel.json e coletarStoriesAtivos pra entender por
 * que precisa ser perto do fim do dia) — mesma autenticação por CRON_SECRET do resto da
 * automação. */
export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!segredoEsperado || autorizacao !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const resultado = await coletarStoriesAtivos();
  return NextResponse.json({ ...resultado, executadoEm: new Date().toISOString() });
}
