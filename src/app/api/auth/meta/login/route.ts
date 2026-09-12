import { NextResponse, type NextRequest } from "next/server";
import { VERSAO_API } from "@/lib/meta/token";

// Permissões pedidas no login: leitura e escrita de anúncios, listar páginas/Instagram vinculado,
// e enxergar as Business Managers do usuário (pra listar contas de anúncio de todas elas).
const ESCOPO = [
  "ads_management",
  "ads_read",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
  "instagram_basic",
].join(",");

function urlDeRedirecionamento(request: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  return `${base}/api/auth/meta/callback`;
}

/** Início do login — redireciona pra tela de autorização da própria Meta. Chamado pelo botão
 * "Conectar Meta" na tela de contas. */
export async function GET(request: NextRequest) {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.json(
      { erro: "META_APP_ID não configurado no servidor." },
      { status: 500 }
    );
  }

  // "state" aleatório contra CSRF — conferido de volta no callback antes de aceitar o código.
  const state = crypto.randomUUID();

  const url = new URL(`https://www.facebook.com/${VERSAO_API}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", urlDeRedirecionamento(request));
  url.searchParams.set("scope", ESCOPO);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");

  const resposta = NextResponse.redirect(url.toString());
  resposta.cookies.set("smartads_meta_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return resposta;
}
