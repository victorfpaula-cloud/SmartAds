import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { coletarFinanceiro, calcularPlanejamento } from "@/lib/financeiro/coletarFinanceiro";
import { Wallet, Info, ChartLine } from "@phosphor-icons/react/dist/ssr";
import EditarSaldo from "./EditarSaldo";
import EditarOrcamentoMensal from "./EditarOrcamentoMensal";

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
  searchParams: { rede?: string };
}) {
  const apenasRede = searchParams.rede === FILTRO_REDE;
  const todasContas = await coletarFinanceiro();
  const contas = apenasRede ? todasContas.filter((c) => c.empresaTipo === "franquia") : todasContas;

  const totalSaldoDisponivel = contas.reduce((s, c) => s + (c.saldoDisponivelCentavos ?? 0), 0);
  const totalGasto7d = contas.reduce((s, c) => s + c.gasto7diasCentavos, 0);
  const totalPlanejado = contas.reduce((s, c) => s + c.investimentoPlanejadoCentavos, 0);
  const semSaldoConfigurado = contas.filter((c) => c.saldoDisponivelCentavos === null && !c.erro).length;

  // Planejamento (orçamento mensal x reservado pro boost x sobra pra campanhas extras) só faz
  // sentido pra rede de franquia — é onde existe o teto combinado (ex: R$500/unidade).
  const planejamentoPorConta = new Map(contas.map((c) => [c.contaId, calcularPlanejamento(c)]));
  const totalOrcamentoMensal = contas.reduce((s, c) => s + c.orcamentoMensalCentavos, 0);
  const totalBoostReservado = contas.reduce(
    (s, c) => s + (planejamentoPorConta.get(c.contaId)?.boostReservadoMensalCentavos ?? 0),
    0
  );
  const totalProjecao = contas.reduce((s, c) => s + c.projecaoMensalCentavos, 0);
  const unidadesEstourando = contas.filter((c) => planejamentoPorConta.get(c.contaId)?.estourou).length;

  return (
    <>
      <Cabecalho ativo="/financeiro" />
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
            <h1 className="font-display text-2xl font-bold">{apenasRede ? "Financeiro da rede" : "Financeiro"}</h1>
            <p className="mt-0.5 text-sm text-neutral-400">
              {apenasRede
                ? "Só as unidades de franquia — pra ver tudo, inclusive empresas individuais, use Financeiro no menu."
                : "Saldo disponível de cada conta e ritmo de gasto. Atualiza sozinho 1x por dia."}
            </p>
          </div>
        </div>

        <div className="cartao-vidro mt-4 flex items-start gap-2.5 border border-white/10 px-4 py-3 text-xs text-neutral-400">
          <Info size={15} className="mt-0.5 shrink-0 text-neutral-500" />
          <p>
            A Meta não deixa nenhum app externo ver o "Fundos" disponível de uma conta em nenhum
            campo — nem a fórmula que outras ferramentas usam pra contas pré-pagas funcionou pra
            vocês, e o histórico de cobranças/recargas só fica disponível uns 6 dias pra trás, sem
            dar pra reconstruir o saldo inteiro do zero. Por isso o SmartAds mantém um saldo
            próprio: você digita o valor real (visto no Gerenciador) uma vez, e a cada dia o cron
            ajusta sozinho somando só o que entrou/saiu desde então. Se algo sair do previsto
            (reembolso, cupom), é só corrigir na mão de novo.
          </p>
        </div>

        {semSaldoConfigurado > 0 && (
          <div className="cartao-vidro mt-3 border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
            {semSaldoConfigurado} conta{semSaldoConfigurado !== 1 ? "s" : ""} ainda sem saldo
            configurado — abra o Gerenciador de Anúncios, veja o valor em "Fundos" e digite abaixo,
            em cada conta.
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="cartao-vidro px-4 py-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Saldo disponível (total)</p>
            <p className="mt-1 text-lg font-bold text-neutral-100">{reais(totalSaldoDisponivel)}</p>
          </div>
          <div className="cartao-vidro px-4 py-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Gasto últimos 7 dias</p>
            <p className="mt-1 text-lg font-bold text-neutral-100">{reais(totalGasto7d)}</p>
          </div>
          <div className="cartao-vidro px-4 py-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Planejado, ainda não iniciado</p>
            <p className="mt-1 text-lg font-bold text-neutral-100">{reais(totalPlanejado)}</p>
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
                  <a
                    href={conta.linkAdicionarCredito}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong"
                  >
                    Ver faturamento na Meta
                  </a>
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
                      </div>
                      <Metrica rotulo="Gasto 7 dias" valor={reais(conta.gasto7diasCentavos)} />
                      <Metrica rotulo="Média diária" valor={reais(conta.mediaDiariaCentavos)} />
                      <Metrica rotulo="Projeção mensal" valor={reais(conta.projecaoMensalCentavos)} />
                      <Metrica
                        rotulo="Planejado + sugerido"
                        valor={reais(conta.investimentoPlanejadoCentavos + conta.ajusteOrcamentoSugeridoCentavos)}
                      />
                    </div>
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

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">{rotulo}</p>
      <p className="mt-0.5 text-sm font-semibold text-neutral-200">{valor}</p>
    </div>
  );
}
