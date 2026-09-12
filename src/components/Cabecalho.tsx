import Link from "next/link";
import {
  Buildings,
  Megaphone,
  Target,
  ChartLineUp,
  SignOut,
} from "@phosphor-icons/react/dist/ssr";

const LINKS = [
  { href: "/contas", label: "Contas", Icone: Buildings },
  { href: "/campanhas", label: "Campanhas", Icone: Megaphone },
  { href: "/publicos", label: "Públicos", Icone: Target },
  { href: "/relatorios", label: "Relatórios", Icone: ChartLineUp },
];

/** Navegação principal — vira barra de abas fixa embaixo no celular (padrão de app, mais fácil de
 * alcançar com o polegar) e barra no topo no desktop. Um só componente, dois layouts via classes
 * responsivas, pra nunca desalinhar qual aba está ativa entre as duas versões. */
export default function Cabecalho({ ativo }: { ativo: string }) {
  return (
    <>
      {/* `env(safe-area-inset-top)` evita colidir com a barra de status do iPad/iPhone quando o
          app roda "Adicionado à Tela de Início" (modo standalone, sem a barra do Safari que antes
          empurrava o conteúdo pra baixo) — mesmo problema já corrigido embaixo, agora em cima. */}
      <header
        className="barra-vidro sticky top-0 z-20 border-b"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-3.5">
          <div className="flex items-center gap-8">
            <span className="font-display text-[15px] font-bold tracking-tight">SmartAds</span>
            <nav className="hidden items-center gap-1 sm:flex">
              {LINKS.map(({ href, label, Icone }) => (
                <Link
                  key={href}
                  href={href}
                  className={
                    ativo === href
                      ? "pilula-ativa flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-neutral-100"
                      : "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-neutral-400 hover:text-neutral-200"
                  }
                >
                  <Icone size={16} weight={ativo === href ? "fill" : "regular"} />
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              aria-label="Sair"
              className="botao-icone-vidro h-9 w-9 rounded-lg text-neutral-400 sm:h-auto sm:w-auto sm:gap-1.5 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs sm:font-medium"
            >
              <SignOut size={16} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </form>
        </div>
      </header>

      {/* Barra de abas no celular — fixa embaixo, mesmo tratamento glass do resto do app. Some a
          partir do breakpoint sm, onde a navegação do topo já dá conta. `pb-[env(safe-area-inset-
          bottom)]` evita ficar por baixo da barra de gestos do iPhone. */}
      <nav
        className="barra-vidro fixed inset-x-0 bottom-0 z-20 border-t sm:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}
      >
        <div className="grid grid-cols-4">
          {LINKS.map(({ href, label, Icone }) => (
            <Link
              key={href}
              href={href}
              className={
                ativo === href
                  ? "flex flex-col items-center gap-1 py-2.5 text-accent-strong"
                  : "flex flex-col items-center gap-1 py-2.5 text-neutral-500"
              }
            >
              <Icone size={22} weight={ativo === href ? "fill" : "regular"} />
              <span className="text-[10.5px] font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
