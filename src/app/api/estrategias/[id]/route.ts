import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Arquiva o molde (ativa = false) em vez de apagar — smartads_planos_execucao referencia a
 * estratégia com `on delete restrict` de propósito: um molde já usado numa unidade não pode
 * desaparecer e quebrar o histórico do plano aplicado. "Arquivada" some da lista de moldes
 * disponíveis pra aplicar de novo, mas o que já foi aplicado continua intacto. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = criarClienteAdmin();
  const { error } = await supabase.from("smartads_estrategias").update({ ativa: false }).eq("id", id);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpo = await request.json().catch(() => null);
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const atualizacao: Record<string, unknown> = {};
  if (typeof corpo.nome === "string") atualizacao.nome = corpo.nome.trim();
  if (typeof corpo.descricao === "string") atualizacao.descricao = corpo.descricao.trim() || null;
  if (typeof corpo.ativa === "boolean") atualizacao.ativa = corpo.ativa;

  if (Object.keys(atualizacao).length === 0) {
    return NextResponse.json({ erro: "Nada pra atualizar." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_estrategias")
    .update(atualizacao)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ estrategia: data });
}
