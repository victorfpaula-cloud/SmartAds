import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsRelatorio, type LinhaInsightRelatorio } from "@/lib/meta/api";
import { comContaMeta } from "@/lib/meta/conexao";
import { listarContasDaRede } from "@/lib/saudeRede";
import { adicionarDias, diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import { mapearEmLotes } from "@/lib/lotes";

/** Análise comparativa do tráfego da rede (semanal): para cada unidade, quanto investiu e o que
 * voltou (alcance, curtidas, interações, comentários, salvamentos...), as taxas de eficiência, e
 * recomendações concretas comparando as unidades entre si e com a semana anterior.
 *
 * Tudo vem dos insights da Meta por campanha. "Boost" = campanhas criadas pelo boost automático (o
 * nome tem "Boost"); "Tudo" = todas as campanhas da conta. O alcance é a soma das campanhas (a
 * mesma pessoa vista em duas campanhas conta duas vezes) — serve pra comparar unidades, não como
 * número de pessoas únicas. */

export type Escopo = "boost" | "tudo";

export interface Metricas {
  gasto: number; // reais
  alcance: number;
  impressoes: number;
  interacoes: number;
  curtidas: number;
  comentarios: number;
  salvamentos: number;
  compartilhamentos: number;
  /** Visitas ao perfil do Instagram vindas dos anúncios (podem faltar em análises antigas). */
  visitasPerfil?: number;
  /** Cliques no link dos anúncios (idem). */
  cliques?: number;
  /** Visualizações de vídeo de 3s+ e ThruPlays (15s+ ou o vídeo inteiro). */
  videoViews?: number;
  thruplays?: number;
  campanhas: number;
}

export interface UnidadeAnalise {
  contaId: string;
  unidade: string;
  erro: string | null;
  /** Orçamento diário configurado no boost automático (reais) e se está ligado. */
  boostLigado: boolean;
  boostDiario: number | null;
  atual: Record<Escopo, Metricas>;
  anterior: Record<Escopo, Metricas>;
}

export type TomInsight = "destaque" | "oportunidade" | "atencao" | "info";

export interface Insight {
  tom: TomInsight;
  unidade: string | null;
  /** Métrica a que a dica se refere (Alcance, Engajamento, Visitas ao perfil, Cliques no link). */
  metrica?: string | null;
  titulo: string;
  /** O que aconteceu (números). Trechos entre **asteriscos** aparecem em negrito na tela. */
  detalhe: string;
  /** O que fazer, quando há uma ação concreta. */
  acao?: string;
}

export interface AnaliseTrafego {
  calculadoEm: string;
  /** Tamanho do período (7 ou 15 dias, sempre terminando ontem) — comparado com o período anterior de mesmo tamanho. */
  dias?: number;
  periodo: { desde: string; ate: string };
  unidades: UnidadeAnalise[];
}

const zero = (): Metricas => ({ gasto: 0, alcance: 0, impressoes: 0, interacoes: 0, curtidas: 0, comentarios: 0, salvamentos: 0, compartilhamentos: 0, visitasPerfil: 0, cliques: 0, videoViews: 0, thruplays: 0, campanhas: 0 });
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const acao = (l: LinhaInsightRelatorio, tipos: string[]) =>
  (l.actions ?? []).filter((a) => tipos.includes(a.action_type)).reduce((t, a) => t + num(a.value), 0);
export const ehBoost = (nome: string | undefined) => /\bboost\b/i.test(nome ?? "");

export function somarLinhas(linhas: LinhaInsightRelatorio[]): Record<Escopo, Metricas> {
  const r = { boost: zero(), tudo: zero() };
  for (const l of linhas) {
    const alvos: Metricas[] = [r.tudo, ...(ehBoost(l.campaign_name) ? [r.boost] : [])];
    for (const m of alvos) {
      m.gasto += num(l.spend);
      m.alcance += num(l.reach);
      m.impressoes += num(l.impressions);
      m.interacoes += acao(l, ["post_engagement"]);
      m.curtidas += acao(l, ["post_reaction"]);
      m.comentarios += acao(l, ["comment"]);
      m.salvamentos += acao(l, ["onsite_conversion.post_save"]);
      m.compartilhamentos += acao(l, ["post"]);
      m.visitasPerfil = (m.visitasPerfil ?? 0) + (l.actions ?? []).filter((a) => /profile_visit/i.test(a.action_type)).reduce((t, a) => t + num(a.value), 0);
      m.cliques = (m.cliques ?? 0) + (num(l.inline_link_clicks) || acao(l, ["link_click"]));
      m.videoViews = (m.videoViews ?? 0) + acao(l, ["video_view"]);
      m.thruplays = (m.thruplays ?? 0) + (l.video_thruplay_watched_actions ?? []).reduce((t, a) => t + num(a.value), 0);
      if (num(l.spend) > 0) m.campanhas++;
    }
  }
  return r;
}

/** Busca as duas semanas (atual e anterior) de todas as unidades da franquia e guarda. */
export const PERIODOS_ANALISE = [7, 15] as const;

export async function calcularAnaliseTrafego(empresaId: string, dias: number = 7, limiteMs = 45_000): Promise<AnaliseTrafego> {
  const inicio = Date.now();
  const contasTodas = await listarContasDaRede(empresaId);
  // Só as unidades: fica de fora a conta central da rede (Principal/Expansão), que divide a mesma
  // conta de anúncio entre mais de um cadastro e não é comparável com uma unidade.
  const usosDaContaDeAnuncio = new Map<string, number>();
  for (const c of contasTodas) if (c.adAccountId) usosDaContaDeAnuncio.set(c.adAccountId, (usosDaContaDeAnuncio.get(c.adAccountId) ?? 0) + 1);
  const contas = contasTodas.filter(
    (c) => c.adAccountId && (usosDaContaDeAnuncio.get(c.adAccountId) ?? 0) === 1 && !ehContaCentralDaRede(c.unidade)
  );
  const { data: cfg } = await criarClienteAdmin()
    .from("smartads_contas_meta")
    .select("id, boost_automatico_ativo, boost_automatico_orcamento_centavos")
    .in("id", contas.map((c) => c.contaId));
  const cfgPorConta = new Map((cfg ?? []).map((c) => [c.id as string, c]));

  const hoje = diaEmSaoPaulo(new Date().toISOString());
  const ate = adicionarDias(hoje, -1); // semana fechada: até ontem
  const desde = adicionarDias(ate, -(dias - 1));
  const antAte = adicionarDias(desde, -1);
  const antDesde = adicionarDias(antAte, -(dias - 1));

  const unidades = await mapearEmLotes(
    contas,
    async (c): Promise<UnidadeAnalise> => {
      const conf = cfgPorConta.get(c.contaId);
      const base = {
        contaId: c.contaId,
        unidade: c.unidade,
        boostLigado: Boolean(conf?.boost_automatico_ativo),
        boostDiario: conf?.boost_automatico_orcamento_centavos ? (conf.boost_automatico_orcamento_centavos as number) / 100 : null,
      };
      if (Date.now() - inicio > limiteMs) return { ...base, erro: "Sem tempo nesta rodada.", atual: { boost: zero(), tudo: zero() }, anterior: { boost: zero(), tudo: zero() } };
      try {
        // Com as métricas de vídeo; se a Meta recusar esses campos, busca sem eles (o resto não se perde).
        const buscar = (comVideo: boolean) =>
          comContaMeta(c.contaId, () =>
            Promise.all([
              obterInsightsRelatorio(c.adAccountId as string, { nivel: "campaign", desde, ate, comVideo }),
              obterInsightsRelatorio(c.adAccountId as string, { nivel: "campaign", desde: antDesde, ate: antAte, comVideo }),
            ])
          );
        const [a, b] = await buscar(true).catch(() => buscar(false));
        return { ...base, erro: null, atual: somarLinhas(a), anterior: somarLinhas(b) };
      } catch (e) {
        return { ...base, erro: (e instanceof Error ? e.message : "Falha na Meta.").slice(0, 200), atual: { boost: zero(), tudo: zero() }, anterior: { boost: zero(), tudo: zero() } };
      }
    },
    6
  );

  const analise: AnaliseTrafego = { calculadoEm: new Date().toISOString(), dias, periodo: { desde, ate }, unidades };
  await criarClienteAdmin()
    .from("smartads_analise_trafego")
    .upsert({ empresa_id: empresaId, dias, dados: analise, calculado_em: analise.calculadoEm });
  return analise;
}

/** Conta central da franquia (não é uma unidade): "Dona Baunilha - Principal", "... - Expansão". */
export const ehContaCentralDaRede = (nome: string) => /\b(principal|expans[aã]o|oficial)\b/i.test(nome);

export async function lerAnaliseTrafego(empresaId: string, dias: number = 7): Promise<AnaliseTrafego | null> {
  const { data } = await criarClienteAdmin().from("smartads_analise_trafego").select("dados").eq("empresa_id", empresaId).eq("dias", dias).maybeSingle();
  const a = (data?.dados as AnaliseTrafego | undefined) ?? null;
  // Análises calculadas antes dessa regra ainda traziam a conta central — tira na leitura também.
  return a ? { ...a, unidades: a.unidades.filter((u) => !ehContaCentralDaRede(u.unidade)) } : null;
}

// ---------------------------------------------------------------------------------------------
// Taxas e recomendações (puro — testável sem a Meta)
// ---------------------------------------------------------------------------------------------

/** Mínimo investido na semana pra uma unidade entrar nas comparações (abaixo disso é ruído). */
export const GASTO_MINIMO_SEMANA = 10;

export interface Taxas {
  gastoDia: number;
  custoMilAlcance: number | null;
  custoEngajamento: number | null;
  custoVisita: number | null;
  custoClique: number | null;
  /** Custo por mil visualizações (CPM) — "visualizações" é como a Meta chama as impressões hoje. */
  custoMilVisualizacoes: number | null;
  custoThruplay: number | null;
  /** De quem começou a ver o vídeo (3s), quantos % assistiram 15s+ / até o fim (ThruPlay). */
  retencaoVideo: number | null;
  /** Visualizações de vídeo (3s) a cada 100 visualizações do anúncio — o "gancho" do Reels. */
  ganchoVideo: number | null;
  /** Mantidos pra compatibilidade (tela antiga / testes). */
  custoCurtida: number | null;
  curtidasPorReal: number | null;
  custoInteracao: number | null;
  taxaEngajamento: number | null; // interações a cada 100 alcançados
  taxaCurtida: number | null;
  frequencia: number | null;
  conversaPorMil: number | null;
}

export function taxas(m: Metricas, dias = 7): Taxas {
  const custo = (qtd: number | undefined, min = 1) => (qtd && qtd >= min ? m.gasto / qtd : null);
  return {
    gastoDia: m.gasto / dias,
    custoMilAlcance: m.alcance > 0 ? (m.gasto / m.alcance) * 1000 : null,
    custoEngajamento: custo(m.interacoes),
    custoVisita: custo(m.visitasPerfil),
    custoClique: custo(m.cliques),
    custoMilVisualizacoes: m.impressoes > 0 ? (m.gasto / m.impressoes) * 1000 : null,
    custoThruplay: custo(m.thruplays),
    retencaoVideo: m.videoViews && m.videoViews >= 50 && m.thruplays !== undefined ? (m.thruplays / m.videoViews) * 100 : null,
    ganchoVideo: m.impressoes > 0 && m.videoViews ? (m.videoViews / m.impressoes) * 100 : null,
    custoCurtida: custo(m.curtidas),
    curtidasPorReal: m.gasto > 0 ? m.curtidas / m.gasto : null,
    custoInteracao: custo(m.interacoes),
    taxaEngajamento: m.alcance > 0 ? (m.interacoes / m.alcance) * 100 : null,
    taxaCurtida: m.alcance > 0 ? (m.curtidas / m.alcance) * 100 : null,
    frequencia: m.alcance > 0 ? m.impressoes / m.alcance : null,
    conversaPorMil: m.alcance > 0 ? ((m.comentarios + m.salvamentos + m.compartilhamentos) / m.alcance) * 1000 : null,
  };
}

export function mediana(valores: Array<number | null>): number | null {
  const v = valores.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

const R = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const I = (n: number) => Math.round(n).toLocaleString("pt-BR");
const D = (n: number, c = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const B = (t: string) => `**${t}**`;
const arred = (n: number) => (n >= 30 ? Math.ceil(n / 5) * 5 : Math.ceil(n));

/** As métricas da análise: o custo de cada resultado, comparado com a mediana da rede. */
export interface MetricaAnalise {
  chave: "alcance" | "visualizacoes" | "engajamento" | "visitas" | "cliques" | "video";
  nome: string;
  unidadeCusto: string;
  volume: (m: Metricas) => number;
  custo: (t: Taxas) => number | null;
  minimo: number;
  rotuloVolume: string;
  /** Peso no índice geral de desempenho. */
  peso: number;
}

export const METRICAS: MetricaAnalise[] = [
  { chave: "alcance", nome: "Alcance", unidadeCusto: "por mil pessoas alcançadas", volume: (m) => m.alcance, custo: (t) => t.custoMilAlcance, minimo: 1000, rotuloVolume: "pessoas alcançadas", peso: 2 },
  { chave: "visualizacoes", nome: "Visualizações", unidadeCusto: "por mil visualizações", volume: (m) => m.impressoes, custo: (t) => t.custoMilVisualizacoes, minimo: 2000, rotuloVolume: "visualizações", peso: 1 },
  { chave: "engajamento", nome: "Engajamento", unidadeCusto: "por engajamento", volume: (m) => m.interacoes, custo: (t) => t.custoEngajamento, minimo: 50, rotuloVolume: "engajamentos", peso: 2 },
  { chave: "visitas", nome: "Visitas ao perfil", unidadeCusto: "por visita ao perfil", volume: (m) => m.visitasPerfil ?? 0, custo: (t) => t.custoVisita, minimo: 10, rotuloVolume: "visitas ao perfil", peso: 1 },
  { chave: "cliques", nome: "Cliques no link", unidadeCusto: "por clique no link", volume: (m) => m.cliques ?? 0, custo: (t) => t.custoClique, minimo: 10, rotuloVolume: "cliques no link", peso: 1 },
  { chave: "video", nome: "Vídeo assistido (ThruPlay)", unidadeCusto: "por ThruPlay", volume: (m) => m.thruplays ?? 0, custo: (t) => t.custoThruplay, minimo: 30, rotuloVolume: "ThruPlays (15s+ ou vídeo inteiro)", peso: 1 },
];

/** A régua: posição de um custo em relação à mediana, em faixas — nunca um percentual exagerado. */
export function regua(custo: number, mediana: number): { faixa: "bem_melhor" | "melhor" | "media" | "pior" | "bem_pior"; texto: string } {
  const r = custo / mediana;
  const pct = Math.round(Math.abs(r - 1) * 100);
  if (r <= 0.5) return { faixa: "bem_melhor", texto: "menos da metade da mediana da rede" };
  if (r <= 0.75) return { faixa: "bem_melhor", texto: `${pct}% abaixo da mediana da rede` };
  if (r <= 0.85) return { faixa: "melhor", texto: `${pct}% abaixo da mediana da rede` };
  if (r < 1.15) return { faixa: "media", texto: "na média da rede" };
  if (r < 1.35) return { faixa: "pior", texto: `${pct}% acima da mediana da rede` };
  if (r < 2) return { faixa: "bem_pior", texto: `${pct}% acima da mediana da rede` };
  return { faixa: "bem_pior", texto: "mais que o dobro da mediana da rede" };
}

const vezes = (r: number) => (r >= 2 ? "mais que o dobro de" : `${D(r)}x`);

export interface IndiceUnidade {
  contaId: string;
  unidade: string;
  /** 100 = desempenho da mediana da rede; 130 = cada real rende 30% mais que a mediana (média ponderada das métricas). */
  indice: number;
  metricas: number;
}

/** Índice geral de desempenho: em cada métrica com volume, quanto a unidade rende por real em
 * relação à mediana (mediana ÷ custo da unidade), média ponderada pelos pesos. Limitado entre 50 e
 * 200 por métrica pra um número fora da curva não dominar. */
export function calcularIndices(analise: AnaliseTrafego, escopo: Escopo): { indices: IndiceUnidade[]; medianas: Map<string, number | null> } {
  const dias = analise.dias ?? 7;
  const minimoGasto = GASTO_MINIMO_SEMANA * (dias / 7);
  const ativas = analise.unidades
    .filter((u) => !u.erro && u.atual[escopo].gasto >= minimoGasto)
    .map((u) => ({ u, m: u.atual[escopo], t: taxas(u.atual[escopo], dias) }));
  const medianas = new Map<string, number | null>();
  for (const met of METRICAS) {
    const com = ativas.filter((l) => met.volume(l.m) >= met.minimo && met.custo(l.t) !== null);
    medianas.set(met.chave, com.length >= 3 ? mediana(com.map((l) => met.custo(l.t))) : null);
  }
  const indices: IndiceUnidade[] = [];
  for (const l of ativas) {
    let soma = 0;
    let pesos = 0;
    let n = 0;
    for (const met of METRICAS) {
      const med = medianas.get(met.chave);
      const c = met.custo(l.t);
      if (!med || c === null || met.volume(l.m) < met.minimo) continue;
      soma += Math.min(2, Math.max(0.5, med / c)) * met.peso;
      pesos += met.peso;
      n++;
    }
    if (n >= 2) indices.push({ contaId: l.u.contaId, unidade: l.u.unidade, indice: Math.round((soma / pesos) * 100), metricas: n });
  }
  return { indices: indices.sort((a, b) => b.indice - a.indice), medianas };
}

export function gerarInsights(analise: AnaliseTrafego, escopo: Escopo): Insight[] {
  const ins: Insight[] = [];
  const dias = analise.dias ?? 7;
  const nomePeriodo = dias === 7 ? "nos últimos 7 dias" : `nos últimos ${dias} dias`;
  const minimoGasto = GASTO_MINIMO_SEMANA * (dias / 7);
  const freqLimite = dias <= 7 ? 2.5 : 3.5;
  const linhas = analise.unidades
    .filter((u) => !u.erro)
    .map((u) => ({ u, m: u.atual[escopo], t: taxas(u.atual[escopo], dias), ant: u.anterior[escopo], tAnt: taxas(u.anterior[escopo], dias) }));
  const ativas = linhas.filter((l) => l.m.gasto >= minimoGasto);
  const { indices, medianas } = calcularIndices(analise, escopo);

  if (escopo === "boost") {
    for (const l of linhas.filter((x) => x.u.boostLigado && x.m.gasto < 1)) {
      ins.push({ tom: "atencao", unidade: l.u.unidade, metrica: null, titulo: `Boost ligado, mas não gastou ${nomePeriodo}`, detalhe: "Nenhuma campanha de boost entregou.", acao: "Confira se a unidade publicou **post oficial da rede** no período (o boost da franquia só turbina esses), se a conta tem **saldo** e o último erro do boost na tela da unidade." });
    }
  }
  for (const l of ativas.filter((x) => x.m.interacoes === 0 && x.m.alcance === 0)) {
    ins.push({ tom: "atencao", unidade: l.u.unidade, metrica: null, titulo: `Investiu ${R(l.m.gasto)} sem resultado medido`, detalhe: "A Meta não registrou alcance nem engajamento.", acao: "Confira no Gerenciador se o anúncio foi **reprovado** ou a entrega travou." });
  }

  // 0) Índice geral: quem rende acima e abaixo da rede, juntando todas as métricas.
  for (const x of indices) {
    if (x.indice >= 125)
      ins.push({ tom: "destaque", unidade: x.unidade, metrica: "Desempenho geral", titulo: `Rende ${x.indice - 100}% acima da mediana da rede`, detalhe: `Índice geral ${B(String(x.indice))} (100 = mediana da rede), somando alcance, visualizações, engajamento${x.metricas > 3 ? ", visitas, cliques e vídeo onde há volume" : ""}.`, acao: "Use o **público salvo** e os **posts turbinados** dessa unidade como referência pras outras." });
    else if (x.indice <= 80)
      ins.push({ tom: "oportunidade", unidade: x.unidade, metrica: "Desempenho geral", titulo: `Rende ${100 - x.indice}% abaixo da mediana da rede`, detalhe: `Índice geral ${B(String(x.indice))} (100 = mediana da rede). Veja abaixo em qual métrica está o problema.` });
  }

  // 1) Cada métrica separada, na régua da mediana.
  for (const met of METRICAS) {
    const med = medianas.get(met.chave);
    if (!med) continue;
    for (const l of ativas) {
      const c = met.custo(l.t);
      if (c === null || met.volume(l.m) < met.minimo) continue;
      const r = regua(c, med);
      const pouco = met.volume(l.m) < met.minimo * 2 ? " Volume ainda pequeno — confirme no próximo período." : "";
      const base = `${B(R(c))} ${met.unidadeCusto} — ${r.texto} (${R(med)}). ${I(met.volume(l.m))} ${met.rotuloVolume} com ${R(l.m.gasto)} investidos.${pouco}`;
      if (r.faixa === "bem_melhor")
        ins.push({ tom: "destaque", unidade: l.u.unidade, metrica: met.nome, titulo: `${met.nome} bem mais barato que a rede`, detalhe: base });
      else if (r.faixa === "bem_pior")
        ins.push({ tom: "oportunidade", unidade: l.u.unidade, metrica: met.nome, titulo: `${met.nome} bem mais caro que a rede`, detalhe: base, acao: acaoPorMetrica(met.chave) });
      else if (r.faixa === "pior" && (met.chave === "engajamento" || met.chave === "cliques"))
        ins.push({ tom: "info", unidade: l.u.unidade, metrica: met.nome, titulo: `${met.nome} um pouco acima da média`, detalhe: `${base} Nada grave — acompanhe.` });
    }
  }
  if (ativas.length < 3) {
    ins.push({ tom: "info", unidade: null, metrica: null, titulo: "Poucas unidades pra comparar", detalhe: `As comparações precisam de pelo menos ${B("3 unidades")} com ${R(minimoGasto)} ou mais investidos ${nomePeriodo}. Hoje são ${ativas.length}.` });
  }

  // 2) Vídeo: gancho (quem para pra ver) e retenção (quem assiste até 15s/fim).
  const medGancho = mediana(ativas.filter((l) => (l.m.videoViews ?? 0) >= 100).map((l) => l.t.ganchoVideo));
  const medRet = mediana(ativas.map((l) => l.t.retencaoVideo));
  for (const l of ativas) {
    if (medGancho && l.t.ganchoVideo !== null && (l.m.videoViews ?? 0) >= 100 && l.t.ganchoVideo < medGancho * 0.7)
      ins.push({ tom: "oportunidade", unidade: l.u.unidade, metrica: "Vídeo", titulo: "Pouca gente para pra ver o vídeo", detalhe: `${B(D(l.t.ganchoVideo) + "%")} das visualizações viram vídeo de 3s+ (mediana ${D(medGancho)}%).`, acao: "Os **primeiros 2 segundos** do Reels decidem: comece pelo doce/produto em close, com texto grande na tela." });
    if (medRet && l.t.retencaoVideo !== null && l.t.retencaoVideo < medRet * 0.7)
      ins.push({ tom: "info", unidade: l.u.unidade, metrica: "Vídeo", titulo: "Assistem pouco do vídeo", detalhe: `Só ${B(D(l.t.retencaoVideo) + "%")} de quem começou assistiu 15s ou até o fim (mediana ${D(medRet)}%).`, acao: "Prefira turbinar **Reels mais curtos** (até 15s) ou com a parte principal logo no início." });
  }

  // 3) Quem investe parecido: quem rende mais alcance e engajamento por real, e por quê.
  const ordenadas = [...ativas].sort((a, b) => a.t.gastoDia - b.t.gastoDia);
  const jaComparadas = new Set<string>();
  for (let i = 0; i < ordenadas.length; i++) {
    for (let j = i + 1; j < ordenadas.length; j++) {
      const a = ordenadas[i];
      const b = ordenadas[j];
      if (b.t.gastoDia > a.t.gastoDia * 1.3) break;
      if (a.m.interacoes < 50 || b.m.interacoes < 50) continue;
      const [melhor, pior] = a.m.interacoes / a.m.gasto >= b.m.interacoes / b.m.gasto ? [a, b] : [b, a];
      const razao = melhor.m.interacoes / melhor.m.gasto / (pior.m.interacoes / pior.m.gasto);
      if (razao < 1.35 || jaComparadas.has(pior.u.contaId)) continue;
      jaComparadas.add(pior.u.contaId);
      const razaoAlc = melhor.t.custoMilAlcance && pior.t.custoMilAlcance ? pior.t.custoMilAlcance / melhor.t.custoMilAlcance : 1;
      const rM = melhor.t.taxaEngajamento ?? 0;
      const rP = pior.t.taxaEngajamento ?? 0;
      const publicoCaro = razaoAlc >= 1.25;
      const postFraco = rM >= rP * 1.25;
      const motivo = publicoCaro && !postFraco
        ? `Motivo: ${B("público mais caro")} — ${R(pior.t.custoMilAlcance ?? 0)} por mil pessoas contra ${R(melhor.t.custoMilAlcance ?? 0)}; o post engaja parecido.`
        : postFraco && !publicoCaro
          ? `Motivo: ${B("post engaja menos")} — ${D(rP)} engajamentos a cada 100 pessoas contra ${D(rM)}; o alcance custa parecido.`
          : `Motivo: ${B("os dois")} — alcance a ${R(pior.t.custoMilAlcance ?? 0)} por mil (contra ${R(melhor.t.custoMilAlcance ?? 0)}) e ${D(rP)} engajamentos a cada 100 pessoas (contra ${D(rM)}).`;
      ins.push({
        tom: "oportunidade",
        unidade: pior.u.unidade,
        metrica: "Comparação",
        titulo: `Investe parecido com ${melhor.u.unidade}, que tira ${vezes(razao)} mais engajamento por real`,
        detalhe: `${pior.u.unidade}: ${B(R(pior.t.gastoDia) + "/dia")} → ${I(pior.m.alcance)} alcançados, ${I(pior.m.interacoes)} engajamentos. ${melhor.u.unidade}: ${B(R(melhor.t.gastoDia) + "/dia")} → ${I(melhor.m.alcance)} alcançados, ${I(melhor.m.interacoes)} engajamentos. ${motivo}`,
        acao: publicoCaro && !postFraco ? acaoPorMetrica("alcance") : postFraco && !publicoCaro ? acaoPorMetrica("engajamento") : "Comece pelo **público** (raio maior, menos filtros) e depois priorize os **posts que mais engajaram**.",
      });
    }
  }

  // 4) Orçamento pra chegar perto do maior volume — só pra quem já tem custo bom.
  const medEng = medianas.get("engajamento") ?? null;
  const topEng = [...ativas].sort((a, b) => b.m.interacoes - a.m.interacoes)[0];
  for (const l of ativas) {
    if (!topEng || l === topEng || l.m.interacoes < 50 || !l.t.custoEngajamento) continue;
    if (l.m.interacoes >= topEng.m.interacoes * 0.8) continue;
    const r = medEng ? regua(l.t.custoEngajamento, medEng) : null;
    if (r && (r.faixa === "bem_pior" || r.faixa === "pior")) continue;
    const necessarioDia = (topEng.m.interacoes / dias) * l.t.custoEngajamento;
    const passos: number[] = [];
    let atual = l.t.gastoDia;
    while (atual < necessarioDia && passos.length < 4) {
      atual = Math.min(necessarioDia, atual * 1.25);
      passos.push(arred(atual));
    }
    const ganho = passos.length ? ((passos[0] - l.t.gastoDia) * dias) / l.t.custoEngajamento : 0;
    ins.push({
      tom: "oportunidade",
      unidade: l.u.unidade,
      metrica: "Orçamento",
      titulo: `Custo bom: dá pra crescer até ~${R(arred(necessarioDia))}/dia`,
      detalhe: `Hoje ${B(R(l.t.gastoDia) + "/dia")} e ${I(l.m.interacoes)} engajamentos a ${R(l.t.custoEngajamento)} cada (${r?.texto ?? "sem mediana"}). ${topEng.u.unidade} teve ${I(topEng.m.interacoes)}.`,
      acao: `Aumente aos poucos (~25% por semana): ${passos.map((v, k) => `${B(`semana ${k + 1}: ${R(v)}`)}`).join(" → ")}${atual < necessarioDia ? " → …" : ""}. O primeiro passo deve trazer ~${B(I(Math.max(0, ganho)) + " engajamentos")} a mais. Confira o teto de gasto do mês.`,
    });
  }

  // 5) Saturação.
  for (const l of ativas) {
    if (l.t.frequencia !== null && l.t.frequencia >= freqLimite)
      ins.push({ tom: "atencao", unidade: l.u.unidade, metrica: "Alcance", titulo: `Público saturado: ${D(l.t.frequencia)} visualizações por pessoa`, detalhe: `${B(I(l.m.impressoes))} visualizações pra ${B(I(l.m.alcance))} pessoas ${nomePeriodo}. Acima de ~${D(freqLimite)} o anúncio repete pra mesma gente e o custo sobe.`, acao: `${acaoPorMetrica("alcance")} Se não der pra ampliar, reduza pra ~${B(R(arred((l.t.gastoDia * freqLimite) / l.t.frequencia * 0.8)) + "/dia")}.` });
  }

  // 6) Contra o período anterior.
  for (const l of ativas) {
    if (l.ant.gasto < minimoGasto) continue;
    for (const [nome, agora, antes, vol, un] of [
      ["Engajamento", l.t.custoEngajamento, l.tAnt.custoEngajamento, l.m.interacoes >= 50 && l.ant.interacoes >= 50, "por engajamento"],
      ["Alcance", l.t.custoMilAlcance, l.tAnt.custoMilAlcance, l.m.alcance >= 1000 && l.ant.alcance >= 1000, "por mil pessoas"],
    ] as const) {
      if (!vol || !agora || !antes) continue;
      const r = agora / antes;
      const contexto = `Gasto ${R(l.tAnt.gastoDia)} → ${R(l.t.gastoDia)}/dia · alcance ${I(l.ant.alcance)} → ${I(l.m.alcance)} · engajamentos ${I(l.ant.interacoes)} → ${I(l.m.interacoes)}.`;
      if (r >= 1.35)
        ins.push({ tom: "atencao", unidade: l.u.unidade, metrica: nome, titulo: `${nome} ficou mais caro que no período anterior`, detalhe: `${R(antes)} → ${B(R(agora))} ${un}${r >= 2 ? " (mais que o dobro)" : ""}. ${contexto}`, acao: (l.t.frequencia ?? 0) > (l.tAnt.frequencia ?? 0) * 1.2 ? "A frequência subiu junto: o público está **cansando** — amplie o raio." : "Sem sinal de saturação: os **posts turbinados renderam menos** — compare com os do período anterior." });
      else if (r <= 0.7)
        ins.push({ tom: "destaque", unidade: l.u.unidade, metrica: nome, titulo: `${nome} ficou mais barato que no período anterior`, detalhe: `${R(antes)} → ${B(R(agora))} ${un}. ${contexto}`, acao: "Vale **repetir o tipo de post** e manter o público." });
    }
  }

  // 7) Investimento muito baixo.
  const medGasto = mediana(ativas.map((l) => l.t.gastoDia));
  for (const l of linhas.filter((x) => x.m.gasto > 0 && x.m.gasto < minimoGasto))
    ins.push({ tom: "info", unidade: l.u.unidade, metrica: null, titulo: `Investimento muito baixo: ${R(l.m.gasto)} ${nomePeriodo}`, detalhe: `A mediana da rede é ${B(R(medGasto ?? 0) + "/dia")}. Com tão pouco a Meta mal sai do aprendizado — a unidade fica fora das comparações.` });

  const ordem: Record<TomInsight, number> = { atencao: 0, oportunidade: 1, destaque: 2, info: 3 };
  return ins.sort((a, b) => ordem[a.tom] - ordem[b.tom]);
}

/** O que fazer quando o custo de uma métrica está alto. */
function acaoPorMetrica(chave: MetricaAnalise["chave"]): string {
  switch (chave) {
    case "alcance":
    case "visualizacoes":
      return "No público salvo do boost, **aumente o raio em 2 a 5 km** ou inclua cidades vizinhas, tire interesses muito específicos e abra a faixa de idade.";
    case "engajamento":
      return "Turbine os **posts oficiais que mais engajaram** (tela da unidade → Melhores posts), evite post só informativo e poste no **horário de pico** (fim da tarde e noite).";
    case "visitas":
      return "Use **chamada pro perfil** no post (\"veja o cardápio no perfil\") e mantenha o perfil atualizado (destaques, bio com cardápio/iFood). Reels costumam levar mais gente ao perfil.";
    case "cliques":
      return "Confira **link e botão** (iFood/WhatsApp), use arte com a **oferta bem visível** e chamada direta (\"peça agora\").";
    case "video":
      return "Reels **mais curtos** e com o produto logo no começo seguram mais gente até o fim.";
  }
}
