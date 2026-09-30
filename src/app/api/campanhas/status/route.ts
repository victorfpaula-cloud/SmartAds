import { NextResponse, type NextRequest } from "next/server";
import { listarCampanhas, obterInsightsConta, listarConjuntosDaConta, campanhaAtivaAgora } from "@/lib/meta/api";
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
    const [{ campanhas, proximoCursor }, insights, { data: cache }, conjuntos, insightsMes] = await Promise.all([
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
      // Orçamento fica no conjunto de anúncios, não na campanha — sem isso a coluna vinha vazia.
      // Falha aqui não derruba a tela: cai no orçamento da campanha (que existe em campanhas CBO).
      listarConjuntosDaConta(conta.meta_ad_account_id).catch(() => null),
      // Gasto do mês corrente por campanha (Meta "this_month", em reais) — a coluna "Gasto no mês" e a
      // soma do cartão do topo, pra dar pra conferir o total contra o Gerenciador campanha a campanha.
      obterInsightsConta(conta.meta_ad_account_id, { nivel: "campaign", datePreset: "this_month", porDia: false }).catch(
        () => null
      ),
    ]);
    const gastoMesPorCampanha = new Map((insightsMes ?? []).map((i) => [i.campaign_id, Number(i.spend ?? 0)]));
    const gastoMesTotalReais = insightsMes ? [...gastoMesPorCampanha.values()].reduce((a, b) => a + b, 0) : null;

    const gastoPorCampanha = new Map(insights.map((i) => [i.campaign_id, i.spend]));
    const cachePorCampanha = new Map((cache ?? []).map((c) => [c.meta_campaign_id, c]));

    // Orçamento da campanha = soma dos conjuntos dela: só os ativos quando a campanha está ativa (um
    // conjunto pausado não gasta), todos os demais casos somam tudo que não foi arquivado/excluído.
    const conjuntosPorCampanha = new Map<string, NonNullable<typeof conjuntos>>();
    for (const conjunto of conjuntos ?? []) {
      const lista = conjuntosPorCampanha.get(conjunto.campaign_id) ?? [];
      lista.push(conjunto);
      conjuntosPorCampanha.set(conjunto.campaign_id, lista);
    }

    const linhas = campanhas.map((campanha) => {
      const doConjunto = (conjuntosPorCampanha.get(campanha.id) ?? []).filter(
        (c) => c.effective_status !== "ARCHIVED" && c.effective_status !== "DELETED"
      );
      const consideradas = campanhaAtivaAgora(campanha)
        ? doConjunto.filter((c) => c.effective_status === "ACTIVE")
        : doConjunto;
      const somar = (campo: "daily_budget" | "lifetime_budget") =>
        consideradas.reduce((total, c) => total + (c[campo] ? Number(c[campo]) : 0), 0);
      const diarioConjuntos = somar("daily_budget");
      const vitalicioConjuntos = somar("lifetime_budget");

      return {
        ...campanha,
        spendTotal: gastoPorCampanha.get(campanha.id) ?? "0",
        gastoMesReais: gastoMesPorCampanha.get(campanha.id) ?? 0,
        local: cachePorCampanha.get(campanha.id) ?? null,
        orcamentoDiarioCentavos: diarioConjuntos || (campanha.daily_budget ? Number(campanha.daily_budget) : null),
        orcamentoVitalicioCentavos:
          vitalicioConjuntos || (campanha.lifetime_budget ? Number(campanha.lifetime_budget) : null),
      };
    });

    return NextResponse.json({ campanhas: linhas, proximoCursor, gastoMesTotalReais });
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
