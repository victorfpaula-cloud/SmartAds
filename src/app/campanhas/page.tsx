import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { obterResumoPorUnidade } from "@/lib/campanhasRede";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import PanoramaCampanhasRede from "@/components/PanoramaCampanhasRede";

const FILTRO_REDE = "franquia";

export const dynamic = "force-dynamic";

/** Duas frentes com a mesma cara, pra não misturar:
 *  - menu Campanhas (/campanhas): panorama de TODAS as contas — franquias e empresas individuais —,
 *    um container por empresa; cada linha abre a página da conta;
 *  - Central da rede (/campanhas?rede=franquia): só as unidades de franquia, num container só. */
export default async function CampanhasPage({
  searchParams,
}: {
  searchParams: { rede?: string; empresa?: string };
}) {
  const apenasRede = searchParams.rede === FILTRO_REDE;
  const empresaId = searchParams.empresa;
  const { data: empresa } = empresaId
    ? await criarClienteAdmin().from("smartads_empresas").select("id, nome").eq("id", empresaId).maybeSingle()
    : { data: null };
  const { unidades, atualizadoEm } = await obterResumoPorUnidade({
    apenasFranquia: apenasRede,
    empresaId: empresa?.id,
  });

  return (
    <>
      <Cabecalho ativo="/campanhas" rede={apenasRede} geralHref="/campanhas" empresa={empresa ?? undefined} />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">
              {empresa ? `Campanhas · ${empresa.nome}` : apenasRede ? "Campanhas da rede" : "Campanhas"}
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              {empresa
                ? "Só as contas desta empresa. Escolha uma pra ver e mexer nas campanhas dela."
                : apenasRede
                ? "Só as unidades de franquia. Escolha uma pra ver e mexer nas campanhas dela."
                : "Todas as contas, de todas as empresas. Escolha uma pra ver e mexer nas campanhas dela."}
            </p>
          </div>
          <Link
            href="/campanhas/nova"
            className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:bg-accent-strong"
          >
            + Nova campanha
          </Link>
        </div>

        <div className="mt-6">
          <PanoramaCampanhasRede
            unidades={unidades}
            atualizadoEm={atualizadoEm}
            agruparPorEmpresa={!apenasRede && !empresa}
            titulo={
              empresa ? `Campanhas ativas · ${empresa.nome}` : apenasRede ? "Campanhas ativas na rede" : "Campanhas ativas em todas as contas"
            }
          />
        </div>
      </main>
    </>
  );
}
