import { NextResponse, type NextRequest } from "next/server";
import { acharPostPorLink, buscarPostsInstagram } from "@/lib/meta/api";
import { ErroMetaNaoConectado } from "@/lib/meta/token";
import { ErroGraphAPIException } from "@/lib/meta/erros";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const instagramBusinessId = request.nextUrl.searchParams.get("instagramBusinessId");
  if (!instagramBusinessId) {
    return NextResponse.json({ erro: "Falta o Instagram vinculado a essa conta." }, { status: 400 });
  }

  const p = request.nextUrl.searchParams;
  try {
    // Por link colado do Instagram: devolve só essa publicação.
    const link = p.get("link");
    if (link) {
      const post = await acharPostPorLink(instagramBusinessId, link);
      return post
        ? NextResponse.json({ posts: [post], proximo: null })
        : NextResponse.json({ erro: "Não achei essa publicação nessa conta. Confira se o link é do perfil certo." }, { status: 404 });
    }
    // Por mês (AAAA-MM, horário de São Paulo) e/ou continuando de onde parou (cursor).
    const mes = p.get("mes");
    let desdeUnix: number | undefined;
    let ateUnix: number | undefined;
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const [ano, m] = mes.split("-").map(Number);
      const proximo = m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, "0")}`;
      desdeUnix = Math.floor(new Date(`${mes}-01T00:00:00-03:00`).getTime() / 1000);
      ateUnix = Math.floor(new Date(`${proximo}-01T00:00:00-03:00`).getTime() / 1000) - 1;
    }
    const r = await buscarPostsInstagram(instagramBusinessId, {
      desdeUnix,
      ateUnix,
      depois: p.get("depois") ?? undefined,
      limit: mes ? 60 : 30,
    });
    return NextResponse.json({ posts: r.posts, proximo: r.proximo });
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
