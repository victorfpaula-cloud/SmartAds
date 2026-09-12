import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clienteId = request.nextUrl.searchParams.get("clienteId");
  if (!clienteId) {
    return NextResponse.json({ erro: "Informe o cliente." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data } = await supabase
    .from("smartads_piloto_automatico")
    .select("*")
    .eq("cliente_id", clienteId)
    .maybeSingle();

  return NextResponse.json({
    piloto: data ?? { cliente_id: clienteId, ativo: false, teto_realocacao_percentual: 20, gasto_minimo_centavos: 10000 },
  });
}

/** Liga/desliga o piloto automático pra um cliente (upsert — a linha só existe depois da primeira
 * vez que alguém mexe nisso). */
export async function PUT(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  if (!corpo?.clienteId || typeof corpo.ativo !== "boolean") {
    return NextResponse.json({ erro: "Informe clienteId e ativo." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_piloto_automatico")
    .upsert({
      cliente_id: corpo.clienteId,
      ativo: corpo.ativo,
      teto_realocacao_percentual: corpo.tetoRealocacaoPercentual ?? 20,
      gasto_minimo_centavos: corpo.gastoMinimoCentavos ?? 10000,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ piloto: data });
}
