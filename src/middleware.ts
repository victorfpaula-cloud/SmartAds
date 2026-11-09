import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { acessoDoUsuario } from "@/lib/acessoBase";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Usuário restrito (ex.: gestora de uma franquia): só entra nas telas das empresas liberadas pra ele.
const PAGINAS_RESTRITO = [
  "/estrategias", "/campanhas", "/boost", "/delivery", "/publicos", "/financeiro",
  "/relatorios", "/relatorio-ads", "/automacao", "/central",
];
// APIs que mexem em contas/clientes/conexões ou devolvem dados de TODAS as empresas: nunca pra restrito.
const API_BLOQUEADA = [
  "/api/admin", "/api/contas-meta", "/api/clientes", "/api/empresas", "/api/auth/meta",
  "/api/meta/contas-disponiveis", "/api/saude", "/api/relatorios/postagens/enviar",
];
// POSTs que só consultam/atualizam números: liberados mesmo pra quem não pode editar.
const API_LEITURA = [
  "/api/auth/logout", "/api/saude-rede", "/api/relatorio-ads", "/api/financeiro/saldo", "/api/financeiro/atualizar",
  "/api/estrategias/postagens/atualizar", "/api/ia/resumo", "/api/diagnostico", "/api/meta/buscar-interesse",
  "/api/meta/buscar-localizacao", "/api/meta/posts-instagram",
];
// Mesmo nome de COOKIE_AMBIENTE (src/lib/ambiente.ts) — repetido aqui porque aquele arquivo usa APIs
// de servidor que o middleware não carrega.
const COOKIE_AMBIENTE = "smartads_ambiente";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const sob = (caminho: string, bases: string[]) => bases.some((b) => caminho === b || caminho.startsWith(b + "/"));

/** Algum id da URL (rota ou parâmetro) é de empresa/cliente/conta que NÃO está liberada pro usuário? */
async function foraDoEscopo(ids: string[], empresas: string[]): Promise<boolean> {
  const alvo = Array.from(new Set(ids.map((i) => i.toLowerCase()))).filter((i) => !empresas.includes(i));
  if (alvo.length === 0) return false;
  const db = criarClienteAdmin();
  const [emp, cli, con] = await Promise.all([
    db.from("smartads_empresas").select("id").in("id", alvo),
    db.from("smartads_clientes").select("id, empresa_id").in("id", alvo),
    db.from("smartads_contas_meta").select("id, smartads_clientes(empresa_id)").in("id", alvo),
  ]);
  if ((emp.data ?? []).length > 0) return true;
  if ((cli.data ?? []).some((c) => !c.empresa_id || !empresas.includes(c.empresa_id))) return true;
  return (con.data ?? []).some((c) => {
    const rel = c.smartads_clientes as unknown as { empresa_id: string | null } | { empresa_id: string | null }[] | null;
    const empresaId = Array.isArray(rel) ? rel[0]?.empresa_id : rel?.empresa_id;
    return !empresaId || !empresas.includes(empresaId);
  });
}

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

  if (session) {
    // Valida a sessão no servidor de Auth (não só decodifica o cookie): o papel de acesso não pode
    // ser forjado editando o cookie.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const destino = request.nextUrl.clone();
      destino.pathname = "/login";
      return NextResponse.redirect(destino);
    }
    const acesso = acessoDoUsuario(user);
    if (acesso.restrito) {
      const bloqueio = await aplicarRestricoes(request, acesso, response);
      if (bloqueio) return bloqueio;
    }
  }

  return response;
}

async function aplicarRestricoes(
  request: NextRequest,
  acesso: ReturnType<typeof acessoDoUsuario>,
  response: NextResponse
): Promise<NextResponse | null> {
  const caminho = request.nextUrl.pathname;
  const ehApi = caminho.startsWith("/api/");
  const negar = () =>
    ehApi
      ? NextResponse.json({ erro: "Sem permissão." }, { status: 403 })
      : NextResponse.redirect(new URL(acesso.empresas.length === 1 ? `/api/ambiente?empresa=${acesso.empresas[0]}` : "/", request.url));
  if (acesso.empresas.length === 0) {
    // Restrito sem nenhuma empresa liberada: não vê nada, só consegue sair.
    return caminho === "/login" || caminho === "/api/auth/logout"
      ? null
      : ehApi
        ? NextResponse.json({ erro: "Sem permissão." }, { status: 403 })
        : NextResponse.redirect(new URL("/login", request.url));
  }

  if (caminho === "/login") return null;
  if (ehApi) {
    if (sob(caminho, API_BLOQUEADA)) return negar();
    const leitura = request.method === "GET" || request.method === "HEAD";
    if (!leitura && !acesso.podeEditar && !sob(caminho, API_LEITURA)) {
      return NextResponse.json(
        { erro: "Seu acesso é somente de consulta — não é possível alterar nada.", motivo: "Seu acesso é somente de consulta." },
        { status: 403, headers: { "x-somente-consulta": "1" } }
      );
    }
  } else if (caminho === "/mais") {
    return NextResponse.redirect(new URL("/", request.url));
  } else if (caminho !== "/" && !sob(caminho, PAGINAS_RESTRITO)) {
    return negar();
  }

  // Qualquer id de empresa/cliente/conta na URL tem de ser de uma empresa liberada.
  const ids = [
    ...(caminho.match(UUID) ?? []),
    ...Array.from(request.nextUrl.searchParams.values()).flatMap((v) => v.match(UUID) ?? []),
  ];
  // Ids enviados no corpo (JSON) de POST/PATCH também contam — sem isso dava pra consultar outra
  // empresa forjando a chamada à mão.
  if (ehApi && request.method !== "GET" && request.method !== "HEAD" && (request.headers.get("content-type") ?? "").includes("json")) {
    try {
      ids.push(...((await request.clone().text()).match(UUID) ?? []).slice(0, 200));
    } catch {
      return negar();
    }
  }
  if (await foraDoEscopo(ids, acesso.empresas)) return negar();

  if (ehApi) return null;

  // Com uma empresa só, não existe "Início": entra direto no ambiente dela.
  if (caminho === "/" && acesso.empresas.length === 1) {
    return NextResponse.redirect(new URL(`/api/ambiente?empresa=${acesso.empresas[0]}`, request.url));
  }
  // O ambiente aberto (cookie) tem de ser um dos liberados — senão abre o primeiro.
  const atual = request.cookies.get(COOKIE_AMBIENTE)?.value?.toLowerCase();
  if (caminho !== "/" && (!atual || !acesso.empresas.includes(atual))) {
    const ir = encodeURIComponent(caminho + request.nextUrl.search);
    const r = NextResponse.redirect(new URL(`/api/ambiente?empresa=${acesso.empresas[0]}&ir=${ir}`, request.url));
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  }
  return null;
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
