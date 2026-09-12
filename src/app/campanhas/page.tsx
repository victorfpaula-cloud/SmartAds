import Cabecalho from "@/components/Cabecalho";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import PainelCampanhas from "./PainelCampanhas";

export const dynamic = "force-dynamic";

export default async function CampanhasPage() {
  const supabase = criarClienteAdmin();
  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select("id, nome, smartads_contas_meta(id, meta_ad_account_nome, nome_exibicao)")
    .eq("ativo", true)
    .order("nome");

  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Campanhas no ar</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Pausar/ativar e editar orçamento na hora, por cliente e conta.
        </p>
        <div className="mt-6">
          <PainelCampanhas clientes={(clientes as any) ?? []} />
        </div>
      </main>
    </>
  );
}
