import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import PainelCampanhasDaConta from "./PainelCampanhasDaConta";

export const dynamic = "force-dynamic";

export default async function CampanhasDaContaPage({ params }: { params: Promise<{ contaId: string }> }) {
  const { contaId } = await params;
  const supabase = criarClienteAdmin();

  const { data: conta } = await supabase
    .from("smartads_contas_meta")
    .select("id, nome_exibicao, meta_ad_account_nome, meta_ad_account_id, smartads_clientes(nome)")
    .eq("id", contaId)
    .single();

  if (!conta) notFound();

  const nomeConta = conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id;
  const nomeCliente = (conta as any).smartads_clientes?.nome ?? "";

  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/campanhas" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Campanhas
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold">{nomeCliente}</h1>
        <p className="mt-1 text-sm text-neutral-400">{nomeConta}</p>

        <div className="mt-6">
          <PainelCampanhasDaConta contaId={contaId} />
        </div>
      </main>
    </>
  );
}
