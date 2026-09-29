import { NextResponse, type NextRequest } from "next/server";
import { listarContasDeAnuncio, listarPaginas } from "@/lib/meta/api";
import { ErroMetaNaoConectado } from "@/lib/meta/token";
import { ErroGraphAPIException } from "@/lib/meta/erros";

// Mesmo motivo do /api/meta/status: sem isso o Next tenta pré-renderizar como estática no build.
export const dynamic = "force-dynamic";

/** Contas de anúncio e páginas que o login atual enxerga — alimenta o seletor "Adicionar conta"
 * na tela de clientes. Cruza os dois porque a Meta não devolve isso já pareado: o usuário escolhe
 * a página certa na hora (a conta de anúncio, sozinha, não indica a qual página ela pertence). */
export async function GET(request: NextRequest) {
  // Sem conexaoId = a conexão principal; com ele, só o que aquele login específico enxerga
  // (cada conta nova conecta pela Meta com o seu próprio portfólio — ver smartads_meta_conexoes).
  const conexaoId = request.nextUrl.searchParams.get("conexaoId") || null;
  try {
    const [contas, paginas] = await Promise.all([listarContasDeAnuncio(conexaoId), listarPaginas(conexaoId)]);
    return NextResponse.json({ contas, paginas });
  } catch (erro) {
    if (erro instanceof ErroMetaNaoConectado) {
      return NextResponse.json({ erro: erro.message, naoConectado: true }, { status: 409 });
    }
    if (erro instanceof ErroGraphAPIException) {
      return NextResponse.json({ erro: erro.message }, { status: 502 });
    }
    return NextResponse.json({ erro: "Falha ao buscar contas na Meta." }, { status: 500 });
  }
}
