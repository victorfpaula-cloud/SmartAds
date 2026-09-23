import { NextResponse, type NextRequest } from "next/server";
import { decidirSugestao, type DecisaoSugestao } from "@/lib/diagnostico/decidirSugestao";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpo = await request.json().catch(() => null);
  const decisao = corpo?.decisao as DecisaoSugestao | undefined;

  if (decisao !== "aprovar" && decisao !== "rejeitar") {
    return NextResponse.json({ erro: "Informe a decisão (aprovar ou rejeitar)." }, { status: 400 });
  }

  const resultado = await decidirSugestao(id, decisao);
  if (!resultado.ok) return NextResponse.json({ erro: resultado.mensagem }, { status: 400 });
  return NextResponse.json({ mensagem: resultado.mensagem });
}
