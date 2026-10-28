import { NextResponse, type NextRequest } from "next/server";
import { enviarRelatoriosMensais } from "@/lib/relatorioMensal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Nos primeiros dias do mês: manda o PDF do mês passado pro e-mail de cada unidade (várias rodadas
 * porque cada rodada tem tempo limitado; quem já recebeu não recebe de novo). */
export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado || request.headers.get("authorization") !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const resultado = await enviarRelatoriosMensais();
  return NextResponse.json({ ...resultado, executadoEm: new Date().toISOString() });
}
