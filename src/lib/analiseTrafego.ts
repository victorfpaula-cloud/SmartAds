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
  titulo: string;
  detalhe: string;
}

export interface AnaliseTrafego {
  calculadoEm: string;
  periodo: { desde: string; ate: string };
  unidades: UnidadeAnalise[];
}

const zero = (): Metricas => ({ gasto: 0, alcance: 0, impressoes: 0, interacoes: 0, curtidas: 0, comentarios: 0, salvamentos: 0, compartilhamentos: 0, campanhas: 0 });
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
      if (num(l.spend) > 0) m.campanhas++;
    }
  }
  return r;
}

/** Busca as duas semanas (atual e anterior) de todas as unidades da franquia e guarda. */
export async function calcularAnaliseTrafego(empresaId: string, limiteMs = 45_000): Promise<AnaliseTrafego> {
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
  const desde = adicionarDias(ate, -6);
  const antAte = adicionarDias(desde, -1);
  const antDesde = adicionarDias(antAte, -6);

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
        const [a, b] = await comContaMeta(c.contaId, () =>
          Promise.all([
            obterInsightsRelatorio(c.adAccountId as string, { nivel: "campaign", desde, ate }),
            obterInsightsRelatorio(c.adAccountId as string, { nivel: "campaign", desde: antDesde, ate: antAte }),
          ])
        );
        return { ...base, erro: null, atual: somarLinhas(a), anterior: somarLinhas(b) };
      } catch (e) {
        return { ...base, erro: (e instanceof Error ? e.message : "Falha na Meta.").slice(0, 200), atual: { boost: zero(), tudo: zero() }, anterior: { boost: zero(), tudo: zero() } };
      }
    },
    6
  );

  const analise: AnaliseTrafego = { calculadoEm: new Date().toISOString(), periodo: { desde, ate }, unidades };
  await criarClienteAdmin()
    .from("smartads_analise_trafego")
    .upsert({ empresa_id: empresaId, dados: analise, calculado_em: analise.calculadoEm });
  return analise;
}

/** Conta central da franquia (não é uma unidade): "Dona Baunilha - Principal", "... - Expansão". */
export const ehContaCentralDaRede = (nome: string) => /\b(principal|expans[aã]o|oficial)\b/i.test(nome);

export async function lerAnaliseTrafego(empresaId: string): Promise<AnaliseTrafego | null> {
  const { data } = await criarClienteAdmin().from("smartads_analise_trafego").select("dados").eq("empresa_id", empresaId).maybeSingle();
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
  custoCurtida: number | null;
  curtidasPorReal: number | null;
  custoInteracao: number | null;
  taxaEngajamento: number | null; // interações a cada 100 alcançados
  taxaCurtida: number | null; // curtidas a cada 100 alcançados
  frequencia: number | null;
  conversaPorMil: number | null; // comentários + salvamentos + compartilhamentos a cada mil alcançados
}

export function taxas(m: Metricas): Taxas {
  const d = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    gastoDia: m.gasto / 7,
    custoMilAlcance: m.alcance > 0 ? (m.gasto / m.alcance) * 1000 : null,
    custoCurtida: m.curtidas > 0 ? m.gasto / m.curtidas : null,
    curtidasPorReal: d(m.curtidas, m.gasto),
    custoInteracao: m.interacoes > 0 ? m.gasto / m.interacoes : null,
    taxaEngajamento: m.alcance > 0 ? (m.interacoes / m.alcance) * 100 : null,
    taxaCurtida: m.alcance > 0 ? (m.curtidas / m.alcance) * 100 : null,
    frequencia: d(m.impressoes, m.alcance),
    conversaPorMil: m.alcance > 0 ? ((m.comentarios + m.salvamentos + m.compartilhamentos) / m.alcance) * 1000 : null,
  };
}

export function mediana(valores: Array<number | null>): number | null {
  const v = valores.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

const R = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: n < 1 ? 2 : 2, maximumFractionDigits: 2 });
const I = (n: number) => Math.round(n).toLocaleString("pt-BR");
const P = (n: number) => `${Math.round(n)}%`;
const D = (n: number, c = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });

