import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import {
  obterRelatorioPostagens,
  classificarComparativoRede,
  calcularEstatisticasStories,
  formatarMediaStories,
  type ComparativoRede,
} from "@/lib/relatorioPostagens";
import { diasEntreEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import { WarningCircle, InstagramLogo, DownloadSimple, GridFour, CircleDashed, FilmStrip } from "@phosphor-icons/react/dist/ssr";
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
  /** Média de stories por dia nos últimos 30 dias (ou desde que a coleta começou); null sem dado. */
  storiesMediaDia: number | null;
  /** Total de stories na janela de 30 dias (desde que a coleta começou). */
  storiesMes: number;
  storiesComparativo: ComparativoRede | null;
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

  // Stories: soma/média só dos dias com coleta e comparativo contra a rede (ver calcularEstatisticasStories).
  const statsStories = calcularEstatisticasStories(unidadesRelatorio);

  const agoraISO = new Date(agora).toISOString();
  const unidades: CardData[] = unidadesRelatorio.map((u) => {
    // Dias de calendário (SP), não horas corridas / 24 — senão um post de ontem à noite ainda
    // aparece "Postou hoje" de manhã, só porque não completou 24h corridas ainda.
    const diasSemPostar = u.ultimoPostEm ? diasEntreEmSaoPaulo(agoraISO, u.ultimoPostEm) : null;
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
      storiesMediaDia: statsStories.porConta.get(u.contaId)?.mediaDia ?? null,
      storiesMes: statsStories.porConta.get(u.contaId)?.total ?? 0,
      storiesComparativo: statsStories.porConta.get(u.contaId)?.comparativo ?? null,
    };
  });

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/estrategias" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Central da rede
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mt-1 font-display text-2xl font-bold">Radar de posts</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Post mais recente de cada unidade no Instagram — feed, Reels ou carrossel, vale
              qualquer formato — mais os stories do dia e do mês (com a comparação contra a rede). 5 dias
              sem postar acende o alerta. Clique
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

// Semáforo ao lado do nome: vermelho quando precisa de atenção (sem post ou alerta crítico de
// ritmo), amarelo quando abaixo da média, verde quando acima, azul no "normal" (na média ou sem
// base de comparação ainda). Só aparece pra unidade com Instagram vinculado — sem dado, sem status.
function corSemaforo(unidade: CardData): string | null {
  if (!unidade.instagramVinculado) return null;
  if (unidade.ultimoPostEm === null || unidade.precisaAtencao || unidade.comparativo === "critico") {
    return "bg-danger";
  }
  if (unidade.comparativo === "abaixo") return "bg-amber-400";
  if (unidade.comparativo === "acima") return "bg-ok";
  return "bg-sky-400";
}

