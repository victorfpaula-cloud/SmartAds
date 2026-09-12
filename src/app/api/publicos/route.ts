import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clienteId = request.nextUrl.searchParams.get("clienteId");
  if (!clienteId) {
    return NextResponse.json({ erro: "Informe o cliente." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_publicos_salvos")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("nome");

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ publicos: data });
}

export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const { clienteId, nome, publico } = corpo ?? {};

  if (!clienteId || !nome?.trim() || !publico) {
    return NextResponse.json({ erro: "Preencha o cliente, o nome e o público." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  // A coluna se chama `targeting` no banco, mas guarda o formato NATIVO do SmartAds (localizações,
  // interesses, idade, gênero) — não o spec já convertido da Meta. É `montarTargeting()` (ver
  // src/lib/meta/api.ts) que faz essa conversão na hora de criar a campanha de verdade, porque
  // editar um público salvo depois exige reabrir ele no construtor, e o formato nativo é o que o
  // construtor entende — reconverter de volta a partir do spec da Meta seria bem mais complicado.
  const { data, error } = await supabase
    .from("smartads_publicos_salvos")
    .insert({ cliente_id: clienteId, nome: nome.trim(), targeting: publico, origem: "smartads" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ publico: data }, { status: 201 });
}
