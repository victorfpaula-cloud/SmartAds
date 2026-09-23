import Cabecalho from "@/components/Cabecalho";
import PainelEstrategias from "./PainelEstrategias";

export const dynamic = "force-dynamic";

export default function EstrategiasPage() {
  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Estratégias</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Moldes reutilizáveis — sequência de campanhas padronizada, aplicável em qualquer unidade
          com o público e o investimento dela.
        </p>
        <div className="mt-6">
          <PainelEstrategias />
        </div>
      </main>
    </>
  );
}
