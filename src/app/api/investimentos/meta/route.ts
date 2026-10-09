import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Combinado de um mês específico (ex.: São Paulo investe R$1.000 só em dezembro). Sem valor, volta
 * ao padrão mensal da unidade. */
export async function PUT(request: NextRequest) {
  const c = await request.json().catch(() => null);
  if (!c?.contaId || !/^\d{4}-\d{2}$/.test(c?.mes ?? "")) {
    return NextResponse.json({ erro: "Informe a unidade e o mês." }, { status: 400 });
  }
  const supabase = criarClienteAdmin();
  if (c.valorCentavos == null) {
    await supabase.from("smartads_meta_mensal").delete().eq("conta_id", c.contaId).eq("mes", c.mes);
    return NextResponse.json({ ok: true });
  }
  const valor = Math.round(Number(c.valorCentavos));
  if (!Number.isFinite(valor) || valor < 0) {
    return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
  }
  const { error } = await supabase
    .from("smartads_meta_mensal")
    .upsert({ conta_id: c.contaId, mes: c.mes, valor_centavos: valor }, { onConflict: "conta_id,mes" });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
