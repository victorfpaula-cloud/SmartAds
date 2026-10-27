import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { lerAmbiente } from "@/lib/ambiente";
import { comContaMeta } from "@/lib/meta/conexao";
import { gerarRelatorioAds } from "@/lib/relatorioAds";
import { completarHistoricoSeguidores } from "@/lib/seguidoresHistorico";
import { enxugar, listarContasDaRede, PERIODOS_SAUDE_REDE } from "@/lib/saudeRede";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Recalcula na Meta os números de UMA conta da franquia num período e guarda no cache da Saúde da
 * rede. A tela chama uma conta por vez (cada uma dentro do limite de tempo) e mostra o progresso. */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const contaId = typeof corpo?.contaId === "string" ? corpo.contaId : "";
  const dias = Number(corpo?.dias);
  if (!contaId || !PERIODOS_SAUDE_REDE.some((p) => p.dias === dias)) {
    return NextResponse.json({ erro: "Conta ou período inválido." }, { status: 400 });
  }
  const ambiente = await lerAmbiente();
  if (!ambiente || ambiente.tipo !== "franquia") return NextResponse.json({ erro: "Abra uma franquia." }, { status: 403 });
  const contas = await listarContasDaRede(ambiente.id);
  if (!contas.some((c) => c.contaId === contaId)) return NextResponse.json({ erro: "Conta fora desta franquia." }, { status: 404 });

  const supabase = criarClienteAdmin();
  try {
    const relatorio = await gerarRelatorioAds(contaId, dias, true);
    await supabase
      .from("smartads_saude_rede_cache")
      .upsert({ conta_id: contaId, dias, dados: enxugar(relatorio), erro: null, calculado_em: new Date().toISOString() });
    // Aproveita pra completar o histórico de seguidores dessa conta (não derruba a atualização se falhar).
    const conta = contas.find((c) => c.contaId === contaId);
    if (conta?.instagramId) {
      const { data: pg } = await supabase.from("smartads_contas_meta").select("page_id").eq("id", contaId).maybeSingle();
      await comContaMeta(contaId, () => completarHistoricoSeguidores(contaId, conta.instagramId!, (pg?.page_id as string | null) ?? null)).catch(() => 0);
    }
    return NextResponse.json({ ok: true });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message.slice(0, 300) : "Falha ao buscar na Meta.";
    await supabase
      .from("smartads_saude_rede_cache")
      .upsert({ conta_id: contaId, dias, erro: mensagem });  // mantém os números antigos, se houver
    return NextResponse.json({ erro: mensagem }, { status: 502 });
  }
}
