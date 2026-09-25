import { criarClienteAdmin } from "@/lib/supabase/admin";
import { listarStoriesAtivosInstagram } from "@/lib/meta/api";
import { diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import { mapearEmLotes } from "@/lib/lotes";

/** Roda 1x/dia perto da meia-noite de SP (ver /api/cron/stories e vercel.json) — a Meta só expõe
 * stories ATIVOS (postados nas últimas 24h), sem histórico nenhum, então cada rodada grava em
 * smartads_stories_vistos os que ainda estão no ar. Como cada story dura exatamente 24h, rodar
 * perto do fim do dia captura praticamente tudo que foi postado nele sem precisar de várias
 * chamadas por dia. O dia gravado vem do timestamp de CRIAÇÃO do story (não de quando o cron
 * rodou), e o id como chave primária evita contar o mesmo story duas vezes caso o cron rode mais
 * de uma vez. Escopado só pra unidades de franquia — mesmo recorte de obterRelatorioPostagens.
 * Processa as contas em lotes (mapearEmLotes) em vez de uma por uma — corta o tempo total sem
 * arriscar estourar rate limit da Meta quando o catálogo de clientes crescer. */
export async function coletarStoriesAtivos(): Promise<{ contasVerificadas: number; storiesRegistrados: number }> {
  const supabase = criarClienteAdmin();
  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select("id, smartads_empresas!inner(tipo), smartads_contas_meta(*)")
    .eq("ativo", true)
    .eq("smartads_empresas.tipo", "franquia");

  const contas = (clientes ?? []).flatMap((cliente: any) =>
    (cliente.smartads_contas_meta as any[]).filter((conta) => conta.ativo && conta.instagram_business_id)
  );

  const registradosPorConta = await mapearEmLotes(contas, async (conta) => {
    const stories = await listarStoriesAtivosInstagram(conta.instagram_business_id).catch(() => []);
    if (stories.length === 0) return 0;

    const linhas = stories.map((story) => ({
      id: story.id,
      conta_id: conta.id,
      dia: diaEmSaoPaulo(story.timestamp),
    }));

    // ignoreDuplicates: um story visto em rodadas anteriores não é regravado nem conta de novo —
    // o id (chave primária) já garante isso no banco, aqui só evita erro de conflito na chamada.
    const { error } = await supabase
      .from("smartads_stories_vistos")
      .upsert(linhas, { onConflict: "id", ignoreDuplicates: true });
    return error ? 0 : linhas.length;
  });

  const storiesRegistrados = registradosPorConta.reduce((soma, n) => soma + n, 0);
  return { contasVerificadas: contas.length, storiesRegistrados };
}
