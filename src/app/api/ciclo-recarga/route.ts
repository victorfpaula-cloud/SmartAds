import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { calcularCiclosDasContas } from "@/lib/cicloSaldo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Define de quanto em quanto tempo a unidade recarrega (semanal, quinzenal, mensal ou nenhum) e
 * já recalcula o ritmo do saldo dela. */
export async function PATCH(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const contaId = typeof corpo?.contaId === "string" ? corpo.contaId : null;
  const ciclo = corpo?.ciclo === null || corpo?.ciclo === "" ? null : corpo?.ciclo;
  if (!contaId) return NextResponse.json({ erro: "Informe a conta." }, { status: 400 });
  if (ciclo !== null && !["semanal", "quinzenal", "mensal"].includes(ciclo)) {
    return NextResponse.json({ erro: "Ciclo inválido." }, { status: 400 });
  }
  const db = criarClienteAdmin();
  const { error } = await db.from("smartads_contas_meta").update({ ciclo_recarga: ciclo }).eq("id", contaId);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (ciclo === null) await db.from("smartads_ciclo_saldo_cache").delete().eq("conta_id", contaId);
  const [resultado] = await calcularCiclosDasContas([contaId]).catch(() => []);
  return NextResponse.json({ ok: true, resultado: resultado ?? null });
}
