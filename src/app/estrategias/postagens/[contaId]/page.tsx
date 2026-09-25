import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  obterRelatorioPostagens,
  classificarComparativoRede,
  ROTULO_COMPARATIVO,
  type DiaRelatorioPostagem,
  type ComparativoRede,
} from "@/lib/relatorioPostagens";
import { WarningCircle, InstagramLogo } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

const CLASSE_COMPARATIVO: Record<ComparativoRede, string> = {
  acima: "bg-ok/15 text-ok",
  na_media: "bg-white/[0.06] text-neutral-400",
  abaixo: "bg-amber-500/15 text-amber-400",
  critico: "bg-danger/15 text-danger",
  sem_base: "bg-white/[0.06] text-neutral-400",
};

/** Histórico de 30 dias de UMA unidade — o mesmo dado do relatório baixável/por e-mail (ver
 * src/lib/relatorioPostagens.ts), só que na cara do app em vez do HTML pensado pra e-mail. Busca
 * o relatório de todas as unidades de franquia porque a média da rede (pro selo de comparativo)
 * depende das outras — mesmo custo que a tela de baixar/enviar já paga. */
export default async function DetalhePostagensPage({ params }: { params: Promise<{ contaId: string }> }) {
  const { contaId } = await params;
  const unidades = await obterRelatorioPostagens();
  const unidade = unidades.find((u) => u.contaId === contaId);
  if (!unidade) notFound();

  const vinculadas = unidades.filter((u) => u.instagramVinculado);
  const mediaRede =
    vinculadas.length > 0 ? vinculadas.reduce((soma, u) => soma + u.totalPostagens, 0) / vinculadas.length : 0;
  const comparativo = classificarComparativoRede(unidade.totalPostagens, mediaRede);

  const metade = Math.ceil(unidade.dias.length / 2);
  const colunas = [unidade.dias.slice(0, metade), unidade.dias.slice(metade)];

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/estrategias/postagens" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Última postagem
        </Link>

        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">{unidade.clienteNome}</h1>
            <p className="mt-1 text-sm text-neutral-400">
              {unidade.instagramUsername && <>@{unidade.instagramUsername} · </>}
              {unidade.totalPostagens} postagem{unidade.totalPostagens !== 1 ? "s" : ""} nos últimos 30 dias
            </p>
          </div>
          {unidade.instagramVinculado && (
            <span
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${CLASSE_COMPARATIVO[comparativo]}`}
            >
              {ROTULO_COMPARATIVO[comparativo]}
            </span>
          )}
        </div>

        {!unidade.instagramVinculado ? (
          <div className="cartao-vidro mt-6 flex flex-col items-center gap-2 px-5 py-10 text-center">
            <InstagramLogo size={22} className="text-neutral-600" />
            <p className="text-sm text-neutral-400">Instagram não vinculado a essa conta.</p>
          </div>
        ) : (
          <div className="cartao-vidro mt-6 overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-white/5">
              {colunas.map((coluna, indice) => (
                <div key={indice} className="divide-y divide-white/5">
                  {coluna.map((dia, i) => (
                    <LinhaDia key={i} dia={dia} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function LinhaDia({ dia }: { dia: DiaRelatorioPostagem }) {
  if (dia.destaqueAtraso) {
    return (
      <div className="flex items-center gap-2 border-l-2 border-danger bg-danger/10 px-4 py-2.5">
        <WarningCircle size={13} weight="fill" className="shrink-0 text-danger" />
        <p className="text-xs font-semibold text-danger">{dia.diaExibicao} — atenção: 5 dias sem postar</p>
      </div>
    );
  }

  if (dia.horasPost.length > 0) {
    return (
      <div className="flex items-start justify-between gap-3 px-4 py-2.5">
        <span className="pt-0.5 text-xs text-neutral-500">{dia.diaExibicao}</span>
        <div className="flex flex-col items-end gap-0.5">
          {dia.horasPost.map((hora, i) => (
            <span key={i} className="text-xs font-semibold text-ok">
              {dia.horasPost.length > 1 ? `Post ${i + 1} · ` : "OK · "}
              {hora}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-xs text-neutral-600">{dia.diaExibicao}</span>
      <span className="text-xs text-neutral-700">—</span>
    </div>
  );
}
