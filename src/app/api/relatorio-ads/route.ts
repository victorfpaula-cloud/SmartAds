import { NextResponse, type NextRequest } from "next/server";
import { gerarRelatorioAds, PERIODOS_RELATORIO_ADS } from "@/lib/relatorioAds";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Dados do relatório de tráfego de uma conta (a tela e o PDF usam exatamente esta resposta). */
export async function GET(request: NextRequest) {
  const contaId = request.nextUrl.searchParams.get("contaId");
  const dias = Number(request.nextUrl.searchParams.get("dias") ?? 30);
  if (!contaId) return NextResponse.json({ erro: "Escolha a conta." }, { status: 400 });
  if (!(PERIODOS_RELATORIO_ADS as readonly number[]).includes(dias)) {
    return NextResponse.json({ erro: "Período inválido." }, { status: 400 });
  }
  try {
    return NextResponse.json({ relatorio: await gerarRelatorioAds(contaId, dias) });
  } catch (erro) {
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Falha ao gerar o relatório." },
      { status: 502 }
    );
  }
}
