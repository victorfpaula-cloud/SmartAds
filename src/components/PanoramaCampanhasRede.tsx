import { Buildings, Storefront } from "@phosphor-icons/react/dist/ssr";
import type { UnidadeRedeResumo } from "@/lib/campanhasRede";
import BotaoAtualizarRede from "@/components/BotaoAtualizarRede";
import LinhaUnidadeRede from "@/components/LinhaUnidadeRede";

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (centavos: number) => formatoReal.format(centavos / 100);

function formatarAtualizacao(iso: string | null): string {
  if (!iso) return "aguardando a primeira atualização automática";
  const horas = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (horas < 1) return "atualizado há menos de 1h";
  if (horas < 24) return `atualizado há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `atualizado há ${dias} dia${dias !== 1 ? "s" : ""}`;
}

function totais(unidades: UnidadeRedeResumo[]) {
  return {
    campanhas: unidades.reduce((soma, u) => soma + (u.campanhasAtivas ?? 0), 0),
    comCampanha: unidades.filter((u) => (u.campanhasAtivas ?? 0) > 0).length,
    semDados: unidades.filter((u) => u.campanhasAtivas === null).length,
    gastoMes: unidades.reduce((soma, u) => soma + (u.gastoMesCentavos ?? 0), 0),
    algumGasto: unidades.some((u) => u.gastoMesCentavos !== null),
  };
}

function Indicadores({ unidades, nomeMes }: { unidades: UnidadeRedeResumo[]; nomeMes: string }) {
  const t = totais(unidades);
  return (
    <div className="flex items-end gap-6">
      <div>
        <p className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">No ar</p>
        <p className="text-lg font-bold leading-tight text-neutral-100">{t.campanhas}</p>
      </div>
      <div>
        <p className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">Gasto em {nomeMes}</p>
        <p className="text-lg font-bold leading-tight text-neutral-100">{t.algumGasto ? reais(t.gastoMes) : "—"}</p>
      </div>
    </div>
  );
}

/** Panorama de campanhas por unidade: quantas estão no ar e quanto já foi gasto no mês. Cada linha
 * abre a página da unidade (detalhe campanha por campanha). Dois usos:
 *  - Central da rede (`agruparPorEmpresa` desligado): um container só, "Campanhas ativas na rede";
 *  - menu Campanhas (`agruparPorEmpresa` ligado): visão geral de TODAS as contas, com um container
 *    por empresa (franquia ou individual) e o total geral no topo. */
export default function PanoramaCampanhasRede({
  unidades,
  atualizadoEm,
  agruparPorEmpresa = false,
  titulo = "Campanhas ativas na rede",
  comBoost = false,
}: {
  unidades: UnidadeRedeResumo[];
  atualizadoEm: string | null;
  agruparPorEmpresa?: boolean;
  titulo?: string;
  /** Na Central: coluna com o controle do boost automático de cada unidade. */
  comBoost?: boolean;
}) {
  const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());
  const t = totais(unidades);

  const cabecalhoGeral = (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-100">{titulo}</h2>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          {t.comCampanha} de {unidades.length} unidades com campanha no ar · {formatarAtualizacao(atualizadoEm)}
        </p>
        {t.semDados > 0 && (
          <p className="mt-1 text-[11px] text-amber-400">
            {t.semDados} {t.semDados === 1 ? "conta ainda sem dados" : "contas ainda sem dados"} — clique em
            “Atualizar agora” (o cron passa a incluí-las na próxima rodada).
          </p>
        )}
      </div>
      <div className="flex items-end gap-6">
        <Indicadores unidades={unidades} nomeMes={nomeMes} />
        <BotaoAtualizarRede />
      </div>
    </div>
  );

  if (unidades.length === 0) {
    return (
      <section className="cartao-vidro overflow-hidden">
        {cabecalhoGeral}
        <p className="border-t border-white/10 px-5 py-8 text-center text-sm text-neutral-500">
          Nenhuma conta de anúncio associada ainda.
        </p>
      </section>
    );
  }

  if (!agruparPorEmpresa) {
    return (
      <section className="cartao-vidro overflow-hidden">
        <div className="border-b border-white/10">{cabecalhoGeral}</div>
        <ul className="divide-y divide-white/5">
          {unidades.map((unidade) => (
            <LinhaUnidadeRede key={unidade.contaId} unidade={unidade} nomeMes={nomeMes} comBoost={comBoost} />
          ))}
        </ul>
      </section>
    );
  }

  const porEmpresa = new Map<string, UnidadeRedeResumo[]>();
  for (const unidade of unidades) {
    const chave = unidade.empresaId ?? "sem-empresa";
    porEmpresa.set(chave, [...(porEmpresa.get(chave) ?? []), unidade]);
  }
  // Franquias primeiro, depois as individuais; dentro de cada tipo, por nome.
  const empresas = [...porEmpresa.values()].sort((a, b) => {
    const pesoA = a[0].empresaTipo === "franquia" ? 0 : 1;
    const pesoB = b[0].empresaTipo === "franquia" ? 0 : 1;
    return pesoA - pesoB || a[0].empresaNome.localeCompare(b[0].empresaNome);
  });

  return (
    <div className="flex flex-col gap-4">
      <section className="cartao-vidro overflow-hidden">{cabecalhoGeral}</section>

      {empresas.map((lista) => {
        const empresa = lista[0];
        const Icone = empresa.empresaTipo === "franquia" ? Buildings : Storefront;
        return (
          <section key={empresa.empresaId ?? "sem-empresa"} className="cartao-vidro overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300">
                  <Icone size={16} weight="fill" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-neutral-100">{empresa.empresaNome}</h3>
                  <p className="text-[10.5px] text-neutral-500">
                    {empresa.empresaTipo === "franquia" ? "Franquia" : "Empresa individual"} · {lista.length}{" "}
                    {lista.length === 1 ? "conta" : "contas"}
                  </p>
                </div>
              </div>
              <Indicadores unidades={lista} nomeMes={nomeMes} />
            </div>
            <ul className="divide-y divide-white/5">
              {lista.map((unidade) => (
                <LinhaUnidadeRede key={unidade.contaId} unidade={unidade} nomeMes={nomeMes} comBoost={comBoost} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
