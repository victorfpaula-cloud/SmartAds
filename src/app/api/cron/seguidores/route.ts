import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterResumoContaInstagram } from "@/lib/meta/api";
import { comContaMeta } from "@/lib/meta/conexao";
import { mapearEmLotes } from "@/lib/lotes";
import { diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import { completarHistoricoSeguidores } from "@/lib/seguidoresHistorico";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Guarda 1x/dia quantos seguidores cada conta tem (smartads_seguidores_snapshot). A Meta não
 * devolve histórico de seguidores, então o "novos seguidores" do Relatório Ads é a diferença entre
 * duas leituras daqui. Mesma autenticação por CRON_SECRET do resto da automação. */
export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado || request.headers.get("authorization") !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const supabase = criarClienteAdmin();
  const { data: contas } = await supabase
    .from("smartads_contas_meta")
    .select("id, instagram_business_id, page_id")
    .eq("ativo", true)
    .not("instagram_business_id", "is", null);

  const hoje = diaEmSaoPaulo(new Date().toISOString());
  const resultados = await mapearEmLotes(contas ?? [], async (conta) => {
    try {
      // Grava a leitura de hoje e completa os últimos 30 dias que ainda não tenham leitura (histórico).
      const completou = await comContaMeta(conta.id, () =>
        completarHistoricoSeguidores(conta.id, conta.instagram_business_id as string, (conta.page_id as string | null) ?? null)
      ).then(() => true, () => false);
      if (completou) return true;
      const resumo = await comContaMeta(conta.id, () => obterResumoContaInstagram(conta.instagram_business_id as string));
      if (typeof resumo.followers_count !== "number") return false;
      await supabase
        .from("smartads_seguidores_snapshot")
        .upsert({ conta_id: conta.id, dia: hoje, seguidores: resumo.followers_count }, { onConflict: "conta_id,dia" });
      return true;
    } catch {
      return false;
    }
  });

  return NextResponse.json({ contas: resultados.length, gravadas: resultados.filter(Boolean).length, executadoEm: new Date().toISOString() });
}
