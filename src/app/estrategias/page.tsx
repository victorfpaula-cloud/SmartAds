import Cabecalho from "@/components/Cabecalho";
import { exigirAmbiente } from "@/lib/ambiente";
import PainelEstrategias from "./PainelEstrategias";

export const dynamic = "force-dynamic";

export default async function EstrategiasPage() {
  const ambiente = await exigirAmbiente("franquia");
  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Visão geral · {ambiente.nome}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          As unidades da rede, o que está no ar em cada uma e o que pede atenção.
        </p>
        <div className="mt-6">
          <PainelEstrategias empresaId={ambiente.id} />
        </div>
      </main>
    </>
  );
}
