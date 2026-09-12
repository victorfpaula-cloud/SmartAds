import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { explicarAnomalia } from "@/lib/ia/explicarAnomalia";

export const dynamic = "force-dynamic";

/** Gera a explicação em texto pra uma anomalia já detectada e cacheada em
 * smartads_saude_contas (ver /api/saude) — recebe só o contaId, busca a anomalia e o nome do
 * cliente/conta no banco, nunca confia em dado vindo do front pra montar o prompt. Não cacheia a
 * explicação em si: é curta e barata, gerar de novo a cada clique é mais simples do que gerenciar
 * mais um cache que pode ficar desatualizado se a anomalia mudar. */
export async function POST(request: Request) {
  const { contaId } = await request.json();
  if (!contaId) {
    return NextResponse.json({ erro: "contaId é obrigatório." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();

  const [{ data: saude }, { data: conta }] = await Promise.all([
    supabase.from("smartads_saude_contas").select("anomalia").eq("conta_id", contaId).maybeSingle(),
    supabase
      .from("smartads_contas_meta")
      .select("nome_exibicao, meta_ad_account_nome, smartads_clientes(nome)")
      .eq("id", contaId)
      .single(),
  ]);

  if (!saude?.anomalia) {
    return NextResponse.json({ erro: "Nenhuma anomalia registrada pra essa conta agora." }, { status: 404 });
  }
  if (!conta) {
    return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  }

  const texto = await explicarAnomalia(saude.anomalia, {
    clienteNome: (conta as any).smartads_clientes?.nome ?? "Cliente",
    contaNome: conta.nome_exibicao || conta.meta_ad_account_nome || "Conta",
  });

  if (!texto) {
    return NextResponse.json(
      { erro: "Não foi possível gerar a explicação agora. Confira se a GEMINI_API_KEY está configurada." },
      { status: 502 }
    );
  }

  return NextResponse.json({ texto });
}
