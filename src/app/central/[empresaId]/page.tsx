import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";
import PanoramaCampanhasRede from "@/components/PanoramaCampanhasRede";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { lerAmbiente } from "@/lib/ambiente";
import { obterResumoPorUnidade } from "@/lib/campanhasRede";
import { coletarFinanceiro } from "@/lib/financeiro/coletarFinanceiro";
import { descreverSituacaoConta } from "@/lib/financeiro/situacaoConta";
import { calcularPrevisaoSaldo } from "@/lib/financeiro/previsaoSaldo";
import { mesAtualEmSaoPaulo } from "@/lib/tempoSaoPaulo";

export const dynamic = "force-dynamic";

const reais = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);

/** Visão geral de uma conta única: situação e saldo no topo, os números do mês e as campanhas dela
 * (com o boost) logo abaixo — sem atalhos que repetem o menu. */
export default async function VisaoGeralDaContaPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { data: empresa } = await criarClienteAdmin()
    .from("smartads_empresas")
    .select("id, nome, tipo")
    .eq("id", empresaId)
    .maybeSingle();

  if (!empresa) notFound();
  if (empresa.tipo === "franquia") redirect(`/api/ambiente?empresa=${empresa.id}`);
  // Entrou direto pelo link: trava o ambiente dessa conta pro menu e as telas seguintes.
  if ((await lerAmbiente())?.id !== empresa.id) redirect(`/api/ambiente?empresa=${empresa.id}`);

  const [{ unidades, atualizadoEm }, contasFin] = await Promise.all([
    obterResumoPorUnidade({ apenasFranquia: false, empresaId }),
    coletarFinanceiro(empresaId),
  ]);
  const fin = contasFin[0];
  const situacao = fin ? descreverSituacaoConta(fin.statusConta, fin.motivoDesativacao) : null;
  const previsao = fin ? calcularPrevisaoSaldo(fin.saldoDisponivelCentavos, fin.mediaDiariaCentavos) : null;
  const campanhasNoAr = unidades.reduce((t, u) => t + (u.semSaldo ? 0 : u.campanhasAtivas ?? 0), 0);
  const paradasSemSaldo = unidades.reduce((t, u) => t + (u.semSaldo ? u.campanhasAtivas ?? 0 : 0), 0);
  const gastoMes = unidades.some((u) => u.gastoMesCentavos !== null)
    ? unidades.reduce((t, u) => t + (u.gastoMesCentavos ?? 0), 0)
    : null;
  const boostsNoAr = unidades.reduce((t, u) => t + (u.boost.ativo && !u.semSaldo ? u.boost.noAr : 0), 0);
  const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
    new Date(`${mesAtualEmSaoPaulo()}-01T00:00:00Z`)
  );
  const tomSituacao = { ok: "text-ok", atencao: "text-amber-400", critico: "text-danger", neutro: "text-neutral-400" };

  return (
    <>
      <Cabecalho ativo="/central" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">{empresa.nome}</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Visão geral da conta:{" "}
              {situacao && <span className={`font-semibold ${tomSituacao[situacao.tom]}`}>{situacao.texto}</span>}
              {situacao?.detalhe ? ` — ${situacao.detalhe}` : ""}
            </p>
          </div>
          <Link
            href="/campanhas/nova"
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            + Nova campanha
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Numero rotulo="Campanhas no ar" valor={String(campanhasNoAr)} aviso={paradasSemSaldo > 0 ? `${paradasSemSaldo} parada${paradasSemSaldo > 1 ? "s" : ""} sem saldo` : undefined} />
          <Numero rotulo={`Gasto em ${nomeMes}`} valor={gastoMes !== null ? reais(gastoMes) : "—"} />
          <Numero
            rotulo="Saldo disponível"
            valor={fin?.saldoDisponivelCentavos != null ? reais(Math.max(fin.saldoDisponivelCentavos, 0)) : "—"}
            aviso={previsao && previsao.dias !== null && previsao.dias <= 7 ? `acaba em ${previsao.texto}` : undefined}
          />
          <Numero rotulo="Boosts no ar" valor={String(boostsNoAr)} />
        </div>

        <div className="mt-6">
          <PanoramaCampanhasRede
            unidades={unidades}
            atualizadoEm={atualizadoEm}
            titulo={`Campanhas ativas · ${empresa.nome}`}
            comBoost
          />
        </div>
      </main>
    </>
  );
}

function Numero({ rotulo, valor, aviso }: { rotulo: string; valor: string; aviso?: string }) {
  return (
    <div className="cartao-vidro px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{rotulo}</p>
      <p className="mt-1 text-xl font-bold text-neutral-100">{valor}</p>
      {aviso && <p className="mt-0.5 text-[11px] font-semibold text-danger">{aviso}</p>}
    </div>
  );
}
