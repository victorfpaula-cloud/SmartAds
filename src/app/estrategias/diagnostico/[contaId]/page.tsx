import Cabecalho from "@/components/Cabecalho";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import PainelDiagnostico from "./PainelDiagnostico";

export const dynamic = "force-dynamic";

export default async function DiagnosticoPage({ params }: { params: Promise<{ contaId: string }> }) {
  const { contaId } = await params;
  const supabase = criarClienteAdmin();
  const { data: conta } = await supabase
    .from("smartads_contas_meta")
    .select("*, smartads_clientes(id, nome)")
    .eq("id", contaId)
    .single();

  if (!conta) notFound();

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <p className="text-xs font-medium text-neutral-500">{(conta as any).smartads_clientes?.nome}</p>
        <h1 className="mt-1 font-display text-2xl font-bold">
          Diagnóstico — {conta.nome_exibicao || conta.meta_ad_account_nome}
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Cruza mídia paga, orgânico do Instagram e comparação com as outras unidades — sempre com
          sugestões de ação em mídia paga, nunca conselho de conteúdo isolado.
        </p>

        <div className="mt-6">
          <PainelDiagnostico contaId={contaId} clienteId={conta.cliente_id} />
        </div>
      </main>
    </>
  );
}
