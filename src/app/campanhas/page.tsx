import Cabecalho from "@/components/Cabecalho";
import { AbasCampanhas } from "@/components/AbasRede";
import Link from "next/link";
import { Plus, UsersThree } from "@phosphor-icons/react/dist/ssr";
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
        <AbasCampanhas />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Campanhas · {ambiente.nome}</h1>
            <p className="mt-1 text-sm text-neutral-400">
              {ambiente.tipo === "franquia"
                ? "O que está no ar em cada unidade. Escolha uma pra ver e mexer nas campanhas dela."
                : "O que está no ar nas contas dessa empresa. Escolha uma pra ver e mexer nas campanhas."}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link
            href="/campanhas/nova"
            className="cartao-vidro flex items-center gap-4 p-5 transition hover:border-accent/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-strong">
              <Plus size={22} weight="bold" />
            </span>
            <span>
              <span className="block text-base font-semibold text-neutral-100">Nova campanha</span>
              <span className="block text-xs text-neutral-400">Para uma unidade só, passo a passo.</span>
            </span>
          </Link>
          {ambiente.tipo === "franquia" && (
            <Link
              href="/campanhas/nova-rede"
              className="cartao-vidro flex items-center gap-4 border-accent/30 p-5 transition hover:border-accent/60"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-strong">
                <UsersThree size={22} weight="fill" />
              </span>
              <span>
                <span className="block text-base font-semibold text-neutral-100">Nova campanha da rede</span>
                <span className="block text-xs text-neutral-400">A mesma campanha de alcance em várias unidades de uma vez.</span>
              </span>
            </Link>
          )}
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
