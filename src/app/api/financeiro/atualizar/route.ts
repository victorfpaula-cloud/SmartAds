import { lerAmbiente } from "@/lib/ambiente";
import { lerAcesso } from "@/lib/acesso";
import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { comContaMeta } from "@/lib/meta/conexao";
import { atualizarCacheFinanceiroDaConta } from "@/lib/financeiro/atualizarCacheFinanceiro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Botão "Atualizar agora" do Financeiro: recalcula na hora o cache de UMA conta (em vez de esperar
 * o cron diário) ou de todas as ativas quando não vem contaId. */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => ({}));
  const contaId: string | undefined = typeof corpo?.contaId === "string" ? corpo.contaId : undefined;

  const supabase = criarClienteAdmin();
  // Sem conta específica: só as contas do ambiente aberto (na visão geral, todas).
  const ambiente = contaId ? null : await lerAmbiente();
  const consulta = ambiente
    ? supabase.from("smartads_contas_meta").select("id, meta_ad_account_id, smartads_clientes!inner(empresa_id)").eq("ativo", true).eq("smartads_clientes.empresa_id", ambiente.id)
    : supabase.from("smartads_contas_meta").select("id, meta_ad_account_id").eq("ativo", true);
  if (!contaId && !ambiente && (await lerAcesso()).restrito) {
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  }
  const { data: contas } = await (contaId ? consulta.eq("id", contaId) : consulta);
  if (!contas || contas.length === 0) {
    return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  }

  // Em lotes pequenos, cada conta no contexto da sua própria conexão com a Meta.
  for (let i = 0; i < contas.length; i += 4) {
    await Promise.all(
      contas
        .slice(i, i + 4)
        .map((c) => comContaMeta(c.id, () => atualizarCacheFinanceiroDaConta(c.id, c.meta_ad_account_id)))
    );
  }
  return NextResponse.json({ ok: true, atualizadas: contas.length });
}
