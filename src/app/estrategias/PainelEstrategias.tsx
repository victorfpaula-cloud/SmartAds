import Link from "next/link";
import { Crown, Gauge, Stack, Broadcast, Megaphone, Wallet } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { obterCampanhasAtivasRede, ROTULO_OBJETIVO, type CampanhaRedeResumo } from "@/lib/campanhasRede";

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

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface GrupoUnidade {
  contaId: string;
  clienteNome: string;
  contaNome: string;
  campanhas: CampanhaRedeResumo[];
}

// Agrupa por conta — cada card do cache já é uma campanha ATIVA (recalcularCampanhasRede só grava
// isso), então a bolinha verde é fixa aqui: uma unidade só aparece nessa lista se tiver pelo menos
// uma campanha no ar agora.
function agruparPorUnidade(campanhas: CampanhaRedeResumo[]): GrupoUnidade[] {
  const porConta = new Map<string, GrupoUnidade>();
  for (const campanha of campanhas) {
    const grupo = porConta.get(campanha.contaId) ?? {
      contaId: campanha.contaId,
      clienteNome: campanha.clienteNome,
      contaNome: campanha.contaNome,
      campanhas: [],
    };
    grupo.campanhas.push(campanha);
    porConta.set(campanha.contaId, grupo);
  }
  return [...porConta.values()].sort((a, b) => a.clienteNome.localeCompare(b.clienteNome));
}

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
 * bater o olho toda vez que se abre essa tela. O container "Insights da rede" (Semáforo + campanhas
 * ativas resumidos em texto corrido) saiu por pedido explícito — sem dado real de verdade ainda no
 * cache, ele só mostrava texto genérico de espera, sem nenhuma utilidade. */
export default async function PainelEstrategias() {
  const { campanhas: campanhasRede, atualizadoEm } = await obterCampanhasAtivasRede();
  const gruposUnidade = agruparPorUnidade(campanhasRede);

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

        {gruposUnidade.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Nenhuma campanha ativa na rede agora.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {gruposUnidade.map((grupo) => (
              <div key={grupo.contaId} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-2 border-b border-white/10 px-3.5 py-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-ok" title="Com campanha ativa" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-100">{grupo.clienteNome}</p>
                    <p className="truncate text-[10.5px] text-neutral-600">{grupo.contaNome}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-[10.5px] font-medium text-neutral-500">
                    {grupo.campanhas.length} campanha{grupo.campanhas.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="divide-y divide-white/5">
                  {grupo.campanhas.map((campanha, indice) => (
                    <div key={indice} className="flex flex-col gap-0.5 px-3.5 py-2.5">
                      <p className="truncate text-xs font-medium text-neutral-200">{campanha.nome}</p>
                      <p className="text-[10.5px] text-neutral-500">
                        {campanha.objetivo ? ROTULO_OBJETIVO[campanha.objetivo] ?? campanha.objetivo : "-"}
                        {campanha.orcamentoDiarioCentavos != null && (
                          <span className="text-neutral-400">
                            {" "}
                            · {formatoReal.format(campanha.orcamentoDiarioCentavos / 100)}/dia
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
