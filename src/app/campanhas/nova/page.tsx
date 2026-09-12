import Cabecalho from "@/components/Cabecalho";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** Passo 1 do fluxo de criação: escolher pra qual conta (cliente + conta de anúncio) a campanha
 * é. Só mostra contas de clientes que já têm pelo menos uma conta Meta associada. */
export default async function EscolherContaPage() {
  const supabase = criarClienteAdmin();
  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select("*, smartads_contas_meta(*)")
    .eq("ativo", true)
    .order("nome");

  const clientesComConta = (clientes ?? []).filter((c) => c.smartads_contas_meta.length > 0);

  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Nova campanha</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Escolha a conta pra qual você quer criar a campanha.
        </p>

        {clientesComConta.length === 0 ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-neutral-400">
            Nenhuma conta de anúncio associada ainda.{" "}
            <Link href="/contas" className="text-accent-strong hover:underline">
              Associe uma conta primeiro.
            </Link>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-5">
            {clientesComConta.map((cliente) => (
              <div key={cliente.id}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {cliente.nome}
                </h2>
                <div className="flex flex-col gap-2">
                  {cliente.smartads_contas_meta.map((conta: any) => (
                    <Link
                      key={conta.id}
                      href={`/campanhas/nova/${conta.id}`}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 backdrop-blur-xl transition hover:border-accent/40 hover:bg-white/[0.05]"
                    >
                      <div>
                        <p className="text-sm font-semibold text-neutral-100">
                          {conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {conta.page_nome}
                          {conta.instagram_username ? ` · @${conta.instagram_username}` : ""}
                        </p>
                      </div>
                      <span className="text-neutral-500">→</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
