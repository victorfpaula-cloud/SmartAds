import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";

export interface AtalhoCentral {
  href: string;
  nome: string;
  descricao: string;
  Icone: Icon;
}

/** Grade de atalhos de uma central (da rede ou de uma empresa): mesmo visual nas duas. */
export default function AtalhosCentral({ atalhos }: { atalhos: AtalhoCentral[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {atalhos.map(({ href, nome, descricao, Icone }) => (
        <Link
          key={href}
          href={href}
          className="cartao-vidro flex flex-col gap-2.5 p-4 transition hover:border-accent/40"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300">
            <Icone size={18} weight="regular" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-100">{nome}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{descricao}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
