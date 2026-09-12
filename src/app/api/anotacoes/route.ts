import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Anotações de uma campanha (mais recentes primeiro) — chaveadas pelo ID de campanha da Meta,
 * funciona pra qualquer campanha do painel "Campanhas no ar". */
export async function GET(request: Request) {
  const campaignId = new URL(request.url).searchParams.get("campaignId");
  if (!campaignId) {
    return NextResponse.json({ erro: "campaignId é obrigatório." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_anotacoes")
    .select("id, texto, created_at")
    .eq("meta_campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ anotacoes: data });
}

export async function POST(request: Request) {
  const { campaignId, texto } = await request.json();
  if (!campaignId || !texto?.trim()) {
    return NextResponse.json({ erro: "campaignId e texto são obrigatórios." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_anotacoes")
    .insert({ meta_campaign_id: campaignId, texto: texto.trim() })
    .select("id, texto, created_at")
    .single();

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ anotacao: data });
}
