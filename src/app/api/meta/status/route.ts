import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Sem parâmetro de request nem cookies — o Next tentaria pré-renderizar essa rota como estática
// no build (e quebraria por faltar env var nesse momento). Força sempre dinâmica/sob demanda.
export const dynamic = "force-dynamic";

/** Status da conexão com a Meta — alimenta o banner "Conectar Meta"/"Reconectar" na tela de
 * contas. Não usa src/lib/meta/token.ts (que tentaria renovar o token) — aqui é só leitura crua
 * pra exibição, sem disparar nenhuma chamada à Graph API. */
export async function GET() {
  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_meta_status")
    .select("conectado, meta_user_nome, token_expira_em, ultimo_erro")
    .eq("id", "default")
    .single();

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
