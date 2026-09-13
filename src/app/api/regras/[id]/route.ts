import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Liga/desliga uma regra — a única edição permitida por aqui de propósito. Pra mudar
 * condição/ação o jeito é apagar e criar de novo, evita o risco de uma regra ficar num estado
 * confuso de "meio editada" enquanto tava ativa. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const corpo = await request.json().catch(() => null);
  if (typeof corpo?.ativa !== "boolean") {
    return NextResponse.json({ erro: "Informe o novo estado (ativa)." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_regras_automacao")
    .update({ ativa: corpo.ativa })
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ regra: data });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = criarClienteAdmin();
  const { error } = await supabase.from("smartads_regras_automacao").delete().eq("id", params.id);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
