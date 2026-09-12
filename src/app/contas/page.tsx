import Cabecalho from "@/components/Cabecalho";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import PainelContas from "./PainelContas";

export const dynamic = "force-dynamic";

export default async function ContasPage({
  searchParams,
}: {
  searchParams: { meta_conectado?: string; meta_erro?: string };
}) {
  const supabase = criarClienteAdmin();

  const [{ data: clientes }, { data: statusMeta }] = await Promise.all([
    supabase
      .from("smartads_clientes")
      .select("*, smartads_contas_meta(*)")
      .order("nome"),
    supabase
      .from("smartads_meta_status")
      .select("conectado, meta_user_nome, token_expira_em, ultimo_erro")
      .eq("id", "default")
      .single(),
  ]);

  return (
    <>
      <Cabecalho ativo="/contas" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <PainelContas
          clientesIniciais={clientes ?? []}
          statusMetaInicial={statusMeta ?? { conectado: false }}
          avisoConexao={
            searchParams.meta_conectado ? "conectado" : searchParams.meta_erro ? "erro" : null
          }
          mensagemErro={searchParams.meta_erro}
        />
      </main>
    </>
  );
}
