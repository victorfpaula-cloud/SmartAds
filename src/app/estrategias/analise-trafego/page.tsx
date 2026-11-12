import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";
import { AbasSaudeRede } from "@/components/AbasRede";
import { exigirAmbiente } from "@/lib/ambiente";
import { gerarInsights, lerAnaliseTrafego, mediana, taxas, GASTO_MINIMO_SEMANA, type Escopo, type TomInsight } from "@/lib/analiseTrafego";
import BotaoAtualizarAnalise from "./BotaoAtualizarAnalise";

export const dynamic = "force-dynamic";

const R = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const I = (n: number) => Math.round(n).toLocaleString("pt-BR");
const D = (n: number | null, c = 1) => (n === null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c }));
const dataBR = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

const ESTILO: Record<TomInsight, { rotulo: string; classe: string }> = {
  atencao: { rotulo: "Atenção", classe: "border-amber-400/40 bg-amber-400/10 text-amber-200" },
  oportunidade: { rotulo: "Oportunidade", classe: "border-accent/40 bg-accent/10 text-accent-strong" },
  destaque: { rotulo: "Destaque", classe: "border-ok/40 bg-ok/10 text-ok" },
  info: { rotulo: "Para saber", classe: "border-white/14 bg-white/[0.03] text-neutral-300" },
};

/** Análise semanal comparando o tráfego das unidades: quem rende mais por real investido, o que
 * explica a diferença e o que fazer. Calculada toda segunda (ou no botão Atualizar agora). */
