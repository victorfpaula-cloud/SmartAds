import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
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
  incluirFacebook: boolean;
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

  const supabase = criarClienteAdmin();

  const { data: etapasEstrategia, error: erroEtapas } = await supabase
    .from("smartads_estrategia_etapas")
    .select("*")
    .eq("estrategia_id", corpo.estrategiaId)
    .order("ordem");

  if (erroEtapas || !etapasEstrategia?.length) {
    return NextResponse.json({ erro: "Estratégia sem etapas — não dá pra aplicar." }, { status: 400 });
  }

  const { data: plano, error: erroPlano } = await supabase
    .from("smartads_planos_execucao")
    .insert({
      estrategia_id: corpo.estrategiaId,
      cliente_id: corpo.clienteId,
      conta_id: corpo.contaId,
      nome: corpo.nome.trim(),
      publico_id: corpo.publicoId ?? null,
      publico: corpo.publico ?? null,
      incluir_facebook: corpo.incluirFacebook,
      investimento_total_centavos: corpo.investimentoTotalCentavos,
      data_inicio: corpo.dataInicio,
      meta_negocio: corpo.metaNegocio ?? null,
    })
    .select()
    .single();

  if (erroPlano || !plano) {
    return NextResponse.json({ erro: erroPlano?.message ?? "Falha ao criar o plano." }, { status: 500 });
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const dataInicioMs = new Date(`${corpo.dataInicio}T00:00:00Z`).getTime();

  const linhasEtapas = etapasEstrategia.map((etapa) => {
    const dataPrevista = new Date(dataInicioMs + etapa.offset_dias_inicio * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return {
      plano_id: plano.id,
      estrategia_etapa_id: etapa.id,
      data_prevista_inicio: dataPrevista,
      status: dataPrevista <= hoje ? "aguardando_admin" : "aguardando",
      observacao: dataPrevista <= hoje ? "Pronta pra disparar — escolha o criativo." : null,
    };
  });

  const { error: erroPlanoEtapas } = await supabase.from("smartads_plano_etapas").insert(linhasEtapas);
  if (erroPlanoEtapas) {
    await supabase.from("smartads_planos_execucao").delete().eq("id", plano.id);
    return NextResponse.json({ erro: erroPlanoEtapas.message }, { status: 500 });
  }

  return NextResponse.json({ plano }, { status: 201 });
}
