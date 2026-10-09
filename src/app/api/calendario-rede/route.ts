import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const c = await request.json().catch(() => null);
  const antecedencia = Number(c?.antecedenciaDias ?? 14);
  if (!c?.empresaId || !c?.nome?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(c?.data ?? "")) {
    return NextResponse.json({ erro: "Informe a rede, o nome e a data." }, { status: 400 });
  }
  if (!Number.isInteger(antecedencia) || antecedencia < 0 || antecedencia > 90) {
    return NextResponse.json({ erro: "A antecedência deve ser de 0 a 90 dias." }, { status: 400 });
  }
  const { data, error } = await criarClienteAdmin()
    .from("smartads_calendario_rede")
    .insert({ empresa_id: c.empresaId, nome: String(c.nome).trim().slice(0, 80), data: c.data, antecedencia_dias: antecedencia })
    .select("id")
    .single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "Informe a data." }, { status: 400 });
  const { error } = await criarClienteAdmin().from("smartads_calendario_rede").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
