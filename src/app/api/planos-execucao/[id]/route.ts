import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = criarClienteAdmin();

  const { data, error } = await supabase
    .from("smartads_planos_execucao")
    .select(
      "*, smartads_estrategias(nome), smartads_clientes(nome), smartads_contas_meta(*), smartads_plano_etapas(*, smartads_estrategia_etapas(*))"
    )
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ erro: "Plano não encontrado." }, { status: 404 });
  return NextResponse.json({ plano: data });
}

/** Só pra pausar/retomar o plano inteiro (status geral) — mudanças de etapa individual passam por
 * /api/campanhas (que já atualiza o checklist ao criar a campanha, ver planoEtapaId ali). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpo = await request.json().catch(() => null);
  if (!corpo?.status) return NextResponse.json({ erro: "Informe o status." }, { status: 400 });

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_planos_execucao")
    .update({ status: corpo.status })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ plano: data });
}
