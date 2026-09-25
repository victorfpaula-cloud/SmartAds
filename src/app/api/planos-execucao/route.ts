import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarPlanoExecucao } from "@/lib/estrategias/criarPlanoExecucao";
import type { Publico } from "@/lib/meta/tipos";

export const dynamic = "force-dynamic";

/** Todos os planos aplicados (com etapas embutidas) — alimenta a lista em /estrategias/planos.
 * Filtro opcional por cliente. */
export async function GET(request: NextRequest) {
  const clienteId = request.nextUrl.searchParams.get("clienteId");

  const supabase = criarClienteAdmin();
  let query = supabase
    .from("smartads_planos_execucao")
    .select(
      "*, smartads_clientes(nome), smartads_contas_meta(nome_exibicao, meta_ad_account_nome), smartads_plano_etapas(*, smartads_estrategia_etapas(*))"
    )
    .order("created_at", { ascending: false });

  if (clienteId) query = query.eq("cliente_id", clienteId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ planos: data });
}

interface CorpoAplicar {
  estrategiaId: string;
  clienteId: string;
  contaId: string;
  nome: string;
  publicoId?: string;
  publico?: Publico;
  investimentoTotalCentavos: number;
  dataInicio: string; // ISO "YYYY-MM-DD"
  metaNegocio?: string;
}

/** Aplica uma estratégia numa unidade: cria o plano de execução e uma linha de checklist
 * (smartads_plano_etapas) pra cada etapa do molde, já com a data prevista calculada (data de
 * início do plano + offset da etapa). Nenhuma campanha é criada aqui — isso acontece quando a
 * etapa chega na data prevista (ver avaliarPlanosExecucao, chamado pelo cron) e o Adm escolhe o
 * criativo pra ela (ver /estrategias/planos/[id]). */
export async function POST(request: NextRequest) {
  const corpo = (await request.json().catch(() => null)) as CorpoAplicar | null;
  if (
    !corpo?.estrategiaId ||
    !corpo.clienteId ||
    !corpo.contaId ||
    !corpo.nome?.trim() ||
    !corpo.investimentoTotalCentavos ||
    !corpo.dataInicio ||
    (!corpo.publicoId && !corpo.publico)
  ) {
    return NextResponse.json({ erro: "Faltam campos obrigatórios." }, { status: 400 });
  }

  try {
    const plano = await criarPlanoExecucao({
      estrategiaId: corpo.estrategiaId,
      clienteId: corpo.clienteId,
      contaId: corpo.contaId,
      nome: corpo.nome,
      publicoId: corpo.publicoId,
      publico: corpo.publico,
      investimentoTotalCentavos: corpo.investimentoTotalCentavos,
      dataInicio: corpo.dataInicio,
      metaNegocio: corpo.metaNegocio,
    });
    return NextResponse.json({ plano }, { status: 201 });
  } catch (erro) {
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Falha ao criar o plano." },
      { status: 500 }
    );
  }
}
