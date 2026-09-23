import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface CorpoCriativo {
  modo: "oficial_upload" | "livre_por_unidade";
  criativoTitulo?: string;
  criativoMensagem?: string;
  criativoImagemBase64?: string;
  criativoCta?: string;
}

/** Define ou atualiza o criativo de UMA etapa de uma Campanha-Mãe — usado tanto na criação quanto
 * depois, quando a mídia de uma etapa futura só fica pronta mais perto da data (ver aviso de
 * criativo pendente). `upsert` porque a linha já existe desde a criação da Campanha-Mãe (ver
 * POST /api/campanhas-mae), então isso sempre atualiza; o upsert só é rede de segurança. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; estrategiaEtapaId: string }> }
) {
  const { id, estrategiaEtapaId } = await params;
  const corpo = (await request.json().catch(() => null)) as CorpoCriativo | null;

  if (!corpo?.modo || (corpo.modo !== "oficial_upload" && corpo.modo !== "livre_por_unidade")) {
    return NextResponse.json({ erro: "Informe o modo do criativo." }, { status: 400 });
  }
  if (corpo.modo === "oficial_upload" && (!corpo.criativoMensagem?.trim() || !corpo.criativoImagemBase64)) {
    return NextResponse.json(
      { erro: "Pra criativo oficial, informe pelo menos a imagem e o texto do anúncio." },
      { status: 400 }
    );
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_campanha_mae_criativos")
    .upsert(
      {
        campanha_mae_id: id,
        estrategia_etapa_id: estrategiaEtapaId,
        modo: corpo.modo,
        criativo_titulo: corpo.criativoTitulo?.trim() || null,
        criativo_mensagem: corpo.modo === "oficial_upload" ? corpo.criativoMensagem?.trim() || null : null,
        criativo_imagem_base64: corpo.modo === "oficial_upload" ? corpo.criativoImagemBase64 || null : null,
        criativo_cta: corpo.modo === "oficial_upload" ? corpo.criativoCta || "LEARN_MORE" : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "campanha_mae_id,estrategia_etapa_id" }
    )
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ erro: error?.message ?? "Falha ao salvar o criativo." }, { status: 500 });
  }

  return NextResponse.json({ criativo: data });
}