export function gerarInsights(analise: AnaliseTrafego, escopo: Escopo): Insight[] {
  const ins: Insight[] = [];
  const nome = escopo === "boost" ? "boost" : "tráfego";
  const linhas = analise.unidades
    .filter((u) => !u.erro)
    .map((u) => ({ u, m: u.atual[escopo], t: taxas(u.atual[escopo]), ant: u.anterior[escopo], tAnt: taxas(u.anterior[escopo]) }));
  const ativas = linhas.filter((l) => l.m.gasto >= GASTO_MINIMO_SEMANA);

  // Unidades com boost ligado que não gastaram nada (boost não rodou na semana).
  if (escopo === "boost") {
    for (const l of linhas.filter((x) => x.u.boostLigado && x.m.gasto < 1)) {
      ins.push({ tom: "atencao", unidade: l.u.unidade, titulo: "Boost ligado, mas não gastou na semana", detalhe: "Nenhuma campanha de boost entregou. Confira se a unidade publicou posts oficiais da rede, se há saldo e o log do boost." });
    }
  }
  const semResultado = ativas.filter((l) => l.m.interacoes === 0 && l.m.alcance === 0);
  for (const l of semResultado) {
    ins.push({ tom: "atencao", unidade: l.u.unidade, titulo: `Investiu ${R(l.m.gasto)} sem resultado medido`, detalhe: "A Meta não registrou alcance nem interações nas campanhas. Pode ser anúncio reprovado ou entrega travada — confira no Gerenciador." });
  }
  if (ativas.length < 2) {
    if (ativas.length === 1) ins.push({ tom: "info", unidade: null, titulo: "Só uma unidade investiu o suficiente pra comparar", detalhe: `É preciso pelo menos duas unidades com ${R(GASTO_MINIMO_SEMANA)}+ na semana em ${nome}.` });
    return ins;
  }

  const med = {
    custoCurtida: mediana(ativas.map((l) => l.t.custoCurtida)),
    custoMil: mediana(ativas.map((l) => l.t.custoMilAlcance)),
    taxaEng: mediana(ativas.map((l) => l.t.taxaEngajamento)),
    taxaCurtida: mediana(ativas.map((l) => l.t.taxaCurtida)),
    conversa: mediana(ativas.map((l) => l.t.conversaPorMil)),
  };

  // 1) Destaques: melhor custo por curtida, maior taxa de engajamento, mais conversa.
  const melhorPor = (f: (l: (typeof ativas)[number]) => number | null, menorMelhor: boolean) =>
    [...ativas].filter((l) => f(l) !== null).sort((a, b) => (menorMelhor ? f(a)! - f(b)! : f(b)! - f(a)!))[0];
  const lider = melhorPor((l) => l.t.custoCurtida, true);
  if (lider && med.custoCurtida && lider.t.custoCurtida) {
    const vantagem = (1 - lider.t.custoCurtida / med.custoCurtida) * 100;
    if (vantagem >= 10)
      ins.push({ tom: "destaque", unidade: lider.u.unidade, titulo: `Curtida mais barata da rede: ${R(lider.t.custoCurtida)}`, detalhe: `${P(vantagem)} abaixo da média da rede (${R(med.custoCurtida)} por curtida). O que essa unidade está turbinando é o modelo a copiar.` });
  }
  const eng = melhorPor((l) => l.t.taxaEngajamento, false);
  if (eng && med.taxaEng && eng.t.taxaEngajamento && eng.t.taxaEngajamento > med.taxaEng * 1.2)
    ins.push({ tom: "destaque", unidade: eng.u.unidade, titulo: `Maior taxa de engajamento: ${D(eng.t.taxaEngajamento)} a cada 100 alcançados`, detalhe: `A média da rede é ${D(med.taxaEng)}. O público dessa unidade responde mais aos posts.` });
  const conv = melhorPor((l) => l.t.conversaPorMil, false);
  if (conv && med.conversa && conv.t.conversaPorMil && conv.t.conversaPorMil > med.conversa * 1.5 && conv.m.comentarios + conv.m.salvamentos + conv.m.compartilhamentos >= 5)
    ins.push({ tom: "destaque", unidade: conv.u.unidade, titulo: "Mais comentários, salvamentos e compartilhamentos", detalhe: `${D(conv.t.conversaPorMil)} a cada mil alcançados (média ${D(med.conversa)}): ${I(conv.m.comentarios)} comentários, ${I(conv.m.salvamentos)} salvamentos, ${I(conv.m.compartilhamentos)} compartilhamentos.` });

  // 2) Pares com investimento parecido e resultado bem diferente.
  const ordenadas = [...ativas].sort((a, b) => a.t.gastoDia - b.t.gastoDia);
  const pares: string[] = [];
  for (let i = 0; i < ordenadas.length; i++) {
    for (let j = i + 1; j < ordenadas.length; j++) {
      const a = ordenadas[i];
      const b = ordenadas[j];
      if (b.t.gastoDia > a.t.gastoDia * 1.3) break;
      if (!a.m.curtidas || !b.m.curtidas) continue;
      const [melhor, pior] = a.m.curtidas / a.m.gasto >= b.m.curtidas / b.m.gasto ? [a, b] : [b, a];
      const dif = ((melhor.m.curtidas / melhor.m.gasto) / (pior.m.curtidas / pior.m.gasto) - 1) * 100;
      if (dif < 30 || pares.includes(pior.u.contaId)) continue;
      pares.push(pior.u.contaId);
      ins.push({
        tom: "oportunidade",
        unidade: pior.u.unidade,
        titulo: `Investe parecido com ${melhor.u.unidade}, mas tem ${P(dif)} menos curtidas por real`,
        detalhe: `${pior.u.unidade}: ${R(pior.t.gastoDia)}/dia → ${I(pior.m.curtidas)} curtidas (${R(pior.t.custoCurtida ?? 0)} cada). ${melhor.u.unidade}: ${R(melhor.t.gastoDia)}/dia → ${I(melhor.m.curtidas)} curtidas (${R(melhor.t.custoCurtida ?? 0)} cada). A diferença costuma estar no público (raio/interesses) e no tipo de post turbinado.`,
      });
    }
  }

  // 3) Orçamento pra alcançar o líder em curtidas na semana.
  const topCurtidas = [...ativas].sort((a, b) => b.m.curtidas - a.m.curtidas)[0];
  for (const l of ativas) {
    if (l === topCurtidas || !l.t.curtidasPorReal || !topCurtidas.m.curtidas) continue;
    if (l.m.curtidas >= topCurtidas.m.curtidas * 0.8) continue;
    const necessarioDia = topCurtidas.m.curtidas / 7 / l.t.curtidasPorReal;
    const caro = med.custoCurtida && l.t.custoCurtida && l.t.custoCurtida > med.custoCurtida * 1.5;
    ins.push({
      tom: caro ? "atencao" : "oportunidade",
      unidade: l.u.unidade,
      titulo: caro
        ? `Pra igualar ${topCurtidas.u.unidade}, seriam ~${R(necessarioDia)}/dia — antes, baixe o custo por curtida`
        : `Pra chegar perto de ${topCurtidas.u.unidade} em curtidas: ~${R(necessarioDia)}/dia`,
      detalhe: `Hoje investe ${R(l.t.gastoDia)}/dia e teve ${I(l.m.curtidas)} curtidas na semana; ${topCurtidas.u.unidade} teve ${I(topCurtidas.m.curtidas)}. No custo atual (${R(l.t.custoCurtida ?? 0)} por curtida), isso exigiria ~${R(necessarioDia)}/dia${caro ? `. Como a curtida dessa unidade custa bem mais que a média (${R(med.custoCurtida ?? 0)}), aumentar o orçamento agora sai caro: revise o público e o tipo de post primeiro` : ". Aumente aos poucos (20–30% por semana) pra a Meta não reiniciar o aprendizado"}.`,
    });
  }

  // 4) Saturação, custo alto de alcance e engajamento baixo.
  for (const l of ativas) {
    if (l.t.frequencia !== null && l.t.frequencia >= 2.5)
      ins.push({ tom: "atencao", unidade: l.u.unidade, titulo: `Público saturado: cada pessoa viu ${D(l.t.frequencia)} vezes`, detalhe: "Acima de ~2,5 na semana o custo sobe e o engajamento cai. Amplie o raio ou os interesses do público do boost, ou reduza o orçamento diário." });
    if (med.custoMil && l.t.custoMilAlcance && l.t.custoMilAlcance > med.custoMil * 1.5)
      ins.push({ tom: "atencao", unidade: l.u.unidade, titulo: `Alcance caro: ${R(l.t.custoMilAlcance)} a cada mil pessoas`, detalhe: `${P((l.t.custoMilAlcance / med.custoMil - 1) * 100)} acima da média da rede (${R(med.custoMil)}). Público pequeno ou muito disputado — vale testar um raio maior ou menos filtros.` });
    if (med.taxaEng && l.t.taxaEngajamento !== null && l.t.taxaEngajamento < med.taxaEng * 0.6 && (l.t.custoMilAlcance ?? 0) <= (med.custoMil ?? Infinity))
      ins.push({ tom: "oportunidade", unidade: l.u.unidade, titulo: "Alcança bem, mas engaja pouco", detalhe: `${D(l.t.taxaEngajamento)} interações a cada 100 alcançados (média ${D(med.taxaEng)}). O público está sendo atingido barato, mas o post não prende: priorize os posts oficiais que mais engajaram na rede.` });
    if (med.taxaCurtida && l.t.taxaCurtida !== null && l.m.interacoes > 0 && l.t.taxaCurtida < med.taxaCurtida * 0.5 && (l.t.taxaEngajamento ?? 0) >= (med.taxaEng ?? 0))
      ins.push({ tom: "info", unidade: l.u.unidade, titulo: "Muita interação, pouca curtida", detalhe: "As interações vêm mais de visualizações e cliques que de curtidas — comum em Reels. Se o objetivo é curtida no feed, foto e carrossel costumam render mais." });
  }

  // 5) Semana contra semana.
  for (const l of ativas) {
    if (l.ant.gasto < GASTO_MINIMO_SEMANA || !l.t.custoCurtida || !l.tAnt.custoCurtida) continue;
    const var_ = (l.t.custoCurtida / l.tAnt.custoCurtida - 1) * 100;
    if (var_ >= 35)
      ins.push({ tom: "atencao", unidade: l.u.unidade, titulo: `Curtida ficou ${P(var_)} mais cara que na semana anterior`, detalhe: `${R(l.tAnt.custoCurtida)} → ${R(l.t.custoCurtida)}. Se o público e o orçamento não mudaram, o post turbinado rendeu menos.` });
    else if (var_ <= -25)
      ins.push({ tom: "destaque", unidade: l.u.unidade, titulo: `Curtida ficou ${P(-var_)} mais barata que na semana anterior`, detalhe: `${R(l.tAnt.custoCurtida)} → ${R(l.t.custoCurtida)}. Algo funcionou melhor — vale repetir o tipo de post.` });
  }

  // 6) Quem quase não investiu enquanto a rede investe.
  const medGasto = mediana(ativas.map((l) => l.t.gastoDia));
  for (const l of linhas.filter((x) => x.m.gasto > 0 && x.m.gasto < GASTO_MINIMO_SEMANA))
    ins.push({ tom: "info", unidade: l.u.unidade, titulo: `Investimento muito baixo: ${R(l.m.gasto)} na semana`, detalhe: `A mediana da rede é ${R(medGasto ?? 0)}/dia. Com tão pouco a Meta mal sai da fase de aprendizado.` });

  const ordem: Record<TomInsight, number> = { atencao: 0, oportunidade: 1, destaque: 2, info: 3 };
  return ins.sort((a, b) => ordem[a.tom] - ordem[b.tom]);
}
