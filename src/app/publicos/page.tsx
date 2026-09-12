import Cabecalho from "@/components/Cabecalho";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import PainelPublicos from "./PainelPublicos";

export const dynamic = "force-dynamic";

export default async function PublicosPage() {
  const supabase = criarClienteAdmin();
  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  return (
    <>
      <Cabecalho ativo="/publicos" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Públicos salvos</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Combinações de localização e interesse reutilizáveis, por cliente.
        </p>
        <div className="mt-6">
          <PainelPublicos clientes={clientes ?? []} />
        </div>
      </main>
    </>
  );
}
