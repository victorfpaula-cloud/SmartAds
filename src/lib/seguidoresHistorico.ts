import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterResumoContaInstagram, obterSerieSeguidoresInstagram } from "@/lib/meta/api";
import { adicionarDias, diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import { listarContasDaRede } from "@/lib/saudeRede";

/** A Meta só informa novos seguidores dos últimos 30 dias, e nunca devolve o total de dias passados.
 * Por isso o SmartAds guarda uma leitura por dia (cron) e, na primeira vez que vê uma conta, reconstrói
 * os últimos 30 dias a partir dos ganhos diários (total de hoje menos os ganhos dos dias seguintes).
 * Dias reconstruídos ficam marcados como tal; leituras reais nunca são sobrescritas. */
export async function completarHistoricoSeguidores(contaId: string, instagramId: string, pageId: string | null): Promise<number> {
  const supabase = criarClienteAdmin();
  const hoje = diaEmSaoPaulo(new Date().toISOString());
  const resumo = await obterResumoContaInstagram(instagramId);
  const agora = resumo.followers_count;
  if (typeof agora !== "number") return 0;

  // Leitura de hoje (real).
  await supabase
    .from("smartads_seguidores_snapshot")
    .upsert({ conta_id: contaId, dia: hoje, seguidores: agora, origem: "leitura" }, { onConflict: "conta_id,dia" });

  const serie = await obterSerieSeguidoresInstagram(instagramId, pageId);
  // Dia civil do ganho: o valor que termina em `fimIso` cobre o dia anterior a esse horário.
  const ganhoPorDia = new Map<string, number>();
  for (const p of serie) {
    const dia = adicionarDias(diaEmSaoPaulo(p.fimIso), -1);
    ganhoPorDia.set(dia, (ganhoPorDia.get(dia) ?? 0) + p.valor);
  }
  if (ganhoPorDia.size === 0) return 0;

  const dias = [...ganhoPorDia.keys()].sort();
  const linhas: Array<{ conta_id: string; dia: string; seguidores: number; origem: string }> = [];
  // Total lido na manhã do dia D ≈ fim do dia D-1 = hoje − ganhos dos dias >= D.
  for (let d = adicionarDias(dias[0], 1); d < hoje; d = adicionarDias(d, 1)) {
    const depois = dias.filter((x) => x >= d).reduce((soma, x) => soma + (ganhoPorDia.get(x) ?? 0), 0);
    linhas.push({ conta_id: contaId, dia: d, seguidores: agora - depois, origem: "reconstruida" });
  }
  if (linhas.length === 0) return 0;
  const { error } = await supabase
    .from("smartads_seguidores_snapshot")
    .upsert(linhas, { onConflict: "conta_id,dia", ignoreDuplicates: true });
  return error ? 0 : linhas.length;
}

export const PERIODOS_SEGUIDORES = [7, 15, 30, 60, 90] as const;

export interface GanhoSeguidores {
  dias: number;
  /** Ganho líquido no período; null sem nenhuma leitura. */
  ganho: number | null;
  /** Dia da leitura mais antiga usada; diferente do início do período = histórico ainda curto. */
  desde: string | null;
  completo: boolean;
}

export interface HistoricoSeguidoresRede {
  hoje: string;
  total: number | null;
  primeiroDia: string | null;
  ganhos: GanhoSeguidores[];
  /** Total da rede por dia (contando cada Instagram uma vez). */
  serie: Array<{ dia: string; total: number }>;
  porUnidade: Array<{ unidade: string; instagram: string | null; total: number | null; ganhos: Record<number, GanhoSeguidores> }>;
}

function ganhoDe(pontos: Array<{ dia: string; v: number }>, hoje: string, dias: number): GanhoSeguidores {
  if (pontos.length === 0) return { dias, ganho: null, desde: null, completo: false };
  const inicio = adicionarDias(hoje, -dias);
  const ultimo = pontos[pontos.length - 1];
  // Leitura mais próxima do início (a mais antiga que ainda cai dentro do período, ou a que cobre o início).
  const base = [...pontos].reverse().find((p) => p.dia <= inicio) ?? pontos[0];
  return { dias, ganho: ultimo.v - base.v, desde: base.dia, completo: base.dia <= inicio };
}

export async function carregarHistoricoSeguidores(empresaId: string): Promise<HistoricoSeguidoresRede> {
  const contas = await listarContasDaRede(empresaId);
  const hoje = diaEmSaoPaulo(new Date().toISOString());
  const vistos = new Set<string>();
  const unicas = contas.filter((c) => {
    if (!c.instagramId) return false;
    if (vistos.has(c.instagramId)) return false;
    vistos.add(c.instagramId);
    return true;
  });
  const { data } =
    unicas.length > 0
      ? await criarClienteAdmin()
          .from("smartads_seguidores_snapshot")
          .select("conta_id, dia, seguidores")
          .in("conta_id", unicas.map((c) => c.contaId))
          .gte("dia", adicionarDias(hoje, -95))
          .order("dia", { ascending: true })
          .range(0, 9999)
      : { data: [] as Array<{ conta_id: string; dia: string; seguidores: number }> };

  const porConta = new Map<string, Array<{ dia: string; v: number }>>();
  for (const l of data ?? []) {
    const lista = porConta.get(l.conta_id) ?? [];
    lista.push({ dia: l.dia, v: l.seguidores });
    porConta.set(l.conta_id, lista);
  }

  // Total da rede por dia, repetindo a última leitura nos dias sem leitura de uma unidade.
  const todosDias = [...new Set((data ?? []).map((l) => l.dia))].sort();
  const serie: Array<{ dia: string; total: number }> = [];
  const ultimo = new Map<string, number>();
  const idx = new Map<string, Map<string, number>>();
  for (const [conta, pts] of porConta) idx.set(conta, new Map(pts.map((p) => [p.dia, p.v])));
  for (const dia of todosDias) {
    for (const [conta, m] of idx) if (m.has(dia)) ultimo.set(conta, m.get(dia)!);
    // só conta o dia quando todas as unidades já têm alguma leitura (senão o total "pula" pra cima)
    if (ultimo.size === unicas.filter((u) => porConta.has(u.contaId)).length) {
      serie.push({ dia, total: [...ultimo.values()].reduce((a, b) => a + b, 0) });
    }
  }

  const pontosRede = serie.map((s) => ({ dia: s.dia, v: s.total }));
  return {
    hoje,
    total: serie.length > 0 ? serie[serie.length - 1].total : null,
    primeiroDia: serie.length > 0 ? serie[0].dia : null,
    ganhos: PERIODOS_SEGUIDORES.map((d) => ganhoDe(pontosRede, hoje, d)),
    serie,
    porUnidade: unicas.map((u) => {
      const pts = porConta.get(u.contaId) ?? [];
      return {
        unidade: u.unidade,
        instagram: u.instagram,
        total: pts.length ? pts[pts.length - 1].v : null,
        ganhos: Object.fromEntries(PERIODOS_SEGUIDORES.map((d) => [d, ganhoDe(pts, hoje, d)])) as Record<number, GanhoSeguidores>,
      };
    }),
  };
}

/** Novos seguidores entre dois dias (inclusive), pela diferença das leituras guardadas: total na manhã
 * do dia seguinte a `ate` menos o total na manhã de `desde`. null se faltar leitura nas pontas. */
export async function ganhoSeguidoresEntre(contaId: string, desde: string, ate: string): Promise<number | null> {
  const { data } = await criarClienteAdmin()
    .from("smartads_seguidores_snapshot")
    .select("dia, seguidores")
    .eq("conta_id", contaId)
    .gte("dia", desde)
    .lte("dia", adicionarDias(ate, 2))
    .order("dia", { ascending: true });
  const linhas = data ?? [];
  const inicio = linhas.find((l) => l.dia >= desde && l.dia <= adicionarDias(desde, 1));
  const fim = [...linhas].reverse().find((l) => l.dia > ate && l.dia <= adicionarDias(ate, 2));
  return inicio && fim ? fim.seguidores - inicio.seguidores : null;
}
