import { criarClienteAdmin } from "@/lib/supabase/admin";

/** Avança etapas de plano de execução da data prevista chegou — muda de "aguardando" pra
 * "aguardando_admin" (esperando alguém escolher o criativo em /estrategias/planos/[id], ver
 * comentário em criarCriativoDoPostDaPagina/criarCriativoNovo do porquê isso não é automático:
 * a estratégia não carrega imagem/legenda nenhuma, só a sequência/orçamento). Também atualiza o
 * status geral do plano pra "em_andamento" assim que a primeira etapa é liberada. Chamado pelo
 * cron (ver /api/cron/automacao), junto do resto da automação. */
export async function avaliarPlanosExecucao() {
  const supabase = criarClienteAdmin();
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: etapasProntas } = await supabase
    .from("smartads_plano_etapas")
    .select("id, plano_id")
    .eq("status", "aguardando")
    .lte("data_prevista_inicio", hoje);

  if (!etapasProntas?.length) return;

  await supabase
    .from("smartads_plano_etapas")
    .update({ status: "aguardando_admin", observacao: "Pronta pra disparar — escolha o criativo." })
    .in(
      "id",
      etapasProntas.map((e) => e.id)
    );

  const planosAfetados = [...new Set(etapasProntas.map((e) => e.plano_id))];
  await supabase
    .from("smartads_planos_execucao")
    .update({ status: "em_andamento" })
    .in("id", planosAfetados)
    .eq("status", "planejado");
}
