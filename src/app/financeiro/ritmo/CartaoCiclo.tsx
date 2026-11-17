import Link from "next/link";
import type { CicloDaConta } from "@/lib/cicloSaldo";
import SeletorCiclo from "./SeletorCiclo";

const R = (c: number | null) => (c === null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const D = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

const COR: Record<CicloDaConta["status"], { faixa: string; chip: string; rotulo: string }> = {
  falta: { faixa: "bg-danger", chip: "bg-danger/15 text-danger", rotulo: "Vai faltar" },
  sobra: { faixa: "bg-amber-400", chip: "bg-amber-400/15 text-amber-300", rotulo: "Vai sobrar" },
  ok: { faixa: "bg-ok", chip: "bg-ok/15 text-ok", rotulo: "No ritmo" },
  ciclo_encerrado: { faixa: "bg-neutral-500", chip: "bg-white/[0.06] text-neutral-300", rotulo: "Ciclo encerrado" },
  sem_recarga: { faixa: "bg-neutral-600", chip: "bg-white/[0.06] text-neutral-400", rotulo: "Sem recarga" },
  sem_ciclo: { faixa: "bg-neutral-700", chip: "bg-white/[0.06] text-neutral-400", rotulo: "Não configurado" },
};

/** Um cartão por unidade: quanto sobra, até quando tem de durar e o que fazer. */
export default function CartaoCiclo({ c, comLink = true }: { c: CicloDaConta; comLink?: boolean }) {
  const cor = COR[c.status];
  const pct =
    c.diasDecorridos !== null && c.diasRestantes !== null && c.diasDecorridos + c.diasRestantes > 0
      ? Math.min(100, (c.diasDecorridos / (c.diasDecorridos + c.diasRestantes)) * 100)
      : null;
  const pctGasto =
    c.valorRecargaCentavos && c.saldoCentavos !== null ? Math.min(100, Math.max(0, (1 - c.saldoCentavos / c.valorRecargaCentavos) * 100)) : null;
  return (
    <div className="cartao-vidro flex overflow-hidden">
      <span className={`w-1.5 shrink-0 ${cor.faixa}`} />
      <div className="min-w-0 flex-1 px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {comLink ? (
              <Link href={`/unidade/${c.contaId}`} className="text-[15px] font-bold text-neutral-100 hover:underline">
                {c.unidade}
              </Link>
            ) : (
              <p className="text-[15px] font-bold text-neutral-100">Ritmo do saldo</p>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cor.chip}`}>{cor.rotulo}</span>
          </div>
          <SeletorCiclo contaId={c.contaId} inicial={c.ciclo} sugerido={c.cicloSugerido} />
        </div>

        {c.ciclo && c.saldoCentavos !== null && c.status !== "sem_recarga" && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Saldo", `${R(c.saldoCentavos)}${c.saldoEstimado ? "*" : ""}`],
              ["Próxima recarga", `${dataBR(c.proximaRecarga)} · ${D(c.diasRestantes)} dia(s)`],
              ["Gasto atual", c.ritmoDiarioCentavos !== null ? `${R(c.ritmoDiarioCentavos)}/dia` : "—"],
              ["Ideal até a recarga", c.idealDiarioCentavos !== null ? `${R(c.idealDiarioCentavos)}/dia` : "—"],
            ].map(([r, v]) => (
              <div key={r} className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-neutral-500">{r}</p>
                <p className="text-sm font-bold text-neutral-100">{v}</p>
              </div>
            ))}
          </div>
        )}
        {pct !== null && (
          <div className="mt-2.5 space-y-1">
            <div className="flex justify-between text-[10.5px] text-neutral-500">
              <span>
                Recarga de {dataBR(c.ultimaRecarga)} ({R(c.valorRecargaCentavos)})
              </span>
              <span>
                {pctGasto !== null ? `${Math.round(pctGasto)}% do dinheiro usado` : ""} · {Math.round(pct)}% do tempo
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
              {pctGasto !== null && <div className={`absolute inset-y-0 left-0 rounded-full ${cor.faixa}`} style={{ width: `${pctGasto}%` }} />}
              <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${pct}%` }} title="Hoje" />
            </div>
          </div>
        )}

        <p className="mt-2.5 text-[13.5px] font-semibold text-neutral-100">{c.titulo}</p>
        <ul className="mt-1 space-y-0.5 text-[12.5px] leading-relaxed text-neutral-400">
          {c.passos.map((p, i) => (
            <li key={i}>• {p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
