import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Detalhe de uma Campanha-Mãe + o rollup: todas as unidades participantes (Planos de Execução
 * linkados), com investimento e status de cada etapa — pra ver de uma vez só quem já publicou,
 * quanto cada unidade investiu, e quem ainda está pendente. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = criarClienteAdmin();

  const { data: campanha, error: erroCampanha } = await supabase
    .from("smartads_campanhas_mae")
    .select("*, smartads_estrategias(nome)")
    .eq("id", id)
    .single();

  if (erroCampanha || !campanha) {
    return NextResponse.json({ erro: "Campanha-Mãe não encontrada." }, { status: 404 });
  }

  const { data: planos, error: erroPlanos } = await supabase
    .from("smartads_planos_execucao")
    .select(
      "id, nome, investimento_total_centavos, status, smartads_clientes(id, nome), smartads_contas_meta(id, nome_exibicao, meta_ad_account_nome), smartads_plano_etapas(status)"
    )
    .eq("campanha_mae_id", id)
    .order("created_at", { ascending: false });

  if (erroPlanos) return NextResponse.json({ erro: erroPlanos.message }, { status: 500 });

  const unidades = (planos ?? []).map((plano: any) => {
    const etapas = plano.smartads_plano_etapas as { status: string }[];
    const concluidas = etapas.filter((e) => e.status === "concluida").length;
    return {
      planoId: plano.id,
      clienteNome: plano.smartads_clientes?.nome ?? "—",
      contaNome: plano.smartads_contas_meta?.nome_exibicao || plano.smartads_contas_meta?.meta_ad_account_nome || "—",
      investimentoTotalCentavos: plano.investimento_total_centavos,
      status: plano.status,
      etapasConcluidas: concluidas,
      etapasTotal: etapas.length,
    };
  });

  return NextResponse.json({
    campanha: {
      id: campanha.id,
      estrategiaId: campanha.estrategia_id,
      estrategiaNome: (campanha as any).smartads_estrategias?.nome ?? "—",
      nome: campanha.nome,
      dataInicio: campanha.data_inicio,
      investimentoMinimoCentavos: campanha.investimento_minimo_centavos,
      investimentoMaximoCentavos: campanha.investimento_maximo_centavos,
      criativoTitulo: campanha.criativo_titulo,
      criativoMensagem: campanha.criativo_mensagem,
      criativoImagemBase64: campanha.criativo_imagem_base64,
      criativoCta: campanha.criativo_cta,
      status: campanha.status,
      criadoEm: campanha.created_at,
    },
    unidades,
    investimentoTotalCentavos: unidades.reduce((soma, u) => soma + u.investimentoTotalCentavos, 0),
  });
}
