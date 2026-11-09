import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { calcularSituacaoTeto } from "@/lib/tetoMensal";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Situação do teto de uma conta; com ?tipo&valor&inicio&fim inclui a campanha que está sendo criada. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const contaId = p.get("contaId");
  if (!contaId) return NextResponse.json({ erro: "Informe a conta." }, { status: 400 });
  const valor = Number(p.get("valor"));
  const tipo: "diario" | "vitalicio" = p.get("tipo") === "vitalicio" ? "vitalicio" : "diario";
  const novo = valor > 0 ? { tipo, valorCentavos: Math.round(valor), dataInicio: p.get("inicio") || undefined, dataFim: p.get("fim") || undefined } : undefined;
  const situacao = await calcularSituacaoTeto(contaId, novo);
  if (!situacao) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  return NextResponse.json({ situacao });
}

/** Define (ou remove, com null) o teto de gasto do mês da unidade. */
export async function PATCH(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const contaId = typeof corpo?.contaId === "string" ? corpo.contaId : null;
  const bruto = corpo?.tetoCentavos;
  if (!contaId) return NextResponse.json({ erro: "Informe a conta." }, { status: 400 });
  const teto = bruto === null ? null : Math.round(Number(bruto));
  if (teto !== null && (!Number.isFinite(teto) || teto <= 0)) {
    return NextResponse.json({ erro: "Informe um teto maior que zero (ou deixe em branco pra remover)." }, { status: 400 });
  }
  const { error } = await criarClienteAdmin().from("smartads_contas_meta").update({ teto_mensal_centavos: teto }).eq("id", contaId);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tetoCentavos: teto });
}
