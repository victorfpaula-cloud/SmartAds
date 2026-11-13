import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";
import { AbasSaudeRede } from "@/components/AbasRede";
import { exigirAmbiente } from "@/lib/ambiente";
import { calcularIndices, gerarInsights, lerAnaliseTrafego, mediana, taxas, GASTO_MINIMO_SEMANA, type Escopo, type TomInsight } from "@/lib/analiseTrafego";
import BotaoAtualizarAnalise from "./BotaoAtualizarAnalise";

export const dynamic = "force-dynamic";

const R = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const I = (n: number) => Math.round(n).toLocaleString("pt-BR");
const D = (n: number | null, c = 1) => (n === null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c }));
const dataBR = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

const ESTILO: Record<TomInsight, { rotulo: string; classe: string; barra: string }> = {
  atencao: { rotulo: "Atenção", classe: "border-amber-400/40 bg-amber-400/10 text-amber-200", barra: "bg-amber-400" },
  oportunidade: { rotulo: "Oportunidade", classe: "border-accent/40 bg-accent/10 text-accent-strong", barra: "bg-accent" },
  destaque: { rotulo: "Destaque", classe: "border-ok/40 bg-ok/10 text-ok", barra: "bg-ok" },
  info: { rotulo: "Para saber", classe: "border-white/14 bg-white/[0.03] text-neutral-300", barra: "bg-neutral-500" },
};

