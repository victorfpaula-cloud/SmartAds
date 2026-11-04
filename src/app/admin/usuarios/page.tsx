import { redirect } from "next/navigation";
import Cabecalho from "@/components/Cabecalho";
import { lerAcesso } from "@/lib/acesso";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import PainelUsuarios from "./PainelUsuarios";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const acesso = await lerAcesso();
  if (acesso.restrito) redirect("/");
  const { data } = await criarClienteAdmin().from("smartads_empresas").select("id, nome, tipo").order("nome");

  return (
    <>
      <Cabecalho ativo="/admin/usuarios" />
      <main className="mx-auto max-w-4xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Acessos</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Crie logins limitados: a pessoa entra com e-mail e senha e só enxerga as empresas que você liberar — nada de
          contas, outras empresas ou configurações. Você, com o login principal, continua vendo tudo.
        </p>
        <PainelUsuarios empresas={(data ?? []) as Array<{ id: string; nome: string; tipo: string }>} />
      </main>
    </>
  );
}
