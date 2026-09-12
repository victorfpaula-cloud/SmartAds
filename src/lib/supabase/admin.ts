import { createClient } from "@supabase/supabase-js";

// Cliente Supabase do lado do servidor, usando a service role key — mesmo padrão de segurança dos
// projetos irmãos: nenhuma policy pública de RLS, só rotas server-side com essa chave conseguem
// ler/escrever. `cache: "no-store"` em toda chamada fetch evita respostas cacheadas antigas (bug
// real já visto no agendador-stories).
export function criarClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltam variáveis de ambiente do Supabase (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
