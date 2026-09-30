import Link from "next/link";
import { Crown, Gauge, Stack, Broadcast, Megaphone, Wallet } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { obterResumoRedePorUnidade } from "@/lib/campanhasRede";
import PanoramaCampanhasRede from "@/components/PanoramaCampanhasRede";

const ATALHOS: { href: string; nome: string; descricao: string; Icone: Icon }[] = [
  {
    href: "/campanhas?rede=franquia",
    nome: "Campanhas da rede",
    descricao: "Só as unidades de franquia — escolha uma pra ver e mexer nas campanhas dela.",
    Icone: Megaphone,
  },
  {
    href: "/financeiro?rede=franquia",
    nome: "Financeiro da rede",
    descricao: "Saldo e ritmo de gasto só das unidades de franquia.",
    Icone: Wallet,
  },
  {
    href: "/estrategias/campanhas-mae",
    nome: "Campanhas-Mãe",
    descricao: "O padrão oficial de campanha da rede, aplicado em quantas unidades você quiser.",
    Icone: Crown,
  },
  {
    href: "/estrategias/semaforo",
    nome: "Semáforo das unidades",
    descricao: "Quais unidades estão indo bem e quais precisam de atenção agora.",
    Icone: Gauge,
  },
  {
    href: "/estrategias/moldes",
    nome: "Moldes de campanhas",
    descricao: "Sequências reutilizáveis (etapas, tipo, duração) — monte uma vez, aplique em várias unidades.",
    Icone: Stack,
  },
  {
    href: "/estrategias/postagens",
    nome: "Radar de posts",
    descricao: "Data do post mais recente de cada unidade no Instagram, mais stories do dia — alerta quem tá sumida.",
    Icone: Broadcast,
  },
];

/** Hub da Central da rede — grid de atalhos pras funções que padronizam/comparam entre unidades, e
 * logo abaixo o panorama de campanhas ativas da rede inteira (mesmo cache 2x/dia usado em
 * /campanhas, ver src/lib/campanhasRede.ts). Antes desse lugar mostrava o construtor/lista de
 * Moldes (Estratégias) direto aqui — virou um atalho como os outros (ver /estrategias/moldes),
 * porque criar molde é uma tarefa ocasional, e a lista de campanhas ativas é o que vale a pena
 * bater o olho toda vez que se abre essa tela. O container "Insights da rede" (Semáforo + campanhas
 * ativas resumidos em texto corrido) saiu por pedido explícito — sem dado real de verdade ainda no
 * cache, ele só mostrava texto genérico de espera, sem nenhuma utilidade. */
export default async function PainelEstrategias() {
  const { unidades, atualizadoEm } = await obterResumoRedePorUnidade();

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ATALHOS.map(({ href, nome: nomeAtalho, descricao: descricaoAtalho, Icone }) => (
          <Link
            key={href}
            href={href}
            className="cartao-vidro flex flex-col gap-2.5 p-4 transition hover:border-accent/40"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300">
              <Icone size={18} weight="regular" />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-100">{nomeAtalho}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{descricaoAtalho}</p>
            </div>
          </Link>
        ))}
      </div>

      <PanoramaCampanhasRede unidades={unidades} atualizadoEm={atualizadoEm} />
    </div>
  );
}
