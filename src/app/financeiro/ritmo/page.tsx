import Cabecalho from "@/components/Cabecalho";
import AbasFinanceiro from "@/components/AbasFinanceiro";
import { lerAmbiente } from "@/lib/ambiente";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { calcularCiclosDasContas, contasDaEmpresa, type CicloDaConta } from "@/lib/cicloSaldo";
import CartaoCiclo from "./CartaoCiclo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORDEM: Record<CicloDaConta["status"], number> = { falta: 0, sobra: 1, ciclo_encerrado: 2, ok: 3, sem_recarga: 4, sem_ciclo: 5 };

/** Ritmo do saldo: pra cada unidade, se o dinheiro da última recarga vai durar até a próxima. */
export default async function RitmoSaldoPage() {
  const ambiente = await lerAmbiente();
  let ids: string[];
  if (ambiente) ids = await contasDaEmpresa(ambiente.id);
  else {
    const { data } = await criarClienteAdmin().from("smartads_contas_meta").select("id").eq("ativo", true);
    ids = (data ?? []).map((c) => c.id as string);
  }
  const ciclos = (await calcularCiclosDasContas(ids)).sort((a, b) => ORDEM[a.status] - ORDEM[b.status] || a.unidade.localeCompare(b.unidade));
  const contagem = (s: CicloDaConta["status"]) => ciclos.filter((c) => c.status === s).length;

  return (
    <>
      <Cabecalho ativo="/financeiro" />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <AbasFinanceiro ativa="ritmo" />
        <h1 className="font-display text-2xl font-bold">Ritmo do saldo</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Cada unidade recarrega num ritmo (semanal, quinzenal ou mensal). A partir da última recarga, o app mede quanto
          sobra, quanto está gastando por dia e se o dinheiro vai durar até a próxima — e diz quanto aumentar ou reduzir.
          Nada é alterado sozinho.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-danger/15 px-3 py-1 font-semibold text-danger">{contagem("falta")} vão faltar</span>
          <span className="rounded-full bg-amber-400/15 px-3 py-1 font-semibold text-amber-300">{contagem("sobra")} vão sobrar</span>
          <span className="rounded-full bg-ok/15 px-3 py-1 font-semibold text-ok">{contagem("ok")} no ritmo</span>
          <span className="rounded-full bg-white/[0.06] px-3 py-1 text-neutral-400">{contagem("sem_ciclo")} sem ciclo definido</span>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {ciclos.map((c) => (
            <CartaoCiclo key={c.contaId} c={c} />
          ))}
        </div>
        <p className="mt-4 text-[11px] text-neutral-600">
          * Saldo estimado: a Meta não informa o saldo dessa conta, então é a recarga menos o que já foi gasto desde ela
          (impostos podem deixar o valor real um pouco menor). Gasto atual = média dos últimos dias completos.
        </p>
      </main>
    </>
  );
}
