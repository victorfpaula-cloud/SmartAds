import { NextResponse, type NextRequest } from "next/server";
import { VERSAO_API } from "@/lib/meta/token";

function urlDeRedirecionamento(request: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  return `${base}/api/auth/meta/callback`;
}

/** Início do login — redireciona pra tela de autorização da própria Meta. Chamado pelo botão
 * "Conectar Meta" na tela de contas.
 *
 * Apps criados como "Negócios" (nosso caso) usam o produto "Login do Facebook para Empresas", que
 * NÃO aceita mais lista de permissões direto na URL (parâmetro "scope") — as permissões (Anúncios,
 * Páginas, Instagram etc.) ficam definidas numa "Configuração de Login" criada dentro do app, e o
 * login precisa informar o ID dela ("config_id") em vez do "scope". Sem isso, a Meta não sabe o
 * que autorizar e só devolve pro feed normal do usuário, sem erro nenhum (descoberto em
 * 12/09/2026 testando o login em produção). */
export async function GET(request: NextRequest) {
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_LOGIN_CONFIG_ID;
  if (!appId) {
    return NextResponse.json(
      { erro: "META_APP_ID não configurado no servidor." },
      { status: 500 }
    );
  }
  if (!configId) {
    return NextResponse.json(
      { erro: "META_LOGIN_CONFIG_ID não configurado no servidor." },
      { status: 500 }
    );
  }

  // "state" aleatório contra CSRF — conferido de volta no callback antes de aceitar o código.
  const state = crypto.randomUUID();

  const url = new URL(`https://www.facebook.com/${VERSAO_API}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", urlDeRedirecionamento(request));
  url.searchParams.set("config_id", configId);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");

  const resposta = NextResponse.redirect(url.toString());
  // 30 minutos — o fluxo "Login do Facebook para Empresas" pode ter várias telas de revisão
  // (Página, conta de anúncios, Instagram, Pix, catálogo...), e os 10 minutos usados antes eram
  // curtos demais pra alguém revisando com calma pela primeira vez: o cookie expirava antes da
  // Meta devolver o código, e o callback recusava o login como "cancelado ou inválido" mesmo
  // depois do usuário aprovar tudo certinho (achado em 12/09/2026 testando em produção).
  resposta.cookies.set("smartads_meta_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 1800,
    path: "/",
  });
  return resposta;
}
