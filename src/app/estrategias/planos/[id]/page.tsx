import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { MODELOS_CAMPANHA } from "@/lib/meta/modelos";
import { notFound } from "next/navigation";
import type { TipoModeloCampanha } from "@/lib/meta/tipos";

export const dynamic = "force-dynamic";

const ESTILO_STATUS: Record<string, { rotulo: string; classe: string }> = {
  aguardando: { rotulo: "Aguardando a data", classe: "bg-white/10 text-neutral-400" },
  pronta_para_disparar: { rotulo: "Pronta pra disparar", classe: "bg-amber-500/15 text-amber-400" },
  aguardando_admin: { rotulo: "Esperando você", classe: "bg-amber-500/15 text-amber-400" },
  em_andamento: { rotulo: "No ar", classe: "bg-emerald-500/15 text-emerald-400" },
  concluida: { rotulo: "Concluída", classe: "bg-emerald-500/15 text-emerald-400" },
  erro: { rotulo: "Erro", classe: "bg-red-500/15 text-red-400" },
};

export default async function DetalhePlanoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = criarClienteAdmin();

  const { data: plano } = await supabase
    .from("smartads_planos_execucao")
    .select(
      "*, smartads_estrategias(nome), smartads_clientes(nome), smartads_contas_meta(nome_exibicao, meta_ad_account_nome), smartads_plano_etapas(*, smartads_estrategia_etapas(*))"
    )
    .eq("id", id)
    .single();

  if (!plano) notFound();

  const etapas = ((plano as any).smartads_plano_etapas as any[]).sort(
    (a, b) => a.smartads_estrategia_etapas.ordem - b.smartads_estrategia_etapas.ordem
  );

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/estrategias/planos" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Planos aplicados
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold">{plano.nome}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {(plano as any).smartads_clientes?.nome} · Estratégia "{(plano as any).smartads_estrategias?.nome}"
          {plano.meta_negocio ? ` · Meta: ${plano.meta_negocio}` : ""}
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          {etapas.map((etapa) => {
            const detalhe = etapa.smartads_estrategia_etapas;
            const modelo = MODELOS_CAMPANHA[detalhe.tipo_modelo as TipoModeloCampanha];
            const estilo = ESTILO_STATUS[etapa.status] ?? { rotulo: etapa.status, classe: "bg-white/10 text-neutral-400" };
            const valorEtapa = (plano.investimento_total_centavos * detalhe.percentual_orcamento) / 100;

            return (
              <div key={etapa.id} className="cartao-vidro flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-neutral-100">
                    {detalhe.ordem}. {detalhe.nome_etapa}{" "}
                    <span className="font-normal text-neutral-500">({modelo?.nomeExibicao})</span>
                  </p>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${estilo.classe}`}>
                    {estilo.rotulo}
                  </span>
                </div>
                <p className="text-xs text-neutral-500">
                  Previsto pra {new Date(`${etapa.data_prevista_inicio}T00:00:00`).toLocaleDateString("pt-BR")} ·
                  R$ {(valorEtapa / 100).toFixed(2)} ({detalhe.percentual_orcamento}%)
                  {etapa.observacao ? ` · ${etapa.observacao}` : ""}
                </p>
                {etapa.status === "aguardando_admin" && (
                  <Link
                    href={`/campanhas/nova-do-plano/${etapa.id}`}
                    className="mt-1 w-fit rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong"
                  >
                    Escolher criativo e publicar
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
