import { criarClienteAdmin } from "@/lib/supabase/admin";
import { listarCampanhas, campanhaAtivaAgora } from "@/lib/meta/api";
import { mapearEmLotes } from "@/lib/lotes";

export const ROTULO_OBJETIVO: Record<string, string> = {
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_AWARENESS: "Alcance",
  OUTCOME_LEADS: "Geração de cadastros",
  OUTCOME_TRAFFIC: "Tráfego / cliques",
  OUTCOME_SALES: "Vendas",
  OUTCOME_APP_PROMOTION: "Promoção de app",
};

interface LinhaCache {
  conta_id: string;
  meta_campaign_id: string;
  nome: string;
  objetivo: string | null;
  orcamento_diario_centavos: number | null;
}

/** Recalcula o snapshot de TODAS as campanhas ativas das unidades de franquia — só é chamado pelo
 * cron (ver /api/cron/campanhas-rede e vercel.json), 2x/dia, nunca por uma visita à tela. Antes
 * disso não existia panorama nenhum entre unidades: só dava pra ver campanha por campanha dentro de
 * cada conta. Em lotes (mapearEmLotes) — corta o tempo total sem arriscar rate limit da Meta. */
export async function recalcularCampanhasRede(): Promise<{ contasVerificadas: number; campanhasAtivas: number }> {
  const supabase = criarClienteAdmin();
  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select("id, smartads_empresas!inner(tipo), smartads_contas_meta(*)")
    .eq("ativo", true)
    .eq("smartads_empresas.tipo", "franquia");

  const contas = (clientes ?? []).flatMap((cliente: any) =>
    (cliente.smartads_contas_meta as any[]).filter((conta) => conta.ativo)
  );

  const listas = await mapearEmLotes(contas, async (conta): Promise<LinhaCache[]> => {
    const ativas: LinhaCache[] = [];
    let after: string | undefined;

    // Pagina até 5 páginas (250 campanhas) por conta como trava de segurança — mesmo limite já
    // usado em obterResumoCampanhasAtivas, raríssima conta de agência chega perto disso.
    for (let pagina = 0; pagina < 5; pagina++) {
      const { campanhas, proximoCursor } = await listarCampanhas(conta.meta_ad_account_id, {
        limit: 50,
        after,
      }).catch(() => ({ campanhas: [], proximoCursor: null }));

      for (const campanha of campanhas) {
        if (!campanhaAtivaAgora(campanha)) continue;
        ativas.push({
          conta_id: conta.id,
          meta_campaign_id: campanha.id,
          nome: campanha.name,
          objetivo: campanha.objective ?? null,
          orcamento_diario_centavos: campanha.daily_budget ? Number(campanha.daily_budget) : null,
        });
      }

      if (!proximoCursor) break;
      after = proximoCursor;
    }

    return ativas;
  });

  const todasAtivas = listas.flat();
  const agora = new Date().toISOString();

  // Troca o snapshot inteiro em vez de diffar quem deixou de estar ativa — mais simples, e uma
  // campanha pausada/encerrada some sozinha da lista nessa substituição.
  await supabase.from("smartads_campanhas_rede_cache").delete().not("id", "is", null);
  if (todasAtivas.length > 0) {
    await supabase
      .from("smartads_campanhas_rede_cache")
      .insert(todasAtivas.map((c) => ({ ...c, atualizado_em: agora })));
  }

  return { contasVerificadas: contas.length, campanhasAtivas: todasAtivas.length };
}

export interface CampanhaRedeResumo {
  contaId: string;
  clienteNome: string;
  contaNome: string;
  nome: string;
  objetivo: string | null;
  orcamentoDiarioCentavos: number | null;
}

/** Lê o panorama já calculado (ver recalcularCampanhasRede) — a tela nunca bate na Meta ao vivo. */
export async function obterCampanhasAtivasRede(): Promise<{
  campanhas: CampanhaRedeResumo[];
  atualizadoEm: string | null;
}> {
  const supabase = criarClienteAdmin();
  const [{ data: cache }, { data: clientes }] = await Promise.all([
    supabase
      .from("smartads_campanhas_rede_cache")
      .select("conta_id, nome, objetivo, orcamento_diario_centavos, atualizado_em"),
    supabase
      .from("smartads_clientes")
      .select("id, nome, smartads_empresas!inner(tipo), smartads_contas_meta(*)")
      .eq("ativo", true)
      .eq("smartads_empresas.tipo", "franquia"),
  ]);

  const nomesPorConta = new Map<string, { clienteNome: string; contaNome: string }>();
  for (const cliente of (clientes ?? []) as any[]) {
    for (const conta of cliente.smartads_contas_meta as any[]) {
      nomesPorConta.set(conta.id, {
        clienteNome: cliente.nome,
        contaNome: conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id,
      });
    }
  }

  const campanhas = (cache ?? [])
    .map((c): CampanhaRedeResumo | null => {
      const nomes = nomesPorConta.get(c.conta_id);
      if (!nomes) return null; // conta desativada depois do último cálculo do cache — ignora
      return {
        contaId: c.conta_id,
        clienteNome: nomes.clienteNome,
        contaNome: nomes.contaNome,
        nome: c.nome,
        objetivo: c.objetivo,
        orcamentoDiarioCentavos: c.orcamento_diario_centavos,
      };
    })
    .filter((c): c is CampanhaRedeResumo => c !== null)
    .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome) || a.nome.localeCompare(b.nome));

  // Todas as linhas nascem na mesma rodada do cron — o timestamp da primeira serve pro conjunto
  // inteiro, não precisa guardar/calcular um "mais recente" separado.
  const atualizadoEm = cache && cache.length > 0 ? cache[0].atualizado_em : null;

  return { campanhas, atualizadoEm };
}
