import { NextResponse, type NextRequest } from "next/server";
import { lerAmbiente } from "@/lib/ambiente";
import { lerAcesso } from "@/lib/acesso";
import { mesDoRelatorio } from "@/lib/relatorioMensal";
import { avancarRelatorioRede, carregarLinhasRede, enviarRelatorioRede, montarPdfRede } from "@/lib/relatorioRede";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Botão "Relatório da rede": cada chamada calcula mais algumas unidades do mês (a tela chama de novo
 * até terminar). Com { enviar: true } e tudo pronto, manda o PDF por e-mail. */
export async function POST(request: NextRequest) {
  const ambiente = await lerAmbiente();
  if (!ambiente || ambiente.tipo !== "franquia") return NextResponse.json({ erro: "Abra uma franquia." }, { status: 403 });
  const corpo = await request.json().catch(() => ({}));
  const mes = mesDoRelatorio(new Date(), typeof corpo?.mes === "string" ? corpo.mes : undefined);
  const andamento = await avancarRelatorioRede(ambiente.id, mes, 45_000);
  const { faltam } = await carregarLinhasRede(ambiente.id, mes);
  if (faltam > 0) return NextResponse.json({ pronto: false, ...andamento, faltam });
  if (corpo?.enviar === true) {
    if ((await lerAcesso()).restrito) return NextResponse.json({ erro: "Sem permissão pra enviar." }, { status: 403 });
    try {
      const r = await enviarRelatorioRede(ambiente.id, mes, true);
      return NextResponse.json({ pronto: true, ...andamento, enviado: r.enviado, motivo: r.motivo });
    } catch (e) {
      return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao enviar." }, { status: 502 });
    }
  }
  return NextResponse.json({ pronto: true, ...andamento });
}

/** Baixa o PDF do mês (só quando todas as unidades já foram calculadas). */
export async function GET(request: NextRequest) {
  const ambiente = await lerAmbiente();
  if (!ambiente || ambiente.tipo !== "franquia") return NextResponse.json({ erro: "Abra uma franquia." }, { status: 403 });
  const mes = mesDoRelatorio(new Date(), request.nextUrl.searchParams.get("mes") ?? undefined);
  const { linhas, faltam } = await carregarLinhasRede(ambiente.id, mes);
  if (faltam > 0 || linhas.length === 0) return NextResponse.json({ erro: "Relatório ainda não calculado." }, { status: 409 });
  const doc = await montarPdfRede(ambiente.nome, mes, linhas);
  return new NextResponse(Buffer.from(doc.output("arraybuffer")), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="relatorio-rede-${mes.mes}.pdf"` },
  });
}
