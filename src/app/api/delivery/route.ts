import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { lerAmbiente } from "@/lib/ambiente";

export const dynamic = "force-dynamic";

function limpar(valor: unknown, tipo: "ifood" | "whatsapp"): string | null | undefined {
  if (valor === undefined) return undefined;
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  if (tipo === "whatsapp" && /^[+\d\s()-]{8,}$/.test(texto)) return `https://wa.me/${texto.replace(/\D/g, "")}`;
  return /^https?:\/\//i.test(texto) ? texto : null;
}

/** Salva os links de delivery (iFood / WhatsApp) de uma conta do ambiente aberto. */
export async function POST(request: NextRequest) {
  const corpo = (await request.json().catch(() => null)) as { contaId?: string; linkIfood?: string; linkWhatsapp?: string } | null;
  const ambiente = await lerAmbiente();
  if (!corpo?.contaId || !ambiente) return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });

  const supabase = criarClienteAdmin();
  const { data: conta } = await supabase
    .from("smartads_contas_meta")
    .select("id, smartads_clientes!inner(empresa_id)")
    .eq("id", corpo.contaId)
    .eq("smartads_clientes.empresa_id", ambiente.id)
    .maybeSingle();
  if (!conta) return NextResponse.json({ erro: "Conta não encontrada neste ambiente." }, { status: 404 });

  const ifood = limpar(corpo.linkIfood, "ifood");
  const whats = limpar(corpo.linkWhatsapp, "whatsapp");
  if ((corpo.linkIfood?.trim() && ifood === null) || (corpo.linkWhatsapp?.trim() && whats === null)) {
    return NextResponse.json({ erro: "Link inválido — precisa começar com https://" }, { status: 400 });
  }
  const atualizacao: Record<string, string | null> = {};
  if (ifood !== undefined) atualizacao.link_ifood = ifood;
  if (whats !== undefined) atualizacao.link_whatsapp = whats;
  const { error } = await supabase.from("smartads_contas_meta").update(atualizacao).eq("id", corpo.contaId);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, linkIfood: ifood ?? null, linkWhatsapp: whats ?? null });
}
