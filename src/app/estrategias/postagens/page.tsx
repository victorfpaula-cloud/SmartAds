import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { obterUltimasPostagensPorUnidade, type UnidadePostagem } from "@/lib/postagens";
import { WarningCircle, InstagramLogo, DownloadSimple } from "@phosphor-icons/react/dist/ssr";
import BotaoEnviarRelatorio from "./BotaoEnviarRelatorio";

export const dynamic = "force-dynamic";

const FUSO_HORARIO = "America/Sao_Paulo";

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: FUSO_HORARIO });
}

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO_HORARIO });
}

export default async function PostagensPage() {
  const unidades = await obterUltimasPostagensPorUnidade();

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/estrategias" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Central da rede
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mt-1 font-display text-2xl font-bold">Última postagem</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Post mais recente de cada unidade no Instagram — feed, Reels ou carrossel, vale
              qualquer formato. Mais de 5 dias sem postar acende o alerta.
            </p>
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
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {unidades.map((unidade) => (
              <CardUnidade key={unidade.contaId} unidade={unidade} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function CardUnidade({ unidade }: { unidade: UnidadePostagem }) {
  const conteudo = (() => {
    if (!unidade.instagramVinculado) {
      return {
        classe: "border-white/10 bg-white/[0.02]",
        corpo: (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
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
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
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
          <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
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
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-bold text-neutral-100">
            {formatarData(unidade.ultimoPostEm)} <span className="font-normal text-neutral-400">{formatarHora(unidade.ultimoPostEm)}</span>
          </p>
          <p className="text-[11px] text-neutral-500">
            há {unidade.diasSemPostar} dia{unidade.diasSemPostar !== 1 ? "s" : ""}
          </p>
        </div>
      ),
    };
  })();

  return (
    <Link
      href={`/estrategias/diagnostico/${unidade.contaId}`}
      className={`aspect-square rounded-xl border p-3 transition hover:border-accent/40 ${conteudo.classe} flex flex-col`}
    >
      <div>
        <p className="truncate text-xs font-semibold text-neutral-200">{unidade.clienteNome}</p>
        {unidade.instagramUsername && (
          <p className="truncate text-[10.5px] text-neutral-500">@{unidade.instagramUsername}</p>
        )}
      </div>
      {conteudo.corpo}
    </Link>
  );
}
