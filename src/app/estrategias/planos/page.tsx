import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const RUBRICA_STATUS: Record<string, string> = {
  planejado: "Planejado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  pausado: "Pausado",
};

export default async function PlanosExecucaoPage() {
  const supabase = criarClienteAdmin();
  const { data: planos } = await supabase
    .from("smartads_planos_execucao")
    .select("*, smartads_clientes(nome), smartads_plano_etapas(status)")
    .order("created_at", { ascending: false });

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/estrategias" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Estratégias
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold">Planos aplicados</h1>
        <p className="mt-1 text-sm text-neutral-400">Uma estratégia aplicada numa unidade, com o checklist de cada etapa.</p>

        <div className="mt-6 flex flex-col gap-2">
          {(planos ?? []).length === 0 ? (
            <p className="cartao-vidro px-5 py-6 text-sm text-neutral-400">Nenhuma estratégia aplicada ainda.</p>
          ) : (
            (planos ?? []).map((plano: any) => {
              const etapas = plano.smartads_plano_etapas as { status: string }[];
              const pendentes = etapas.filter((e) => e.status === "aguardando_admin").length;
              return (
                <Link
                  key={plano.id}
                  href={`/estrategias/planos/${plano.id}`}
                  className="cartao-vidro-interno flex items-center justify-between px-4 py-3.5 transition hover:border-accent/40"
                >
                  <div>
                    <p className="text-sm font-semibold text-neutral-100">{plano.nome}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {plano.smartads_clientes?.nome} · {RUBRICA_STATUS[plano.status] ?? plano.status}
                    </p>
                  </div>
                  {pendentes > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-400">
                      {pendentes} pendente{pendentes > 1 ? "s" : ""}
                    </span>
                  )}
                </Link>
              );
            })
          )}
        </div>
      </main>
    </>
  );
}
