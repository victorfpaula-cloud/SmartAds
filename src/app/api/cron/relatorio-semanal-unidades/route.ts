import { NextResponse, type NextRequest } from "next/server";
import { enviarRelatoriosMensais, semanaDoRelatorio } from "@/lib/relatorioMensal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Segunda-feira: manda o PDF dos últimos 7 dias pro e-mail de cada unidade (várias rodadas por causa
 * do tempo limite; quem já recebeu a semana não recebe de novo). */
export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado || request.headers.get("authorization") !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const resultado = await enviarRelatoriosMensais(42_000, semanaDoRelatorio());
  return NextResponse.json({ ...resultado, executadoEm: new Date().toISOString() });
}
