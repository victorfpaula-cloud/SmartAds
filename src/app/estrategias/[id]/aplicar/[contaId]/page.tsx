import Cabecalho from "@/components/Cabecalho";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import AplicarEstrategiaForm from "./AplicarEstrategiaForm";

export const dynamic = "force-dynamic";

export default async function AplicarEstrategiaPage({
  params,
}: {
  params: Promise<{ id: string; contaId: string }>;
}) {
  const { id, contaId } = await params;
  const supabase = criarClienteAdmin();

  const [{ data: estrategia }, { data: conta }] = await Promise.all([
    supabase
      .from("smartads_estrategias")
      .select("id, nome, smartads_estrategia_etapas(*)")
      .eq("id", id)
      .single(),
    supabase.from("smartads_contas_meta").select("*, smartads_clientes(id, nome)").eq("id", contaId).single(),
  ]);

  if (!estrategia || !conta) notFound();

  const { data: publicosSalvos } = await supabase
    .from("smartads_publicos_salvos")
    .select("id, nome, targeting")
    .eq("cliente_id", conta.cliente_id)
    .order("nome");

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Aplicar "{estrategia.nome}"</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Em {(conta as any).smartads_clientes?.nome} —{" "}
          {conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id}
        </p>

        <div className="mt-6">
          <AplicarEstrategiaForm
            estrategiaId={estrategia.id}
            estrategiaNome={estrategia.nome}
            etapas={(estrategia.smartads_estrategia_etapas as any[]).sort((a, b) => a.ordem - b.ordem)}
            clienteId={conta.cliente_id}
            clienteNome={(conta as any).smartads_clientes?.nome ?? ""}
            contaId={conta.id}
            publicosSalvos={publicosSalvos ?? []}
          />
        </div>
      </main>
    </>
  );
}
