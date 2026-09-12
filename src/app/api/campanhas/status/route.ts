import { NextResponse, type NextRequest } from "next/server";
import { listarCampanhas, obterInsightsConta } from "@/lib/meta/api";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { ErroMetaNaoConectado } from "@/lib/meta/token";
import { ErroGraphAPIException } from "@/lib/meta/erros";

export const dynamic = "force-dynamic";

/** Campanhas de uma conta, com gasto acumulado (insights) e o tipo_modelo/id local cruzados pelo
 * ID da campanha na Meta — alimenta o painel "Campanhas no ar". */
export async function GET(request: NextRequest) {
  const contaId = request.nextUrl.searchParams.get("contaId");
  if (!contaId) {
    return NextResponse.json({ erro: "Informe a conta." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data: conta, error: erroConta } = await supabase
    .from("smartads_contas_meta")
    .select("meta_ad_account_id")
    .eq("id", contaId)
    .single();

  if (erroConta || !conta) {
    return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  }

  try {
    const [campanhas, insights, { data: cache }] = await Promise.all([
      listarCampanhas(conta.meta_ad_account_id),
      obterInsightsConta(conta.meta_ad_account_id, { nivel: "campaign", datePreset: "maximum" }),
      supabase
        .from("smartads_campanhas_criadas")
        .select("id, meta_campaign_id, meta_adset_id, tipo_modelo, meta_ad_ids")
        .eq("conta_id", contaId),
    ]);

    const gastoPorCampanha = new Map(insights.map((i) => [i.campaign_id, i.spend]));
    const cachePorCampanha = new Map((cache ?? []).map((c) => [c.meta_campaign_id, c]));

    const linhas = campanhas.map((campanha) => ({
      ...campanha,
      spend: gastoPorCampanha.get(campanha.id) ?? "0",
      local: cachePorCampanha.get(campanha.id) ?? null,
    }));

    return NextResponse.json({ campanhas: linhas });
  } catch (erro) {
    if (erro instanceof ErroMetaNaoConectado) {
      return NextResponse.json({ erro: erro.message, naoConectado: true }, { status: 409 });
    }
    if (erro instanceof ErroGraphAPIException) {
      return NextResponse.json({ erro: erro.message }, { status: 502 });
    }
    return NextResponse.json({ erro: "Falha ao buscar campanhas." }, { status: 500 });
  }
}
