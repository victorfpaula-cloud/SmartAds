import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Todas as empresas, com os clientes (unidades) de cada uma já embutidos — alimenta a dashboard
 * inicial e o seletor de empresa ao cadastrar um cliente novo. */
export async function GET() {
  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_empresas")
    .select("*, smartads_clientes(id, nome, ativo, smartads_contas_meta(id))")
    .order("nome");

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ empresas: data });
}

export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const nome = corpo?.nome?.trim();
  const tipo = corpo?.tipo;

  if (!nome || (tipo !== "individual" && tipo !== "franquia")) {
    return NextResponse.json({ erro: "Informe o nome e o tipo (individual ou franquia)." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase.from("smartads_empresas").insert({ nome, tipo }).select().single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ empresa: data }, { status: 201 });
}
