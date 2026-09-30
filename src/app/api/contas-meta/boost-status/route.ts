import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Última tentativa do boost automático por conta (só as que têm boost ligado) — alimenta o aviso
 * clicável no card de Início quando a tentativa mais recente falhou. Conta que nunca tentou, ou
 * cuja última tentativa deu certo, simplesmente não aparece na resposta. */
export async function GET() {
  const supabase = criarClienteAdmin();

  const { data: contasComBoost } = await supabase
    .from("smartads_contas_meta")
    .select("id, boost_automatico_duracao_dias")
    .eq("boost_automatico_ativo", true);

  const contaIds = (contasComBoost ?? []).map((c) => c.id);
  if (contaIds.length === 0) {
    return NextResponse.json({ ultimasFalhas: {}, noArPorConta: {} });
  }

  const { data: logs } = await supabase
    .from("smartads_boost_automatico_log")
    .select("conta_id, sucesso, erro_mensagem, created_at")
    .in("conta_id", contaIds)
    .order("created_at", { ascending: false });

  const ultimasFalhas: Record<string, { erroMensagem: string | null; criadoEm: string }> = {};
  const vistos = new Set<string>();
  for (const log of logs ?? []) {
    if (vistos.has(log.conta_id)) continue; // só a tentativa mais recente de cada conta
    vistos.add(log.conta_id);
    if (!log.sucesso) {
      ultimasFalhas[log.conta_id] = { erroMensagem: log.erro_mensagem, criadoEm: log.created_at };
    }
  }

  // Campanhas de boost automático "no ar" por conta: as criadas com sucesso que ainda estão dentro da
  // duração escolhida (3 ou 7 dias, ver boostAutomatico.ts — a Meta encerra sozinha no fim). Vem do
  // próprio log, sem bater na Meta; campanha pausada à mão ainda conta até o fim da janela.
  const duracaoPorConta = new Map((contasComBoost ?? []).map((c) => [c.id, c.boost_automatico_duracao_dias ?? 3]));
  const noArPorConta: Record<string, number> = {};
  const agora = Date.now();
  for (const log of logs ?? []) {
    if (!log.sucesso) continue;
    const fimMs = new Date(log.created_at).getTime() + (duracaoPorConta.get(log.conta_id) ?? 3) * 86_400_000;
    if (fimMs > agora) noArPorConta[log.conta_id] = (noArPorConta[log.conta_id] ?? 0) + 1;
  }

  return NextResponse.json({ ultimasFalhas, noArPorConta });
}
