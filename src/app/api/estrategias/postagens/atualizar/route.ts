import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { coletarStoriesAtivos } from "@/lib/stories";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Botão "Atualizar agora" do Radar de posts: registra já os stories que estão no ar (o que o cron faz
 * de 3 em 3 horas) e apaga o cache dos posts do dia, pra a tela buscar o feed de novo na Meta. */
export async function POST() {
  const supabase = criarClienteAdmin();
  // Limpa primeiro: o recálculo dos posts acontece quando a página recarrega, depois disso.
  await supabase.from("smartads_relatorio_postagens_cache").delete().not("conta_id", "is", null);
  const stories = await coletarStoriesAtivos();
  return NextResponse.json({ ok: true, ...stories, atualizadoEm: new Date().toISOString() });
}
