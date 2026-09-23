import Cabecalho from "@/components/Cabecalho";
import { coletarFinanceiro } from "@/lib/financeiro/coletarFinanceiro";
import { Wallet, Info } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

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

export default async function FinanceiroPage() {
  const contas = await coletarFinanceiro();

  const totalSaldoDisponivel = contas.reduce((s, c) => s + (c.saldoDisponivelCentavos ?? 0), 0);
  const totalGasto7d = contas.reduce((s, c) => s + c.gasto7diasCentavos, 0);
  const totalPlanejado = contas.reduce((s, c) => s + c.investimentoPlanejadoCentavos, 0);

  return (
    <>
      <Cabecalho ativo="/financeiro" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300">
            <Wallet size={16} weight="fill" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Financeiro</h1>
            <p className="mt-0.5 text-sm text-neutral-400">
              Saldo disponível de cada conta na Meta e ritmo de gasto. Atualiza sozinho 1x por dia.
            </p>
          </div>
        </div>

        <div className="cartao-vidro mt-4 flex items-start gap-2.5 border border-white/10 px-4 py-3 text-xs text-neutral-400">
          <Info size={15} className="mt-0.5 shrink-0 text-neutral-500" />
          <p>
            Conta com fundo pré-pago (Pix/boleto): "Saldo disponível" é quanto ainda dá pra gastar
            antes de precisar carregar mais fundo — a Meta não expõe esse número direto, então é
            calculado (limite de gasto da conta menos o que já foi gasto). Conta cobrada por fatura,
            sem fundo pré-pago: não existe "saldo" nesse modelo, só "Fatura em aberto" (o que já
            acumulou e vai virar a próxima cobrança). Os números vêm de um cache atualizado 1x por
            dia — não a cada vez que a tela é aberta, pra não gastar requisição à toa.
          </p>
        </div>

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

        {contas.length === 0 ? (
          <p className="cartao-vidro mt-6 px-5 py-8 text-center text-sm text-neutral-500">
            Nenhuma conta de anúncio ativa ainda.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {contas.map((conta) => (
              <div key={conta.contaId} className="cartao-vidro overflow-hidden border border-white/10">
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
                  <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-3 lg:grid-cols-5">
                    {conta.saldoDisponivelCentavos !== null ? (
                      <Metrica rotulo="Saldo disponível" valor={reais(conta.saldoDisponivelCentavos)} destaque />
                    ) : (
                      <Metrica
                        rotulo="Fatura em aberto"
                        valor={conta.faturaEmAbertoCentavos !== null ? reais(conta.faturaEmAbertoCentavos) : "—"}
                      />
                    )}
                    <Metrica rotulo="Gasto 7 dias" valor={reais(conta.gasto7diasCentavos)} />
                    <Metrica rotulo="Média diária" valor={reais(conta.mediaDiariaCentavos)} />
                    <Metrica rotulo="Projeção mensal" valor={reais(conta.projecaoMensalCentavos)} />
                    <Metrica
                      rotulo="Planejado + sugerido"
                      valor={reais(conta.investimentoPlanejadoCentavos + conta.ajusteOrcamentoSugeridoCentavos)}
                    />
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

function Metrica({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">{rotulo}</p>
      <p className={destaque ? "mt-0.5 text-sm font-semibold text-accent-strong" : "mt-0.5 text-sm font-semibold text-neutral-200"}>
        {valor}
      </p>
    </div>
  );
}