function CardUnidade({ unidade }: { unidade: CardData }) {
  const semaforo = corSemaforo(unidade);
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
          <div className="mt-3 flex flex-1 flex-col items-center justify-center text-center">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <WarningCircle size={14} weight="fill" className="shrink-0 text-danger" />
              <p className="text-sm font-bold text-neutral-100">
                {formatarData(unidade.ultimoPostEm)}{" "}
                <span className="font-normal text-neutral-400">{formatarHora(unidade.ultimoPostEm)}</span>
              </p>
              <span className="text-neutral-600">–</span>
              <span className="rounded-full border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-danger">
                {unidade.diasSemPostar} dias sem postar
              </span>
            </div>
          </div>
        ),
      };
    }

    // Data/hora e "há X dias" (ou "Postou hoje") numa linha só, com o adesivinho depois de um
    // tracinho — antes eram duas linhas centralizadas, ocupando mais altura do card à toa.
    return {
      classe: "border-white/10 bg-white/[0.02]",
      corpo: (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <p className="text-sm font-bold text-neutral-100">
              {formatarData(unidade.ultimoPostEm)}{" "}
              <span className="font-normal text-neutral-400">{formatarHora(unidade.ultimoPostEm)}</span>
            </p>
            <span className="text-neutral-600">–</span>
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold ${
                unidade.diasSemPostar === 0
                  ? "border-ok/40 bg-ok/10 text-ok"
                  : "border-white/10 bg-white/[0.03] text-neutral-400"
              }`}
            >
              {unidade.diasSemPostar === 0
                ? "Postou hoje"
                : `há ${unidade.diasSemPostar} dia${unidade.diasSemPostar !== 1 ? "s" : ""}`}
            </span>
          </div>
        </div>
      ),
    };
  })();

  // "Adesivos": cada métrica (posts/comparativo, stories) mora no seu próprio subcontainer, com o
  // status (rótulo colorido) numa linha e a contagem em outra — antes vinham juntos numa linha só
  // com truncate, e "abaixo da média"/"na média" cortava no meio em cards estreitos.
  //
  // O rótulo tem altura mínima fixa (min-h) só o bastante pra 1 linha — com os cards mais largos de
  // agora o rótulo quase nunca quebra, então uma reserva de 2 linhas (como era antes) deixava um
  // vão vazio grande demais entre o rótulo e a contagem embaixo. Uma reserva pequena ainda evita o
  // desalinhamento entre os dois adesivos lado a lado no raro caso de um rótulo quebrar mesmo assim.
  //
  // Ordem: [posts] [stories — média e mês] na primeira linha, e "Stories hoje" sozinho ocupando a
  // linha de baixo inteira. Os dois de cima ficam lado a lado (mesma altura pela grade) e cada um
  // abre com o nome da mídia ("Posts" / "Stories") pra não confundir um com o outro.
  const adesivos: React.ReactNode[] = [];
  const comPosts = !!unidade.comparativo && unidade.comparativo !== "sem_base";
  if (comPosts && unidade.comparativo) {
    adesivos.push(
      <div key="posts" className="rounded-lg bg-white/[0.04] px-2 py-1.5">
        <p className="min-h-[11px] leading-tight text-[8.5px] font-bold uppercase tracking-wide">
          <span className="text-neutral-400">Posts · </span>
          <span className={CLASSE_COMPARATIVO_CURTO[unidade.comparativo]}>{ROTULO_COMPARATIVO_CURTO[unidade.comparativo]}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold text-neutral-300">
          <GridFour size={11} weight="bold" className="shrink-0 text-neutral-500" />
          {unidade.totalPostagens} {unidade.totalPostagens === 1 ? "post" : "posts"}
        </p>
      </div>
    );
  }

  if (unidade.instagramVinculado && unidade.storiesMediaDia !== null) {
    // Mesmo desenho do adesivo de posts: mídia + status colorido em cima, dados embaixo. O status vem
    // da média de stories por dia contra a da rede.
    const comparativo = unidade.storiesComparativo;
    const semBase = !comparativo || comparativo === "sem_base";
    adesivos.push(
      <div
        key="stories-mes"
        className={`rounded-lg bg-white/[0.04] px-2 py-1.5 ${comPosts ? "" : "col-span-2"}`}
        title={`Média de ${unidade.storiesMediaDia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} stories por dia e ${unidade.storiesMes} no total, contando só os dias em que já há coleta`}
      >
        <p className="min-h-[11px] leading-tight text-[8.5px] font-bold uppercase tracking-wide">
          <span className="text-neutral-400">Stories</span>
          {!semBase && (
            <>
              <span className="text-neutral-400"> · </span>
              <span className={CLASSE_COMPARATIVO_CURTO[comparativo]}>{ROTULO_COMPARATIVO_CURTO[comparativo]}</span>
            </>
          )}
        </p>
        <p className="mt-0.5 flex items-start gap-1 text-[10.5px] font-semibold leading-tight text-neutral-300">
          <FilmStrip size={11} weight="bold" className="mt-px shrink-0 text-neutral-500" />
          <span>
            {formatarMediaStories(unidade.storiesMediaDia)}/dia · {unidade.storiesMes}/mês
          </span>
        </p>
      </div>
    );
  }

  if (unidade.instagramVinculado) {
    adesivos.push(
      <div key="stories" className="col-span-2 rounded-lg bg-white/[0.04] px-2 py-1.5">
        <p
          className={`min-h-[11px] leading-tight text-[8.5px] font-bold uppercase tracking-wide ${unidade.storiesHoje > 0 ? "text-sky-300" : "text-neutral-600"}`}
        >
          Stories hoje
        </p>
        <p className={`mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold ${unidade.storiesHoje > 0 ? "text-neutral-200" : "text-neutral-500"}`}>
          <CircleDashed size={11} weight="bold" className="shrink-0" />
          {unidade.storiesHoje} {unidade.storiesHoje === 1 ? "story" : "stories"}
        </p>
      </div>
    );
  }

  // min-h fixo: sem isso cada card ficava do tamanho do próprio conteúdo — unidade sem Instagram
  // (só ícone + texto) bem mais baixa que unidade com os dois adesivos + data. O corpo abaixo usa
  // flex-1 justify-center, então preenche esse espaço extra centralizado em vez de esticar feio.
  return (
    <Link
      href={`/estrategias/postagens/${unidade.contaId}`}
      className={`flex min-h-[176px] flex-col rounded-xl border p-3 transition hover:border-accent/40 ${conteudo.classe}`}
    >
      <div>
        <div className="flex items-center gap-1.5">
          {semaforo && <span className={`h-2 w-2 shrink-0 rounded-full ${semaforo}`} title="Status da unidade" />}
          <p className="truncate text-xs font-semibold text-neutral-200">{unidade.clienteNome}</p>
        </div>
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
