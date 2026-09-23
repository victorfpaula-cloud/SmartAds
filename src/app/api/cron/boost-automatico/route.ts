import { NextResponse, type NextRequest } from "next/server";
import { avaliarBoostAutomatico } from "@/lib/automacao/boostAutomatico";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Chamado 1x/dia pelo cron da Vercel (ver vercel.json), depois da janela de postagem do dia —
 * mesma autenticação por CRON_SECRET do resto da automação. */
export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!segredoEsperado || autorizacao !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const resultado = await avaliarBoostAutomatico();
  return NextResponse.json({ ...resultado, executadoEm: new Date().toISOString() });
}
