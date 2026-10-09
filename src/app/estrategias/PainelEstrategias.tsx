import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { obterResumoPorUnidade } from "@/lib/campanhasRede";
import { carregarCalendario } from "@/lib/calendarioRede";
import PanoramaCampanhasRede from "@/components/PanoramaCampanhasRede";

const dataBR = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

/** Visão geral da rede: o que pede ação (datas do calendário sem campanha) e as unidades com o que
 * está no ar em cada uma. Os atalhos para as outras telas vivem só no menu do topo. */
export default async function PainelEstrategias({ empresaId }: { empresaId: string }) {
  const [{ unidades, atualizadoEm }, calendario] = await Promise.all([
    obterResumoPorUnidade({ apenasFranquia: false, empresaId }),
    carregarCalendario(empresaId),
  ]);

  return (
    <div className="flex flex-col gap-5">
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
