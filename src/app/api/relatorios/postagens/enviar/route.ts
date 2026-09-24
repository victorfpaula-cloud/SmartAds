import { NextResponse } from "next/server";
import { enviarRelatorioPostagens } from "@/lib/email/relatorioPostagens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Botão "Enviar por e-mail agora" da aba Última postagem — mesma função que o cron semanal
 * chama sozinho (ver /api/cron/relatorio-postagens), só que disparada na hora. */
export async function POST() {
  const resultado = await enviarRelatorioPostagens();
  if (!resultado.enviado) {
    return NextResponse.json({ erro: resultado.motivo ?? "Falha ao enviar." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
