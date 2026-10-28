import { NextResponse, type NextRequest } from "next/server";
import { gerarRelatoriosDoMes, enviarRelatorioMensalDaUnidade, mesDoRelatorio } from "@/lib/relatorioMensal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Baixa o PDF do mês passado (ou ?mes=AAAA-MM) de uma unidade: se tiver mais de uma conta de anúncio, devolve a primeira. */
export async function GET(request: NextRequest) {
  const clienteId = request.nextUrl.searchParams.get("clienteId");
  if (!clienteId) return NextResponse.json({ erro: "Informe a unidade." }, { status: 400 });
  try {
    const mes = mesDoRelatorio(new Date(), request.nextUrl.searchParams.get("mes") ?? undefined);
    const { pdfs } = await gerarRelatoriosDoMes(clienteId, mes);
    if (pdfs.length === 0) return NextResponse.json({ erro: "Unidade sem conta de anúncio ativa." }, { status: 404 });
    return new NextResponse(new Uint8Array(pdfs[0].conteudo), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${pdfs[0].nome}"` },
    });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao gerar o PDF." }, { status: 502 });
  }
}

/** Envia agora o relatório do mês passado pro e-mail da unidade (teste ou reenvio). */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const clienteId = typeof corpo?.clienteId === "string" ? corpo.clienteId : "";
  if (!clienteId) return NextResponse.json({ erro: "Informe a unidade." }, { status: 400 });
  try {
    const r = await enviarRelatorioMensalDaUnidade(clienteId, mesDoRelatorio());
    return NextResponse.json(r, { status: r.enviado ? 200 : 422 });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao enviar." }, { status: 502 });
  }
}
