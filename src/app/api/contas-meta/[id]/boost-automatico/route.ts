import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DURACOES_VALIDAS = [3, 7];

/** Liga/desliga o boost automático de uma conta e grava público + orçamento diário + duração — ver
 * src/lib/automacao/boostAutomatico.ts pra lógica de disparo (cron diário). Vale igual pra conta de
 * franquia e de empresa individual — não tem distinção de tipo aqui. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpo = await request.json().catch(() => null);
  const ativo = Boolean(corpo?.ativo);
  const publicoId = corpo?.publicoId ?? null;
  const orcamentoCentavos = corpo?.orcamentoCentavos != null ? Number(corpo.orcamentoCentavos) : null;
  const duracaoDias = DURACOES_VALIDAS.includes(Number(corpo?.duracaoDias)) ? Number(corpo.duracaoDias) : 3;

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
      boost_automatico_duracao_dias: duracaoDias,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
