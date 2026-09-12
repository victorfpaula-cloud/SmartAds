import { NextResponse, type NextRequest } from "next/server";
import { buscarInteresses } from "@/lib/meta/api";
import { ErroMetaNaoConectado } from "@/lib/meta/token";
import { ErroGraphAPIException } from "@/lib/meta/erros";

export async function GET(request: NextRequest) {
  const termo = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const resultados = await buscarInteresses(termo);
    return NextResponse.json({ resultados });
  } catch (erro) {
    if (erro instanceof ErroMetaNaoConectado) {
      return NextResponse.json({ erro: erro.message, naoConectado: true }, { status: 409 });
    }
    if (erro instanceof ErroGraphAPIException) {
      return NextResponse.json({ erro: erro.message }, { status: 502 });
    }
    return NextResponse.json({ erro: "Falha ao buscar interesses." }, { status: 500 });
  }
}
