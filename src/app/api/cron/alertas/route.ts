import { NextResponse, type NextRequest } from "next/server";
import { enviarAlertasDiarios } from "@/lib/email/alertasDiarios";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cron diário (depois da atualização do Financeiro): manda o e-mail de alertas quando há algo urgente. */
export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado || request.headers.get("authorization") !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const resultado = await enviarAlertasDiarios();
  return NextResponse.json({ ...resultado, executadoEm: new Date().toISOString() });
}
