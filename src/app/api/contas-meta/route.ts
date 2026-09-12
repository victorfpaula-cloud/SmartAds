import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

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
  } = corpo ?? {};

  if (!clienteId || !metaAdAccountId || !pageId) {
    return NextResponse.json(
      { erro: "Selecione o cliente, a conta de anúncio e a página." },
      { status: 400 }
    );
  }

  const supabase = criarClienteAdmin();
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
    })
    .select()
    .single();

  if (error) {
    // unique_violation na conta de anúncio (já associada a outro cliente)
    const mensagem =
      error.code === "23505"
        ? "Essa conta de anúncio já está associada a outro cliente."
        : error.message;
    return NextResponse.json({ erro: mensagem }, { status: 400 });
  }

  return NextResponse.json({ conta: data }, { status: 201 });
}
