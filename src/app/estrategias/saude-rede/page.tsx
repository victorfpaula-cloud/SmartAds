import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { exigirAmbiente } from "@/lib/ambiente";
import { carregarSaudeRede, PERIODOS_SAUDE_REDE, type ParteOrganicoTrafego, type ResumoRede } from "@/lib/saudeRede";
import { formatarDiaExibicao } from "@/lib/tempoSaoPaulo";
import { carregarHistoricoSeguidores, type GanhoSeguidores } from "@/lib/seguidoresHistorico";
import BotaoAtualizarSaude from "./BotaoAtualizarSaude";

export const dynamic = "force-dynamic";

const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const real = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compacto = (v: number) => (v >= 10_000 ? new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v) : n0.format(v));
const dataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function Divisao({ parte, unidadesComIg }: { parte: ParteOrganicoTrafego | null; unidadesComIg: number }) {
  if (!parte || parte.total <= 0) return <p className="mt-2 text-[11px] text-neutral-600">Orgânico × tráfego: a Meta não separou.</p>;
  const pctTrafego = Math.round((parte.trafego / parte.total) * 100);
  return (
    <div className="mt-2">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="bg-emerald-400/80" style={{ width: `${100 - pctTrafego}%` }} />
        <div className="bg-sky-400/80" style={{ width: `${pctTrafego}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-neutral-500">
        <span className="text-emerald-300">{compacto(parte.organico)} orgânico</span> · <span className="text-sky-300">{compacto(parte.trafego)} tráfego ({pctTrafego}%)</span>
      </p>
      {(parte.unidades < unidadesComIg || parte.limitadas > 0) && (
        <p className="mt-0.5 text-[10.5px] text-neutral-600">
          Divisão de {compacto(parte.total)} em {parte.unidades} de {unidadesComIg} unidades
          {parte.limitadas > 0 ? ` · em ${parte.limitadas} os anúncios informam mais que o total do Instagram (limitado ao total)` : ""}.
        </p>
      )}
    </div>
  );
}

function Kpi({ rotulo, valor, nota, children }: { rotulo: string; valor: string; nota?: string; children?: React.ReactNode }) {
  return (
    <div className="cartao-vidro p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{rotulo}</p>
      <p className="mt-1 font-display text-2xl font-bold text-neutral-100">{valor}</p>
      {nota && <p className="mt-0.5 text-[11.5px] text-neutral-500">{nota}</p>}
      {children}
    </div>
  );
}

function Barras({ serie }: { serie: ResumoRede["serieDiaria"] }) {
  if (serie.length === 0) return null;
  const max = Math.max(...serie.map((s) => s.alcance), 1);
  return (
    <div className="mt-4">
      <p className="text-[11px] font-semibold text-neutral-500">Alcance dos anúncios por dia (todas as unidades)</p>
      <div className="mt-2 flex h-20 items-end gap-[3px]">
        {serie.map((s) => (
          <div key={s.dia} className="group relative flex-1">
            <div className="w-full rounded-sm bg-sky-400/70" style={{ height: `${Math.max((s.alcance / max) * 100, 2)}%` }} title={`${formatarDiaExibicao(s.dia)}: ${n0.format(s.alcance)} alcançados · ${real.format(s.gasto)}`} />
          </div>
        ))}
      </div>
    </div>
  );
}


function notaGanho(g: GanhoSeguidores): string {
  if (g.ganho === null) return "sem leitura";
  return g.completo ? "no período" : g.desde ? `desde ${formatarDiaExibicao(g.desde)} (histórico curto)` : "";
}

function BarrasSeguidores({ serie }: { serie: Array<{ dia: string; total: number }> }) {
  if (serie.length < 2) return <p className="text-xs text-neutral-500">Precisa de pelo menos 2 dias de leitura para o gráfico.</p>;
  const min = Math.min(...serie.map((s) => s.total));
  const max = Math.max(...serie.map((s) => s.total));
  const faixa = Math.max(max - min, 1);
  return (
    <div>
      <p className="text-[11px] font-semibold text-neutral-500">
        Total de seguidores da rede, dia a dia ({n0.format(min)} → {n0.format(max)})
      </p>
      <div className="mt-2 flex h-24 items-end gap-[2px]">
        {serie.map((s) => (
          <div key={s.dia} className="flex-1 rounded-sm bg-emerald-400/70" style={{ height: `${10 + ((s.total - min) / faixa) * 90}%` }} title={`${formatarDiaExibicao(s.dia)}: ${n0.format(s.total)}`} />
        ))}
      </div>
    </div>
  );
}

export default async function SaudeDaRedePage({ searchParams }: { searchParams: { dias?: string } }) {
  const ambiente = await exigirAmbiente("franquia");
  const dias = PERIODOS_SAUDE_REDE.find((p) => String(p.dias) === searchParams.dias)?.dias ?? 30;
  const [r, hist] = await Promise.all([carregarSaudeRede(ambiente.id, dias), carregarHistoricoSeguidores(ambiente.id)]);
  const linhas = [...r.linhas].sort((a, b) => (b.alcance ?? -1) - (a.alcance ?? -1));
  const maxAlcance = Math.max(...linhas.map((l) => l.alcance ?? 0), 1);
  const unidadesIg = r.linhas.filter((l) => l.status === "ok").length;
  const semDados = r.linhas.filter((l) => l.status === "sem_dados").length;
  const unidadesContadas = r.unidadesTotal - r.linhas.filter((l) => l.status === "repetida").length;
  const comErro = r.linhas.filter((l) => l.status === "erro");

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Saúde da rede · {ambiente.nome}</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-400">
              A soma de todas as unidades: alcance, visualizações, interações e seguidores (Instagram, orgânico + tráfego) e o
              que os anúncios estão entregando. Os números ficam guardados — clique em Atualizar para buscar de novo na Meta.
            </p>
            <p className="mt-1 text-[11px] text-neutral-600">
              {r.atualizadoEm ? `Dados de ${dataHora(r.atualizadoEm)} · ${r.unidadesComDados} de ${unidadesContadas} unidades` : "Ainda sem dados nesse período."}
            </p>
          </div>
          <BotaoAtualizarSaude key={dias} contaIds={r.linhas.filter((l) => l.status !== "repetida").map((l) => l.contaId)} dias={dias} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {PERIODOS_SAUDE_REDE.map((p) => (
            <Link
              key={p.dias}
              href={`/estrategias/saude-rede?dias=${p.dias}`}
              className={
                p.dias === dias
                  ? "pilula-ativa rounded-lg px-5 py-2.5 text-sm font-semibold text-neutral-100"
                  : "rounded-lg bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-200"
              }
            >
              {p.rotulo} <span className="text-[11px] font-normal text-neutral-500">· {p.detalhe}</span>
            </Link>
          ))}
        </div>

        {r.unidadesComDados === 0 ? (
          <p className="cartao-vidro mt-6 px-5 py-8 text-center text-sm text-neutral-400">
            Nenhum número guardado para {PERIODOS_SAUDE_REDE.find((p) => p.dias === dias)?.detalhe}. Clique em <strong>Atualizar dados</strong> — leva
            cerca de {Math.max(1, Math.round(r.unidadesTotal * 0.4))} minuto(s), uma unidade por vez.
          </p>
        ) : (
          <>
            <h2 className="mt-8 text-sm font-semibold text-neutral-300">Instagram da rede (orgânico + tráfego)</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Kpi rotulo="Alcance" valor={compacto(r.alcance)} nota="soma das unidades — a mesma pessoa pode estar em mais de uma">
                <Divisao parte={r.divisao.alcance} unidadesComIg={unidadesIg} />
              </Kpi>
              <Kpi rotulo="Visualizações" valor={compacto(r.visualizacoes)} nota="vezes que o conteúdo foi visto">
                <Divisao parte={r.divisao.visualizacoes} unidadesComIg={unidadesIg} />
              </Kpi>
              <Kpi
                rotulo="Interações"
                valor={compacto(r.interacoes)}
                nota={`${compacto(r.curtidas)} curtidas · ${compacto(r.comentarios)} comentários · ${compacto(r.compartilhamentos)} compart. · ${compacto(r.salvamentos)} salvos`}
              >
                <Divisao parte={r.divisao.interacoes} unidadesComIg={unidadesIg} />
              </Kpi>
              <Kpi rotulo="Novos seguidores" valor={`+${n0.format(r.novosSeguidores)}`} nota={`${compacto(r.seguidores)} seguidores somando todas as unidades`} />
              <Kpi rotulo="Visitas ao perfil" valor={compacto(r.visitasPerfil)} />
              <Kpi
                rotulo="Posts publicados"
                valor={n0.format(r.posts)}
                nota={r.unidadesComDados > 0 ? `${n1.format(r.posts / r.unidadesComDados)} por unidade no período` : undefined}
              />
            </div>
            {r.taxaEngajamento !== null && (
              <p className="mt-3 text-xs text-neutral-400">
                Taxa de interação da rede: <strong className="text-neutral-200">{n1.format(r.taxaEngajamento)}</strong> interações a cada 100 pessoas
                alcançadas.
              </p>
            )}

            <h2 className="mt-8 text-sm font-semibold text-neutral-300">Anúncios (tráfego pago)</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi rotulo="Investido" valor={real.format(r.anuncios.gasto)} nota={`${r.anuncios.unidadesInvestindo} de ${r.unidadesComDados} unidades investiram${r.anuncios.gastoForaInstagram > 0 ? ` · ${real.format(r.anuncios.gastoForaInstagram)} rodou fora do Instagram` : ""}`} />
              <Kpi rotulo="Alcance pago" valor={compacto(r.anuncios.alcance)} nota={[r.anuncios.alcanceInstagram !== r.anuncios.alcance ? `${compacto(r.anuncios.alcanceInstagram)} no Instagram` : null, r.anuncios.custoPorMilAlcancados !== null ? `${real.format(r.anuncios.custoPorMilAlcancados)} a cada mil` : null].filter(Boolean).join(" · ") || undefined} />
              <Kpi rotulo="Engajamento pago" valor={compacto(r.anuncios.engajamentos)} nota={r.anuncios.custoPorEngajamento !== null ? `${real.format(r.anuncios.custoPorEngajamento)} por engajamento` : undefined} />
              <Kpi rotulo="Cliques no link" valor={compacto(r.anuncios.cliquesNoLink)} nota={r.anuncios.cpm !== null ? `CPM ${real.format(r.anuncios.cpm)}` : undefined} />
            </div>
            <div className="cartao-vidro mt-3 p-4">
              <Barras serie={r.serieDiaria} />
              {r.serieDiaria.length === 0 && <p className="text-xs text-neutral-500">Sem evolução diária de anúncios nesse período.</p>}
            </div>
          </>
        )}


        <h2 className="mt-8 text-sm font-semibold text-neutral-300">Seguidores — histórico da rede</h2>
        <p className="mt-1 text-xs text-neutral-500">
          A Meta só informa novos seguidores dos últimos 30 dias. Por isso o SmartAds guarda o total de cada Instagram todo dia (e
          reconstruiu os últimos 30 dias na primeira leitura) — assim dá para comparar períodos maiores, e o histórico só cresce.
        </p>
        {hist.total === null ? (
          <p className="cartao-vidro mt-3 px-5 py-6 text-sm text-neutral-400">Sem leituras ainda. Clique em Atualizar dados — o histórico começa na hora.</p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi rotulo="Seguidores hoje" valor={compacto(hist.total)} nota={hist.primeiroDia ? `histórico desde ${formatarDiaExibicao(hist.primeiroDia)}` : undefined} />
              {hist.ganhos.map((g) => (
                <Kpi key={g.dias} rotulo={`Em ${g.dias} dias`} valor={g.ganho === null ? "—" : `${g.ganho >= 0 ? "+" : ""}${n0.format(g.ganho)}`} nota={notaGanho(g)} />
              ))}
            </div>
            <div className="cartao-vidro mt-3 p-4">
              <BarrasSeguidores serie={hist.serie} />
            </div>
            <div className="cartao-vidro mt-3 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-4 py-3 font-medium">Unidade</th>
                      <th className="px-4 py-3 font-medium">Hoje</th>
                      <th className="px-4 py-3 font-medium">7 dias</th>
                      <th className="px-4 py-3 font-medium">30 dias</th>
                      <th className="px-4 py-3 font-medium">90 dias</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {hist.porUnidade.map((u) => (
                      <tr key={u.unidade}>
                        <td className="px-4 py-2.5 text-neutral-100">{u.unidade}</td>
                        <td className="px-4 py-2.5 text-neutral-300">{u.total !== null ? compacto(u.total) : "—"}</td>
                        {[7, 30, 90].map((d) => {
                          const g = u.ganhos[d];
                          return (
                            <td key={d} className="px-4 py-2.5 text-neutral-300" title={notaGanho(g)}>
                              {g.ganho === null ? "—" : `${g.ganho >= 0 ? "+" : ""}${n0.format(g.ganho)}`}
                              {g.ganho !== null && !g.completo && <span className="text-neutral-600"> *</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-neutral-600">
              * histórico ainda mais curto que o período — o número vale desde a primeira leitura. Ganho líquido (entradas menos quem deixou de seguir).
              Dias reconstruídos são aproximados; as leituras diárias daqui para frente são exatas.
            </p>
          </>
        )}

        <h2 className="mt-8 text-sm font-semibold text-neutral-300">Por unidade</h2>
        <div className="cartao-vidro mt-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3 font-medium">Unidade</th>
                  <th className="px-4 py-3 font-medium">Alcance</th>
                  <th className="px-4 py-3 font-medium">Visualiz.</th>
                  <th className="px-4 py-3 font-medium">Interações</th>
                  <th className="px-4 py-3 font-medium">Taxa</th>
                  <th className="px-4 py-3 font-medium">Posts</th>
                  <th className="px-4 py-3 font-medium">Novos seg.</th>
                  <th className="px-4 py-3 font-medium">Investido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {linhas.map((l) => (
                  <tr key={l.contaId}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-100">{l.unidade}</p>
                      {l.instagram && <p className="text-[10.5px] text-neutral-600">@{l.instagram}</p>}
                    </td>
                    {l.status === "ok" ? (
                      <>
                        <td className="px-4 py-3">
                          <p className="text-neutral-200">{l.alcance !== null ? compacto(l.alcance) : "—"}</p>
                          <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full bg-sky-400/70" style={{ width: `${((l.alcance ?? 0) / maxAlcance) * 100}%` }} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-neutral-300">{l.visualizacoes !== null ? compacto(l.visualizacoes) : "—"}</td>
                        <td className="px-4 py-3 text-neutral-300">{l.interacoes !== null ? compacto(l.interacoes) : "—"}</td>
                        <td className="px-4 py-3 text-neutral-300">{l.taxaEngajamento !== null ? `${n1.format(l.taxaEngajamento)}%` : "—"}</td>
                        <td className="px-4 py-3 text-neutral-300">{l.posts ?? "—"}</td>
                        <td className="px-4 py-3 text-neutral-300">{l.novosSeguidores !== null ? `+${n0.format(l.novosSeguidores)}` : "—"}</td>
                        <td className="px-4 py-3 text-neutral-300">{l.gasto > 0 ? real.format(l.gasto) : "—"}</td>
                      </>
                    ) : (
                      <td colSpan={7} className="px-4 py-3 text-xs text-neutral-500">
                        {l.status === "sem_dados" && "Ainda sem números — clique em Atualizar dados."}
                        {l.status === "erro" && <span className="text-amber-400">Não veio da Meta: {l.mensagem}</span>}
                        {l.status === "repetida" && l.mensagem}
                        {l.status === "sem_instagram" && `Sem Instagram conectado${l.gasto > 0 ? ` · investiu ${real.format(l.gasto)}` : ""}.`}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {(semDados > 0 || comErro.length > 0) && r.unidadesComDados > 0 && (
          <p className="mt-2 text-[11px] text-neutral-600">
            {semDados > 0 && `${semDados} unidade(s) ainda sem números nesse período. `}
            {comErro.length > 0 && `${comErro.length} deram erro na Meta — os totais acima não as incluem.`}
          </p>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-neutral-600">
          Como ler: os números do Instagram vêm dos insights de cada conta (orgânico + o que os anúncios trouxeram); “tráfego” é a parte
          atribuída aos anúncios e “orgânico” é a diferença. Novos seguidores só existem para os últimos 30 dias. O alcance somado pode
          contar a mesma pessoa em mais de uma unidade.
        </p>
      </main>
    </>
  );
}
