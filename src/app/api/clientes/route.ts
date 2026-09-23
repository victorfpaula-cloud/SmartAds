import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// GET não lê nada do request — sem isso o Next tenta pré-renderizar a rota como estática no
// build e quebra por faltar env var nesse momento (mesmo motivo do /api/meta/status).
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_clientes")
    .select("*, smartads_contas_meta(*)")
    .order("nome");

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ clientes: data });
}

export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const nome = corpo?.nome?.trim();
  const empresaId = corpo?.empresaId;

  if (!nome || !empresaId) {
    return NextResponse.json({ erro: "Informe o nome do cliente e a empresa." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_clientes")
    .insert({ nome, empresa_id: empresaId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ cliente: data }, { status: 201 });
}
