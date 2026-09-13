import { NextResponse, type NextRequest } from "next/server";
import { concluirLogin } from "@/lib/meta/token";

/** Volta da tela de autorização da Meta — troca o código pelo token de longa duração e salva no
 * Supabase (ver concluirLogin). Redireciona pra tela de contas com um aviso de sucesso/erro. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const estadoSalvo = request.cookies.get("smartads_meta_oauth_state")?.value;
  // A Meta às vezes manda só "error" (ex: access_denied), sem "error_description" — usa
  // qualquer um dos dois que vier, pra nunca cair na mensagem genérica de baixo por engano.
  const erroDaMeta =
    request.nextUrl.searchParams.get("error_description") ||
    request.nextUrl.searchParams.get("error");

  const destino = request.nextUrl.clone();
  destino.pathname = "/contas";
  destino.search = "";

  if (erroDaMeta) {
    destino.searchParams.set("meta_erro", erroDaMeta);
    return NextResponse.redirect(destino);
  }

  if (!code || !state) {
    destino.searchParams.set("meta_erro", "Login cancelado ou inválido — tente novamente.");
    return NextResponse.redirect(destino);
  }

  if (state !== estadoSalvo) {
    // Distingue do erro genérico acima: cookie ausente/expirado é o caso mais comum (fluxo
    // demorou mais que o tempo do cookie) — mensagem específica ajuda a diagnosticar se
    // acontecer de novo, em vez de cair tudo no mesmo "cancelado ou inválido" sem pista nenhuma.
    destino.searchParams.set(
      "meta_erro",
      estadoSalvo
        ? "Login expirou ou veio de outra tentativa — tente novamente."
        : "Não encontramos o cookie de segurança do login (pode ter expirado) — tente novamente."
    );
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
