import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { exigirAmbiente } from "@/lib/ambiente";
import { obterResumoPorUnidade } from "@/lib/campanhasRede";
import PanoramaCampanhasRede from "@/components/PanoramaCampanhasRede";

export const dynamic = "force-dynamic";

/** Campanhas do ambiente aberto: as unidades da franquia, ou a(s) conta(s) da empresa única. Cada
 * linha abre a página da conta (campanha por campanha). */
export default async function CampanhasPage() {
  const ambiente = await exigirAmbiente();
  const { unidades, atualizadoEm } = await obterResumoPorUnidade({ apenasFranquia: false, empresaId: ambiente.id });

  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Campanhas · {ambiente.nome}</h1>
            <p className="mt-1 text-sm text-neutral-400">
              {ambiente.tipo === "franquia"
                ? "O que está no ar em cada unidade. Escolha uma pra ver e mexer nas campanhas dela."
                : "O que está no ar nas contas dessa empresa. Escolha uma pra ver e mexer nas campanhas."}
            </p>
          </div>
          <Link
            href="/campanhas/nova"
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            + Nova campanha
          </Link>
        </div>

        <div className="mt-6">
          <PanoramaCampanhasRede
            unidades={unidades}
            atualizadoEm={atualizadoEm}
            titulo={ambiente.tipo === "franquia" ? "Campanhas ativas na rede" : `Campanhas ativas · ${ambiente.nome}`}
          />
        </div>
      </main>
    </>
  );
}
