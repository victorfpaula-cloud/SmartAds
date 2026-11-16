import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { buscarLinhasResumo } from "@/lib/relatorios";
import { lerAmbiente } from "@/lib/ambiente";

/** Um resumo por ambiente (empresa aberta); na visão geral, o de todas as contas. */
async function chaveDoResumo(): Promise<{ id: string; empresaId: string | undefined }> {
  const empresaId = (await lerAmbiente())?.id;
  return { id: empresaId ? `relatorios:${empresaId}` : "relatorios", empresaId };
}
import { gerarResumoRelatorio } from "@/lib/ia/resumoRelatorio";

export const dynamic = "force-dynamic";

/** Devolve o resumo em texto já gerado (cache), sem chamar o Gemini de novo — a tela de
 * Relatórios busca isso ao carregar. `null` quando nunca foi gerado ainda. */
export async function GET() {
  const supabase = criarClienteAdmin();
  const { id } = await chaveDoResumo();
  const { data } = await supabase
    .from("smartads_resumos_ia")
    .select("texto, gerado_em")
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ resumo: data ?? null });
}

/** Gera um resumo novo (chama o Gemini de verdade) e sobrescreve o cache — acionado só pelo botão
 * "Gerar resumo"/"Atualizar" na tela, nunca automaticamente, pra não gastar token à toa. */
export async function POST() {
  const { id, empresaId } = await chaveDoResumo();
  const linhas = await buscarLinhasResumo(empresaId);
  const texto = await gerarResumoRelatorio(linhas);

  if (!texto) {
    return NextResponse.json(
      { erro: "Não foi possível gerar o resumo agora. Confira se a GEMINI_API_KEY está configurada." },
      { status: 502 }
    );
  }

  const supabase = criarClienteAdmin();
  const geradoEm = new Date().toISOString();
  await supabase
    .from("smartads_resumos_ia")
    .upsert({ id, texto, gerado_em: geradoEm });

  return NextResponse.json({ resumo: { texto, gerado_em: geradoEm } });
}
