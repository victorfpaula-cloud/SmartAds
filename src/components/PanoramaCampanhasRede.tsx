import Link from "next/link";
import type { UnidadeRedeResumo } from "@/lib/campanhasRede";

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

/** Panorama da rede numa olhada: uma linha por unidade com quantas campanhas estão no ar e quanto
 * já foi gasto no mês (contra o teto mensal da unidade). Detalhe de cada campanha fica dentro da
 * página da unidade (clicar na linha) — aqui só o que dá pra comparar entre unidades. */
export default function PanoramaCampanhasRede({
  unidades,
  atualizadoEm,
}: {
  unidades: UnidadeRedeResumo[];
  atualizadoEm: string | null;
}) {
  const totalCampanhas = unidades.reduce((soma, u) => soma + u.campanhasAtivas, 0);
  const unidadesComCampanha = unidades.filter((u) => u.campanhasAtivas > 0).length;
  const totalGastoMes = unidades.reduce((soma, u) => soma + (u.gastoMesCentavos ?? 0), 0);
  const algumGasto = unidades.some((u) => u.gastoMesCentavos !== null);

  return (
    <section className="cartao-vidro overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">Campanhas ativas na rede</h2>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {unidadesComCampanha} de {unidades.length} unidades com campanha no ar · {formatarAtualizacao(atualizadoEm)}
          </p>
        </div>
        <div className="flex gap-6">
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">No ar</p>
            <p className="text-lg font-bold leading-tight text-neutral-100">{totalCampanhas}</p>
          </div>
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">Gasto no mês</p>
            <p className="text-lg font-bold leading-tight text-neutral-100">{algumGasto ? reais(totalGastoMes) : "—"}</p>
          </div>
        </div>
      </div>

      {unidades.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-neutral-500">Nenhuma unidade de franquia cadastrada.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {unidades.map((unidade) => {
            const ativa = unidade.campanhasAtivas > 0;
            const percentual =
              unidade.gastoMesCentavos !== null && unidade.tetoMensalCentavos > 0
                ? Math.min(100, Math.round((unidade.gastoMesCentavos / unidade.tetoMensalCentavos) * 100))
                : 0;
            const estourou =
              unidade.gastoMesCentavos !== null && unidade.gastoMesCentavos > unidade.tetoMensalCentavos;
            return (
              <li key={unidade.contaId}>
                <Link
                  href={`/campanhas/conta/${unidade.contaId}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3 transition hover:bg-white/[0.03] sm:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${ativa ? "bg-ok" : "bg-neutral-700"}`}
                      title={ativa ? "Com campanha no ar" : "Sem campanha no ar"}
                    />
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${ativa ? "text-neutral-100" : "text-neutral-500"}`}>
                        {unidade.clienteNome}
                      </p>
                      <p className="truncate text-[10.5px] text-neutral-600">{unidade.contaNome}</p>
                    </div>
                  </div>

                  <span
                    className={`justify-self-end rounded-full px-2.5 py-1 text-xs font-semibold ${
                      ativa ? "bg-ok/15 text-ok" : "bg-white/[0.05] text-neutral-500"
                    }`}
                  >
                    {ativa
                      ? `${unidade.campanhasAtivas} campanha${unidade.campanhasAtivas !== 1 ? "s" : ""}`
                      : "Nenhuma no ar"}
                  </span>

                  <div className="col-span-2 sm:col-span-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-neutral-200">
                        {unidade.gastoMesCentavos !== null ? reais(unidade.gastoMesCentavos) : "—"}
                      </p>
                      <p className="text-[10.5px] text-neutral-500">de {reais(unidade.tetoMensalCentavos)} no mês</p>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className={`h-full rounded-full ${estourou ? "bg-danger" : "bg-accent"}`}
                        style={{ width: `${percentual}%` }}
                      />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
