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
  detalhe: string;
}

export interface AnaliseTrafego {
  calculadoEm: string;
  /** Tamanho do período (7 ou 15 dias, sempre terminando ontem) — comparado com o período anterior de mesmo tamanho. */
  dias?: number;
  periodo: { desde: string; ate: string };
  unidades: UnidadeAnalise[];
}

const zero = (): Metricas => ({ gasto: 0, alcance: 0, impressoes: 0, interacoes: 0, curtidas: 0, comentarios: 0, salvamentos: 0, compartilhamentos: 0, visitasPerfil: 0, cliques: 0, campanhas: 0 });
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
  custoEngajamento: number | null;
  custoVisita: number | null;
  custoClique: number | null;
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
const arred = (n: number) => (n >= 30 ? Math.ceil(n / 5) * 5 : Math.ceil(n));

/** As quatro métricas da análise: o custo de cada resultado, comparado com a mediana da rede. */
export interface MetricaAnalise {
  chave: "alcance" | "engajamento" | "visitas" | "cliques";
  nome: string;
  /** Como se lê o custo ("por mil pessoas alcançadas", "por engajamento"...). */
  unidadeCusto: string;
  volume: (m: Metricas) => number;
  custo: (t: Taxas) => number | null;
  /** Volume mínimo no período pra a unidade entrar na comparação dessa métrica. */
  minimo: number;
  rotuloVolume: string;
}

export const METRICAS: MetricaAnalise[] = [
  { chave: "alcance", nome: "Alcance", unidadeCusto: "por mil pessoas alcançadas", volume: (m) => m.alcance, custo: (t) => t.custoMilAlcance, minimo: 1000, rotuloVolume: "pessoas alcançadas" },
  { chave: "engajamento", nome: "Engajamento", unidadeCusto: "por engajamento", volume: (m) => m.interacoes, custo: (t) => t.custoEngajamento, minimo: 50, rotuloVolume: "engajamentos" },
  { chave: "visitas", nome: "Visitas ao perfil", unidadeCusto: "por visita ao perfil", volume: (m) => m.visitasPerfil ?? 0, custo: (t) => t.custoVisita, minimo: 10, rotuloVolume: "visitas ao perfil" },
  { chave: "cliques", nome: "Cliques no link", unidadeCusto: "por clique no link", volume: (m) => m.cliques ?? 0, custo: (t) => t.custoClique, minimo: 10, rotuloVolume: "cliques no link" },
];

/** A régua: posição de um custo em relação à mediana, em faixas — nunca um percentual exagerado.
 * "na média" (±15%) não vira dica. */
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

