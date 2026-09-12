import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const contaId = request.nextUrl.searchParams.get("contaId");
  if (!contaId) {
    return NextResponse.json({ erro: "Informe a conta." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_regras_automacao")
    .select("*, smartads_campanhas_criadas(config_criacao)")
    .eq("conta_id", contaId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ regras: data });
}

export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  if (!corpo?.contaId || !corpo.nome || !corpo.metrica || !corpo.operador || corpo.valorLimite === undefined || !corpo.acao) {
    return NextResponse.json({ erro: "Faltam campos obrigatórios." }, { status: 400 });
  }
  if ((corpo.acao === "aumentar_orcamento" || corpo.acao === "diminuir_orcamento") && !corpo.acaoPercentual) {
    return NextResponse.json({ erro: "Informe o percentual de ajuste de orçamento." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_regras_automacao")
    .insert({
      conta_id: corpo.contaId,
      campanha_id: corpo.campanhaId || null,
      nome: corpo.nome,
      metrica: corpo.metrica,
      operador: corpo.operador,
      valor_limite: corpo.valorLimite,
      janela_dias: corpo.janelaDias || 3,
      acao: corpo.acao,
      acao_percentual: corpo.acaoPercentual || null,
      gasto_minimo_centavos: corpo.gastoMinimoCentavos || 0,
      cooldown_horas: corpo.cooldownHoras || 24,
      ativa: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ regra: data }, { status: 201 });
}
