import { NextResponse, type NextRequest } from "next/server";
import { definirSaldoDisponivelManual } from "@/lib/financeiro/atualizarCacheFinanceiro";

export const dynamic = "force-dynamic";

/** Grava o saldo disponível digitado à mão (seed inicial ou correção) — a Meta não expõe esse
 * número por API (ver comentários em src/lib/meta/api.ts e atualizarCacheFinanceiro.ts), então
 * precisa começar de um valor real que a pessoa vê no Gerenciador de Anúncios. Dali pra frente o
 * cron diário mantém sozinho (ledger incremental). */
export async function PATCH(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const contaId = corpo?.contaId;
  const saldoCentavos = Number(corpo?.saldoCentavos);

  if (!contaId || typeof contaId !== "string" || !Number.isFinite(saldoCentavos)) {
    return NextResponse.json({ erro: "Informe contaId e saldoCentavos (número)." }, { status: 400 });
  }

  await definirSaldoDisponivelManual(contaId, Math.round(saldoCentavos));
  return NextResponse.json({ ok: true });
}
