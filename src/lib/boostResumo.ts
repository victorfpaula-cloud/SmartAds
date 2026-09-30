import { criarClienteAdmin } from "@/lib/supabase/admin";

export interface ResumoBoostConta {
  /** Campanhas de boost automático ainda dentro da duração escolhida (3 ou 7 dias). */
  noAr: number;
  /** Última tentativa, se falhou (só relevante com o boost ligado); null se deu certo ou nunca tentou. */
  falha: { erroMensagem: string | null; criadoEm: string } | null;
}

/** Resumo do boost automático por conta, direto do log (sem chamar a Meta). "No ar" = sucesso criado
 * dentro da duração escolhida — campanha pausada à mão ainda conta até o fim da janela. */
export async function obterResumoBoostPorConta(
  contas: Array<{ id: string; boost_automatico_ativo: boolean; boost_automatico_duracao_dias: number | null }>
): Promise<Map<string, ResumoBoostConta>> {
  const resultado = new Map<string, ResumoBoostConta>();
  const comBoost = contas.filter((c) => c.boost_automatico_ativo);
  if (comBoost.length === 0) return resultado;

  const supabase = criarClienteAdmin();
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: logs } = await supabase
    .from("smartads_boost_automatico_log")
    .select("conta_id, sucesso, erro_mensagem, created_at")
    .in("conta_id", comBoost.map((c) => c.id))
    .gte("created_at", desde)
    .order("created_at", { ascending: false });

  const duracaoPorConta = new Map(comBoost.map((c) => [c.id, c.boost_automatico_duracao_dias ?? 3]));
  const agora = Date.now();
  const vistos = new Set<string>();

  for (const conta of comBoost) resultado.set(conta.id, { noAr: 0, falha: null });

  for (const log of logs ?? []) {
    const resumo = resultado.get(log.conta_id);
    if (!resumo) continue;
    if (!vistos.has(log.conta_id)) {
      vistos.add(log.conta_id); // só a tentativa mais recente decide se há falha a mostrar
      if (!log.sucesso) resumo.falha = { erroMensagem: log.erro_mensagem, criadoEm: log.created_at };
    }
    if (log.sucesso) {
      const fimMs = new Date(log.created_at).getTime() + (duracaoPorConta.get(log.conta_id) ?? 3) * 86_400_000;
      if (fimMs > agora) resumo.noAr += 1;
    }
  }
  return resultado;
}
