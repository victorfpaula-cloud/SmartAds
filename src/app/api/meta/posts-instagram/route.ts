import { NextResponse, type NextRequest } from "next/server";
import { listarPostsInstagram } from "@/lib/meta/api";
import { ErroMetaNaoConectado } from "@/lib/meta/token";
import { ErroGraphAPIException } from "@/lib/meta/erros";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const instagramBusinessId = request.nextUrl.searchParams.get("instagramBusinessId");
  if (!instagramBusinessId) {
    return NextResponse.json({ erro: "Falta o Instagram vinculado a essa conta." }, { status: 400 });
  }

  try {
    const posts = await listarPostsInstagram(instagramBusinessId);
    return NextResponse.json({ posts });
  } catch (erro) {
    if (erro instanceof ErroMetaNaoConectado) {
      return NextResponse.json({ erro: erro.message, naoConectado: true }, { status: 409 });
    }
    if (erro instanceof ErroGraphAPIException) {
      return NextResponse.json({ erro: erro.message }, { status: 502 });
    }
    return NextResponse.json({ erro: "Falha ao buscar publicações do Instagram." }, { status: 500 });
  }
}
