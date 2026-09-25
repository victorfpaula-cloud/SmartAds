import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import PainelMoldes from "./PainelMoldes";

export const dynamic = "force-dynamic";

export default function MoldesPage() {
  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/estrategias" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Central da rede
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold">Moldes de campanhas</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Sequências de campanha reutilizáveis (etapas, tipo e duração de cada uma) — monte uma vez,
          aplique em quantas unidades quiser.
        </p>
        <div className="mt-6">
          <PainelMoldes />
        </div>
      </main>
    </>
  );
}
