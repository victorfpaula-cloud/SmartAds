import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Liga/desliga o boost automático de uma conta e grava público + orçamento diário — ver
 * src/lib/automacao/boostAutomatico.ts pra lógica de disparo (cron diário). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpo = await request.json().catch(() => null);
  const ativo = Boolean(corpo?.ativo);
  const publicoId = corpo?.publicoId ?? null;
  const orcamentoCentavos = corpo?.orcamentoCentavos != null ? Number(corpo.orcamentoCentavos) : null;

  if (ativo && (!publicoId || !Number.isFinite(orcamentoCentavos) || (orcamentoCentavos ?? 0) <= 0)) {
    return NextResponse.json(
      { erro: "Pra ligar, selecione um público salvo e informe um orçamento diário maior que zero." },
      { status: 400 }
    );
  }

  const supabase = criarClienteAdmin();
  const { error } = await supabase
    .from("smartads_contas_meta")
    .update({
      boost_automatico_ativo: ativo,
      boost_automatico_publico_id: publicoId,
      boost_automatico_orcamento_centavos: orcamentoCentavos,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
