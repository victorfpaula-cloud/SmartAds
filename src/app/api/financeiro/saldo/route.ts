import { NextResponse, type NextRequest } from "next/server";
import { comContaMeta } from "@/lib/meta/conexao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { atualizarCacheFinanceiroDaConta, definirSaldoDisponivelManual } from "@/lib/financeiro/atualizarCacheFinanceiro";

export const dynamic = "force-dynamic";

/** Grava o saldo disponível digitado à mão (seed inicial ou correção) — a Meta não expõe esse
 * número por API (ver comentários em src/lib/meta/api.ts e atualizarCacheFinanceiro.ts), então
 * precisa começar de um valor real que a pessoa vê no Gerenciador de Anúncios. Dali pra frente o
 * cron diário mantém sozinho (ledger incremental). */
export async function PATCH(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const contaId = corpo?.contaId;
  const saldoCentavos = corpo?.saldoCentavos;

  if (!contaId || typeof contaId !== "string" || typeof saldoCentavos !== "number" || !Number.isFinite(saldoCentavos) || saldoCentavos < 0) {
    return NextResponse.json({ erro: "Informe contaId e saldoCentavos (número, zero ou mais)." }, { status: 400 });
  }

  const { data: conta } = await criarClienteAdmin().from("smartads_contas_meta").select("id, meta_ad_account_id").eq("id", contaId).maybeSingle();
  if (!conta) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });

  await definirSaldoDisponivelManual(contaId, Math.round(saldoCentavos));
  // Calcula o resto (gasto, projeção, situação) agora, em vez de deixar a conta nova com zeros até o cron do dia seguinte.
  await comContaMeta(conta.id, () => atualizarCacheFinanceiroDaConta(conta.id, conta.meta_ad_account_id)).catch(() => null);
  return NextResponse.json({ ok: true });
}
