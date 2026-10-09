import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DURACOES_VALIDAS = [3, 7];
const TIPOS = ["engajamento", "alcance", "ambos"];

/** Configuração atual do boost da conta (tipo de entrega, posts por dia) — o modal carrega daqui. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await criarClienteAdmin()
    .from("smartads_contas_meta")
    .select("boost_tipo_entrega, boost_posts_por_dia")
    .eq("id", id)
    .maybeSingle();
  return NextResponse.json({ tipoEntrega: data?.boost_tipo_entrega ?? "engajamento", postsPorDia: data?.boost_posts_por_dia ?? 1 });
}

/** Liga/desliga o boost automático de uma conta e grava público + orçamento diário + duração — ver
 * src/lib/automacao/boostAutomatico.ts pra lógica de disparo (cron diário). Vale igual pra conta de
 * franquia e de empresa individual — não tem distinção de tipo aqui. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpo = await request.json().catch(() => null);
  const ativo = Boolean(corpo?.ativo);
  const publicoId = corpo?.publicoId ?? null;
  const orcamentoCentavos = corpo?.orcamentoCentavos != null ? Number(corpo.orcamentoCentavos) : null;
  const tipoEntrega = TIPOS.includes(corpo?.tipoEntrega) ? corpo.tipoEntrega : "engajamento";
  const postsPorDia = Number.isInteger(Number(corpo?.postsPorDia)) && Number(corpo.postsPorDia) >= 1 && Number(corpo.postsPorDia) <= 10 ? Number(corpo.postsPorDia) : 1;
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
      boost_tipo_entrega: tipoEntrega,
      boost_posts_por_dia: postsPorDia,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
