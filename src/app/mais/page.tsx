import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { Target, Robot, ChartLineUp } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

export const dynamic = "force-dynamic";

const FERRAMENTAS: { href: string; nome: string; descricao: string; Icone: Icon }[] = [
  {
    href: "/publicos",
    nome: "Públicos",
    descricao: "Grupos salvos (localização, idade, interesses) pra usar em campanhas sem remontar tudo de novo toda vez.",
    Icone: Target,
  },
  {
    href: "/automacao",
    nome: "Automação",
    descricao: "Regras que ajustam orçamento e pausam anúncio fraco sozinhas, dentro dos limites que você define.",
    Icone: Robot,
  },
  {
    href: "/relatorios",
    nome: "Relatórios",
    descricao: "Resumo de gasto, alcance e resultado por cliente — pronto pra revisar ou mandar pra eles.",
    Icone: ChartLineUp,
  },
];

/** Diretório das ferramentas de uso mais esporádico — configura uma vez, revisita de vez em
 * quando. Tiradas da barra principal (ver Cabecalho.tsx) porque competiam por espaço com o que se
 * abre todo dia, e cada card aqui explica o que a ferramenta faz, não só o nome — é a página que
 * responde "o que eu faço, por onde eu faço" pra quem não usa o app toda hora. */
export default function MaisPage() {
  return (
    <>
      <Cabecalho ativo="/mais" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Mais ferramentas</h1>
        <p className="mt-1 text-sm text-neutral-400">
          O que você não abre todo dia, mas usa de vez em quando.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {FERRAMENTAS.map(({ href, nome, descricao, Icone }) => (
            <Link
              key={href}
              href={href}
              className="cartao-vidro flex items-center gap-4 p-4 transition hover:border-accent/40"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-neutral-300">
                <Icone size={20} weight="regular" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-100">{nome}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">{descricao}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
