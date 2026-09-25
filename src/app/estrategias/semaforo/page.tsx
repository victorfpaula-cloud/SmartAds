import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { calcularSemaforo, type CorSemaforo } from "@/lib/semaforo";

export const dynamic = "force-dynamic";

const ESTILO_COR: Record<CorSemaforo, string> = {
  verde: "bg-emerald-500",
  amarelo: "bg-amber-500",
  vermelho: "bg-red-500",
};

function formatarAtualizacao(iso: string | null): string {
  if (!iso) return "Ainda sem dados — aguardando a primeira atualização automática";
  const horas = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (horas < 1) return "Atualizado há menos de 1h";
  if (horas < 24) return `Atualizado há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `Atualizado há ${dias} dia${dias !== 1 ? "s" : ""}`;
}

export default async function SemaforoPage() {
  const unidades = await calcularSemaforo();

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/estrategias" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Estratégias
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold">Semáforo das unidades</h1>
        <p className="mt-1 text-sm text-neutral-400">
          CTR dos últimos 7 dias comparado com a mediana das outras unidades ativas.
        </p>

        {unidades.length === 0 ? (
          <p className="cartao-vidro mt-6 px-5 py-6 text-sm text-neutral-400">Nenhuma unidade ativa ainda.</p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {unidades.map((u) => (
              <Link
                key={u.contaId}
                href={`/estrategias/diagnostico/${u.contaId}`}
                className="cartao-vidro flex items-start gap-3 p-4 transition hover:border-accent/40"
              >
                <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${ESTILO_COR[u.cor]}`} />
                <div>
                  <p className="text-sm font-semibold text-neutral-100">{u.clienteNome}</p>
                  <p className="text-xs text-neutral-500">{u.contaNome}</p>
                  <p className="mt-1.5 text-xs text-neutral-400">{u.motivo}</p>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Gasto 7d: R$ {(u.spend7dias).toFixed(2)} · CTR: {u.ctr7dias.toFixed(2)}% · {formatarAtualizacao(u.calculadoEm)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
