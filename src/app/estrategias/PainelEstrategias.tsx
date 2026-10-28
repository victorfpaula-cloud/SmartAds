import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { obterResumoPorUnidade } from "@/lib/campanhasRede";
import { carregarCalendario } from "@/lib/calendarioRede";
import { gerarAlertas } from "@/lib/alertas";
import PanoramaCampanhasRede from "@/components/PanoramaCampanhasRede";

const dataBR = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

/** Visão geral da rede: o que pede ação (datas do calendário sem campanha) e as unidades com o que
 * está no ar em cada uma. Os atalhos para as outras telas vivem só no menu do topo. */
export default async function PainelEstrategias({ empresaId }: { empresaId: string }) {
  const [{ unidades, atualizadoEm }, calendario, alertas] = await Promise.all([
    obterResumoPorUnidade({ apenasFranquia: false, empresaId }),
    carregarCalendario(empresaId),
    gerarAlertas(empresaId).catch(() => []),
  ]);
  const urgentes = alertas.filter((a) => a.severidade === "critico").length;
  const atencao = alertas.filter((a) => a.severidade === "atencao").length;

  return (
    <div className="flex flex-col gap-5">
      {urgentes + atencao > 0 && (
        <Link
          href="/estrategias/alertas"
          className={`cartao-vidro flex items-center justify-between gap-3 border p-4 ${urgentes > 0 ? "border-danger/30 bg-danger/5" : "border-amber-500/30 bg-amber-500/5"}`}
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-100">
            <WarningCircle size={16} weight="fill" className={urgentes > 0 ? "text-danger" : "text-amber-300"} />
            {urgentes > 0 ? `${urgentes} urgente${urgentes !== 1 ? "s" : ""}` : null}
            {urgentes > 0 && atencao > 0 ? " · " : null}
            {atencao > 0 ? `${atencao} pedindo atenção` : null}
          </span>
          <span className="text-xs font-semibold text-accent-strong">Ver alertas →</span>
        </Link>
      )}
      {calendario.alertas.length > 0 && (
        <div className="cartao-vidro border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-300">
            <WarningCircle size={16} weight="fill" /> Datas chegando sem campanha oficial
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-neutral-300">
            {calendario.alertas.slice(0, 3).map((a) => (
              <li key={a.dataId}>
                <span className="font-semibold text-neutral-100">{a.nome}</span> ({dataBR(a.data)}) —{" "}
                {a.diasParaComecar >= 0 ? `começar até ${dataBR(a.comecarAte)}` : "o prazo ideal de início já passou"}
              </li>
            ))}
          </ul>
          <Link href="/estrategias/calendario" className="mt-2 inline-block text-xs font-semibold text-accent-strong hover:underline">
            Abrir o calendário →
          </Link>
        </div>
      )}

      <PanoramaCampanhasRede unidades={unidades} atualizadoEm={atualizadoEm} comBoost />
    </div>
  );
}
