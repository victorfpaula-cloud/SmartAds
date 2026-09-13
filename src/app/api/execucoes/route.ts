import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Histórico de tudo que a automação já fez (regra, teste A/B, piloto automático) — filtrado por
 * conta quando informado, senão devolve as mais recentes de todas. É a resposta pra "o que o
 * piloto automático fez sozinho" — sempre auditável, nunca uma caixa preta. */
export async function GET(request: NextRequest) {
  const contaId = request.nextUrl.searchParams.get("contaId");

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_execucoes_automacao")
    .select("*, smartads_campanhas_criadas(conta_id)")
    .order("executado_em", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const filtradas = contaId
    ? (data ?? []).filter((linha: any) => linha.smartads_campanhas_criadas?.conta_id === contaId)
    : data ?? [];

  return NextResponse.json({ execucoes: filtradas });
}
