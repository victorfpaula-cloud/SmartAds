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
  const after = request.nextUrl.searchParams.get("after") ?? undefined;
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
    const [{ campanhas, proximoCursor }, insights, { data: cache }] = await Promise.all([
      // limit 50 (não o padrão de 10 de listarCampanhas) — com 10 por página, uma conta com mais
      // de 10 campanhas cadastradas podia ter uma campanha ATIVA fora da primeira página, escondida
      // até alguém clicar em "Carregar mais campanhas" (ninguém clica achando que só tem histórico
      // antigo ali). 50 cobre a esmagadora maioria das contas numa página só, sem round-trip extra.
      listarCampanhas(conta.meta_ad_account_id, { limit: 50, after }),
      // Últimos 30 dias, não a vida inteira da campanha — é o que a tela usa tanto pra mostrar
      // "Gasto (30d)" quanto pra decidir o que é "relevante agora" (ver PainelCampanhasDaConta,
      // filtro padrão ativa-ou-com-gasto-recente). `porDia: false` agrega num total só por
      // campanha — sem isso vinha uma linha POR DIA, travando a tela em contas com muita campanha.
      obterInsightsConta(conta.meta_ad_account_id, { nivel: "campaign", datePreset: "last_30d", porDia: false }),
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

    return NextResponse.json({ campanhas: linhas, proximoCursor });
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
