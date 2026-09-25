import { NextResponse, type NextRequest } from "next/server";
import { limparDadosAntigos } from "@/lib/limpeza";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Roda 1x/semana (ver vercel.json) — mesma autenticação por CRON_SECRET do resto da automação.
 * Ver limparDadosAntigos pra saber o que é apagado e por quê. */
export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!segredoEsperado || autorizacao !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const resultado = await limparDadosAntigos();
  return NextResponse.json({ ...resultado, executadoEm: new Date().toISOString() });
}
