import Cabecalho from "@/components/Cabecalho";
import { coletarFinanceiro } from "@/lib/financeiro/coletarFinanceiro";
import { Wallet } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function reais(centavos: number) {
  return formatoReal.format(centavos / 100);
}

/** Cor do card conforme o quanto de saldo pré-pago resta na própria conta da Meta — vermelho é
 * "vai faltar crédito essa semana", não "a campanha está indo mal" (isso é papel do Semáforo). */
function corAlerta(diasRestantes: number | null, saldoCentavos: number | null): "vermelho" | "amarelo" | "verde" | "neutro" {
  if (saldoCentavos === null) return "neutro";
  if (saldoCentavos <= 0) return "vermelho";
  if (diasRestantes === null) return "neutro";
  if (diasRestantes <= 3) return "vermelho";
  if (diasRestantes <= 7) return "amarelo";
  return "verde";
}

const ESTILO_ALERTA: Record<ReturnType<typeof corAlerta>, string> = {
  vermelho: "border-red-500/30 bg-red-500/5",
  amarelo: "border-amber-500/30 bg-amber-500/5",
  verde: "border-white/10",
  neutro: "border-white/10",
};

export default async function FinanceiroPage() {
  const contas = await coletarFinanceiro();

  const totalSaldo = contas.reduce((s, c) => s + (c.saldoCentavos ?? 0), 0);
  const totalGasto7d = contas.reduce((s, c) => s + c.gasto7diasCentavos, 0);
  const totalPlanejado = contas.reduce((s, c) => s + c.investimentoPlanejadoCentavos, 0);
  const contasComAlerta = contas.filter((c) => {
    const cor = corAlerta(c.diasRestantes, c.saldoCentavos);
    return cor === "vermelho" || cor === "amarelo";
  });

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
              Saldo de cada conta direto da Meta, ritmo de gasto e o que já está planejado pra sair.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="cartao-vidro px-4 py-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Saldo total (contas pré-pagas)</p>
            <p className="mt-1 text-lg font-bold text-neutral-100">{reais(totalSaldo)}</p>
          </div>
          <div className="cartao-vidro px-4 py-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Gasto últimos 7 dias</p>
            <p className="mt-1 text-lg font-bold text-neutral-100">{reais(totalGasto7d)}</p>
          </div>
          <div className="cartao-vidro px-4 py-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Planejado, ainda não iniciado</p>
            <p className="mt-1 text-lg font-bold text-neutral-100">{reais(totalPlanejado)}</p>
          </div>
          <div className="cartao-vidro px-4 py-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Unidades precisando de atenção</p>
            <p className="mt-1 text-lg font-bold text-neutral-100">{contasComAlerta.length}</p>
          </div>
        </div>

        {contas.length === 0 ? (
          <p className="cartao-vidro mt-6 px-5 py-8 text-center text-sm text-neutral-500">
            Nenhuma conta de anúncio ativa ainda.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {contas.map((conta) => {
              const cor = corAlerta(conta.diasRestantes, conta.saldoCentavos);
              return (
                <div key={conta.contaId} className={`cartao-vidro border ${ESTILO_ALERTA[cor]} overflow-hidden`}>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-3.5">
                    <div>
                      <p className="text-sm font-semibold text-neutral-100">{conta.contaNome}</p>
                      <p className="text-[11px] text-neutral-500">
                        {conta.empresaNome} · {conta.clienteNome}
                      </p>
                    </div>
                    <a
                      href={conta.linkAdicionarCredito}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong"
                    >
                      Adicionar crédito (Pix na Meta)
                    </a>
                  </div>

                  {conta.erro ? (
                    <p className="px-5 py-4 text-xs text-danger">{conta.erro}</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
                      <Metrica
                        rotulo="Saldo na Meta"
                        valor={conta.saldoCentavos !== null ? reais(conta.saldoCentavos) : "Conta pós-paga"}
                      />
                      <Metrica rotulo="Gasto 7 dias" valor={reais(conta.gasto7diasCentavos)} />
                      <Metrica rotulo="Média diária" valor={reais(conta.mediaDiariaCentavos)} />
                      <Metrica rotulo="Projeção mensal" valor={reais(conta.projecaoMensalCentavos)} />
                      <Metrica
                        rotulo="Dias restantes de saldo"
                        valor={conta.diasRestantes !== null ? `${conta.diasRestantes} dia${conta.diasRestantes !== 1 ? "s" : ""}` : "—"}
                      />
                      <Metrica
                        rotulo="Planejado + sugerido"
                        valor={reais(conta.investimentoPlanejadoCentavos + conta.ajusteOrcamentoSugeridoCentavos)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
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
