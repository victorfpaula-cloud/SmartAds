import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { coletarDadosDiagnostico } from "@/lib/diagnostico/coletarDados";
import { gerarDiagnostico } from "@/lib/diagnostico/gerarDiagnostico";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Último diagnóstico gerado pra uma conta + suas sugestões (pendentes ou não, a tela decide o
 * que mostrar). `null` quando nunca foi gerado. */
export async function GET(request: NextRequest) {
  const contaId = request.nextUrl.searchParams.get("contaId");
  if (!contaId) return NextResponse.json({ erro: "Informe a conta." }, { status: 400 });

  const supabase = criarClienteAdmin();
  const { data: diagnostico } = await supabase
    .from("smartads_diagnosticos")
    .select("*")
    .eq("conta_id", contaId)
    .order("gerado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!diagnostico) return NextResponse.json({ diagnostico: null, sugestoes: [] });

  const { data: sugestoes } = await supabase
    .from("smartads_sugestoes")
    .select("*")
    .eq("diagnostico_id", diagnostico.id)
    .order("created_at");

  return NextResponse.json({ diagnostico, sugestoes: sugestoes ?? [] });
}

/** Gera um diagnóstico novo (chama o Gemini de verdade) — acionado só pelo botão na tela, nunca
 * automaticamente, mesma filosofia do resumo de Relatórios (evita gastar token à toa). */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  if (!corpo?.clienteId || !corpo?.contaId) {
    return NextResponse.json({ erro: "Informe o cliente e a conta." }, { status: 400 });
  }

  let pacote;
  try {
    pacote = await coletarDadosDiagnostico(corpo.clienteId, corpo.contaId);
  } catch (erro) {
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Falha ao coletar os dados." },
      { status: 500 }
    );
  }

  const resultado = await gerarDiagnostico(pacote);
  if (!resultado) {
    return NextResponse.json(
      { erro: "Não foi possível gerar o diagnóstico agora. Confira se a GEMINI_API_KEY está configurada." },
      { status: 502 }
    );
  }

  const supabase = criarClienteAdmin();
  const { data: diagnostico, error: erroDiagnostico } = await supabase
    .from("smartads_diagnosticos")
    .insert({
      cliente_id: corpo.clienteId,
      conta_id: corpo.contaId,
      texto: resultado.diagnostico,
      dados_usados: pacote,
    })
    .select()
    .single();

  if (erroDiagnostico || !diagnostico) {
    return NextResponse.json({ erro: erroDiagnostico?.message ?? "Falha ao salvar o diagnóstico." }, { status: 500 });
  }

  let sugestoesSalvas: unknown[] = [];
  if (resultado.sugestoes.length > 0) {
    const { data } = await supabase
      .from("smartads_sugestoes")
      .insert(
        resultado.sugestoes.map((s) => ({
          diagnostico_id: diagnostico.id,
          cliente_id: corpo.clienteId,
          conta_id: corpo.contaId,
          tipo: s.tipo,
          titulo: s.titulo,
          descricao: s.descricao,
          dados: s.dados,
          token_aprovacao: randomUUID(),
        }))
      )
      .select();
    sugestoesSalvas = data ?? [];
  }

  return NextResponse.json({ diagnostico, sugestoes: sugestoesSalvas }, { status: 201 });
}
