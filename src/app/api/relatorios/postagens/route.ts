import { NextResponse } from "next/server";
import { obterRelatorioPostagens, montarHtmlRelatorioPostagens } from "@/lib/relatorioPostagens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Botão "Baixar relatório" da aba Radar de posts — mesmo HTML do e-mail, servido como arquivo
 * pra abrir no navegador ou compartilhar direto (não é um PDF de verdade: um .html já abre
 * formatado em qualquer navegador e imprime/salva como PDF se precisar, sem trazer mais uma
 * dependência pro projeto só por causa de um relatório simples). */
export async function GET() {
  const unidades = await obterRelatorioPostagens();
  const html = montarHtmlRelatorioPostagens(unidades);
  const nomeArquivo = `relatorio-postagens-${new Date().toISOString().slice(0, 10)}.html`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
