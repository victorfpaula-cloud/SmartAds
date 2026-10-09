"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Megaphone,
  Binoculars,
  UsersThree,
  CurrencyCircleDollar,
  ChartBar,
  Robot,
  Lightning,
  Motorcycle,
  Target,
  Plugs,
  type Icon,
} from "@phosphor-icons/react";

const ICONES: Record<string, Icon> = {
  inicio: House,
  campanhas: Megaphone,
  radar: Binoculars,
  unidades: UsersThree,
  financeiro: CurrencyCircleDollar,
  relatorios: ChartBar,
  automacao: Robot,
  boost: Lightning,
  delivery: Motorcycle,
  publicos: Target,
  contas: Plugs,
};

export interface ItemMenu {
  href: string;
  label: string;
  /** Nome do ícone (ver ICONES). */
  icone?: keyof typeof ICONES;
  /** Prefixos extras de caminho que também acendem esse botão. */
  tambem?: string[];
}

const COLUNAS: Record<number, string> = {
  5: "md:grid-cols-5",
  6: "md:grid-cols-6",
  7: "md:grid-cols-7",
  8: "md:grid-cols-8",
};

/** Botões do menu — ícone + nome, em grade (quebra em duas linhas quando falta espaço). O ativo é o
 * de caminho mais específico que bate com a página aberta. */
export default function MenuNavegacao({ itens }: { itens: ItemMenu[] }) {
  const caminho = usePathname() ?? "/";
  const bate = (i: ItemMenu) =>
    [i.href.split("?")[0], ...(i.tambem ?? [])].filter((h) => (h === "/" ? caminho === "/" : caminho === h || caminho.startsWith(`${h}/`)));
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
    <nav className={`grid grid-cols-4 gap-1.5 ${COLUNAS[itens.length] ?? "md:grid-cols-6"}`}>
      {itens.map((i) => {
        const Ico = i.icone ? ICONES[i.icone] : null;
        const ligado = ativo === i.href;
        return (
          <Link
            key={i.href + i.label}
            href={i.href}
            prefetch={i.href.startsWith("/api/") ? false : undefined}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-[12px] leading-tight ${
              ligado
                ? "pilula-ativa font-semibold text-neutral-100"
                : "bg-white/[0.04] font-medium text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-200"
            }`}
          >
            {Ico && <Ico size={20} weight={ligado ? "fill" : "regular"} />}
            <span>{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
