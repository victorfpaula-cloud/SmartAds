import { NextResponse, type NextRequest } from "next/server";
import { concluirLogin } from "@/lib/meta/token";

/** Volta da tela de autorização da Meta — troca o código pelo token de longa duração e salva no
 * Supabase (ver concluirLogin). Redireciona pra tela de contas com um aviso de sucesso/erro. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const estadoSalvo = request.cookies.get("smartads_meta_oauth_state")?.value;
  const erroDaMeta = request.nextUrl.searchParams.get("error_description");

  const destino = request.nextUrl.clone();
  destino.pathname = "/contas";
  destino.search = "";

  if (erroDaMeta) {
    destino.searchParams.set("meta_erro", erroDaMeta);
    return NextResponse.redirect(destino);
  }

  if (!code || !state || state !== estadoSalvo) {
    destino.searchParams.set("meta_erro", "Login cancelado ou inválido — tente novamente.");
    return NextResponse.redirect(destino);
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const redirectUri = `${base}/api/auth/meta/callback`;

  try {
    await concluirLogin(code, redirectUri);
    destino.searchParams.set("meta_conectado", "1");
  } catch (erro) {
    destino.searchParams.set(
      "meta_erro",
      erro instanceof Error ? erro.message : "Falha ao concluir o login com a Meta."
    );
  }

  const resposta = NextResponse.redirect(destino);
  resposta.cookies.delete("smartads_meta_oauth_state");
  return resposta;
}
