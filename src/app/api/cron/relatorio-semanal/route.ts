import { NextResponse, type NextRequest } from "next/server";
import { enviarRelatorioSemanal } from "@/lib/email/relatorioSemanal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Chamado pelo cron semanal da Vercel (ver vercel.json) — mesma autenticação por CRON_SECRET do
 * resto da automação. */
export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!segredoEsperado || autorizacao !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const resultado = await enviarRelatorioSemanal();
  return NextResponse.json({ ...resultado, executadoEm: new Date().toISOString() });
}
