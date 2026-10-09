import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarRegrasDaConta } from "@/lib/boostRedeServidor";

export const dynamic = "force-dynamic";

const TIPOS = ["engajamento", "alcance", "ambos"];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Datas especiais de uma conta. */
export async function GET(request: NextRequest) {
  const contaId = request.nextUrl.searchParams.get("contaId");
  if (!contaId) return NextResponse.json({ erro: "Informe a conta." }, { status: 400 });
  return NextResponse.json({ regras: await carregarRegrasDaConta(contaId) });
}

/** Data especial de uma conta: num período (ex.: 01/12 a 25/12) o boost dela troca o que entrega. */
export async function POST(request: NextRequest) {
  const c = await request.json().catch(() => null);
  const boostsPorDia = c?.boostsPorDia == null ? null : Number(c.boostsPorDia);

  if (!c?.contaId || !c?.nome?.trim()) {
    return NextResponse.json({ erro: "Informe a conta e um nome pra regra." }, { status: 400 });
  }
  if (!DATA.test(c.dataInicio ?? "") || !DATA.test(c.dataFim ?? "") || c.dataFim < c.dataInicio) {
    return NextResponse.json({ erro: "Datas inválidas — o fim não pode ser antes do início." }, { status: 400 });
  }
  if (!TIPOS.includes(c.tipoEntrega)) {
    return NextResponse.json({ erro: "Tipo de entrega inválido." }, { status: 400 });
  }
  if (boostsPorDia !== null && (!Number.isInteger(boostsPorDia) || boostsPorDia < 1 || boostsPorDia > 10)) {
    return NextResponse.json({ erro: "Posts por dia deve ser de 1 a 10." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data: conta } = await supabase
    .from("smartads_contas_meta")
    .select("id, smartads_clientes(empresa_id)")
    .eq("id", c.contaId)
    .maybeSingle();
  const rel = (conta as any)?.smartads_clientes;
  const empresaId = (Array.isArray(rel) ? rel[0] : rel)?.empresa_id;
  if (!conta || !empresaId) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });

  const { data, error } = await supabase
    .from("smartads_boost_rede_regras")
    .insert({
      empresa_id: empresaId,
      conta_id: c.contaId,
      nome: String(c.nome).trim().slice(0, 80),
      data_inicio: c.dataInicio,
      data_fim: c.dataFim,
      tipo_entrega: c.tipoEntrega,
      boosts_por_dia: boostsPorDia,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "Informe a regra." }, { status: 400 });
  const { error } = await criarClienteAdmin().from("smartads_boost_rede_regras").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
