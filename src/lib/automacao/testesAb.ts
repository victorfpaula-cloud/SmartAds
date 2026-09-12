import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsConta, pausarAnuncio } from "@/lib/meta/api";
import { registrarExecucao } from "./log";

/** Roda os testes A/B ainda "em andamento" — chamada pelo cron (ver /api/cron/automacao). Um
 * teste só é avaliado depois de bater DUAS condições ao mesmo tempo: os dias mínimos configurados
 * E o gasto mínimo — bater só uma das duas não é suficiente pra confiar no resultado (um teste de
 * 7 dias com R$5 gastos não decide nada). Quando não bate as duas, fica marcado
 * "dado_insuficiente" em vez de forçar um vencedor sem confiança nenhuma — o dono decide manualmente
 * o que fazer com aquela campanha. Quando bate, pausa todas as variações menos a de maior CTR e
 * registra no log. */
export async function avaliarTestesAb() {
  const supabase = criarClienteAdmin();
  const { data: testes } = await supabase
    .from("smartads_testes_ab")
    .select("*, smartads_campanhas_criadas(*, smartads_contas_meta(meta_ad_account_id))")
    .eq("status", "rodando");

  for (const teste of testes ?? []) {
    const campanha = (teste as any).smartads_campanhas_criadas;
    if (!campanha) continue;

    const diasRodando = (Date.now() - new Date(teste.created_at).getTime()) / 86_400_000;
    if (diasRodando < teste.duracao_dias_minima) continue;

    const adAccountId = campanha.smartads_contas_meta?.meta_ad_account_id;
    const idsDoTeste: string[] = campanha.meta_ad_ids ?? [];
    if (!adAccountId || idsDoTeste.length < 2) continue;

    let insightsAds;
    try {
      const desde = new Date(teste.created_at).toISOString().slice(0, 10);
      const ontem = new Date();
      ontem.setUTCDate(ontem.getUTCDate() - 1);
      insightsAds = await obterInsightsConta(adAccountId, {
        nivel: "ad",
        intervalo: { desde, ate: ontem.toISOString().slice(0, 10) },
        porDia: false,
      });
    } catch {
      continue; // erro pontual — reavalia na próxima execução do cron
    }

    const linhasDoTeste = insightsAds.filter((i) => idsDoTeste.includes(i.ad_id ?? ""));
    const gastoTotalCentavos = linhasDoTeste.reduce((s, l) => s + Number(l.spend ?? 0), 0) * 100;
    const nomeCampanha = campanha.config_criacao?.nomeCampanha ?? campanha.meta_campaign_id;

    if (gastoTotalCentavos < teste.gasto_minimo_centavos) {
      await supabase
        .from("smartads_testes_ab")
        .update({ status: "dado_insuficiente", avaliado_em: new Date().toISOString() })
        .eq("id", teste.id);

      await registrarExecucao({
        tipo: "teste_ab",
        campanhaId: campanha.id,
        descricao: `Teste A/B de "${nomeCampanha}" encerrado sem gasto suficiente (R$ ${(gastoTotalCentavos / 100).toFixed(2)} de R$ ${(teste.gasto_minimo_centavos / 100).toFixed(2)} mínimos) pra decidir um vencedor com confiança — nenhum anúncio foi pausado.`,
        dados: { gastoTotalCentavos, gastoMinimoCentavos: teste.gasto_minimo_centavos },
        sucesso: true,
      });
      continue;
    }

    let vencedor = linhasDoTeste[0];
    for (const linha of linhasDoTeste) {
      if (Number(linha.ctr ?? 0) > Number(vencedor?.ctr ?? 0)) vencedor = linha;
    }
    if (!vencedor?.ad_id) continue;

    const perdedores = idsDoTeste.filter((id) => id !== vencedor.ad_id);
    await Promise.all(perdedores.map((id) => pausarAnuncio(id).catch(() => {})));

    await supabase
      .from("smartads_testes_ab")
      .update({ status: "concluido", vencedor_meta_ad_id: vencedor.ad_id, avaliado_em: new Date().toISOString() })
      .eq("id", teste.id);

    await registrarExecucao({
      tipo: "teste_ab",
      campanhaId: campanha.id,
      descricao: `Teste A/B de "${nomeCampanha}" concluído — a variação vencedora (CTR de ${Number(vencedor.ctr ?? 0).toFixed(2)}%) ficou ativa, as outras ${perdedores.length} foram pausadas.`,
      dados: { vencedorAdId: vencedor.ad_id, ctrVencedor: vencedor.ctr, gastoTotalCentavos },
      sucesso: true,
    });
  }
}
