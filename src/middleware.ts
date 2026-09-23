import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Exige login em todo o painel — SmartAds é uso interno de uma pessoa só (a agência), sem rota
 * pública nenhuma além do login em si.
 *
 * Falha "aberta" (deixa passar sem exigir login) só se faltar configurar
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` — evita que um esquecimento de configuração derrube o site
 * inteiro com tela em branco; ainda assim registra um erro no log pra não passar despercebido.
 *
 * Usa `getSession()` (decodifica o token localmente, sem chamada de rede pro servidor de Auth) em
 * vez de `getUser()` (que valida contra o servidor a cada navegação) — mesmo padrão já usado no
 * ShoppingHub e no Chatbot Direct: troca consciente de segurança por velocidade, aceitável aqui
 * por ser um painel de uso interno com um único administrador de confiança.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveAnonima = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !chaveAnonima) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY não configurada — login desativado temporariamente."
    );
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, chaveAnonima, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session && request.nextUrl.pathname !== "/login") {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    return NextResponse.redirect(destino);
  }

  return response;
}

export const config = {
  // icon.png/apple-icon.png/manifest.webmanifest/logo.png precisam ficar de fora: quem busca esses
  // arquivos é o navegador (pra montar o atalho na tela de início) ou a própria tela de login antes
  // de existir sessão nenhuma — sem essa exceção, o middleware redirecionava a imagem pro /login e
  // o logo aparecia quebrado (visto em produção, print de 12/09/2026).
  // api/cron também fica de fora: quem chama é o cron da Vercel, sem sessão de usuário nenhuma —
  // a própria rota confere o CRON_SECRET, não depende desse middleware pra estar protegida.
  // api/sugestoes/aprovar fica de fora pelo mesmo motivo: é o link clicável do relatório semanal
  // por e-mail (ver src/lib/email/relatorioSemanal.ts), quem autentica é o token único da
  // sugestão, não uma sessão logada — a própria rota confere o token antes de aplicar qualquer
  // coisa.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|logo.png|api/cron|api/sugestoes/aprovar).*)",
  ],
};
