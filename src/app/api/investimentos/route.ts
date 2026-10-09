import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Registra um aporte (investimento) à mão — Pix que a unidade fez, mês passado, valor fora do
 * padrão... As recargas que a Meta mostra entram sozinhas (origem "meta"). */
export async function POST(request: NextRequest) {
  const c = await request.json().catch(() => null);
  const valor = Math.round(Number(c?.valorCentavos));
  if (!c?.contaId || !/^\d{4}-\d{2}-\d{2}$/.test(c?.data ?? "") || !Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ erro: "Informe a unidade, a data e um valor maior que zero." }, { status: 400 });
  }
  const { data, error } = await criarClienteAdmin()
    .from("smartads_investimentos")
    .insert({
      conta_id: c.contaId,
      data: c.data,
      valor_centavos: valor,
      origem: "manual",
      observacao: typeof c.observacao === "string" && c.observacao.trim() ? c.observacao.trim().slice(0, 200) : null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

/** Só aportes lançados à mão podem ser apagados — os que vieram da Meta são o registro real. */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "Informe o aporte." }, { status: 400 });
  const { error, count } = await criarClienteAdmin()
    .from("smartads_investimentos")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("origem", "manual");
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  if (!count) return NextResponse.json({ erro: "Esse aporte veio da Meta e não pode ser apagado." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
