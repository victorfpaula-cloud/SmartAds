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
  /** Tamanho do período (7 ou 15 dias, sempre terminando ontem) — comparado com o período anterior de mesmo tamanho. */
  dias?: number;
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
  custoCurtida: number | null;
  curtidasPorReal: number | null;
  custoInteracao: number | null;
  taxaEngajamento: number | null; // interações a cada 100 alcançados
  taxaCurtida: number | null; // curtidas a cada 100 alcançados
  frequencia: number | null;
  conversaPorMil: number | null; // comentários + salvamentos + compartilhamentos a cada mil alcançados
}

export function taxas(m: Metricas, dias = 7): Taxas {
  const d = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    gastoDia: m.gasto / dias,
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

const R = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const I = (n: number) => Math.round(n).toLocaleString("pt-BR");
const P = (n: number) => `${Math.round(n)}%`;
const D = (n: number, c = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
/** Arredonda orçamento sugerido pra um valor "redondo" de R$ 1 (ou R$ 5 acima de R$ 30). */
const arred = (n: number) => (n >= 30 ? Math.ceil(n / 5) * 5 : Math.ceil(n));

/** Por que uma unidade rende menos que outra: custo do alcance (público) ou resposta ao post (conteúdo). */
function diagnosticoDiferenca(pior: Taxas, melhor: Taxas, nomePior: string, nomeMelhor: string): string {
  const cpm = pior.custoMilAlcance && melhor.custoMilAlcance ? pior.custoMilAlcance / melhor.custoMilAlcance : 1;
  const resp = pior.taxaCurtida && melhor.taxaCurtida ? melhor.taxaCurtida / pior.taxaCurtida : 1;
  const publico = `${nomePior} paga ${R(pior.custoMilAlcance ?? 0)} pra alcançar mil pessoas, contra ${R(melhor.custoMilAlcance ?? 0)} em ${nomeMelhor}`;
  const post = `a cada 100 pessoas alcançadas, ${D(pior.taxaCurtida ?? 0)} curtem em ${nomePior} e ${D(melhor.taxaCurtida ?? 0)} em ${nomeMelhor}`;
  if (cpm >= 1.25 && resp < 1.25)
    return `O motivo principal é o custo do público: ${publico}, e o post engaja parecido (${post}). Ação: no público salvo do boost, aumente o raio em 2 a 5 km ou inclua cidades vizinhas, tire interesses muito específicos e abra a faixa de idade — público maior costuma baratear o alcance.`;
  if (resp >= 1.25 && cpm < 1.25)
    return `O alcance custa parecido, mas o post converte menos em curtida: ${post}. Ação: turbine os posts oficiais que mais renderam na rede (veja "Melhores posts" na tela da unidade), dê preferência a foto e carrossel quando o objetivo for curtida, e confira se a unidade está postando no horário de pico (fim da tarde e noite).`;
  if (cpm >= 1.25 && resp >= 1.25)
    return `Os dois pesam: ${publico}, e ${post}. Comece pelo público (raio maior, menos filtros) e, na sequência, priorize os posts que mais engajaram.`;
  return `Custo do alcance e resposta ao post são parecidos (${publico}; ${post}); a diferença vem do volume entregue — vale olhar se as campanhas ficaram pausadas ou sem saldo em algum dia.`;
}

export function gerarInsights(analise: AnaliseTrafego, escopo: Escopo): Insight[] {
  const ins: Insight[] = [];
  const dias = analise.dias ?? 7;
  const nomePeriodo = dias === 7 ? "na semana" : `nos ${dias} dias`;
  const minimo = GASTO_MINIMO_SEMANA * (dias / 7);
  const freqLimite = dias <= 7 ? 2.5 : 3.5;
  const linhas = analise.unidades
    .filter((u) => !u.erro)
    .map((u) => ({ u, m: u.atual[escopo], t: taxas(u.atual[escopo], dias), ant: u.anterior[escopo], tAnt: taxas(u.anterior[escopo], dias) }));
  const ativas = linhas.filter((l) => l.m.gasto >= minimo);

  if (escopo === "boost") {
    for (const l of linhas.filter((x) => x.u.boostLigado && x.m.gasto < 1)) {
      ins.push({ tom: "atencao", unidade: l.u.unidade, titulo: `Boost ligado, mas não gastou ${nomePeriodo}`, detalhe: "Nenhuma campanha de boost entregou. As causas mais comuns: a unidade não publicou post oficial da rede no período (o boost da franquia só turbina esses), a conta está sem saldo, ou a Meta recusou o post (veja o último erro na tela da unidade)." });
    }
  }
  for (const l of ativas.filter((x) => x.m.interacoes === 0 && x.m.alcance === 0)) {
    ins.push({ tom: "atencao", unidade: l.u.unidade, titulo: `Investiu ${R(l.m.gasto)} sem resultado medido`, detalhe: "A Meta não registrou alcance nem interações. Pode ser anúncio reprovado, entrega travada ou atraso no relatório da Meta — confira as campanhas no Gerenciador." });
  }
  if (ativas.length < 2) {
    if (ativas.length === 1) ins.push({ tom: "info", unidade: null, titulo: "Só uma unidade investiu o suficiente pra comparar", detalhe: `É preciso pelo menos duas unidades com ${R(minimo)} ou mais ${nomePeriodo}.` });
    return ins;
  }

  const med = {
    custoCurtida: mediana(ativas.map((l) => l.t.custoCurtida)),
    custoMil: mediana(ativas.map((l) => l.t.custoMilAlcance)),
    taxaEng: mediana(ativas.map((l) => l.t.taxaEngajamento)),
    taxaCurtida: mediana(ativas.map((l) => l.t.taxaCurtida)),
    conversa: mediana(ativas.map((l) => l.t.conversaPorMil)),
  };

  // 1) Destaques da rede.
  const melhorPor = (f: (l: (typeof ativas)[number]) => number | null, menorMelhor: boolean) =>
    [...ativas].filter((l) => f(l) !== null).sort((a, b) => (menorMelhor ? f(a)! - f(b)! : f(b)! - f(a)!))[0];
  const lider = melhorPor((l) => l.t.custoCurtida, true);
  if (lider && med.custoCurtida && lider.t.custoCurtida) {
    const vantagem = (1 - lider.t.custoCurtida / med.custoCurtida) * 100;
    if (vantagem >= 10)
      ins.push({
        tom: "destaque",
        unidade: lider.u.unidade,
        titulo: `Curtida mais barata da rede: ${R(lider.t.custoCurtida)}`,
        detalhe: `${P(vantagem)} abaixo da mediana da rede (${R(med.custoCurtida)}). Com ${R(lider.t.gastoDia)}/dia gerou ${I(lider.m.curtidas)} curtidas ${nomePeriodo}, alcançando ${I(lider.m.alcance)} pessoas (${R(lider.t.custoMilAlcance ?? 0)} por mil). Use o público salvo e os posts turbinados dessa unidade como referência pras outras.`,
      });
  }
  const eng = melhorPor((l) => l.t.taxaEngajamento, false);
  if (eng && med.taxaEng && eng.t.taxaEngajamento && eng.t.taxaEngajamento > med.taxaEng * 1.2)
    ins.push({ tom: "destaque", unidade: eng.u.unidade, titulo: `Maior engajamento: ${D(eng.t.taxaEngajamento)} interações a cada 100 alcançados`, detalhe: `A mediana da rede é ${D(med.taxaEng)}. O público dessa unidade responde mais aos posts turbinados — bom candidato a receber mais orçamento, porque cada real rende mais aqui.` });
  const conv = melhorPor((l) => l.t.conversaPorMil, false);
  if (conv && med.conversa && conv.t.conversaPorMil && conv.t.conversaPorMil > med.conversa * 1.5 && conv.m.comentarios + conv.m.salvamentos + conv.m.compartilhamentos >= 5)
    ins.push({ tom: "destaque", unidade: conv.u.unidade, titulo: "Quem mais gera conversa (comentários, salvamentos e compartilhamentos)", detalhe: `${D(conv.t.conversaPorMil)} a cada mil alcançados (mediana ${D(med.conversa)}): ${I(conv.m.comentarios)} comentários, ${I(conv.m.salvamentos)} salvamentos e ${I(conv.m.compartilhamentos)} compartilhamentos. Esses sinais pesam mais pro algoritmo do Instagram que a curtida e ajudam o orgânico da unidade.` });

  // 2) Pares com investimento parecido e resultado bem diferente — com o motivo.
  const ordenadas = [...ativas].sort((a, b) => a.t.gastoDia - b.t.gastoDia);
  const jaComparadas = new Set<string>();
  for (let i = 0; i < ordenadas.length; i++) {
    for (let j = i + 1; j < ordenadas.length; j++) {
      const a = ordenadas[i];
      const b = ordenadas[j];
      if (b.t.gastoDia > a.t.gastoDia * 1.3) break;
      if (!a.m.curtidas || !b.m.curtidas) continue;
      const [melhor, pior] = a.m.curtidas / a.m.gasto >= b.m.curtidas / b.m.gasto ? [a, b] : [b, a];
      const dif = ((melhor.m.curtidas / melhor.m.gasto) / (pior.m.curtidas / pior.m.gasto) - 1) * 100;
      if (dif < 30 || jaComparadas.has(pior.u.contaId)) continue;
      jaComparadas.add(pior.u.contaId);
      ins.push({
        tom: "oportunidade",
        unidade: pior.u.unidade,
        titulo: `Investe parecido com ${melhor.u.unidade}, mas tem ${P(dif)} menos curtidas por real`,
        detalhe: `${pior.u.unidade}: ${R(pior.t.gastoDia)}/dia → ${I(pior.m.curtidas)} curtidas (${R(pior.t.custoCurtida ?? 0)} cada). ${melhor.u.unidade}: ${R(melhor.t.gastoDia)}/dia → ${I(melhor.m.curtidas)} curtidas (${R(melhor.t.custoCurtida ?? 0)} cada). ${diagnosticoDiferenca(pior.t, melhor.t, pior.u.unidade, melhor.u.unidade)}`,
      });
    }
  }

  // 3) Orçamento pra chegar perto do líder em curtidas, com plano de aumento gradual.
  const topCurtidas = [...ativas].sort((a, b) => b.m.curtidas - a.m.curtidas)[0];
  for (const l of ativas) {
    if (l === topCurtidas || !l.t.curtidasPorReal || !topCurtidas.m.curtidas) continue;
    if (l.m.curtidas >= topCurtidas.m.curtidas * 0.8) continue;
    const necessarioDia = topCurtidas.m.curtidas / dias / l.t.curtidasPorReal;
    const caro = med.custoCurtida && l.t.custoCurtida && l.t.custoCurtida > med.custoCurtida * 1.5;
    const passos: number[] = [];
    let atual = l.t.gastoDia;
    while (atual < necessarioDia && passos.length < 4) {
      atual = Math.min(necessarioDia, atual * 1.25);
      passos.push(arred(atual));
    }
    const plano = passos.length ? `Plano sugerido (aumento de ~25% por semana pra a Meta não reiniciar o aprendizado): ${passos.map((v, k) => `semana ${k + 1}: ${R(v)}/dia`).join(" → ")}${atual < necessarioDia ? " → e assim por diante" : ""}.` : "";
    const ganho = (arred(Math.min(necessarioDia, l.t.gastoDia * 1.25)) - l.t.gastoDia) * dias * l.t.curtidasPorReal;
    ins.push({
      tom: caro ? "atencao" : "oportunidade",
      unidade: l.u.unidade,
      titulo: caro
        ? `Pra igualar ${topCurtidas.u.unidade} seriam ~${R(arred(necessarioDia))}/dia — antes, baixe o custo por curtida`
        : `Pra chegar perto de ${topCurtidas.u.unidade} em curtidas: ~${R(arred(necessarioDia))}/dia`,
      detalhe: caro
        ? `Hoje: ${R(l.t.gastoDia)}/dia e ${I(l.m.curtidas)} curtidas ${nomePeriodo}, a ${R(l.t.custoCurtida ?? 0)} cada — ${P(((l.t.custoCurtida ?? 0) / (med.custoCurtida ?? 1) - 1) * 100)} acima da mediana (${R(med.custoCurtida ?? 0)}). ${topCurtidas.u.unidade} fez ${I(topCurtidas.m.curtidas)}. Aumentar verba com o custo assim só multiplica o desperdício: primeiro ajuste o público (raio maior, menos filtros) e os posts turbinados; quando a curtida chegar perto de ${R(med.custoCurtida ?? 0)}, o orçamento necessário cai pra ~${R(arred(topCurtidas.m.curtidas / dias * (med.custoCurtida ?? 0)))}/dia.`
        : `Hoje: ${R(l.t.gastoDia)}/dia e ${I(l.m.curtidas)} curtidas ${nomePeriodo} (${R(l.t.custoCurtida ?? 0)} cada); ${topCurtidas.u.unidade} fez ${I(topCurtidas.m.curtidas)}. Mantido o custo atual, chegar lá exige ~${R(arred(necessarioDia))}/dia. ${plano} Só o primeiro passo já deve render ~${I(Math.max(0, ganho))} curtidas a mais ${nomePeriodo}. Confira se o teto de gasto do mês da unidade comporta o aumento.`,
    });
  }

  // 4) Saturação, alcance caro, engajamento baixo, curtida baixa.
  for (const l of ativas) {
    if (l.t.frequencia !== null && l.t.frequencia >= freqLimite)
      ins.push({ tom: "atencao", unidade: l.u.unidade, titulo: `Público saturado: cada pessoa viu o anúncio ${D(l.t.frequencia)} vezes ${nomePeriodo}`, detalhe: `Foram ${I(l.m.impressoes)} exibições pra ${I(l.m.alcance)} pessoas. Acima de ~${D(freqLimite)} a Meta começa a repetir o anúncio pra mesma gente: o custo sobe e o engajamento cai. Ação: aumente o raio do público salvo (2 a 5 km) ou inclua cidades vizinhas; se não der pra ampliar, reduza o orçamento diário pra ~${R(arred((l.t.gastoDia * freqLimite) / l.t.frequencia * 0.8))} — o mesmo público com menos repetição.` });
    if (med.custoMil && l.t.custoMilAlcance && l.t.custoMilAlcance > med.custoMil * 1.5)
      ins.push({ tom: "atencao", unidade: l.u.unidade, titulo: `Alcance caro: ${R(l.t.custoMilAlcance)} a cada mil pessoas`, detalhe: `${P((l.t.custoMilAlcance / med.custoMil - 1) * 100)} acima da mediana da rede (${R(med.custoMil)}). Com o custo da mediana, o mesmo investimento alcançaria ~${I((l.m.gasto / med.custoMil) * 1000)} pessoas em vez de ${I(l.m.alcance)}. Geralmente é público pequeno (raio curto, muitos interesses) ou muito disputado na região. Teste um público salvo mais aberto por uma semana e compare aqui.` });
    if (med.taxaEng && l.t.taxaEngajamento !== null && l.t.taxaEngajamento < med.taxaEng * 0.6 && (l.t.custoMilAlcance ?? 0) <= (med.custoMil ?? Infinity))
      ins.push({ tom: "oportunidade", unidade: l.u.unidade, titulo: "Alcança barato, mas engaja pouco", detalhe: `${D(l.t.taxaEngajamento)} interações a cada 100 alcançados (mediana ${D(med.taxaEng)}), com alcance a ${R(l.t.custoMilAlcance ?? 0)} por mil. O público está sendo atingido, mas o post não prende. Ação: turbine os posts oficiais com mais curtidas e comentários orgânicos (tela da unidade → Melhores posts) e evite turbinar post só informativo.` });
    if (med.taxaCurtida && l.t.taxaCurtida !== null && l.m.interacoes > 0 && l.t.taxaCurtida < med.taxaCurtida * 0.5 && (l.t.taxaEngajamento ?? 0) >= (med.taxaEng ?? 0))
      ins.push({ tom: "info", unidade: l.u.unidade, titulo: "Muita interação, pouca curtida", detalhe: `${I(l.m.interacoes)} interações mas só ${I(l.m.curtidas)} curtidas: a maior parte é visualização de vídeo e clique, típico de Reels. Se o objetivo é curtida no feed, turbine mais foto e carrossel; se é alcance e marca, o Reels está cumprindo o papel.` });
  }

  // 5) Período contra período anterior.
  for (const l of ativas) {
    if (l.ant.gasto < minimo || !l.t.custoCurtida || !l.tAnt.custoCurtida) continue;
    const v = (l.t.custoCurtida / l.tAnt.custoCurtida - 1) * 100;
    const contexto = `Gasto ${R(l.tAnt.gastoDia)}/dia → ${R(l.t.gastoDia)}/dia; alcance ${I(l.ant.alcance)} → ${I(l.m.alcance)}; curtidas ${I(l.ant.curtidas)} → ${I(l.m.curtidas)}.`;
    if (v >= 35)
      ins.push({ tom: "atencao", unidade: l.u.unidade, titulo: `Curtida ficou ${P(v)} mais cara que no período anterior`, detalhe: `${R(l.tAnt.custoCurtida)} → ${R(l.t.custoCurtida)}. ${contexto} ${(l.t.frequencia ?? 0) > (l.tAnt.frequencia ?? 0) * 1.2 ? "A frequência subiu junto: o público está cansando — amplie o raio." : "Sem sinal de saturação: provavelmente os posts turbinados renderam menos — compare com os que funcionaram no período anterior."}` });
    else if (v <= -25)
      ins.push({ tom: "destaque", unidade: l.u.unidade, titulo: `Curtida ficou ${P(-v)} mais barata que no período anterior`, detalhe: `${R(l.tAnt.custoCurtida)} → ${R(l.t.custoCurtida)}. ${contexto} Algo funcionou melhor — vale repetir o tipo de post e manter o público.` });
  }

  // 6) Investimento muito baixo.
  const medGasto = mediana(ativas.map((l) => l.t.gastoDia));
  for (const l of linhas.filter((x) => x.m.gasto > 0 && x.m.gasto < minimo))
    ins.push({ tom: "info", unidade: l.u.unidade, titulo: `Investimento muito baixo: ${R(l.m.gasto)} ${nomePeriodo}`, detalhe: `A mediana da rede é ${R(medGasto ?? 0)}/dia. Com tão pouco a Meta mal sai da fase de aprendizado e o resultado fica instável; o mínimo que costuma funcionar é ~R$ 5 a 10/dia por campanha.` });

  const ordem: Record<TomInsight, number> = { atencao: 0, oportunidade: 1, destaque: 2, info: 3 };
  return ins.sort((a, b) => ordem[a.tom] - ordem[b.tom]);
}
