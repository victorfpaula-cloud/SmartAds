import { criarClienteAdmin } from "@/lib/supabase/admin";
import { deixarConjuntoSoNoFeed } from "@/lib/meta/api";
import { comContaMeta } from "@/lib/meta/conexao";

/** Opção "só feed" do boost da unidade: os boosts que ainda estão no ar (criados antes de ligar a
 * opção) passam a rodar só no feed também. Roda a cada passagem do cron do boost; conjunto que já
 * está só no feed não é alterado (a leitura na Meta é barata, a mudança só acontece uma vez).
 * Devolve quantos conjuntos mudaram; uma falha num conjunto não impede os outros. */
export async function aplicarSoFeedNosBoostsNoAr(contaId: string): Promise<{ alterados: number; erros: string[] }> {
  const { data } = await criarClienteAdmin()
    .from("smartads_campanhas_criadas")
    .select("meta_adset_id, config_criacao")
    .eq("conta_id", contaId)
    .not("meta_adset_id", "is", null)
    .gte("created_at", new Date(Date.now() - 10 * 86_400_000).toISOString());
  const agora = Date.now();
  const noAr = (data ?? []).filter((c) => {
    const cfg = (c.config_criacao ?? {}) as { nomeCampanha?: string; orcamento?: { dataFim?: string } };
    const fim = cfg.orcamento?.dataFim ? Date.parse(cfg.orcamento.dataFim) : NaN;
    return /^boost\b/i.test(cfg.nomeCampanha ?? "") && (!Number.isFinite(fim) || fim > agora);
  });
  let alterados = 0;
  const erros: string[] = [];
  for (const c of noAr) {
    try {
      if (await comContaMeta(contaId, () => deixarConjuntoSoNoFeed(c.meta_adset_id as string))) alterados++;
    } catch (e) {
      erros.push(`${c.meta_adset_id}: ${(e instanceof Error ? e.message : String(e)).slice(0, 150)}`);
    }
  }
  return { alterados, erros };
}
