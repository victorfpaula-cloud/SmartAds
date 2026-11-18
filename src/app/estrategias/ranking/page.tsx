import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";
import { AbasSaudeRede } from "@/components/AbasRede";
import { exigirAmbiente } from "@/lib/ambiente";
import { lerAnaliseTrafego, periodoAnalise, PERIODOS_ANALISE, type Escopo } from "@/lib/analiseTrafego";
import { carregarHistoricoSeguidores } from "@/lib/seguidoresHistorico";
import { montarRanking, pontas, QUADRANTES, type LinhaRanking, type Quadrante, type SeguidoresUnidade } from "@/lib/rankingRede";
import BotaoAtualizarAnalise from "../analise-trafego/BotaoAtualizarAnalise";

export const dynamic = "force-dynamic";

const R = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const R0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const I = (n: number) => Math.round(n).toLocaleString("pt-BR");
const P = (n: number, c = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c }) + "%";
const dataBR = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const sinal = (n: number) => (n > 0 ? "+" : "") + n.toLocaleString("pt-BR");
const NOME_PERIODO: Record<number, string> = { 7: "Última semana", 15: "15 dias", 30: "30 dias", 60: "60 dias", 90: "90 dias" };

const COR_QUADRANTE: Record<Quadrante, { borda: string; etiqueta: string }> = {
  escalar: { borda: "border-accent/40", etiqueta: "bg-accent/15 text-accent-strong" },
  manter: { borda: "border-ok/40", etiqueta: "bg-ok/15 text-ok" },
  rever: { borda: "border-amber-400/40", etiqueta: "bg-amber-400/15 text-amber-300" },
  base: { borda: "border-white/14", etiqueta: "bg-white/[0.06] text-neutral-300" },
};
const ROTULO_CURTO: Record<Quadrante, string> = { escalar: "Pode receber mais verba", manter: "Manter", rever: "Rever antes de investir mais", base: "Arrumar o básico" };

function corIndice(i: number | null) {
  if (i === null) return "text-neutral-600";
  return i >= 115 ? "text-ok" : i <= 85 ? "text-amber-300" : "text-neutral-200";
}

