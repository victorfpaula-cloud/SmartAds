import { NextResponse, type NextRequest } from "next/server";
import { comRegistroDeCron } from "@/lib/cronRegistro";
import { rodarRelatorioRede } from "@/lib/relatorioRede";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cron dos primeiros dias do mês: calcula o mês fechado de cada franquia aos poucos e envia o PDF da
 * rede quando todas as unidades estiverem prontas (várias rodadas — ver vercel.json). */
export const GET = comRegistroDeCron("relatorio-rede", async function (request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado || request.headers.get("authorization") !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const resultado = await rodarRelatorioRede();
  return NextResponse.json({ ...resultado, executadoEm: new Date().toISOString() });
});