/** Texto das dicas com trechos **em negrito**. */
function Texto({ t }: { t: string }) {
  return (
    <>
      {t.split(/\*\*(.+?)\*\*/g).map((parte, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold text-neutral-100">{parte}</strong> : parte))}
    </>
  );
}

/** Análise semanal comparando o tráfego das unidades: quem rende mais por real investido, o que
 * explica a diferença e o que fazer. Calculada toda segunda (ou no botão Atualizar agora). */
export default async function AnaliseTrafegoPage({ searchParams }: { searchParams: { escopo?: string; dias?: string } }) {
  const ambiente = await exigirAmbiente("franquia");
  const escopo: Escopo = searchParams.escopo === "tudo" ? "tudo" : "boost";
  const dias = searchParams.dias === "15" ? 15 : 7;
  const analise = await lerAnaliseTrafego(ambiente.id, dias);
  const nomePeriodo = dias === 7 ? "7 dias" : "15 dias";
  const link = (mud: { escopo?: Escopo; dias?: number }) => `/estrategias/analise-trafego?escopo=${mud.escopo ?? escopo}&dias=${mud.dias ?? dias}`;
  const insights = analise ? gerarInsights(analise, escopo) : [];
  const indices = analise ? calcularIndices(analise, escopo).indices : [];
  const linhas = (analise?.unidades ?? [])
    .map((u) => ({ u, m: u.atual[escopo], t: taxas(u.atual[escopo], dias), tAnt: taxas(u.anterior[escopo], dias), ant: u.anterior[escopo] }))
    .sort((a, b) => (a.t.custoEngajamento ?? Infinity) - (b.t.custoEngajamento ?? Infinity));
  const ativas = linhas.filter((l) => !l.u.erro && l.m.gasto >= GASTO_MINIMO_SEMANA * (dias / 7));
  const med = {
    custoEng: mediana(ativas.filter((l) => l.m.interacoes >= 50).map((l) => l.t.custoEngajamento)),
    custoVisita: mediana(ativas.filter((l) => (l.m.visitasPerfil ?? 0) >= 10).map((l) => l.t.custoVisita)),
    custoClique: mediana(ativas.filter((l) => (l.m.cliques ?? 0) >= 10).map((l) => l.t.custoClique)),
    custoMil: mediana(ativas.map((l) => l.t.custoMilAlcance)),
    custoMilViews: mediana(ativas.map((l) => l.t.custoMilVisualizacoes)),
    taxaEng: mediana(ativas.map((l) => l.t.taxaEngajamento)),
    freq: mediana(ativas.map((l) => l.t.frequencia)),
    gastoDia: mediana(ativas.map((l) => l.t.gastoDia)),
  };
  const total = ativas.reduce((t, l) => ({ gasto: t.gasto + l.m.gasto, eng: t.eng + l.m.interacoes, alcance: t.alcance + l.m.alcance, views: t.views + l.m.impressoes, visitas: t.visitas + (l.m.visitasPerfil ?? 0), cliques: t.cliques + (l.m.cliques ?? 0) }), { gasto: 0, eng: 0, alcance: 0, views: 0, visitas: 0, cliques: 0 });
  const totalAnt = linhas.filter((l) => !l.u.erro && l.m.gasto >= GASTO_MINIMO_SEMANA * (dias / 7)).reduce((t, l) => ({ gasto: t.gasto + l.ant.gasto, eng: t.eng + l.ant.interacoes, alcance: t.alcance + l.ant.alcance, views: t.views + l.ant.impressoes, visitas: t.visitas + (l.ant.visitasPerfil ?? 0), cliques: t.cliques + (l.ant.cliques ?? 0) }), { gasto: 0, eng: 0, alcance: 0, views: 0, visitas: 0, cliques: 0 });
  // Um cartão por unidade (com todas as dicas dela), na ordem do mais urgente; dicas da rede no topo.
  const ordemTom: Record<TomInsight, number> = { atencao: 0, oportunidade: 1, destaque: 2, info: 3 };
  const porUnidade = new Map<string | null, typeof insights>();
  for (const i of insights) porUnidade.set(i.unidade, [...(porUnidade.get(i.unidade) ?? []), i]);
  const grupos = [...porUnidade.entries()]
    .map(([unidade, itens]) => {
      const l = linhas.find((x) => x.u.unidade === unidade);
      const resumo = l && l.m.gasto > 0 ? `${R(l.t.gastoDia)}/dia · ${I(l.m.alcance)} alcançados · ${I(l.m.impressoes)} visualizações · ${I(l.m.interacoes)} engajamentos` : null;
      const indice = indices.find((x) => x.unidade === unidade)?.indice ?? null;
      return { unidade, itens, resumo, indice, peso: Math.min(...itens.map((i) => ordemTom[i.tom])) };
    })
    .sort((a, b) => (a.unidade === null ? -1 : b.unidade === null ? 1 : a.peso - b.peso || (a.unidade ?? "").localeCompare(b.unidade ?? "")));
  const varPct = (a: number, b: number) => (b > 0 ? Math.round((a / b - 1) * 100) : null);
  const cor = (valor: number | null, ref: number | null, menorMelhor: boolean) =>
    valor === null || ref === null ? "" : (menorMelhor ? valor <= ref * 0.75 : valor >= ref * 1.35) ? "text-ok" : (menorMelhor ? valor >= ref * 1.35 : valor <= ref * 0.75) ? "text-amber-300" : "";

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <AbasSaudeRede />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Análise do tráfego · {ambiente.nome}</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-400">
              Compara só as unidades (a conta central Principal/Expansão fica de fora) pelo que cada real investido devolve em alcance, visualizações, engajamento, visitas ao perfil, cliques no link e vídeo assistido — cada métrica comparada com a mediana da rede, numa régua por faixas — e sugere o que ajustar.
              Sempre os últimos {nomePeriodo} até ontem, comparados com os {nomePeriodo} anteriores. Atualiza sozinha toda segunda.
            </p>
            {analise && (
              <p className="mt-1 text-[11px] text-neutral-600">
                Período de {dataBR(analise.periodo.desde)} a {dataBR(analise.periodo.ate)} comparado com os {nomePeriodo} anteriores · calculado em{" "}
                {new Date(analise.calculadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <BotaoAtualizarAnalise dias={dias} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {([7, 15] as const).map((d) => (
            <Link key={d} href={link({ dias: d })} className={d === dias ? "pilula-ativa rounded-lg px-3.5 py-2 text-[13px] font-semibold text-neutral-100" : "rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-400 hover:text-neutral-200"}>
              Últimos {d} dias
            </Link>
          ))}
          <span className="mx-1 h-5 w-px bg-white/10" />
          {(["boost", "tudo"] as const).map((e) => (
            <Link key={e} href={link({ escopo: e })} className={e === escopo ? "pilula-ativa rounded-lg px-3.5 py-2 text-[13px] font-semibold text-neutral-100" : "rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-400 hover:text-neutral-200"}>
              {e === "boost" ? "Só boost" : "Todo o tráfego"}
            </Link>
          ))}
        </div>

        {!analise ? (
          <p className="cartao-vidro mt-4 px-5 py-6 text-sm text-neutral-400">Ainda sem análise dos últimos {nomePeriodo}. Clique em Atualizar agora (leva alguns segundos).</p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                [`Investido em ${nomePeriodo}`, R(total.gasto), varPct(total.gasto, totalAnt.gasto)],
                ["Alcance", I(total.alcance), varPct(total.alcance, totalAnt.alcance)],
                ["Visualizações", I(total.views), varPct(total.views, totalAnt.views)],
                ["Engajamentos", I(total.eng), varPct(total.eng, totalAnt.eng)],
                ["Visitas ao perfil", I(total.visitas), varPct(total.visitas, totalAnt.visitas)],
                ["Cliques no link", I(total.cliques), varPct(total.cliques, totalAnt.cliques)],
              ].map(([rotulo, valor, v]) => (
                <div key={rotulo as string} className="cartao-vidro px-4 py-3">
                  <p className="text-[10.5px] uppercase tracking-wide text-neutral-500">{rotulo}</p>
                  <p className="mt-0.5 text-lg font-bold text-neutral-100">{valor}</p>
                  {typeof v === "number" && <p className={`text-[11px] ${v >= 0 ? "text-ok" : "text-amber-300"}`}>{v >= 0 ? "+" : ""}{v}% vs período anterior</p>}
                </div>
              ))}
            </div>

            <section className="mt-5">
              <h2 className="font-display text-base font-bold">Análises e recomendações</h2>
              {insights.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">Nada fora do padrão nesse período.</p>
              ) : (
                <div className="mt-2 flex flex-col gap-3">
                  {grupos.map((g) => (
                    <div key={g.unidade ?? "rede"} className="cartao-vidro overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <p className="text-[15px] font-bold text-neutral-100">{g.unidade ?? "Rede"}</p>
                          {g.indice !== null && (
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${g.indice >= 115 ? "bg-ok/15 text-ok" : g.indice <= 85 ? "bg-amber-400/15 text-amber-300" : "bg-white/[0.06] text-neutral-300"}`}>
                              índice {g.indice}
                            </span>
                          )}
                        </div>
                        {g.resumo && <p className="text-[11px] text-neutral-500">{g.resumo}</p>}
                      </div>
                      <ul className="flex flex-col divide-y divide-white/5">
                        {g.itens.map((i, n) => (
                          <li key={n} className="flex gap-3 px-4 py-3">
                            <span className={`mt-1 w-1 shrink-0 self-stretch rounded-full ${ESTILO[i.tom].barra}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={`rounded-full border px-2 py-px text-[10px] font-semibold ${ESTILO[i.tom].classe}`}>{ESTILO[i.tom].rotulo}</span>
                                {i.metrica && <span className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">{i.metrica}</span>}
                              </div>
                              <p className="mt-1 text-[14px] font-bold leading-snug text-neutral-100">{i.titulo}</p>
                              <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-400">
                                <Texto t={i.detalhe} />
                              </p>
                              {i.acao && (
                                <p className="mt-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[12.5px] leading-relaxed text-neutral-300">
                                  <span className="font-semibold text-neutral-100">O que fazer: </span>
                                  <Texto t={i.acao} />
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="cartao-vidro mt-5 overflow-x-auto p-4">
              <h2 className="font-display text-base font-bold">Unidade a unidade</h2>
              <p className="mt-0.5 text-[11px] text-neutral-500">Ordenado pelo custo por engajamento (mais barato primeiro). Índice = desempenho geral (100 = mediana da rede), juntando alcance, visualizações, engajamento, visitas, cliques e vídeo onde há volume. Verde = bem melhor que a mediana da rede; amarelo = bem pior. Unidades com menos de {R(GASTO_MINIMO_SEMANA * (dias / 7))} no período não entram na mediana.</p>
              <table className="mt-3 w-full min-w-[1180px] text-left text-[12.5px]">
                <thead className="text-[10.5px] uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Unidade</th>
                    <th className="py-2 text-right font-medium">Boost/dia</th>
                    <th className="py-2 text-right font-medium">Gastou/dia</th>
                    <th className="py-2 text-right font-medium">Alcance</th>
                    <th className="py-2 text-right font-medium">Índice</th>
                    <th className="py-2 text-right font-medium">R$/mil alcance</th>
                    <th className="py-2 text-right font-medium">Visualiz.</th>
                    <th className="py-2 text-right font-medium">R$/mil visualiz.</th>
                    <th className="py-2 text-right font-medium">Engajam.</th>
                    <th className="py-2 text-right font-medium">R$/engaj.</th>
                    <th className="py-2 text-right font-medium">Visitas perfil</th>
                    <th className="py-2 text-right font-medium">R$/visita</th>
                    <th className="py-2 text-right font-medium">Cliques</th>
                    <th className="py-2 text-right font-medium">R$/clique</th>
                    <th className="py-2 text-right font-medium">Frequência</th>
                    <th className="py-2 text-right font-medium">R$/engaj. antes</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(({ u, m, t, tAnt }) => (
                    <tr key={u.contaId} className="border-t border-white/5 text-neutral-300">
                      <td className="py-2 pr-2">
                        <Link href={`/unidade/${u.contaId}`} className="font-medium text-neutral-100 hover:underline">{u.unidade}</Link>
                        {u.erro && <p className="text-[10.5px] text-amber-300">sem leitura: {u.erro.slice(0, 60)}</p>}
                      </td>
                      <td className="py-2 text-right tabular-nums">{u.boostLigado ? R(u.boostDiario) : <span className="text-neutral-600">desligado</span>}</td>
                      <td className="py-2 text-right tabular-nums">{R(t.gastoDia)}</td>
                      <td className="py-2 text-right tabular-nums">{I(m.alcance)}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{indices.find((x) => x.contaId === u.contaId)?.indice ?? "—"}</td>
                      <td className={`py-2 text-right tabular-nums ${cor(t.custoMilAlcance, med.custoMil, true)}`}>{R(t.custoMilAlcance)}</td>
                      <td className="py-2 text-right tabular-nums">{I(m.impressoes)}</td>
                      <td className={`py-2 text-right tabular-nums ${cor(t.custoMilVisualizacoes, med.custoMilViews, true)}`}>{R(t.custoMilVisualizacoes)}</td>
                      <td className="py-2 text-right tabular-nums">{I(m.interacoes)}</td>
                      <td className={`py-2 text-right tabular-nums ${m.interacoes >= 50 ? cor(t.custoEngajamento, med.custoEng, true) : ""}`}>{R(t.custoEngajamento)}</td>
                      <td className="py-2 text-right tabular-nums">{I(m.visitasPerfil ?? 0)}</td>
                      <td className={`py-2 text-right tabular-nums ${(m.visitasPerfil ?? 0) >= 10 ? cor(t.custoVisita, med.custoVisita, true) : ""}`}>{R(t.custoVisita)}</td>
                      <td className="py-2 text-right tabular-nums">{I(m.cliques ?? 0)}</td>
                      <td className={`py-2 text-right tabular-nums ${(m.cliques ?? 0) >= 10 ? cor(t.custoClique, med.custoClique, true) : ""}`}>{R(t.custoClique)}</td>
                      <td className={`py-2 text-right tabular-nums ${t.frequencia !== null && t.frequencia >= (dias <= 7 ? 2.5 : 3.5) ? "text-amber-300" : ""}`}>{D(t.frequencia, 2)}</td>
                      <td className="py-2 text-right tabular-nums text-neutral-500">{R(tAnt.custoEngajamento)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/15 text-neutral-400">
                    <td className="py-2 pr-2 font-semibold">Mediana da rede</td>
                    <td />
                    <td className="py-2 text-right tabular-nums">{R(med.gastoDia)}</td>
                    <td />
                    <td className="py-2 text-right tabular-nums">100</td>
                    <td className="py-2 text-right tabular-nums">{R(med.custoMil)}</td>
                    <td />
                    <td className="py-2 text-right tabular-nums">{R(med.custoMilViews)}</td>
                    <td />
                    <td className="py-2 text-right tabular-nums">{R(med.custoEng)}</td>
                    <td />
                    <td className="py-2 text-right tabular-nums">{R(med.custoVisita)}</td>
                    <td />
                    <td className="py-2 text-right tabular-nums">{R(med.custoClique)}</td>
                    <td className="py-2 text-right tabular-nums">{D(med.freq, 2)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-[10.5px] text-neutral-600">
                Alcance é a soma das campanhas do período (a mesma pessoa em duas campanhas conta duas vezes). Engajamento = toda interação com o anúncio (curtida, comentário, compartilhamento, salvamento, clique e visualização de vídeo), como a Meta conta. Visitas e cliques só entram na comparação a partir de 10 no período; engajamento a partir de 50; alcance a partir de mil pessoas. Visitas e cliques aparecem a partir da próxima atualização.
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}
