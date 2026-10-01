import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  obterRelatorioPostagens,
  classificarComparativoRede,
  calcularEstatisticasStories,
  descricaoTotalStories,
  formatarMediaStories,
  ROTULO_COMPARATIVO,
  type DiaRelatorioPostagem,
  type ComparativoRede,
} from "@/lib/relatorioPostagens";
import { WarningCircle, InstagramLogo } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

const CLASSE_COMPARATIVO: Record<ComparativoRede, string> = {
  acima: "bg-ok/15 text-ok",
  na_media: "bg-indigo-500/15 text-indigo-300",
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
  const statsStories = calcularEstatisticasStories(unidades);
  const stats = statsStories.porConta.get(unidade.contaId);

  const metade = Math.ceil(unidade.dias.length / 2);
  const colunas = [unidade.dias.slice(0, metade), unidade.dias.slice(metade)];

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/estrategias/postagens" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Radar de posts
        </Link>

        <div className="mt-1">
          <h1 className="font-display text-2xl font-bold">
            {unidade.clienteNome}
            {unidade.instagramUsername && (
              <span className="ml-2 align-middle text-sm font-normal text-neutral-500">@{unidade.instagramUsername}</span>
            )}
          </h1>
          {unidade.instagramVinculado && (
            // Subcard discreto: selo de saúde à esquerda (coluna fixa, pros textos alinharem) e
            // "mídia · números" na frente — feed/Reels numa linha, stories na outra.
            <div className="mt-3 space-y-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
              <LinhaSaude
                classe={CLASSE_COMPARATIVO[comparativo]}
                rotulo={ROTULO_COMPARATIVO[comparativo]}
                midia="Feed / Reels"
                texto={`${unidade.totalPostagens} ${unidade.totalPostagens === 1 ? "postagem" : "postagens"} em 30 dias`}
              />
              <LinhaSaude
                classe={CLASSE_COMPARATIVO[stats?.comparativo ?? "sem_base"]}
                rotulo={ROTULO_COMPARATIVO[stats?.comparativo ?? "sem_base"]}
                midia="Stories"
                texto={`${descricaoTotalStories(stats?.total ?? 0, statsStories.diasDeColeta)}${
                  stats?.mediaDia != null ? ` · média ${formatarMediaStories(stats.mediaDia)}/dia` : ""
                }`}
              />
            </div>
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

function LinhaSaude({ classe, rotulo, midia, texto }: { classe: string; rotulo: string; midia: string; texto: string }) {
  // Três colunas fixas (selo, mídia, números): selos de mesma largura e o primeiro número de cada
  // linha alinhado na vertical, não importa o tamanho do rótulo.
  return (
    <div className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[12.5rem_6rem_1fr] sm:gap-3">
      <span className={`w-fit whitespace-nowrap rounded-full px-3 py-1 text-center text-xs font-semibold sm:w-full ${classe}`}>{rotulo}</span>
      <span className="text-sm font-semibold text-neutral-200">{midia}</span>
      <p className="text-sm text-neutral-400">{texto}</p>
    </div>
  );
}

function LinhaDia({ dia }: { dia: DiaRelatorioPostagem }) {
  if (dia.diasSemPostarDestaque !== null) {
    return (
      <div className="flex items-center gap-2 border-l-2 border-danger bg-danger/10 px-4 py-2.5">
        <WarningCircle size={13} weight="fill" className="shrink-0 text-danger" />
        <p className="text-xs font-semibold text-danger">
          {dia.diaExibicao} — atenção: {dia.diasSemPostarDestaque} dias sem postar
        </p>
      </div>
    );
  }

  if (dia.horasPost.length > 0) {
    return (
      <div className="flex items-start justify-between gap-3 px-4 py-2.5">
        <span className="pt-0.5 text-xs text-neutral-500">{dia.diaExibicao}</span>
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-end gap-0.5">
            {dia.horasPost.map((hora, i) => (
              <span key={i} className="text-xs font-semibold text-ok">
                {dia.horasPost.length > 1 ? `Post ${i + 1} · ` : "OK · "}
                {hora}
              </span>
            ))}
          </div>
          <ContadorStories quantidade={dia.storiesPostados} temRegistro={dia.temRegistroStories} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-xs text-neutral-600">{dia.diaExibicao}</span>
      <div className="flex items-center gap-4">
        <span className="text-xs text-neutral-700">—</span>
        <ContadorStories quantidade={dia.storiesPostados} temRegistro={dia.temRegistroStories} />
      </div>
    </div>
  );
}

// Só informativo — stories não participam de aviso nem têm cor de destaque, por isso fica sempre
// no mesmo cinza neutro dos dias sem post. "—" só aparece antes da coleta de stories começar
// (temRegistro falso); a partir daí, dia sem story é "0 stories" de verdade.
function ContadorStories({ quantidade, temRegistro }: { quantidade: number; temRegistro: boolean }) {
  const texto = quantidade > 0 ? `${quantidade} ${quantidade === 1 ? "story" : "stories"}` : temRegistro ? "0 stories" : "—";
  return <span className="w-16 shrink-0 pt-0.5 text-right text-[11px] text-neutral-600">{texto}</span>;
}
