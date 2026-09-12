import Link from "next/link";

const LINKS = [
  { href: "/contas", label: "Contas" },
  { href: "/campanhas", label: "Campanhas" },
  { href: "/publicos", label: "Públicos" },
  { href: "/relatorios", label: "Relatórios" },
];

export default function Cabecalho({ ativo }: { ativo: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-8">
          <span className="font-display text-[15px] font-bold tracking-tight">SmartAds</span>
          <nav className="flex items-center gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  ativo === link.href
                    ? "rounded-lg bg-white/[0.06] px-3 py-1.5 text-[13px] font-semibold text-neutral-100"
                    : "rounded-lg px-3 py-1.5 text-[13px] font-medium text-neutral-400 hover:text-neutral-200"
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-neutral-400 hover:border-white/20 hover:text-neutral-200"
          >
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
