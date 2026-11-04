import { criarClienteServidor } from "@/lib/supabase/server";

/** Quem está logado e até onde pode ir. O papel mora no `app_metadata` do usuário do Supabase —
 * só o service role (a área /admin) consegue escrever ali, a pessoa não consegue se promover.
 * Usuário sem papel nenhum = administrador (o dono; todos os logins que já existiam). */
export interface Acesso {
  restrito: boolean;
  /** Empresas que um usuário restrito enxerga (vazio pro administrador, que vê todas). */
  empresas: string[];
  podeEditar: boolean;
  email: string | null;
}

export function acessoDoUsuario(user: { email?: string | null; app_metadata?: Record<string, unknown> } | null): Acesso {
  const meta = user?.app_metadata ?? {};
  const restrito = meta.papel === "restrito";
  const empresas = Array.isArray(meta.empresas) ? meta.empresas.filter((e): e is string => typeof e === "string") : [];
  return { restrito, empresas: restrito ? empresas : [], podeEditar: !restrito || meta.pode_editar === true, email: user?.email ?? null };
}

export async function lerAcesso(): Promise<Acesso> {
  const { data } = await criarClienteServidor().auth.getUser();
  return acessoDoUsuario(data.user);
}
