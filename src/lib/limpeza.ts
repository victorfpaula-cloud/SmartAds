import { criarClienteAdmin } from "@/lib/supabase/admin";

const DIAS_RETENCAO = 90;

/** Apaga linhas antigas das tabelas de log/histórico que não têm nenhuma outra rotina de limpeza
 * — sem isso crescem pra sempre: smartads_stories_vistos grava 1 linha por story visto por dia
 * por conta (ver src/lib/stories.ts), smartads_boost_automatico_log grava 1 linha por tentativa
 * de boost automático (ver src/lib/automacao/boostAutomatico.ts). 90 dias é generoso pra qualquer
 * investigação retroativa sem deixar as tabelas crescer indefinidamente. Roda 1x/semana (ver
 * /api/cron/limpeza e vercel.json) — não precisa ser mais frequente que isso. */
export async function limparDadosAntigos(): Promise<{ storiesApagados: number; boostLogsApagados: number }> {
  const supabase = criarClienteAdmin();
  const limiteISO = new Date(Date.now() - DIAS_RETENCAO * 86_400_000).toISOString();
  const limiteDia = limiteISO.slice(0, 10); // smartads_stories_vistos.dia é texto "YYYY-MM-DD"

  const [stories, boostLogs] = await Promise.all([
    supabase.from("smartads_stories_vistos").delete({ count: "exact" }).lt("dia", limiteDia),
    supabase.from("smartads_boost_automatico_log").delete({ count: "exact" }).lt("created_at", limiteISO),
  ]);

  return { storiesApagados: stories.count ?? 0, boostLogsApagados: boostLogs.count ?? 0 };
}
