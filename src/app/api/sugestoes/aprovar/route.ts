import { NextResponse, type NextRequest } from "next/server";
import { decidirSugestao, buscarSugestaoPorToken, type DecisaoSugestao } from "@/lib/diagnostico/decidirSugestao";

export const dynamic = "force-dynamic";

function paginaHtml(titulo: string, mensagem: string, formulario?: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title>
<style>
body{font-family:-apple-system,sans-serif;background:#07080a;color:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
.cartao{max-width:420px;background:#111214;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:28px;text-align:center}
h1{font-size:18px;margin:0 0 12px}
p{font-size:14px;color:#a3a3a3;line-height:1.5}
button{margin-top:16px;background:#6366f1;color:#fff;border:none;border-radius:10px;padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer}
</style></head>
<body><div class="cartao"><h1>${titulo}</h1><p>${mensagem}</p>${formulario ?? ""}</div></body></html>`;
}

/** Link clicável do relatório semanal por e-mail — mostra uma confirmação em vez de aplicar
 * direto no GET, porque alguns clientes de e-mail pré-carregam links (abririam a página e
 * aplicariam a ação sem ninguém ter clicado de verdade). A ação de fato só acontece no POST, que
 * só existe atrás do botão dessa confirmação. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const acao = request.nextUrl.searchParams.get("acao") as DecisaoSugestao | null;

  if (!token || (acao !== "aprovar" && acao !== "rejeitar")) {
    return new NextResponse(paginaHtml("Link inválido", "Esse link de aprovação não é válido."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const sugestao = await buscarSugestaoPorToken(token);
  if (!sugestao) {
    return new NextResponse(paginaHtml("Sugestão não encontrada", "Esse link já não é mais válido."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (sugestao.status !== "pendente") {
    return new NextResponse(
      paginaHtml("Já decidido", `Essa sugestão já foi ${sugestao.status} antes.`),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const formulario = `<form method="POST" action="/api/sugestoes/aprovar?token=${encodeURIComponent(token)}&acao=${acao}">
    <button type="submit">${acao === "aprovar" ? "Confirmar aprovação" : "Confirmar rejeição"}</button>
  </form>`;

  return new NextResponse(
    paginaHtml(
      acao === "aprovar" ? "Aprovar sugestão?" : "Rejeitar sugestão?",
      `"${sugestao.titulo}" — clique abaixo pra confirmar.`,
      formulario
    ),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const acao = request.nextUrl.searchParams.get("acao") as DecisaoSugestao | null;

  if (!token || (acao !== "aprovar" && acao !== "rejeitar")) {
    return new NextResponse(paginaHtml("Link inválido", "Esse link de aprovação não é válido."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const sugestao = await buscarSugestaoPorToken(token);
  if (!sugestao) {
    return new NextResponse(paginaHtml("Sugestão não encontrada", "Esse link já não é mais válido."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const resultado = await decidirSugestao(sugestao.id, acao);
  return new NextResponse(paginaHtml(resultado.ok ? "Pronto!" : "Não deu certo", resultado.mensagem), {
    status: resultado.ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
