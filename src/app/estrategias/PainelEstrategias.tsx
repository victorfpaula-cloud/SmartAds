import Link from "next/link";
import { Crown, Gauge, Stack, CalendarBlank, Megaphone, Wallet } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { obterCampanhasAtivasRede, ROTULO_OBJETIVO } from "@/lib/campanhasRede";

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
    nome: "Última postagem",
    descricao: "Data do post mais recente de cada unidade no Instagram — alerta quem tá sumida.",
    Icone: CalendarBlank,
  },
];

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatarAtualizacao(iso: string | null): string {
  if (!iso) return "Ainda sem dados — aguardando a primeira atualização automática";
  const horas = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (horas < 1) return "Atualizado há menos de 1h";
  if (horas < 24) return `Atualizado há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `Atualizado há ${dias} dia${dias !== 1 ? "s" : ""}`;
}

/** Hub da Central da rede — grid de atalhos pras funções que padronizam/comparam entre unidades, e
 * logo abaixo o panorama de campanhas ativas da rede inteira (mesmo cache 2x/dia usado em
 * /campanhas, ver src/lib/campanhasRede.ts). Antes desse lugar mostrava o construtor/lista de
 * Moldes (Estratégias) direto aqui — virou um atalho como os outros (ver /estrategias/moldes),
 * porque criar molde é uma tarefa ocasional, e a lista de campanhas ativas é o que vale a pena
 * bater o olho toda vez que se abre essa tela. */
export default async function PainelEstrategias() {
  const { campanhas: campanhasRede, atualizadoEm } = await obterCampanhasAtivasRede();

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

      <section className="cartao-vidro overflow-hidden">
        <div className="border-b border-white/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-neutral-200">Campanhas ativas na rede</h2>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {campanhasRede.length} campanha{campanhasRede.length !== 1 ? "s" : ""} ativa
            {campanhasRede.length !== 1 ? "s" : ""} agora · {formatarAtualizacao(atualizadoEm)}
          </p>
        </div>

        {campanhasRede.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Nenhuma campanha ativa na rede agora.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3 font-medium">Unidade</th>
                  <th className="px-4 py-3 font-medium">Campanha</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Orçamento diário</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {campanhasRede.map((campanha, indice) => (
                  <tr key={`${campanha.contaId}-${indice}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-100">{campanha.clienteNome}</p>
                      <p className="text-[10.5px] text-neutral-600">{campanha.contaNome}</p>
                    </td>
                    <td className="px-4 py-3 text-neutral-300">{campanha.nome}</td>
                    <td className="px-4 py-3 text-neutral-400">
                      {campanha.objetivo ? ROTULO_OBJETIVO[campanha.objetivo] ?? campanha.objetivo : "-"}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {campanha.orcamentoDiarioCentavos != null
                        ? `${formatoReal.format(campanha.orcamentoDiarioCentavos / 100)}/dia`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
