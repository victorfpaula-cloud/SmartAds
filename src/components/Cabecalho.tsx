import Link from "next/link";
import {
  House,
  Buildings,
  Megaphone,
  Wallet,
  DotsThreeCircle,
  SignOut,
} from "@phosphor-icons/react/dist/ssr";

// Só as 5 coisas que se abrem quase todo dia ficam fixas aqui — era o padrão original do app, antes
// da barra crescer pra 7-8 ícones conforme cada fase nova adicionava a própria aba (achado
// reportado pelo dono: "não sei nem mexer nele" de tanta coisa espremida). Públicos, Automação e
// Relatórios (uso mais esporádico — configura uma vez, revisita de vez em quando) foram pra dentro
// de "Mais", que também explica o que cada um faz (ver /mais/page.tsx). "Estratégias"/Central da
// Rede nem entra aqui — é pauta só de franquia, acessada pelo card da empresa na tela inicial.
const LINKS = [
  { href: "/", label: "Início", Icone: House },
  { href: "/contas", label: "Contas", Icone: Buildings },
  { href: "/campanhas", label: "Campanhas", Icone: Megaphone },
  { href: "/financeiro", label: "Financeiro", Icone: Wallet },
  { href: "/mais", label: "Mais", Icone: DotsThreeCircle },
];

// Páginas que vivem "dentro" de Mais — abrem a página normalmente, mas a aba que acende na barra é
// a de Mais, não nenhuma (senão pareceria que saiu da navegação principal ao entrar nelas).
const PAGINAS_DENTRO_DE_MAIS = ["/publicos", "/automacao", "/relatorios", "/mais"];

/** Navegação principal — vira barra de abas fixa embaixo no celular (padrão de app, mais fácil de
 * alcançar com o polegar) e barra no topo no desktop. Um só componente, dois layouts via classes
 * responsivas, pra nunca desalinhar qual aba está ativa entre as duas versões. */
export default function Cabecalho({ ativo }: { ativo: string }) {
  const ativoNaBarra = PAGINAS_DENTRO_DE_MAIS.includes(ativo) ? "/mais" : ativo;

  return (
    <>
      {/* `env(safe-area-inset-top)` evita colidir com a barra de status do iPad/iPhone quando o
          app roda "Adicionado à Tela de Início" (modo standalone, sem a barra do Safari que antes
          empurrava o conteúdo pra baixo) — mesmo problema já corrigido embaixo, agora em cima. */}
      <header
        className="barra-vidro sticky top-0 z-20 border-b"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-8">
            <span className="font-display text-[15px] font-bold tracking-tight">SmartAds</span>
            <nav className="hidden items-center gap-1.5 sm:flex">
              {LINKS.map(({ href, label, Icone }) => (
                <Link
                  key={href}
                  href={href}
                  className={
                    ativoNaBarra === href
                      ? "pilula-ativa flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-neutral-100"
                      : "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-400 hover:text-neutral-200"
                  }
                >
                  <Icone size={16} weight={ativoNaBarra === href ? "fill" : "regular"} />
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              aria-label="Sair"
              className="botao-icone-vidro h-9 w-9 shrink-0 rounded-lg text-neutral-400 sm:h-auto sm:w-auto sm:gap-1.5 sm:rounded-lg sm:px-3 sm:py-2 sm:text-xs sm:font-medium"
            >
              <SignOut size={16} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </form>
        </div>
      </header>

      {/* Barra de abas no celular — fixa embaixo, mesmo tratamento glass do resto do app. Some a
          partir do breakpoint sm, onde a navegação do topo já dá conta. `pb-[env(safe-area-inset-
          bottom)]` evita ficar por baixo da barra de gestos do iPhone. 5 itens (não 7-8) dão pra
          cada um respirar e ter uma área de toque de verdade. */}
      <nav
        className="barra-vidro fixed inset-x-0 bottom-0 z-20 border-t sm:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}
      >
        <div className="grid grid-cols-5">
          {LINKS.map(({ href, label, Icone }) => (
            <Link
              key={href}
              href={href}
              className={
                ativoNaBarra === href
                  ? "flex flex-col items-center gap-1 px-1 py-3 text-accent-strong"
                  : "flex flex-col items-center gap-1 px-1 py-3 text-neutral-500"
              }
            >
              <Icone size={22} weight={ativoNaBarra === href ? "fill" : "regular"} />
              <span className="text-center text-[11px] font-medium leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
