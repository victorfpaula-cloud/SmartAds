import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterPostInstagram, obterTokenDePagina, listarPostsDaPaginaBruto } from "@/lib/meta/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Rota TEMPORÁRIA, pra investigar direto contra a API real por que o boost automático falhou com
// "sem cross-post correspondente" em dois posts (26 e 27/09/2026) que, segundo o dono, TINHAM
// cross-post — não dá pra confirmar (ou descartar) a teoria da janela de 10min só olhando o log de
// erro, que não guarda o que a Meta realmente devolveu. Dispara manualmente pelo botão "Run" do
// Vercel (Cron Jobs), não fica agendada em vercel.json. Remover depois de usar (ver Fase N, mesmo
// padrão de rota de diagnóstico já usado antes nesse projeto).
const CASOS = [
  { pageId: "269025273239114", mediaId: "18394213630166170" }, // falhou 27/09
  { pageId: "269025273239114", mediaId: "18134394634656646" }, // falhou 26/09
];

export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");
  if (!segredoEsperado || autorizacao !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const supabase = criarClienteAdmin();
  const resultados: unknown[] = [];

  for (const caso of CASOS) {
    try {
      const post = await obterPostInstagram(caso.mediaId);
      const tokenPagina = await obterTokenDePagina(caso.pageId);

      if (!tokenPagina) {
        resultados.push({ ...caso, igTimestamp: post.timestamp, temTokenPagina: false });
        continue;
      }

      // Janela bem larga (±48h) só pra enxergar o que existe de verdade — sem filtro nenhum.
      const alvo = new Date(post.timestamp).getTime();
      const desde = new Date(alvo - 48 * 3600 * 1000).toISOString().slice(0, 10);
      const ate = new Date(alvo + 48 * 3600 * 1000).toISOString().slice(0, 10);
      const postsDaPagina = await listarPostsDaPaginaBruto(caso.pageId, tokenPagina, desde, ate);

      resultados.push({
        ...caso,
        igTimestamp: post.timestamp,
        igMediaType: post.media_type,
        temTokenPagina: true,
        postsDaPagina: postsDaPagina.map((p) => ({
          id: p.id,
          created_time: p.created_time,
          diferencaMin: Math.round((new Date(p.created_time).getTime() - alvo) / 60_000),
          message: p.message?.slice(0, 60),
        })),
      });
    } catch (e) {
      resultados.push({ ...caso, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  await supabase.from("smartads_boost_diagnostico").insert({ resultado: resultados });
  return NextResponse.json({ ok: true, resultados });
}