export default async function AnaliseTrafegoPage({ searchParams }: { searchParams: { escopo?: string } }) {
  const ambiente = await exigirAmbiente("franquia");
  const escopo: Escopo = searchParams.escopo === "tudo" ? "tudo" : "boost";
  const analise = await lerAnaliseTrafego(ambiente.id);
  const insights = analise ? gerarInsights(analise, escopo) : [];
  const linhas = (analise?.unidades ?? [])
    .map((u) => ({ u, m: u.atual[escopo], t: taxas(u.atual[escopo]), tAnt: taxas(u.anterior[escopo]), ant: u.anterior[escopo] }))
    .sort((a, b) => (b.t.curtidasPorReal ?? -1) - (a.t.curtidasPorReal ?? -1));
  const ativas = linhas.filter((l) => !l.u.erro && l.m.gasto >= GASTO_MINIMO_SEMANA);
  const med = {
    custoCurtida: mediana(ativas.map((l) => l.t.custoCurtida)),
    custoMil: mediana(ativas.map((l) => l.t.custoMilAlcance)),
    taxaEng: mediana(ativas.map((l) => l.t.taxaEngajamento)),
    freq: mediana(ativas.map((l) => l.t.frequencia)),
    gastoDia: mediana(ativas.map((l) => l.t.gastoDia)),
  };
  const total = ativas.reduce((t, l) => ({ gasto: t.gasto + l.m.gasto, curtidas: t.curtidas + l.m.curtidas, alcance: t.alcance + l.m.alcance }), { gasto: 0, curtidas: 0, alcance: 0 });
  const totalAnt = linhas.filter((l) => !l.u.erro).reduce((t, l) => ({ gasto: t.gasto + l.ant.gasto, curtidas: t.curtidas + l.ant.curtidas }), { gasto: 0, curtidas: 0 });
  const varPct = (a: number, b: number) => (b > 0 ? Math.round((a / b - 1) * 100) : null);
  const cor = (valor: number | null, ref: number | null, menorMelhor: boolean) =>
    valor === null || ref === null ? "" : (menorMelhor ? valor <= ref * 0.85 : valor >= ref * 1.15) ? "text-ok" : (menorMelhor ? valor >= ref * 1.3 : valor <= ref * 0.7) ? "text-amber-300" : "";

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <AbasSaudeRede />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Análise do tráfego · {ambiente.nome}</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-400">
              Compara as unidades pelo que cada real investido devolve — alcance, curtidas, interações — e sugere o que ajustar.
              Atualiza sozinha toda segunda com a semana que fechou.
            </p>
            {analise && (
              <p className="mt-1 text-[11px] text-neutral-600">
                Semana de {dataBR(analise.periodo.desde)} a {dataBR(analise.periodo.ate)} comparada com a anterior · calculado em{" "}
                {new Date(analise.calculadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <BotaoAtualizarAnalise />
        </div>

        <div className="mt-4 flex gap-2">
          {(["boost", "tudo"] as const).map((e) => (
            <Link key={e} href={`/estrategias/analise-trafego?escopo=${e}`} className={e === escopo ? "pilula-ativa rounded-lg px-3.5 py-2 text-[13px] font-semibold text-neutral-100" : "rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-400 hover:text-neutral-200"}>
              {e === "boost" ? "Só boost" : "Todo o tráfego"}
            </Link>
          ))}
        </div>

        {!analise ? (
          <p className="cartao-vidro mt-4 px-5 py-6 text-sm text-neutral-400">Ainda sem análise. Clique em Atualizar agora (leva alguns segundos).</p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Investido na semana", R(total.gasto), varPct(total.gasto, totalAnt.gasto)],
                ["Curtidas", I(total.curtidas), varPct(total.curtidas, totalAnt.curtidas)],
                ["Custo por curtida (mediana)", R(med.custoCurtida), null],
                ["Alcance a cada R$ 1 (mediana)", med.custoMil ? I(1000 / med.custoMil) : "—", null],
              ].map(([rotulo, valor, v]) => (
                <div key={rotulo as string} className="cartao-vidro px-4 py-3">
                  <p className="text-[10.5px] uppercase tracking-wide text-neutral-500">{rotulo}</p>
                  <p className="mt-0.5 text-lg font-bold text-neutral-100">{valor}</p>
                  {typeof v === "number" && <p className={`text-[11px] ${v >= 0 ? "text-ok" : "text-amber-300"}`}>{v >= 0 ? "+" : ""}{v}% vs semana anterior</p>}
                </div>
              ))}
            </div>

            <section className="mt-5">
              <h2 className="font-display text-base font-bold">Análises e recomendações</h2>
              {insights.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">Nada fora do padrão nesta semana.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {insights.map((i, n) => (
                    <li key={n} className="cartao-vidro px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${ESTILO[i.tom].classe}`}>{ESTILO[i.tom].rotulo}</span>
                        {i.unidade && <span className="text-xs font-semibold text-neutral-300">{i.unidade}</span>}
                      </div>
                      <p className="mt-1.5 text-sm font-semibold text-neutral-100">{i.titulo}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">{i.detalhe}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="cartao-vidro mt-5 overflow-x-auto p-4">
              <h2 className="font-display text-base font-bold">Unidade a unidade</h2>
              <p className="mt-0.5 text-[11px] text-neutral-500">Ordenado por curtidas por real. Verde = bem melhor que a mediana da rede; amarelo = bem pior. Unidades com menos de {R(GASTO_MINIMO_SEMANA)} na semana não entram na mediana.</p>
              <table className="mt-3 w-full min-w-[860px] text-left text-[12.5px]">
                <thead className="text-[10.5px] uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Unidade</th>
                    <th className="py-2 text-right font-medium">Boost/dia</th>
                    <th className="py-2 text-right font-medium">Gastou/dia</th>
                    <th className="py-2 text-right font-medium">Alcance</th>
                    <th className="py-2 text-right font-medium">Curtidas</th>
                    <th className="py-2 text-right font-medium">R$/curtida</th>
                    <th className="py-2 text-right font-medium">R$/mil alcance</th>
                    <th className="py-2 text-right font-medium">Engaj./100</th>
                    <th className="py-2 text-right font-medium">Frequência</th>
                    <th className="py-2 text-right font-medium">Coment. + salv.</th>
                    <th className="py-2 text-right font-medium">R$/curtida sem. ant.</th>
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
                      <td className="py-2 text-right tabular-nums">{I(m.curtidas)}</td>
                      <td className={`py-2 text-right tabular-nums ${cor(t.custoCurtida, med.custoCurtida, true)}`}>{R(t.custoCurtida)}</td>
                      <td className={`py-2 text-right tabular-nums ${cor(t.custoMilAlcance, med.custoMil, true)}`}>{R(t.custoMilAlcance)}</td>
                      <td className={`py-2 text-right tabular-nums ${cor(t.taxaEngajamento, med.taxaEng, false)}`}>{D(t.taxaEngajamento)}</td>
                      <td className={`py-2 text-right tabular-nums ${t.frequencia !== null && t.frequencia >= 2.5 ? "text-amber-300" : ""}`}>{D(t.frequencia, 2)}</td>
                      <td className="py-2 text-right tabular-nums">{I(m.comentarios + m.salvamentos)}</td>
                      <td className="py-2 text-right tabular-nums text-neutral-500">{R(tAnt.custoCurtida)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/15 text-neutral-400">
                    <td className="py-2 pr-2 font-semibold">Mediana da rede</td>
                    <td />
                    <td className="py-2 text-right tabular-nums">{R(med.gastoDia)}</td>
                    <td />
                    <td />
                    <td className="py-2 text-right tabular-nums">{R(med.custoCurtida)}</td>
                    <td className="py-2 text-right tabular-nums">{R(med.custoMil)}</td>
                    <td className="py-2 text-right tabular-nums">{D(med.taxaEng)}</td>
                    <td className="py-2 text-right tabular-nums">{D(med.freq, 2)}</td>
                    <td />
                    <td />
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-[10.5px] text-neutral-600">
                Alcance é a soma das campanhas da semana (a mesma pessoa em duas campanhas conta duas vezes). Curtidas = reações nos posts turbinados. Engaj./100 = interações (inclui visualizações de vídeo e cliques) a cada 100 alcançados.
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}
