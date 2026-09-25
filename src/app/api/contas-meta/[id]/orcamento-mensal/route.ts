import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Teto de orçamento mensal comprometido pela unidade — só usado pelo painel de Planejamento em
 * /financeiro?rede=franquia (ver src/lib/financeiro/coletarFinanceiro.ts). Vale igual pra franquia
 * e empresa individual. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpo = await request.json().catch(() => null);
  const orcamentoCentavos = Number(corpo?.orcamentoCentavos);

  if (!Number.isFinite(orcamentoCentavos) || orcamentoCentavos <= 0) {
    return NextResponse.json({ erro: "Informe um orçamento mensal maior que zero." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { error } = await supabase
    .from("smartads_contas_meta")
    .update({ orcamento_mensal_centavos: Math.round(orcamentoCentavos) })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
