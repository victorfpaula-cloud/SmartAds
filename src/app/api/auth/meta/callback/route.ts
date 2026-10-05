import { NextResponse, type NextRequest } from "next/server";
import { concluirLogin } from "@/lib/meta/token";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { invalidarMapaDeConexoes } from "@/lib/meta/conexao";

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

  const clienteNovaConta = request.cookies.get("smartads_meta_oauth_nova_conta")?.value;
  const contaReconectar = request.cookies.get("smartads_meta_oauth_reconectar_conta")?.value;

  try {
    if (contaReconectar) {
      // "Reconectar" uma conta existente: login novo vira uma conexão nova e a conta passa a usá-la
      // — mantém o histórico, o público e o boost configurados, sem criar conta duplicada.
      const { conexaoId } = await concluirLogin(code, redirectUri, { novaConexao: true });
      const supabase = criarClienteAdmin();
      const { error } = await supabase
        .from("smartads_contas_meta")
        .update({ conexao_id: conexaoId })
        .eq("id", contaReconectar);
      if (error) throw new Error(error.message);
      invalidarMapaDeConexoes();
      destino.searchParams.set("conta_reconectada", contaReconectar);
    } else if (clienteNovaConta) {
      // Login de "Adicionar conta": cria uma conexão nova e volta pra tela de contas já com o
      // seletor daquele cliente aberto, listando só o que ESSE login enxerga.
      const { conexaoId } = await concluirLogin(code, redirectUri, { novaConexao: true });
      destino.searchParams.set("nova_conexao", conexaoId ?? "");
      destino.searchParams.set("cliente", clienteNovaConta);
    } else {
      await concluirLogin(code, redirectUri);
      destino.searchParams.set("meta_conectado", "1");
    }
  } catch (erro) {
    destino.searchParams.set(
      "meta_erro",
      erro instanceof Error ? erro.message : "Falha ao concluir o login com a Meta."
    );
  }

  const resposta = NextResponse.redirect(destino);
  resposta.cookies.delete("smartads_meta_oauth_state");
  resposta.cookies.delete("smartads_meta_oauth_nova_conta");
  resposta.cookies.delete("smartads_meta_oauth_reconectar_conta");
  return resposta;
}
