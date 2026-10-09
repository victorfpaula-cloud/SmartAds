"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AbaPagina {
  href: string;
  label: string;
  /** Prefixos extras que também acendem essa aba. */
  tambem?: string[];
}

/** Abas dentro de uma tela (ex.: Moldes | Campanhas-Mãe | Planos). Só mudam a seção; o menu de cima
 * continua o mesmo. */
export default function AbasPagina({ abas, destaque = false }: { abas: AbaPagina[]; destaque?: boolean }) {
  const caminho = usePathname() ?? "";
  const bate = (a: AbaPagina) => [a.href, ...(a.tambem ?? [])].some((h) => caminho === h || caminho.startsWith(`${h}/`));
  return (
    <div className={destaque ? "mb-6 flex flex-wrap justify-center gap-2.5" : "mb-5 flex flex-wrap gap-2"}>
      {abas.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={
            bate(a)
              ? `pilula-ativa rounded-lg ${destaque ? "px-6 py-3 text-sm" : "px-3.5 py-2 text-[13px]"} font-semibold text-neutral-100`
              : `rounded-lg bg-white/[0.04] ${destaque ? "px-6 py-3 text-sm" : "px-3.5 py-2 text-[13px]"} font-medium text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-200`
          }
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
}
