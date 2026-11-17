import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { campanhaAtivaAgora, listarCampanhas, obterCriativosPorCampanha, obterInsightsRelatorio, type LinhaInsightRelatorio } from "@/lib/meta/api";
import { comContaMeta } from "@/lib/meta/conexao";
import { adicionarDias, diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export interface Totais24h {
  gasto: number; // reais
  alcance: number;
  impressoes: number;
  curtidas: number;
  engajamentos: number;
  visitas: number;
  cliques: number;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const acao = (l: LinhaInsightRelatorio, f: (t: string) => boolean) => (l.actions ?? []).filter((a) => f(a.action_type)).reduce((t, a) => t + num(a.value), 0);
const zero = (): Totais24h => ({ gasto: 0, alcance: 0, impressoes: 0, curtidas: 0, engajamentos: 0, visitas: 0, cliques: 0 });
function somar(linhas: LinhaInsightRelatorio[]): Totais24h {
  const t = zero();
  for (const l of linhas) {
    t.gasto += num(l.spend);
    t.alcance += num(l.reach);
    t.impressoes += num(l.impressions);
    t.curtidas += acao(l, (x) => x === "post_reaction");
    t.engajamentos += acao(l, (x) => x === "post_engagement");
    t.visitas += acao(l, (x) => /profile_visit/i.test(x));
    t.cliques += num(l.inline_link_clicks) || acao(l, (x) => x === "link_click");
  }
  return t;
}

/** Resultado recente do tráfego de uma conta: hoje até agora, ontem (dia inteiro) e, pra cada
 * campanha no ar, há quantas horas ela está rodando e o que entregou desde que entrou no ar. Só
 * anúncio pago (nada de orgânico). */
export async function GET(request: NextRequest) {
  const contaId = request.nextUrl.searchParams.get("contaId");
  if (!contaId) return NextResponse.json({ erro: "Informe a conta." }, { status: 400 });
  const { data: conta } = await criarClienteAdmin().from("smartads_contas_meta").select("meta_ad_account_id").eq("id", contaId).maybeSingle();
  if (!conta) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  const act = conta.meta_ad_account_id as string;
  const hoje = diaEmSaoPaulo(new Date().toISOString());
  const ontem = adicionarDias(hoje, -1);

  try {
    const r = await comContaMeta(contaId, async () => {
      const [{ campanhas }, linhasHoje, linhasOntem, criativos] = await Promise.all([
        (async () => {
          // Até 3 páginas: conta com muitas campanhas antigas não esconde uma ativa.
          const todas = [];
          let after: string | undefined;
          for (let i = 0; i < 3; i++) {
            const p = await listarCampanhas(act, { limit: 100, after });
            todas.push(...p.campanhas);
            if (!p.proximoCursor) break;
            after = p.proximoCursor;
          }
          return { campanhas: todas };
        })(),
        obterInsightsRelatorio(act, { nivel: "campaign", desde: hoje, ate: hoje }),
        obterInsightsRelatorio(act, { nivel: "campaign", desde: ontem, ate: ontem }),
        obterCriativosPorCampanha(act).catch(() => null),
      ]);
      const ativas = campanhas.filter((c) => campanhaAtivaAgora(c));
      // Desde que cada campanha ativa entrou no ar (uma consulta só, a partir da mais antiga, até 37 dias).
      const inicios = ativas.map((c) => (c.start_time ? diaEmSaoPaulo(c.start_time) : hoje)).sort();
      const desde = [inicios[0] ?? hoje, adicionarDias(hoje, -37)].sort().reverse()[0];
      const desdeInicio = ativas.length ? await obterInsightsRelatorio(act, { nivel: "campaign", desde, ate: hoje }).catch(() => []) : [];
      const agora = Date.now();
      return {
        hoje: somar(linhasHoje),
        ontem: somar(linhasOntem),
        campanhas: ativas
          .map((c) => {
            const criativo = criativos?.get(c.id);
            return {
              id: c.id,
              nome: c.name.replace(/^🤖\s*/, ""),
              horasNoAr: c.start_time ? Math.max(0, (agora - new Date(c.start_time).getTime()) / 3_600_000) : null,
              thumbnailUrl: criativo?.thumbnailUrl ?? null,
              legenda: criativo?.legenda ?? null,
              desdeInicio: somar(desdeInicio.filter((l) => l.campaign_id === c.id)),
              hoje: somar(linhasHoje.filter((l) => l.campaign_id === c.id)),
            };
          })
          .sort((a, b) => (a.horasNoAr ?? 1e9) - (b.horasNoAr ?? 1e9)),
      };
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message.slice(0, 200) : "Falha na Meta." }, { status: 502 });
  }
}
