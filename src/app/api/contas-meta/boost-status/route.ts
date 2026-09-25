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
    .select("id")
    .eq("boost_automatico_ativo", true);

  const contaIds = (contasComBoost ?? []).map((c) => c.id);
  if (contaIds.length === 0) {
    return NextResponse.json({ ultimasFalhas: {} });
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

  return NextResponse.json({ ultimasFalhas });
}
