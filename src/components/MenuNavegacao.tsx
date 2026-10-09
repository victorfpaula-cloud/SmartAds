"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ItemMenu {
  href: string;
  label: string;
  /** Prefixos extras de caminho que também acendem esse botão. */
  tambem?: string[];
}

/** Botões do menu — todos iguais, com nome. O ativo é o de caminho mais específico que bate com a
 * página aberta (ex.: /financeiro/investimentos acende "Investimento", não "Financeiro"). */
export default function MenuNavegacao({ itens }: { itens: ItemMenu[] }) {
  const caminho = usePathname() ?? "/";
  const bate = (i: ItemMenu) => [i.href.split("?")[0], ...(i.tambem ?? [])].filter((h) => (h === "/" ? caminho === "/" : caminho === h || caminho.startsWith(`${h}/`)));
  let ativo = "";
  let melhor = -1;
  for (const i of itens) {
    for (const h of bate(i)) {
      if (h.length > melhor) {
        melhor = h.length;
        ativo = i.href;
      }
    }
  }

  return (
    <nav className="flex flex-wrap gap-1.5">
      {itens.map((i) => (
        <Link
          key={i.href + i.label}
          href={i.href}
          prefetch={i.href.startsWith("/api/") ? false : undefined}
          className={
            ativo === i.href
              ? "pilula-ativa whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-semibold text-neutral-100"
              : "whitespace-nowrap rounded-lg bg-white/[0.04] px-3.5 py-2 text-[13px] font-medium text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-200"
          }
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
