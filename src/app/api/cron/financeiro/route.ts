import { NextResponse, type NextRequest } from "next/server";
import { atualizarCacheFinanceiroDeTodasAsContas } from "@/lib/financeiro/atualizarCacheFinanceiro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Recalcula o cache do Financeiro 1x/dia (ver vercel.json) — a tela /financeiro só LÊ esse cache
 * (coletarFinanceiro.ts), nunca bate na Meta sozinha numa visita comum, pra não gastar requisição
 * (Meta, Supabase, Vercel) toda vez que alguém abre a tela. Mesma autenticação por CRON_SECRET do
 * resto da automação. */
export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!segredoEsperado || autorizacao !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const resultado = await atualizarCacheFinanceiroDeTodasAsContas();
  return NextResponse.json({ ...resultado, executadoEm: new Date().toISOString() });
}
