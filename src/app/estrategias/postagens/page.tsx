import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { obterRelatorioPostagens, classificarComparativoRede, type ComparativoRede } from "@/lib/relatorioPostagens";
import { WarningCircle, InstagramLogo, DownloadSimple, GridFour, CircleDashed } from "@phosphor-icons/react/dist/ssr";
import BotaoEnviarRelatorio from "./BotaoEnviarRelatorio";

export const dynamic = "force-dynamic";

const FUSO_HORARIO = "America/Sao_Paulo";
const DIAS_LIMITE_ATENCAO = 5;

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: FUSO_HORARIO });
}

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO_HORARIO });
}

interface CardData {
  contaId: string;
  clienteNome: string;
  instagramUsername: string | null;
  instagramVinculado: boolean;
  ultimoPostEm: string | null;
  diasSemPostar: number | null;
  precisaAtencao: boolean;
  comparativo: ComparativoRede | null;
  totalPostagens: number;
  storiesHoje: number;
}

export default async function PostagensPage() {
  // Mesma fonte de dados do relatório e da página de detalhe (obterRelatorioPostagens) — antes essa
  // grade usava obterUltimasPostagensPorUnidade, uma busca separada que batia na Meta de novo e
  // calculava "dias sem postar" com sua própria lógica, correndo o risco de um dia divergir do que
  // o relatório mostra pra mesma unidade.
  const unidadesRelatorio = await obterRelatorioPostagens();
  const agora = Date.now();
  const horaVerificacao = new Date(agora).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO_HORARIO,
  });

  const vinculadas = unidadesRelatorio.filter((u) => u.instagramVinculado);
  const mediaRede =
    vinculadas.length > 0 ? vinculadas.reduce((soma, u) => soma + u.totalPostagens, 0) / vinculadas.length : 0;

  const unidades: CardData[] = unidadesRelatorio.map((u) => {
    const diasSemPostar = u.ultimoPostEm ? Math.floor((agora - new Date(u.ultimoPostEm).getTime()) / 86_400_000) : null;
    return {
      contaId: u.contaId,
      clienteNome: u.clienteNome,
      instagramUsername: u.instagramUsername,
      instagramVinculado: u.instagramVinculado,
      ultimoPostEm: u.ultimoPostEm,
      diasSemPostar,
      precisaAtencao: diasSemPostar !== null && diasSemPostar >= DIAS_LIMITE_ATENCAO,
      comparativo: u.instagramVinculado ? classificarComparativoRede(u.totalPostagens, mediaRede) : null,
      totalPostagens: u.totalPostagens,
      storiesHoje: u.dias[u.dias.length - 1]?.storiesPostados ?? 0,
    };
  });

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/estrategias" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Central da rede
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mt-1 font-display text-2xl font-bold">Radar de posts</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Post mais recente de cada unidade no Instagram — feed, Reels ou carrossel, vale
              qualquer formato — mais os stories do dia. 5 dias sem postar acende o alerta. Clique
              num card pra ver o histórico completo dos últimos 30 dias.
            </p>
            <p className="mt-1 text-[11px] text-neutral-600">Verificado às {horaVerificacao}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <a
              href="/api/relatorios/postagens"
              download
              className="flex items-center gap-1.5 rounded-lg border border-white/14 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/[0.04]"
            >
              <DownloadSimple size={14} />
              Baixar relatório (30d)
            </a>
            <BotaoEnviarRelatorio />
          </div>
        </div>

        {unidades.length === 0 ? (
          <p className="cartao-vidro mt-6 px-5 py-6 text-sm text-neutral-400">
            Nenhuma unidade de franquia ativa ainda.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {unidades.map((unidade) => (
              <CardUnidade key={unidade.contaId} unidade={unidade} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

// Texto curto, sem selo/fundo — o card já é pequeno (grade de 3-4 colunas), então a cor sozinha
// mais a palavra já bate o olho sem competir por espaço com o resto do conteúdo.
const ROTULO_COMPARATIVO_CURTO: Record<ComparativoRede, string> = {
  acima: "Acima da média",
  na_media: "Na média",
  abaixo: "Abaixo da média",
  critico: "Alerta crítico",
  sem_base: "",
};

const CLASSE_COMPARATIVO_CURTO: Record<ComparativoRede, string> = {
  acima: "text-ok",
  na_media: "text-sky-300",
  abaixo: "text-amber-400",
  critico: "text-danger",
  sem_base: "",
};

function CardUnidade({ unidade }: { unidade: CardData }) {
  const conteudo = (() => {
    if (!unidade.instagramVinculado) {
      return {
        classe: "border-white/10 bg-white/[0.02]",
        corpo: (
          <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
            <InstagramLogo size={18} className="text-neutral-600" />
            <p className="text-[11px] text-neutral-500">Instagram não vinculado</p>
          </div>
        ),
      };
    }

    if (unidade.ultimoPostEm === null) {
      return {
        classe: "border-danger/30 bg-danger/10",
        corpo: (
          <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
            <WarningCircle size={18} weight="fill" className="text-danger" />
            <p className="text-[11px] font-medium text-danger">Nenhum post encontrado</p>
          </div>
        ),
      };
    }

    if (unidade.precisaAtencao) {
      return {
        classe: "border-danger/30 bg-danger/10",
        corpo: (
          <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-1 text-center">
            <WarningCircle size={18} weight="fill" className="text-danger" />
            <p className="mt-0.5 text-sm font-bold text-neutral-100">
              {formatarData(unidade.ultimoPostEm)} <span className="font-normal text-neutral-400">{formatarHora(unidade.ultimoPostEm)}</span>
            </p>
            <p className="text-[11px] font-semibold text-danger">
              {unidade.diasSemPostar} dias sem postar
            </p>
          </div>
        ),
      };
    }

    return {
      classe: "border-white/10 bg-white/[0.02]",
      corpo: (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-bold text-neutral-100">
            {formatarData(unidade.ultimoPostEm)} <span className="font-normal text-neutral-400">{formatarHora(unidade.ultimoPostEm)}</span>
          </p>
          <p className="text-[11px] text-neutral-500">
            {unidade.diasSemPostar === 0
              ? "Postou hoje"
              : `há ${unidade.diasSemPostar} dia${unidade.diasSemPostar !== 1 ? "s" : ""}`}
          </p>
        </div>
      ),
    };
  })();

  // "Adesivos": cada métrica (posts/comparativo, stories) mora no seu próprio subcontainer, com o
  // status (rótulo colorido) numa linha e a contagem em outra — antes vinham juntos numa linha só
  // com truncate, e "abaixo da média"/"na média" cortava no meio em cards estreitos.
  //
  // O rótulo tem altura mínima fixa (min-h, 2 linhas) porque uns são curtos ("Na média", 1 linha) e
  // outros quebram em 2 ("Abaixo da média", "Stories hoje") — sem isso, a linha da contagem embaixo
  // ficava em alturas diferentes entre os dois adesivos lado a lado, desalinhada.
  const adesivos: React.ReactNode[] = [];
  if (unidade.comparativo && unidade.comparativo !== "sem_base") {
    adesivos.push(
      <div key="posts" className="rounded-lg bg-white/[0.04] px-2.5 py-2">
        <p
          className={`min-h-[21px] leading-tight text-[8.5px] font-bold uppercase tracking-wide ${CLASSE_COMPARATIVO_CURTO[unidade.comparativo]}`}
        >
          {ROTULO_COMPARATIVO_CURTO[unidade.comparativo]}
        </p>
        <p className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold text-neutral-300">
          <GridFour size={11} weight="bold" className="shrink-0 text-neutral-500" />
          {unidade.totalPostagens} {unidade.totalPostagens === 1 ? "post" : "posts"}
        </p>
      </div>
    );
  }
  if (unidade.instagramVinculado) {
    adesivos.push(
      <div key="stories" className="rounded-lg bg-white/[0.04] px-2.5 py-2">
        <p
          className={`min-h-[21px] leading-tight text-[8.5px] font-bold uppercase tracking-wide ${unidade.storiesHoje > 0 ? "text-sky-300" : "text-neutral-600"}`}
        >
          Stories hoje
        </p>
        <p className={`mt-1 flex items-center gap-1 text-[10.5px] font-semibold ${unidade.storiesHoje > 0 ? "text-neutral-200" : "text-neutral-500"}`}>
          <CircleDashed size={11} weight="bold" className="shrink-0" />
          {unidade.storiesHoje} {unidade.storiesHoje === 1 ? "story" : "stories"}
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/estrategias/postagens/${unidade.contaId}`}
      className={`rounded-xl border p-3 transition hover:border-accent/40 ${conteudo.classe} flex flex-col`}
    >
      <div>
        <p className="truncate text-xs font-semibold text-neutral-200">{unidade.clienteNome}</p>
        {unidade.instagramUsername && (
          <p className="truncate text-[10.5px] text-neutral-500">@{unidade.instagramUsername}</p>
        )}
        {adesivos.length > 0 && (
          <div className={`mt-2.5 grid gap-1.5 ${adesivos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{adesivos}</div>
        )}
      </div>
      {conteudo.corpo}
    </Link>
  );
}
