import { criarClienteAdmin } from "@/lib/supabase/admin";

export interface BoostInsight {
  campanhasAtivas: number;
  previsaoGastoCentavos: number;
  orcamentoDiarioCentavos: number;
}

/** Cruza o log do boost automático (smartads_boost_automatico_log) com a config salva de cada
 * campanha criada (smartads_campanhas_criadas.config_criacao, que guarda o orçamento e a data de
 * término usados na hora de criar) pra saber, sem bater na Meta: quantas campanhas do boost ainda
 * estão no período configurado, e quanto ainda falta gastar até elas encerrarem sozinhas. Usado
 * pelo /api/saude pra alimentar o card do Início. */
export async function obterBoostInsightsPorConta(contaIds: string[]): Promise<Map<string, BoostInsight>> {
  const resultado = new Map<string, BoostInsight>();
  if (contaIds.length === 0) return resultado;

  const supabase = criarClienteAdmin();
  const { data: logs } = await supabase
    .from("smartads_boost_automatico_log")
    .select("conta_id, campanha_criada_id")
    .eq("sucesso", true)
    .not("campanha_criada_id", "is", null)
    .in("conta_id", contaIds);

  const campanhaIds = [...new Set((logs ?? []).map((l) => l.campanha_criada_id).filter(Boolean))] as string[];
  if (campanhaIds.length === 0) return resultado;

  const { data: campanhas } = await supabase
    .from("smartads_campanhas_criadas")
    .select("id, config_criacao")
    .in("id", campanhaIds);

  const configPorCampanhaId = new Map((campanhas ?? []).map((c) => [c.id, c.config_criacao as any]));
  const agora = Date.now();

  for (const log of logs ?? []) {
    const config = log.campanha_criada_id ? configPorCampanhaId.get(log.campanha_criada_id) : null;
    const orcamento = config?.orcamento;
    if (!orcamento?.dataFim || !orcamento?.valorCentavos) continue;

    const dataFim = new Date(orcamento.dataFim).getTime();
    if (dataFim <= agora) continue; // Já encerrou — não conta como ativa.

    const diasRestantes = Math.max(1, Math.ceil((dataFim - agora) / 86_400_000));
    const atual = resultado.get(log.conta_id) ?? {
      campanhasAtivas: 0,
      previsaoGastoCentavos: 0,
      orcamentoDiarioCentavos: 0,
    };
    atual.campanhasAtivas += 1;
    atual.previsaoGastoCentavos += orcamento.valorCentavos * diasRestantes;
    atual.orcamentoDiarioCentavos += orcamento.valorCentavos;
    resultado.set(log.conta_id, atual);
  }

  return resultado;
}

/** Nome da Campanha-Mãe com um Plano de Execução em andamento nessa conta, se houver — mostrado no
 * card do Início pra saber, sem clicar em nada, se a unidade está dentro de um padrão de rede
 * ativo agora. */
export async function obterCampanhaMaeAtivaPorConta(contaIds: string[]): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  if (contaIds.length === 0) return resultado;

  const supabase = criarClienteAdmin();
  const { data } = await supabase
    .from("smartads_planos_execucao")
    .select("conta_id, smartads_campanhas_mae(nome)")
    .in("conta_id", contaIds)
    .eq("status", "em_andamento")
    .not("campanha_mae_id", "is", null);

  for (const linha of data ?? []) {
    const nome = (linha as any).smartads_campanhas_mae?.nome;
    if (nome) resultado.set(linha.conta_id, nome);
  }

  return resultado;
}
