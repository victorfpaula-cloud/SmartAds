import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { coletarFinanceiro, calcularPlanejamento, unicasPorContaDeAnuncio, type ContaFinanceiro } from "@/lib/financeiro/coletarFinanceiro";
import { Wallet, Info, ChartLine } from "@phosphor-icons/react/dist/ssr";
import { calcularPrevisaoSaldo, type NivelPrevisao } from "@/lib/financeiro/previsaoSaldo";
import EditarSaldo from "./EditarSaldo";
import EditarOrcamentoMensal from "./EditarOrcamentoMensal";
import AtualizarAgora from "./AtualizarAgora";
import { descreverSituacaoConta, type TomSituacao } from "@/lib/financeiro/situacaoConta";

export const dynamic = "force-dynamic";

const FILTRO_REDE = "franquia";

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function reais(centavos: number) {
  return formatoReal.format(centavos / 100);
}

function formatarAtualizacao(iso: string | null): string {
  if (!iso) return "Ainda sem dados — aguardando a primeira atualização automática";
  const horas = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (horas < 1) return "Atualizado há menos de 1h";
  if (horas < 24) return `Atualizado há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `Atualizado há ${dias} dia${dias !== 1 ? "s" : ""}`;
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: { rede?: string; empresa?: string };
}) {
  const apenasRede = searchParams.rede === FILTRO_REDE;
  const todasContas = await coletarFinanceiro();
  const empresaId = searchParams.empresa;
  const empresaFiltro = empresaId ? todasContas.find((c) => c.empresaId === empresaId) : undefined;
  const contas = empresaFiltro
    ? todasContas.filter((c) => c.empresaId === empresaId)
    : apenasRede
      ? todasContas.filter((c) => c.empresaTipo === "franquia")
      : todasContas;

  // Totais contam cada conta de anúncio da Meta uma vez só (duas contas locais podem apontar pra mesma).
  const contasUnicas = unicasPorContaDeAnuncio(contas);
  const totalSaldoDisponivel = contasUnicas.reduce((s, c) => s + (c.saldoDisponivelCentavos ?? 0), 0);
  const totalGasto7d = contasUnicas.reduce((s, c) => s + c.gasto7diasCentavos, 0);
  const totalGastoMes = contasUnicas.reduce((s, c) => s + (c.gastoMesCentavos ?? 0), 0);
  const contasComProblema = contasUnicas.filter((c) => {
    const status = descreverSituacaoConta(c.statusConta, c.motivoDesativacao);
    return status.tom === "critico" || status.tom === "atencao";
  });
  // Contas cujo saldo acaba em até 7 dias (ou já zerou) no ritmo atual de gasto.
  const contasSaldoAcabando = contasUnicas.filter((c) => {
    const previsao = calcularPrevisaoSaldo(c.saldoDisponivelCentavos, c.mediaDiariaCentavos);
    return previsao.dias !== null && previsao.dias <= 7;
  }).length;
  const semSaldoConfigurado = contas.filter((c) => c.saldoDisponivelCentavos === null && !c.erro).length;

  // Planejamento (orçamento mensal x reservado pro boost x sobra pra campanhas extras) só faz
  // sentido pra rede de franquia — é onde existe o teto combinado (ex: R$500/unidade).
  const planejamentoPorConta = new Map(contas.map((c) => [c.contaId, calcularPlanejamento(c)]));
  const totalOrcamentoMensal = contasUnicas.reduce((s, c) => s + c.orcamentoMensalCentavos, 0);
  const totalBoostReservado = contasUnicas.reduce(
    (s, c) => s + (planejamentoPorConta.get(c.contaId)?.boostReservadoMensalCentavos ?? 0),
    0
  );
  const totalProjecao = contasUnicas.reduce((s, c) => s + c.projecaoMensalCentavos, 0);
  const unidadesEstourando = contasUnicas.filter((c) => planejamentoPorConta.get(c.contaId)?.estourou).length;

  return (
    <>
      <Cabecalho
        ativo="/financeiro"
        rede={apenasRede}
        geralHref="/financeiro"
        empresa={empresaFiltro && empresaId ? { id: empresaId, nome: empresaFiltro.empresaNome } : undefined}
      />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        {apenasRede && (
          <Link href="/estrategias" className="text-xs text-neutral-500 hover:text-neutral-300">
            ← Central da rede
          </Link>
        )}
        <div className="mt-1 flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300">
            <Wallet size={16} weight="fill" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">{empresaFiltro ? `Financeiro · ${empresaFiltro.empresaNome}` : apenasRede ? "Financeiro da rede" : "Financeiro"}</h1>
            <p className="mt-0.5 text-sm text-neutral-400">
              {apenasRede
                ? "Só as unidades de franquia — pra ver tudo, inclusive empresas individuais, use Financeiro no menu."
                : "Saldo disponível de cada conta e ritmo de gasto. Atualiza sozinho 1x por dia."}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
          <Link
            href="/financeiro/investimentos"
            className="rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:bg-accent-strong"
          >
            Investimento por unidade
          </Link>
          <AtualizarAgora rotulo="Atualizar todas agora" />
        </div>

        {contasComProblema.length > 0 && (
          <div className="cartao-vidro mt-3 border border-danger/30 bg-danger/5 px-4 py-3 text-xs text-neutral-200">
            <p className="font-semibold text-danger">
              {contasComProblema.length} conta{contasComProblema.length !== 1 ? "s" : ""} com a situação na Meta
              pedindo atenção
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5 text-neutral-300">
              {contasComProblema.map((c) => {
                const st = descreverSituacaoConta(c.statusConta, c.motivoDesativacao);
                return (
                  <li key={c.contaId}>
                    <a href={`#conta-${c.contaId}`} className="font-medium underline-offset-2 hover:underline">
                      {c.clienteNome} · {c.contaNome}
                    </a>
                    : {st.texto}
                    {st.detalhe ? ` — ${st.detalhe}` : ""}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="cartao-vidro mt-4 flex items-start gap-2.5 border border-white/10 px-4 py-3 text-xs text-neutral-400">
          <Info size={15} className="mt-0.5 shrink-0 text-neutral-500" />
          <p>
            O saldo vem da forma de pagamento da conta na Meta — o mesmo texto que o Gerenciador mostra
            (ex.: "Saldo disponível (R$ 115,81)"), atualizado 1x por dia. Conta com cartão não tem
            saldo pra ler: nela vale o valor que você digitar, que o cron ajusta sozinho com o que
            entrar e sair desde então.
          </p>
        </div>

        {semSaldoConfigurado > 0 && (
          <div className="cartao-vidro mt-3 border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
            {semSaldoConfigurado} conta{semSaldoConfigurado !== 1 ? "s" : ""} ainda sem saldo
            configurado — abra o Gerenciador de Anúncios, veja o valor em "Fundos" e digite abaixo,
            em cada conta.
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="cartao-vidro px-4 py-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Saldo disponível (total)</p>
            <p className="mt-1 text-lg font-bold text-neutral-100">{reais(totalSaldoDisponivel)}</p>
          </div>
          <div className="cartao-vidro px-4 py-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Gasto últimos 7 dias</p>
            <p className="mt-1 text-lg font-bold text-neutral-100">{reais(totalGasto7d)}</p>
          </div>
          <div className="cartao-vidro px-4 py-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Gasto no mês</p>
            <p className="mt-1 text-lg font-bold text-neutral-100">{reais(totalGastoMes)}</p>
          </div>
          <div className="cartao-vidro px-4 py-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Saldo acabando (até 7 dias)</p>
            <p className={`mt-1 text-lg font-bold ${contasSaldoAcabando > 0 ? "text-danger" : "text-ok"}`}>
              {contasSaldoAcabando} {contasSaldoAcabando === 1 ? "conta" : "contas"}
            </p>
          </div>
        </div>

        {apenasRede && contas.length > 0 && (
          <section className="cartao-vidro mt-6 overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-3.5">
              <ChartLine size={16} className="shrink-0 text-neutral-400" />
              <div>
                <h2 className="text-sm font-semibold text-neutral-200">Planejamento</h2>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  Estimativa a partir do orçamento diário do boost já configurado — não é gasto real
                  campanha por campanha.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">Orçamento mensal (rede)</p>
                <p className="mt-0.5 text-sm font-semibold text-neutral-200">{reais(totalOrcamentoMensal)}</p>
              </div>
              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">Reservado pro boost</p>
                <p className="mt-0.5 text-sm font-semibold text-neutral-200">{reais(totalBoostReservado)}</p>
              </div>
              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">Projeção total do mês</p>
                <p className="mt-0.5 text-sm font-semibold text-neutral-200">{reais(totalProjecao)}</p>
              </div>
              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">Unidades estourando o teto</p>
                <p className={`mt-0.5 text-sm font-semibold ${unidadesEstourando > 0 ? "text-danger" : "text-ok"}`}>
                  {unidadesEstourando}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border-t border-white/10">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-3 font-medium">Unidade</th>
                    <th className="px-4 py-3 font-medium">Orçamento mensal</th>
                    <th className="px-4 py-3 font-medium">Reservado pro boost</th>
                    <th className="px-4 py-3 font-medium">Sobra pra extras</th>
                    <th className="px-4 py-3 font-medium">Projeção total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {contas.map((conta) => {
                    const p = planejamentoPorConta.get(conta.contaId)!;
                    return (
                      <tr key={conta.contaId}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-neutral-100">{conta.clienteNome}</p>
                          <p className="text-[10.5px] text-neutral-600">{conta.contaNome}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-neutral-300">{reais(conta.orcamentoMensalCentavos)}</p>
                          <EditarOrcamentoMensal
                            contaId={conta.contaId}
                            orcamentoAtualCentavos={conta.orcamentoMensalCentavos}
                          />
                        </td>
                        <td className="px-4 py-3 text-neutral-300">
                          {conta.boostAutomaticoAtivo ? reais(p.boostReservadoMensalCentavos) : "Boost desligado"}
                        </td>
                        <td className={`px-4 py-3 ${p.sobraParaExtrasCentavos < 0 ? "text-danger" : "text-neutral-300"}`}>
                          {reais(p.sobraParaExtrasCentavos)}
                        </td>
                        <td className={`px-4 py-3 font-medium ${p.estourou ? "text-danger" : "text-neutral-300"}`}>
                          {reais(conta.projecaoMensalCentavos)}
                          {p.estourou && <span className="ml-1.5 text-[10px] font-semibold uppercase">Estourando</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {contas.length === 0 ? (
          <p className="cartao-vidro mt-6 px-5 py-8 text-center text-sm text-neutral-500">
            Nenhuma conta de anúncio ativa ainda.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {contas.map((conta) => (
              <div
                key={conta.contaId}
                id={`conta-${conta.contaId}`}
                className="cartao-vidro overflow-hidden border border-white/10 scroll-mt-20"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-semibold text-neutral-100">{conta.contaNome}</p>
                    <p className="text-[11px] text-neutral-500">
                      {conta.empresaNome} · {conta.clienteNome} · {formatarAtualizacao(conta.atualizadoEm)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SituacaoChip conta={conta} />
                    <AtualizarAgora contaId={conta.contaId} />
                    <a
                      href={conta.linkAdicionarCredito}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong"
                    >
                      Ver faturamento na Meta
                    </a>
                  </div>
                </div>

                {conta.erro ? (
                  <p className="px-5 py-4 text-xs text-danger">{conta.erro}</p>
                ) : (
                  <div className="flex flex-col gap-3 px-5 py-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      <div>
                        <p className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">Saldo disponível</p>
                        <p className="mt-0.5 text-sm font-semibold text-accent-strong">
                          {conta.saldoDisponivelCentavos !== null ? reais(conta.saldoDisponivelCentavos) : "—"}
                        </p>
                        {conta.fontePagamentoTexto && (
                          <p className="mt-0.5 text-[10px] text-neutral-500">Meta: {conta.fontePagamentoTexto}</p>
                        )}
                      </div>
                      <Metrica rotulo="Gasto 7 dias" valor={reais(conta.gasto7diasCentavos)} />
                      <Metrica rotulo="Média diária" valor={reais(conta.mediaDiariaCentavos)} />
                      <Metrica rotulo="Projeção mensal" valor={reais(conta.projecaoMensalCentavos)} />
                      <PrevisaoDoSaldo
                        previsao={calcularPrevisaoSaldo(conta.saldoDisponivelCentavos, conta.mediaDiariaCentavos)}
                      />
                    </div>
                    <MinimoDoMes conta={conta} />
                    <EditarSaldo contaId={conta.contaId} saldoAtualCentavos={conta.saldoDisponivelCentavos} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

const TOM_SITUACAO: Record<TomSituacao, string> = {
  ok: "border-ok/30 bg-ok/10 text-ok",
  atencao: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  critico: "border-danger/30 bg-danger/10 text-danger",
  neutro: "border-white/10 bg-white/[0.04] text-neutral-400",
};

function SituacaoChip({ conta }: { conta: ContaFinanceiro }) {
  const st = descreverSituacaoConta(conta.statusConta, conta.motivoDesativacao);
  return (
    <span
      title={st.detalhe ?? undefined}
      className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${TOM_SITUACAO[st.tom]}`}
    >
      {st.texto}
    </span>
  );
}

const formatoDiaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

/** Quanto a unidade recarregou e gastou neste mês frente ao mínimo combinado (o orçamento mensal
 * da conta). A recarga vem de um ledger diário (a Meta só guarda ~6 dias de atividades), então diz
 * desde quando está contando. */
function MinimoDoMes({ conta }: { conta: ContaFinanceiro }) {
  const minimo = conta.orcamentoMensalCentavos;
  const recarga = conta.recargaMesCentavos;
  const pct = recarga !== null && minimo > 0 ? Math.min(100, Math.round((recarga / minimo) * 100)) : null;
  const desde = conta.recargaContadaDesde ? formatoDiaMes.format(new Date(`${conta.recargaContadaDesde}T00:00:00Z`)) : null;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11.5px]">
        <span className="text-neutral-400">
          Recarregado no mês:{" "}
          <span className="font-semibold text-neutral-100">{recarga !== null ? reais(recarga) : "—"}</span>
          <span className="text-neutral-500"> de {reais(minimo)} (mínimo)</span>
        </span>
        <span className="text-neutral-400">
          Gasto no mês:{" "}
          <span className="font-semibold text-neutral-100">
            {conta.gastoMesCentavos !== null ? reais(conta.gastoMesCentavos) : "—"}
          </span>
        </span>
      </div>
      {pct !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full ${pct >= 100 ? "bg-ok" : "bg-accent"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-1.5 text-[10px] text-neutral-500">
        {conta.recargaErro
          ? `Não consegui ler as recargas na Meta: ${conta.recargaErro}`
          : desde
            ? `Recargas contadas desde ${desde} (a Meta só guarda ~6 dias de histórico; o total soma a cada atualização).`
            : "Recargas ainda não contadas — clique em Atualizar agora."}
      </p>
    </div>
  );
}

const TOM_PREVISAO: Record<NivelPrevisao, string> = {
  critico: "text-danger",
  atencao: "text-amber-400",
  ok: "text-ok",
  neutro: "text-neutral-200",
};

function PrevisaoDoSaldo({ previsao }: { previsao: ReturnType<typeof calcularPrevisaoSaldo> }) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">Saldo acaba em</p>
      <p className={`mt-0.5 text-sm font-semibold ${TOM_PREVISAO[previsao.nivel]}`}>{previsao.texto}</p>
      {previsao.detalhe && <p className="mt-0.5 text-[10px] text-neutral-500">{previsao.detalhe}</p>}
    </div>
  );
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">{rotulo}</p>
      <p className="mt-0.5 text-sm font-semibold text-neutral-200">{valor}</p>
    </div>
  );
}
