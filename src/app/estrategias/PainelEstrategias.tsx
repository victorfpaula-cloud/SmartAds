import { Crown, Gauge, Stack, Broadcast, Megaphone, Wallet, Lightning, PiggyBank } from "@phosphor-icons/react/dist/ssr";
import AtalhosCentral, { type AtalhoCentral } from "@/components/AtalhosCentral";
import { obterResumoRedePorUnidade } from "@/lib/campanhasRede";
import PanoramaCampanhasRede from "@/components/PanoramaCampanhasRede";

// Duas etapas, na ordem em que se usam: PLANEJAR (montar a sequência e a campanha oficial) e
// ACOMPANHAR (ver o que está no ar, o dinheiro e a saúde de cada unidade).
const PLANEJAR: AtalhoCentral[] = [
  {
    href: "/estrategias/moldes",
    nome: "1. Moldes (sequências)",
    descricao: "Monte uma vez uma sequência de campanhas (etapas, tipo, duração) pra reaproveitar em várias unidades.",
    Icone: Stack,
  },
  {
    href: "/estrategias/campanhas-mae",
    nome: "2. Campanha oficial da rede",
    descricao: "Aplique um molde, com o criativo oficial, nas unidades que você escolher (a Campanha-Mãe).",
    Icone: Crown,
  },
  {
    href: "/boost",
    nome: "Boost da rede",
    descricao: "O que o boost entrega (engajamento, alcance ou os dois), orçamento e datas especiais.",
    Icone: Lightning,
  },
];

const ACOMPANHAR: AtalhoCentral[] = [
  {
    href: "/campanhas?rede=franquia",
    nome: "Campanhas da rede",
    descricao: "O que está no ar em cada unidade — escolha uma pra ver e mexer nas campanhas dela.",
    Icone: Megaphone,
  },
  {
    href: "/financeiro?rede=franquia",
    nome: "Financeiro da rede",
    descricao: "Saldo, ritmo de gasto e situação da conta de cada unidade.",
    Icone: Wallet,
  },
  {
    href: "/financeiro/investimentos",
    nome: "Investimento por unidade",
    descricao: "Quanto cada unidade combinou investir no mês, quanto já investiu e quando.",
    Icone: PiggyBank,
  },
  {
    href: "/estrategias/semaforo",
    nome: "Semáforo das unidades",
    descricao: "Quais unidades estão indo bem e quais precisam de atenção agora.",
    Icone: Gauge,
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
      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Planejar</h2>
        <AtalhosCentral atalhos={PLANEJAR} />
      </section>
      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Acompanhar</h2>
        <AtalhosCentral atalhos={ACOMPANHAR} />
      </section>

      <PanoramaCampanhasRede unidades={unidades} atualizadoEm={atualizadoEm} comBoost />
    </div>
  );
}
