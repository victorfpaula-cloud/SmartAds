import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import AplicarCampanhaMaeForm from "./AplicarCampanhaMaeForm";

export const dynamic = "force-dynamic";

export default async function AplicarCampanhaMaePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = criarClienteAdmin();

  const { data: campanha } = await supabase.from("smartads_campanhas_mae").select("*").eq("id", id).single();
  if (!campanha) notFound();

  // Só unidades de empresa franquia — Campanha-Mãe é uma pauta de rede, não faz sentido pra
  // empresa individual (que sequer aparece na Central da rede).
  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select("id, nome, ativo, smartads_empresas!inner(tipo), smartads_contas_meta(*)")
    .eq("ativo", true)
    .eq("smartads_empresas.tipo", "franquia")
    .order("nome");

  const { data: planosExistentes } = await supabase
    .from("smartads_planos_execucao")
    .select("conta_id")
    .eq("campanha_mae_id", id);
  const contasJaAplicadas = new Set((planosExistentes ?? []).map((p) => p.conta_id));

  const unidadesElegiveis = (clientes ?? []).flatMap((cliente: any) =>
    (cliente.smartads_contas_meta as any[])
      .filter((conta) => conta.ativo && !contasJaAplicadas.has(conta.id))
      .map((conta) => ({
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        contaId: conta.id,
        contaNome: conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id,
      }))
  );

  const clienteIds = [...new Set(unidadesElegiveis.map((u) => u.clienteId))];
  const { data: publicos } =
    clienteIds.length > 0
      ? await supabase.from("smartads_publicos_salvos").select("id, cliente_id, nome").in("cliente_id", clienteIds)
      : { data: [] };

  const publicosPorCliente: Record<string, { id: string; nome: string }[]> = {};
  for (const p of publicos ?? []) {
    (publicosPorCliente[p.cliente_id] ??= []).push({ id: p.id, nome: p.nome });
  }

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href={`/estrategias/campanhas-mae/${id}`} className="text-xs text-neutral-500 hover:text-neutral-300">
          ← {campanha.nome}
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold">Aplicar em unidades</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Escolha as unidades e o investimento de cada uma (entre{" "}
          {(campanha.investimento_minimo_centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} e{" "}
          {(campanha.investimento_maximo_centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          ). O criativo, o período e a estratégia já vêm da Campanha-Mãe — nenhuma unidade escolhe isso.
        </p>

        <div className="mt-6">
          <AplicarCampanhaMaeForm
            campanhaId={id}
            investimentoMinimoCentavos={campanha.investimento_minimo_centavos}
            investimentoMaximoCentavos={campanha.investimento_maximo_centavos}
            unidades={unidadesElegiveis}
            publicosPorCliente={publicosPorCliente}
          />
        </div>
      </main>
    </>
  );
}
