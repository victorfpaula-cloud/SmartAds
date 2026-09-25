import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Publico } from "@/lib/meta/tipos";

export interface ParametrosPlanoExecucao {
  estrategiaId: string;
  clienteId: string;
  contaId: string;
  nome: string;
  publicoId?: string;
  publico?: Publico;
  investimentoTotalCentavos: number;
  dataInicio: string; // ISO "YYYY-MM-DD"
  metaNegocio?: string;
  /** Preenchido quando esse plano nasce de uma Campanha-Mãe disparada pra várias unidades —
   * é o que liga o rollup (ver /estrategias/campanhas-mae/[id]) e trava o criativo no formulário
   * de campanha de cada etapa (ver FormularioCampanha.tsx). */
  campanhaMaeId?: string;
}

/** Cria o plano de execução + uma linha de checklist (smartads_plano_etapas) por etapa do molde,
 * já com a data prevista calculada (data de início do plano + offset da etapa). Extraído de
 * /api/planos-execucao pra ser reaproveitado também ao disparar uma Campanha-Mãe pra N unidades
 * de uma vez — mesmo mecanismo, só que chamado em loop. Nenhuma campanha é criada aqui — isso
 * acontece quando a etapa chega na data prevista (ver avaliarPlanosExecucao) e o Adm escolhe o
 * criativo pra ela. */
export async function criarPlanoExecucao(parametros: ParametrosPlanoExecucao) {
  const supabase = criarClienteAdmin();

  const { data: etapasEstrategia, error: erroEtapas } = await supabase
    .from("smartads_estrategia_etapas")
    .select("*")
    .eq("estrategia_id", parametros.estrategiaId)
    .order("ordem");

  if (erroEtapas || !etapasEstrategia?.length) {
    throw new Error("Estratégia sem etapas — não dá pra aplicar.");
  }

  const { data: plano, error: erroPlano } = await supabase
    .from("smartads_planos_execucao")
    .insert({
      estrategia_id: parametros.estrategiaId,
      cliente_id: parametros.clienteId,
      conta_id: parametros.contaId,
      nome: parametros.nome.trim(),
      publico_id: parametros.publicoId ?? null,
      publico: parametros.publico ?? null,
      investimento_total_centavos: parametros.investimentoTotalCentavos,
      data_inicio: parametros.dataInicio,
      meta_negocio: parametros.metaNegocio ?? null,
      campanha_mae_id: parametros.campanhaMaeId ?? null,
    })
    .select()
    .single();

  if (erroPlano || !plano) {
    throw new Error(erroPlano?.message ?? "Falha ao criar o plano.");
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const dataInicioMs = new Date(`${parametros.dataInicio}T00:00:00Z`).getTime();

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
    throw new Error(erroPlanoEtapas.message);
  }

  return plano;
}
