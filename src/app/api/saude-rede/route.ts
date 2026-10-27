import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { lerAmbiente } from "@/lib/ambiente";
import { gerarRelatorioAds } from "@/lib/relatorioAds";
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
    return NextResponse.json({ ok: true });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message.slice(0, 300) : "Falha ao buscar na Meta.";
    await supabase
      .from("smartads_saude_rede_cache")
      .upsert({ conta_id: contaId, dias, erro: mensagem });  // mantém os números antigos, se houver
    return NextResponse.json({ erro: mensagem }, { status: 502 });
  }
}
