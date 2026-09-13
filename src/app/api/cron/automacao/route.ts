import { NextResponse, type NextRequest } from "next/server";
import { avaliarRegras } from "@/lib/automacao/regras";
import { avaliarTestesAb } from "@/lib/automacao/testesAb";
import { executarPilotoAutomatico } from "@/lib/automacao/pilotoAutomatico";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Executa toda a automação do app: regras, testes A/B e piloto automático — nessa ordem, porque
 * uma regra pode pausar uma campanha que um teste A/B ou o piloto ainda iam avaliar, e é melhor a
 * pausa acontecer primeiro (mais conservador) do que o contrário. Chamado pelo cron da Vercel
 * (ver vercel.json), autenticado pelo header que a própria Vercel manda automaticamente —
 * ninguém mais consegue disparar isso batendo na URL. */
export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!segredoEsperado || autorizacao !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  await avaliarRegras();
  await avaliarTestesAb();
  await executarPilotoAutomatico();

  return NextResponse.json({ ok: true, executadoEm: new Date().toISOString() });
}
