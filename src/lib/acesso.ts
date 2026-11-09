import { cache } from "react";
import { criarClienteServidor } from "@/lib/supabase/server";
import { acessoDoUsuario, type Acesso } from "@/lib/acessoBase";

export { acessoDoUsuario, type Acesso };

/** `cache`: layout, cabeçalho e página pedem o acesso na mesma requisição — uma ida só ao servidor de Auth. */
export const lerAcesso = cache(async (): Promise<Acesso> => {
  const { data } = await criarClienteServidor().auth.getUser();
  return acessoDoUsuario(data.user);
});
