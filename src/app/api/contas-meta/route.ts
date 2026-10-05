import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { invalidarMapaDeConexoes } from "@/lib/meta/conexao";

export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const {
    clienteId,
    metaAdAccountId,
    metaAdAccountNome,
    metaBusinessId,
    pageId,
    pageNome,
    instagramBusinessId,
    instagramUsername,
    nomeExibicao,
    siglaCampanha,
    conexaoId,
  } = corpo ?? {};

  if (!clienteId || !metaAdAccountId || !pageId) {
    return NextResponse.json(
      { erro: "Selecione o cliente, a conta de anúncio e a página." },
      { status: 400 }
    );
  }

  const supabase = criarClienteAdmin();

  // A mesma conta de anúncio não entra duas vezes no mesmo cliente — adicionar de novo (por exemplo
  // pra trocar o login da Meta) criava uma linha duplicada na tela. Pra isso existe "Reconectar".
  const { data: existente } = await supabase
    .from("smartads_contas_meta")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("meta_ad_account_id", metaAdAccountId)
    .eq("ativo", true)
    .limit(1);
  if (existente && existente.length > 0) {
    return NextResponse.json(
      {
        erro: "Essa conta de anúncio já está cadastrada nesse cliente. Pra trocar o login da Meta dela, use o botão Reconectar na própria conta.",
      },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("smartads_contas_meta")
    .insert({
      cliente_id: clienteId,
      meta_ad_account_id: metaAdAccountId,
      meta_ad_account_nome: metaAdAccountNome,
      meta_business_id: metaBusinessId,
      page_id: pageId,
      page_nome: pageNome,
      instagram_business_id: instagramBusinessId,
      instagram_username: instagramUsername,
      nome_exibicao: nomeExibicao,
      sigla_campanha: siglaCampanha?.trim() || null,
      conexao_id: conexaoId || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }

  invalidarMapaDeConexoes();
  return NextResponse.json({ conta: data }, { status: 201 });
}