/** Cartão de destaque: os 3 melhores e os 3 piores numa medida. */
function CartaoTop({ titulo, explica, lista, valor, vazio }: { titulo: string; explica: string; lista: LinhaRanking[]; valor: (l: LinhaRanking) => string; vazio: string }) {
  const { melhores, piores } = pontas(lista);
  const Item = ({ l, pos, ruim }: { l: LinhaRanking; pos: number; ruim?: boolean }) => (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className={`w-5 shrink-0 text-right text-[11px] font-bold tabular-nums ${ruim ? "text-amber-300" : "text-ok"}`}>{pos}º</span>
        <Link href={`/unidade/${l.contaId}`} className="truncate text-[13px] text-neutral-200 hover:underline">{l.unidade.replace(/^DB\s*-\s*/i, "")}</Link>
      </span>
      <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-neutral-100">{valor(l)}</span>
    </li>
  );
  return (
    <div className="cartao-vidro flex flex-col px-4 py-3.5">
      <p className="text-[14px] font-bold text-neutral-100">{titulo}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{explica}</p>
      {lista.length === 0 ? (
        <p className="mt-3 text-[12px] text-neutral-500">{vazio}</p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-white/5">{melhores.map((l, n) => <Item key={l.contaId} l={l} pos={n + 1} />)}</ul>
          {piores.length > 0 && (
            <>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Por último</p>
              <ul className="divide-y divide-white/5">{piores.map((l, n) => <Item key={l.contaId} l={l} pos={lista.length - n} ruim />)}</ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Ranking das unidades: quem investe mais, quem faz cada real render mais, quem melhorou, quem
 * cresce no Instagram e o cruzamento investimento × resultado — nos últimos 7, 15, 30, 60 ou 90 dias. */
export default async function RankingPage({ searchParams }: { searchParams: { dias?: string; escopo?: string } }) {
  const ambiente = await exigirAmbiente("franquia");
  const dias = periodoAnalise(searchParams.dias ?? 30);
  const escopo: Escopo = searchParams.escopo === "boost" ? "boost" : "tudo";
  const link = (mud: { dias?: number; escopo?: Escopo }) => `/estrategias/ranking?dias=${mud.dias ?? dias}&escopo=${mud.escopo ?? escopo}`;

  const [analise, historico] = await Promise.all([
    lerAnaliseTrafego(ambiente.id, dias),
    carregarHistoricoSeguidores(ambiente.id).catch(() => null),
  ]);
  const seguidores = new Map<string, SeguidoresUnidade>();
  for (const u of historico?.porUnidade ?? []) {
    const g = u.ganhos[dias];
    if (g) seguidores.set(u.contaId, { total: u.total, ganho: g.ganho, completo: g.completo, desde: g.desde });
  }
  const ranking = analise ? montarRanking(analise, escopo, seguidores) : null;
  const comIndice = ranking?.linhas.filter((l) => l.indice !== null) ?? [];
  const semDados = ranking?.linhas.filter((l) => l.indice === null) ?? [];
  const maiorGasto = Math.max(1, ...(ranking?.linhas.map((l) => l.gasto) ?? [0]));
  const varGasto = ranking && ranking.totalGastoAnterior > 0 ? Math.round((ranking.totalGasto / ranking.totalGastoAnterior - 1) * 100) : null;
  const seguidoresIncompleto = [...seguidores.values()].some((s) => !s.completo && s.ganho !== null);
  const nomePeriodo = dias === 7 ? "na última semana" : `nos últimos ${dias} dias`;
  const curto = (n: string) => n.replace(/^DB\s*-\s*/i, "");

  const porGasto = (ranking?.linhas ?? []).filter((l) => !l.erro && l.gasto > 0).sort((a, b) => b.gasto - a.gasto);
  const porEvolucao = comIndice.filter((l) => l.evolucao !== null).sort((a, b) => (b.evolucao ?? 0) - (a.evolucao ?? 0));
  // Só quem tem histórico cobrindo o período inteiro — senão o ganho é de uma janela menor e a comparação engana.
  const porSeguidores = (ranking?.linhas ?? []).filter((l) => l.crescimentoSeguidores !== null && l.seguidores?.completo).sort((a, b) => (b.crescimentoSeguidores ?? 0) - (a.crescimentoSeguidores ?? 0));
  const porEngajamento = comIndice.filter((l) => l.m.interacoes >= 50 && l.t.custoEngajamento !== null).sort((a, b) => (a.t.custoEngajamento ?? 0) - (b.t.custoEngajamento ?? 0));
  const porVisita = comIndice.filter((l) => (l.m.visitasPerfil ?? 0) >= 10 && l.t.custoVisita !== null).sort((a, b) => (a.t.custoVisita ?? 0) - (b.t.custoVisita ?? 0));
  const porAlcance = comIndice.filter((l) => l.m.alcance >= 1000 && l.t.custoMilAlcance !== null).sort((a, b) => (a.t.custoMilAlcance ?? 0) - (b.t.custoMilAlcance ?? 0));

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <AbasSaudeRede />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Ranking das unidades · {ambiente.nome}</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-400">
              Quem investe mais, quem faz cada real render mais e o cruzamento entre as duas coisas. O resultado de cada unidade é comparado com a mediana da rede (índice 100) em alcance,
              visualizações, engajamento, visitas ao perfil, cliques e vídeo. A conta central (Principal/Expansão) fica de fora.
            </p>
            {analise && (
              <p className="mt-1 text-[11px] text-neutral-600">
                De {dataBR(analise.periodo.desde)} a {dataBR(analise.periodo.ate)}, comparado com os {dias} dias anteriores · calculado em{" "}
                {new Date(analise.calculadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · atualiza sozinho toda segunda
              </p>
            )}
          </div>
          <BotaoAtualizarAnalise dias={dias} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {PERIODOS_ANALISE.map((d) => (
            <Link key={d} href={link({ dias: d })} className={d === dias ? "pilula-ativa rounded-lg px-3.5 py-2 text-[13px] font-semibold text-neutral-100" : "rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-400 hover:text-neutral-200"}>
              {NOME_PERIODO[d]}
            </Link>
          ))}
          <span className="mx-1 h-5 w-px bg-white/10" />
          {(["tudo", "boost"] as const).map((e) => (
            <Link key={e} href={link({ escopo: e })} className={e === escopo ? "pilula-ativa rounded-lg px-3.5 py-2 text-[13px] font-semibold text-neutral-100" : "rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-400 hover:text-neutral-200"}>
              {e === "tudo" ? "Todo o tráfego" : "Só boost"}
            </Link>
          ))}
        </div>

        {!ranking ? (
          <p className="cartao-vidro mt-4 px-5 py-6 text-sm text-neutral-400">
            Ainda não há números de {NOME_PERIODO[dias].toLowerCase()}. Clique em Atualizar agora (leva alguns segundos).
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="cartao-vidro px-4 py-3">
                <p className="text-[10.5px] uppercase tracking-wide text-neutral-500">Investido pela rede</p>
                <p className="mt-0.5 text-lg font-bold text-neutral-100">{R(ranking.totalGasto)}</p>
                {varGasto !== null && <p className="text-[11px] text-neutral-500">{varGasto >= 0 ? "+" : ""}{varGasto}% vs período anterior</p>}
              </div>
              <div className="cartao-vidro px-4 py-3">
                <p className="text-[10.5px] uppercase tracking-wide text-neutral-500">Unidades comparadas</p>
                <p className="mt-0.5 text-lg font-bold text-neutral-100">{comIndice.length} de {ranking.linhas.length}</p>
                <p className="text-[11px] text-neutral-500">mínimo de {R0(ranking.minimoGasto)} no período</p>
              </div>
              <div className="cartao-vidro px-4 py-3">
                <p className="text-[10.5px] uppercase tracking-wide text-neutral-500">Verba mediana por unidade</p>
                <p className="mt-0.5 text-lg font-bold text-neutral-100">{R(ranking.medianaGastoDia)}/dia</p>
                <p className="text-[11px] text-neutral-500">linha que separa "investe pouco" de "investe bastante"</p>
              </div>
              <div className="cartao-vidro px-4 py-3">
                <p className="text-[10.5px] uppercase tracking-wide text-neutral-500">Melhor rendimento</p>
                <p className="mt-0.5 truncate text-lg font-bold text-neutral-100">{comIndice[0] ? curto(comIndice[0].unidade) : "—"}</p>
                {comIndice[0] && <p className="text-[11px] text-ok">índice {comIndice[0].indice}{comIndice[0].indice! > 100 ? `: cada real rende ${comIndice[0].indice! - 100}% acima da mediana` : ""}</p>}
              </div>
            </div>

            <section className="mt-6">
              <h2 className="font-display text-base font-bold">Investimento × resultado</h2>
              <p className="mt-0.5 text-[12px] text-neutral-500">
                Cada unidade cai num quadro conforme investe acima ou abaixo da verba mediana ({R(ranking.medianaGastoDia)}/dia) e rende acima ou abaixo da mediana da rede (índice 100).
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {(["escalar", "manter", "rever", "base"] as const).map((q) => {
                  const lista = comIndice.filter((l) => l.quadrante === q);
                  return (
                    <div key={q} className={`cartao-vidro border ${COR_QUADRANTE[q].borda} px-4 py-3.5`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[14px] font-bold text-neutral-100">{QUADRANTES[q].titulo}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${COR_QUADRANTE[q].etiqueta}`}>{lista.length}</span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-neutral-500">{QUADRANTES[q].resumo}</p>
                      {lista.length === 0 ? (
                        <p className="mt-2 text-[12px] text-neutral-600">Nenhuma unidade aqui.</p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {lista.map((l) => (
                            <Link key={l.contaId} href={`/unidade/${l.contaId}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[12px] text-neutral-200 hover:bg-white/[0.06]">
                              {curto(l.unidade)} <span className="text-neutral-500">· {R(l.gastoDia)}/dia · </span>
                              <span className={`font-semibold ${corIndice(l.indice)}`}>{l.indice}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                      <p className="mt-2.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-neutral-300">
                        <span className="font-semibold text-neutral-100">O que fazer: </span>
                        {QUADRANTES[q].acao}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-6">
              <h2 className="font-display text-base font-bold">Destaques {nomePeriodo}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <CartaoTop titulo="Quem mais investe" explica="Valor gasto em anúncios no período e a fatia de cada unidade no total da rede." lista={porGasto} valor={(l) => `${R0(l.gasto)} · ${P(l.participacao, 0)}`} vazio="Nenhum investimento no período." />
                <CartaoTop titulo="Quem mais rende por real" explica="Índice geral: 100 é a mediana da rede, 130 quer dizer que cada real rende 30% a mais." lista={comIndice} valor={(l) => `índice ${l.indice}`} vazio="Poucas unidades com volume para comparar." />
                <CartaoTop titulo="Quem mais melhorou" explica={`Variação do índice em relação aos ${dias} dias anteriores.`} lista={porEvolucao} valor={(l) => `${sinal(l.evolucao ?? 0)} pts`} vazio="Sem índice nos dois períodos para comparar." />
                <CartaoTop
                  titulo="Mais cresceu no Instagram"
                  explica={`Seguidores ganhos no período, em % (soma orgânico e anúncios).${seguidoresIncompleto ? " Só entram unidades com histórico guardado cobrindo o período inteiro." : ""}`}
                  lista={porSeguidores}
                  valor={(l) => `${sinal(l.seguidores?.ganho ?? 0)} · ${P(l.crescimentoSeguidores ?? 0)}`}
                  vazio="O histórico de seguidores guardado ainda não cobre esse período inteiro."
                />
                <CartaoTop titulo="Engajamento mais barato" explica="Custo por engajamento (mínimo de 50 engajamentos no período)." lista={porEngajamento} valor={(l) => R(l.t.custoEngajamento)} vazio="Poucas unidades com volume de engajamento." />
                <CartaoTop titulo="Visita ao perfil mais barata" explica="Custo por visita ao perfil vinda do anúncio (mínimo de 10 visitas)." lista={porVisita} valor={(l) => R(l.t.custoVisita)} vazio="Poucas unidades com visitas suficientes." />
                <CartaoTop titulo="Alcance mais barato" explica="Custo por mil pessoas alcançadas (mínimo de mil pessoas)." lista={porAlcance} valor={(l) => R(l.t.custoMilAlcance)} vazio="Poucas unidades com alcance suficiente." />
              </div>
            </section>

            <section className="cartao-vidro mt-6 overflow-x-auto p-4">
              <h2 className="font-display text-base font-bold">Ranking geral</h2>
              <p className="mt-0.5 text-[11px] text-neutral-500">Ordenado pelo índice (rendimento por real). Verde = bem acima da mediana; amarelo = bem abaixo.</p>
              <table className="mt-3 w-full min-w-[980px] text-left text-[12.5px]">
                <thead className="text-[10.5px] uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="py-2 pr-2 font-medium">#</th>
                    <th className="py-2 pr-2 font-medium">Unidade</th>
                    <th className="py-2 pr-3 font-medium">Investido</th>
                    <th className="py-2 text-right font-medium">Por dia</th>
                    <th className="py-2 text-right font-medium">Índice</th>
                    <th className="py-2 text-right font-medium">vs ant.</th>
                    <th className="py-2 text-right font-medium">Alcance</th>
                    <th className="py-2 text-right font-medium">Engajam.</th>
                    <th className="py-2 text-right font-medium">Visitas</th>
                    <th className="py-2 text-right font-medium">R$/engaj.</th>
                    <th className="py-2 text-right font-medium">Seguidores</th>
                    <th className="py-2 pl-3 font-medium">Leitura</th>
                  </tr>
                </thead>
                <tbody>
                  {[...comIndice, ...semDados].map((l, n) => (
                    <tr key={l.contaId} className={`border-t border-white/5 ${l.indice === null ? "text-neutral-500" : "text-neutral-300"}`}>
                      <td className="py-2 pr-2 tabular-nums text-neutral-500">{l.indice !== null ? `${n + 1}º` : "—"}</td>
                      <td className="py-2 pr-2">
                        <Link href={`/unidade/${l.contaId}`} className="font-medium text-neutral-100 hover:underline">{curto(l.unidade)}</Link>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="w-20 shrink-0 tabular-nums">{R0(l.gasto)}</span>
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
                            <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round((l.gasto / maiorGasto) * 100)}%` }} />
                          </span>
                          <span className="w-9 text-[11px] tabular-nums text-neutral-500">{P(l.participacao, 0)}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right tabular-nums">{R(l.gastoDia)}</td>
                      <td className={`py-2 text-right font-bold tabular-nums ${corIndice(l.indice)}`}>{l.indice ?? "—"}</td>
                      <td className={`py-2 text-right tabular-nums ${l.evolucao === null ? "text-neutral-600" : l.evolucao >= 10 ? "text-ok" : l.evolucao <= -10 ? "text-amber-300" : ""}`}>{l.evolucao === null ? "—" : sinal(l.evolucao)}</td>
                      <td className="py-2 text-right tabular-nums">{I(l.m.alcance)}</td>
                      <td className="py-2 text-right tabular-nums">{I(l.m.interacoes)}</td>
                      <td className="py-2 text-right tabular-nums">{I(l.m.visitasPerfil ?? 0)}</td>
                      <td className="py-2 text-right tabular-nums">{R(l.t.custoEngajamento)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {l.seguidores?.ganho != null ? (
                          <span title={!l.seguidores.completo && l.seguidores.desde ? `Histórico desde ${dataBR(l.seguidores.desde)}` : undefined}>
                            {sinal(l.seguidores.ganho)}
                            {l.crescimentoSeguidores !== null && <span className="text-[11px] text-neutral-500"> ({P(l.crescimentoSeguidores)})</span>}
                            {!l.seguidores.completo && <span className="text-neutral-600">*</span>}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pl-3">
                        {l.quadrante ? (
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${COR_QUADRANTE[l.quadrante].etiqueta}`}>{ROTULO_CURTO[l.quadrante]}</span>
                        ) : (
                          <span className="text-[11px] text-neutral-500">{l.semDados}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10.5px] leading-relaxed text-neutral-600">
                Investido = gasto em anúncios {escopo === "boost" ? "só nas campanhas de boost" : "em todas as campanhas da conta"}. O índice só existe para unidades que investiram pelo menos {R0(ranking.minimoGasto)} e têm volume em pelo menos duas
                métricas. Alcance é a soma das campanhas (a mesma pessoa em duas campanhas conta duas vezes). Seguidores somam orgânico e anúncios, contados até hoje
                {seguidoresIncompleto ? "; * = o histórico guardado dessa unidade ainda é menor que o período" : ""}.
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}
