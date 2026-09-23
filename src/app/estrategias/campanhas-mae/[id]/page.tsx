import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const ESTILO_STATUS_PLANO: Record<string, { rotulo: string; classe: string }> = {
  planejado: { rotulo: "Planejado", classe: "bg-white/10 text-neutral-400" },
  em_andamento: { rotulo: "No ar", classe: "bg-emerald-500/15 text-emerald-400" },
  concluido: { rotulo: "Concluído", classe: "bg-emerald-500/15 text-emerald-400" },
  pausado: { rotulo: "Pausado", classe: "bg-amber-500/15 text-amber-400" },
};

export default async function DetalheCampanhaMaePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = criarClienteAdmin();

  const { data: campanha } = await supabase
    .from("smartads_campanhas_mae")
    .select("*, smartads_estrategias(nome)")
    .eq("id", id)
    .single();

  if (!campanha) notFound();

  const { data: planos } = await supabase
    .from("smartads_planos_execucao")
    .select(
      "id, nome, investimento_total_centavos, status, smartads_clientes(nome), smartads_contas_meta(nome_exibicao, meta_ad_account_nome), smartads_plano_etapas(status)"
    )
    .eq("campanha_mae_id", id)
    .order("created_at", { ascending: false });

  const unidades = (planos ?? []).map((plano: any) => {
    const etapas = plano.smartads_plano_etapas as { status: string }[];
    return {
      planoId: plano.id,
      clienteNome: plano.smartads_clientes?.nome ?? "—",
      contaNome: plano.smartads_contas_meta?.nome_exibicao || plano.smartads_contas_meta?.meta_ad_account_nome || "—",
      investimentoTotalCentavos: plano.investimento_total_centavos,
      status: plano.status as string,
      concluidas: etapas.filter((e) => e.status === "concluida").length,
      total: etapas.length,
    };
  });

  const investimentoTotal = unidades.reduce((soma, u) => soma + u.investimentoTotalCentavos, 0);

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/estrategias/campanhas-mae" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Campanhas-Mãe
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">{campanha.nome}</h1>
            <p className="mt-1 text-sm text-neutral-400">
              {(campanha as any).smartads_estrategias?.nome} · desde{" "}
              {new Date(`${campanha.data_inicio}T00:00:00`).toLocaleDateString("pt-BR")} ·{" "}
              {formatoReal.format(campanha.investimento_minimo_centavos / 100)}–
              {formatoReal.format(campanha.investimento_maximo_centavos / 100)}/unidade
            </p>
          </div>
          <Link
            href={`/estrategias/campanhas-mae/${id}/aplicar`}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            + Aplicar em unidades
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
          <div className="aspect-square overflow-hidden rounded-xl border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/jpeg;base64,${campanha.criativo_imagem_base64}`}
              alt="Criativo oficial"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="cartao-vidro-interno p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Criativo oficial</p>
            {campanha.criativo_titulo && (
              <p className="mt-1.5 font-semibold text-neutral-100">{campanha.criativo_titulo}</p>
            )}
            <p className="mt-1 text-neutral-300">{campanha.criativo_mensagem}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="cartao-vidro px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Unidades participando</p>
            <p className="mt-1 text-lg font-bold text-neutral-100">{unidades.length}</p>
          </div>
          <div className="cartao-vidro px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Investimento total</p>
            <p className="mt-1 text-lg font-bold text-neutral-100">{formatoReal.format(investimentoTotal / 100)}</p>
          </div>
        </div>

        <h2 className="mt-8 text-sm font-semibold text-neutral-200">Unidades</h2>
        {unidades.length === 0 ? (
          <p className="cartao-vidro mt-3 px-5 py-6 text-sm text-neutral-500">
            Nenhuma unidade aplicada ainda — use "Aplicar em unidades" acima.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {unidades.map((u) => {
              const estilo = ESTILO_STATUS_PLANO[u.status] ?? { rotulo: u.status, classe: "bg-white/10 text-neutral-400" };
              return (
                <Link
                  key={u.planoId}
                  href={`/estrategias/planos/${u.planoId}`}
                  className="cartao-vidro-interno flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:border-accent/40"
                >
                  <div>
                    <p className="text-sm font-semibold text-neutral-100">{u.clienteNome}</p>
                    <p className="text-xs text-neutral-500">
                      {u.contaNome} · {formatoReal.format(u.investimentoTotalCentavos / 100)} · {u.concluidas}/{u.total} etapas concluídas
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${estilo.classe}`}>
                    {estilo.rotulo}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
