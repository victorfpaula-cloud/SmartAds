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
      // "maximum" = vida inteira da campanha (até 37 meses, o teto da própria API) — usado tanto
      // pra decidir o que é "relevante agora" (ver PainelCampanhasDaConta) quanto pro número exibido
      // na coluna "Gasto". Antes eram DUAS chamadas (uma de 30 dias só pra relevância, outra de
      // vida inteira pro número exibido) — uma conta com gasto lifetime mas nada recente agora fica
      // "relevante" por mais tempo do que antes, troca aceitável por bater na Meta metade das vezes
      // nessa tela, que é visitada o tempo todo.
      obterInsightsConta(conta.meta_ad_account_id, { nivel: "campaign", datePreset: "maximum", porDia: false }),
      supabase
        .from("smartads_campanhas_criadas")
        .select("id, meta_campaign_id, meta_adset_id, tipo_modelo, meta_ad_ids")
        .eq("conta_id", contaId),
    ]);

    const gastoPorCampanha = new Map(insights.map((i) => [i.campaign_id, i.spend]));
    const cachePorCampanha = new Map((cache ?? []).map((c) => [c.meta_campaign_id, c]));

    const linhas = campanhas.map((campanha) => ({
      ...campanha,
      spendTotal: gastoPorCampanha.get(campanha.id) ?? "0",
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
