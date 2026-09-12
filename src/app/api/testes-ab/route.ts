import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const campanhaId = request.nextUrl.searchParams.get("campanhaId");
  if (!campanhaId) return NextResponse.json({ erro: "Informe a campanha." }, { status: 400 });

  const supabase = criarClienteAdmin();
  const { data } = await supabase
    .from("smartads_testes_ab")
    .select("*")
    .eq("campanha_id", campanhaId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ teste: data ?? null });
}

/** Inicia um teste A/B numa campanha que já tem mais de uma variação de criativo (mesmo Conjunto
 * de Anúncios, ver suporte a múltiplas imagens) — o teste só observa e, quando os dois critérios
 * mínimos (dias + gasto) forem batidos, o cron declara o vencedor e pausa os outros sozinho. */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  if (!corpo?.campanhaId) {
    return NextResponse.json({ erro: "Informe a campanha." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data: campanha } = await supabase
    .from("smartads_campanhas_criadas")
    .select("meta_ad_ids")
    .eq("id", corpo.campanhaId)
    .single();

  if (!campanha) return NextResponse.json({ erro: "Campanha não encontrada." }, { status: 404 });
  if (!Array.isArray(campanha.meta_ad_ids) || campanha.meta_ad_ids.length < 2) {
    return NextResponse.json(
      { erro: "Essa campanha tem só 1 anúncio — teste A/B precisa de pelo menos 2 variações no mesmo conjunto." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("smartads_testes_ab")
    .insert({
      campanha_id: corpo.campanhaId,
      duracao_dias_minima: corpo.duracaoDiasMinima || 7,
      gasto_minimo_centavos: corpo.gastoMinimoCentavos || 5000,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ teste: data }, { status: 201 });
}
