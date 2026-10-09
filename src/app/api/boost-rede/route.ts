import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TIPOS = ["engajamento", "alcance", "ambos"];

/** Salva o padrão do boost de uma rede (empresa): tipo de entrega, orçamento/duração padrão e
 * quantos posts por dia podem ser turbinados. */
export async function PUT(request: NextRequest) {
  const c = await request.json().catch(() => null);
  const orcamento = c?.orcamentoDiarioCentavos == null ? null : Math.round(Number(c.orcamentoDiarioCentavos));
  const duracao = c?.duracaoDias == null ? null : Number(c.duracaoDias);
  const boostsPorDia = Number(c?.boostsPorDia ?? 1);

  if (!c?.empresaId || typeof c.empresaId !== "string") {
    return NextResponse.json({ erro: "Informe a rede." }, { status: 400 });
  }
  if (!TIPOS.includes(c.tipoEntrega)) {
    return NextResponse.json({ erro: "Tipo de entrega inválido." }, { status: 400 });
  }
  if (orcamento !== null && (!Number.isFinite(orcamento) || orcamento <= 0)) {
    return NextResponse.json({ erro: "Orçamento diário inválido." }, { status: 400 });
  }
  if (duracao !== null && duracao !== 3 && duracao !== 7) {
    return NextResponse.json({ erro: "A duração deve ser 3 ou 7 dias." }, { status: 400 });
  }
  if (!Number.isInteger(boostsPorDia) || boostsPorDia < 1 || boostsPorDia > 10) {
    return NextResponse.json({ erro: "Posts por dia deve ser de 1 a 10." }, { status: 400 });
  }

  const { error } = await criarClienteAdmin().from("smartads_boost_rede_config").upsert(
    {
      empresa_id: c.empresaId,
      tipo_entrega: c.tipoEntrega,
      orcamento_diario_centavos: orcamento,
      duracao_dias: duracao,
      boosts_por_dia: boostsPorDia,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "empresa_id" }
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
