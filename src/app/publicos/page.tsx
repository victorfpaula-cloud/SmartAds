import Cabecalho from "@/components/Cabecalho";
import { AbasUnidades } from "@/components/AbasRede";
import { lerAmbiente } from "@/lib/ambiente";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import PainelPublicos from "./PainelPublicos";

export const dynamic = "force-dynamic";

export default async function PublicosPage() {
  const supabase = criarClienteAdmin();
  const ambiente = await lerAmbiente();
  let consulta = supabase.from("smartads_clientes").select("id, nome").eq("ativo", true).order("nome");
  if (ambiente) consulta = consulta.eq("empresa_id", ambiente.id);
  const { data: clientes } = await consulta;

  return (
    <>
      <Cabecalho ativo="/publicos" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <AbasUnidades />
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