/** "1,4x mais", "mais que o dobro" — comparação entre duas unidades sem percentuais gigantes. */
const vezes = (r: number) => (r >= 2 ? "mais que o dobro de" : `${D(r)}x`);

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

  if (escopo === "boost") {
    for (const l of linhas.filter((x) => x.u.boostLigado && x.m.gasto < 1)) {
      ins.push({ tom: "atencao", unidade: l.u.unidade, metrica: null, titulo: `Boost ligado, mas não gastou ${nomePeriodo}`, detalhe: "Nenhuma campanha de boost entregou. Causas mais comuns: a unidade não publicou post oficial da rede no período (o boost da franquia só turbina esses), a conta está sem saldo, ou a Meta recusou o post (veja o último erro na tela da unidade)." });
    }
  }
  for (const l of ativas.filter((x) => x.m.interacoes === 0 && x.m.alcance === 0)) {
    ins.push({ tom: "atencao", unidade: l.u.unidade, metrica: null, titulo: `Investiu ${R(l.m.gasto)} sem resultado medido`, detalhe: "A Meta não registrou alcance nem engajamento. Pode ser anúncio reprovado, entrega travada ou atraso no relatório da Meta — confira as campanhas no Gerenciador." });
  }

  // 1) Cada métrica separada: custo do resultado na régua da mediana da rede.
  const medianas = new Map<string, number | null>();
  for (const met of METRICAS) {
    const comVolume = ativas.filter((l) => met.volume(l.m) >= met.minimo && met.custo(l.t) !== null);
    const med = comVolume.length >= 3 ? mediana(comVolume.map((l) => met.custo(l.t))) : null;
    medianas.set(met.chave, med);
    if (!med) continue;
    for (const l of comVolume) {
      const c = met.custo(l.t)!;
      const r = regua(c, med);
      const pouco = met.volume(l.m) < met.minimo * 2 ? ` Volume ainda pequeno (${I(met.volume(l.m))} ${met.rotuloVolume}) — confirme no próximo período.` : "";
      const base = `${R(c)} ${met.unidadeCusto} (${r.texto}, que é ${R(med)}). Resultado: ${I(met.volume(l.m))} ${met.rotuloVolume} com ${R(l.m.gasto)} investidos.`;
      if (r.faixa === "bem_melhor")
        ins.push({ tom: "destaque", unidade: l.u.unidade, metrica: met.nome, titulo: `${met.nome}: bem mais barato que a média da rede`, detalhe: `${base} O público e os posts dessa unidade são referência pra ${met.nome.toLowerCase()}.${pouco}` });
      else if (r.faixa === "bem_pior")
        ins.push({ tom: "oportunidade", unidade: l.u.unidade, metrica: met.nome, titulo: `${met.nome}: custo bem acima da média da rede`, detalhe: `${base} ${acaoPorMetrica(met.chave)}${pouco}` });
      else if (r.faixa === "pior" && met.chave !== "alcance")
        ins.push({ tom: "info", unidade: l.u.unidade, metrica: met.nome, titulo: `${met.nome}: um pouco acima da média`, detalhe: `${base} Nada grave — acompanhe no próximo período.${pouco}` });
    }
  }
  if (ativas.length < 3) {
    ins.push({ tom: "info", unidade: null, metrica: null, titulo: "Poucas unidades pra comparar", detalhe: `As comparações precisam de pelo menos 3 unidades com ${R(minimoGasto)} ou mais investidos ${nomePeriodo}. Hoje são ${ativas.length}.` });
  }

  // 2) Unidades que investem parecido: quem rende mais alcance e engajamento por real, e por quê.
  const medEng = medianas.get("engajamento") ?? null;
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
      const respostaMelhor = melhor.t.taxaEngajamento ?? 0;
      const respostaPior = pior.t.taxaEngajamento ?? 0;
      const motivo =
        razaoAlc >= 1.25 && respostaMelhor < respostaPior * 1.25
          ? `O motivo é o custo do público: ${pior.u.unidade} paga ${R(pior.t.custoMilAlcance ?? 0)} pra alcançar mil pessoas contra ${R(melhor.t.custoMilAlcance ?? 0)}, e o post engaja parecido. ${acaoPorMetrica("alcance")}`
          : respostaMelhor >= respostaPior * 1.25 && razaoAlc < 1.25
            ? `O alcance custa parecido, mas o post engaja menos: ${D(respostaPior)} engajamentos a cada 100 pessoas contra ${D(respostaMelhor)}. ${acaoPorMetrica("engajamento")}`
            : `Pesam os dois: o alcance custa ${R(pior.t.custoMilAlcance ?? 0)} por mil (contra ${R(melhor.t.custoMilAlcance ?? 0)}) e o post engaja ${D(respostaPior)} a cada 100 pessoas (contra ${D(respostaMelhor)}). Comece pelo público e depois priorize os posts que mais engajaram.`;
      ins.push({
        tom: "oportunidade",
        unidade: pior.u.unidade,
        metrica: "Engajamento",
        titulo: `Investe parecido com ${melhor.u.unidade}, que tira ${vezes(razao)} mais engajamento por real`,
        detalhe: `${pior.u.unidade}: ${R(pior.t.gastoDia)}/dia → ${I(pior.m.interacoes)} engajamentos e ${I(pior.m.alcance)} alcançados. ${melhor.u.unidade}: ${R(melhor.t.gastoDia)}/dia → ${I(melhor.m.interacoes)} engajamentos e ${I(melhor.m.alcance)} alcançados. ${motivo}`,
      });
    }
  }

  // 3) Orçamento pra chegar perto da unidade que mais engaja — só pra quem já tem custo razoável.
  const topEng = [...ativas].sort((a, b) => b.m.interacoes - a.m.interacoes)[0];
  for (const l of ativas) {
    if (!topEng || l === topEng || l.m.interacoes < 50 || !l.t.custoEngajamento) continue;
    if (l.m.interacoes >= topEng.m.interacoes * 0.8) continue;
    const r = medEng ? regua(l.t.custoEngajamento, medEng) : null;
    const necessarioDia = (topEng.m.interacoes / dias) * l.t.custoEngajamento;
    if (r && (r.faixa === "bem_pior" || r.faixa === "pior")) continue; // primeiro baixar o custo (dica da régua acima)
    const passos: number[] = [];
    let atual = l.t.gastoDia;
    while (atual < necessarioDia && passos.length < 4) {
      atual = Math.min(necessarioDia, atual * 1.25);
      passos.push(arred(atual));
    }
    const ganho = passos.length ? (passos[0] - l.t.gastoDia) * dias / l.t.custoEngajamento : 0;
    ins.push({
      tom: "oportunidade",
      unidade: l.u.unidade,
      metrica: "Engajamento",
      titulo: `Pra chegar perto do volume de ${topEng.u.unidade}: ~${R(arred(necessarioDia))}/dia`,
      detalhe: `Hoje: ${R(l.t.gastoDia)}/dia e ${I(l.m.interacoes)} engajamentos ${nomePeriodo}, a ${R(l.t.custoEngajamento)} cada (${r?.texto ?? "sem mediana"}). ${topEng.u.unidade} teve ${I(topEng.m.interacoes)}. Como o custo dessa unidade já é bom, o caminho é volume: ${passos.map((v, k) => `semana ${k + 1}: ${R(v)}/dia`).join(" → ")}${atual < necessarioDia ? " → e assim por diante" : ""} (aumentos de ~25% por semana pra a Meta não reiniciar o aprendizado). O primeiro passo deve trazer ~${I(Math.max(0, ganho))} engajamentos a mais ${nomePeriodo}. Confira se o teto de gasto do mês comporta.`,
    });
  }

  // 4) Saturação do público.
  for (const l of ativas) {
    if (l.t.frequencia !== null && l.t.frequencia >= freqLimite)
      ins.push({ tom: "atencao", unidade: l.u.unidade, metrica: "Alcance", titulo: `Público saturado: cada pessoa viu o anúncio ${D(l.t.frequencia)} vezes`, detalhe: `${I(l.m.impressoes)} exibições pra ${I(l.m.alcance)} pessoas ${nomePeriodo}. Acima de ~${D(freqLimite)} a Meta repete o anúncio pra mesma gente: o alcance trava e o custo por engajamento sobe. ${acaoPorMetrica("alcance")} Se não der pra ampliar, reduza o orçamento pra ~${R(arred((l.t.gastoDia * freqLimite) / l.t.frequencia * 0.8))}/dia.` });
  }

  // 5) Período contra o anterior (alcance e engajamento, na mesma régua de ±35%).
  for (const l of ativas) {
    if (l.ant.gasto < minimoGasto) continue;
    for (const [nome, agora, antes, vol] of [
      ["Engajamento", l.t.custoEngajamento, l.tAnt.custoEngajamento, l.m.interacoes >= 50 && l.ant.interacoes >= 50],
      ["Alcance", l.t.custoMilAlcance, l.tAnt.custoMilAlcance, l.m.alcance >= 1000 && l.ant.alcance >= 1000],
    ] as const) {
      if (!vol || !agora || !antes) continue;
      const r = agora / antes;
      const contexto = `Gasto ${R(l.tAnt.gastoDia)}/dia → ${R(l.t.gastoDia)}/dia; alcance ${I(l.ant.alcance)} → ${I(l.m.alcance)}; engajamentos ${I(l.ant.interacoes)} → ${I(l.m.interacoes)}.`;
      if (r >= 1.35)
        ins.push({ tom: "atencao", unidade: l.u.unidade, metrica: nome, titulo: `${nome} ficou mais caro que no período anterior`, detalhe: `${R(antes)} → ${R(agora)} ${nome === "Alcance" ? "por mil pessoas" : "por engajamento"}${r >= 2 ? " (mais que o dobro)" : ""}. ${contexto} ${(l.t.frequencia ?? 0) > (l.tAnt.frequencia ?? 0) * 1.2 ? "A frequência subiu junto: o público está cansando." : "Sem sinal de saturação: os posts turbinados renderam menos que no período anterior."}` });
      else if (r <= 0.7)
        ins.push({ tom: "destaque", unidade: l.u.unidade, metrica: nome, titulo: `${nome} ficou mais barato que no período anterior`, detalhe: `${R(antes)} → ${R(agora)} ${nome === "Alcance" ? "por mil pessoas" : "por engajamento"}. ${contexto} Vale repetir o tipo de post e manter o público.` });
    }
  }

  // 6) Investimento muito baixo.
  const medGasto = mediana(ativas.map((l) => l.t.gastoDia));
  for (const l of linhas.filter((x) => x.m.gasto > 0 && x.m.gasto < minimoGasto))
    ins.push({ tom: "info", unidade: l.u.unidade, metrica: null, titulo: `Investimento muito baixo: ${R(l.m.gasto)} ${nomePeriodo}`, detalhe: `A mediana da rede é ${R(medGasto ?? 0)}/dia. Com tão pouco a Meta mal sai da fase de aprendizado e os números ficam instáveis — por isso a unidade fica fora das comparações.` });

  const ordem: Record<TomInsight, number> = { atencao: 0, oportunidade: 1, destaque: 2, info: 3 };
  return ins.sort((a, b) => ordem[a.tom] - ordem[b.tom]);
}

/** O que fazer quando o custo de uma métrica está alto. */
function acaoPorMetrica(chave: MetricaAnalise["chave"]): string {
  switch (chave) {
    case "alcance":
      return "Ação: no público salvo do boost, aumente o raio em 2 a 5 km ou inclua cidades vizinhas, tire interesses muito específicos e abra a faixa de idade — público maior barateia o alcance.";
    case "engajamento":
      return "Ação: turbine os posts oficiais que mais engajaram (tela da unidade → Melhores posts), evite turbinar post só informativo e confira se a unidade posta no horário de pico (fim da tarde e noite).";
    case "visitas":
      return "Ação: posts com chamada clara pro perfil (\"veja o cardápio no perfil\", \"siga pra novidades\") e um perfil atualizado (destaques, bio com cardápio/iFood) aumentam a visita; Reels costumam levar mais gente ao perfil que foto.";
    case "cliques":
      return "Ação: confira se o link e o botão estão certos (iFood/WhatsApp), use arte com a oferta bem visível e chamada direta (\"peça agora\"), e prefira Stories pra campanha de clique.";
  }
}
