import Cabecalho from "@/components/Cabecalho";
import { lerAmbiente } from "@/lib/ambiente";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Passo 1 do fluxo de criação: escolher pra qual conta (cliente + conta de anúncio) a campanha
 * é. Só mostra contas de clientes que já têm pelo menos uma conta Meta associada. */
export default async function EscolherContaPage() {
  const supabase = criarClienteAdmin();
  const ambiente = await lerAmbiente();
  let consulta = supabase.from("smartads_clientes").select("*, smartads_contas_meta(*)").eq("ativo", true).order("nome");
  if (ambiente) consulta = consulta.eq("empresa_id", ambiente.id);
  const { data: clientes } = await consulta;

  const clientesComConta = (clientes ?? [])
    .map((c) => ({ ...c, smartads_contas_meta: c.smartads_contas_meta.filter((x: { ativo?: boolean }) => x.ativo !== false) }))
    .filter((c) => c.smartads_contas_meta.length > 0);
  // Uma conta só (empresa única): o passo de escolher a conta não serve pra nada.
  const todasAsContas = clientesComConta.flatMap((c) => c.smartads_contas_meta);
  if (todasAsContas.length === 1) redirect(`/campanhas/nova/${todasAsContas[0].id}`);

  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Nova campanha</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Escolha a conta pra qual você quer criar a campanha.
        </p>

        {clientesComConta.length === 0 ? (
          <div className="cartao-vidro mt-6 px-5 py-6 text-sm text-neutral-400">
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
                      className="cartao-vidro-interno flex items-center justify-between px-4 py-3.5 transition hover:border-accent/40"
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
