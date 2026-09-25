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
 * cada conta. Em lotes (mapearEmLotes) — corta o tempo total sem arriscar rate limit da Meta.
 *
 * Grava o snapshot de CADA conta assim que ela termina de ser processada, em vez de acumular tudo
 * em memória e só gravar no final (era assim antes, e por isso essa tabela nunca tinha uma linha
 * sequer em produção: com 18+ contas em lotes sequenciais de 5, cada uma com paginação de até 5
 * páginas na Meta, a function do Vercel estourava o tempo antes de chegar no delete+insert final —
 * nada era salvo, nem das contas que já tinham terminado. Mesmo raciocínio de robustez já usado no
 * financeiro e no /api/saude (ver atualizarCacheFinanceiroDaConta e /api/saude/route.ts): se a
 * function for interrompida no meio, o que já rodou continua salvo.
 *
 * Grava também em smartads_cron_diagnostico (início, quantas contas achou, quantas linhas gravou,
 * erro cru se algo explodir) — depois do fix acima, essa tabela CONTINUOU vazia mesmo passado o
 * horário do cron, sem nenhum jeito de saber por quê a partir daqui (sem acesso a runtime logs do
 * Vercel nesse ambiente). Isso dá um jeito de inspecionar direto pelo Supabase o que aconteceu na
 * última rodada, em vez de continuar tentando corrigir às cegas. */
export async function recalcularCampanhasRede(): Promise<{ contasVerificadas: number; campanhasAtivas: number }> {
  const supabase = criarClienteAdmin();

  const { data: diagnostico } = await supabase
    .from("smartads_cron_diagnostico")
    .insert({ cron: "campanhas-rede" })
    .select("id")
    .single();
  const diagnosticoId = diagnostico?.id as string | undefined;

  try {
    const { data: clientes, error: erroClientes } = await supabase
      .from("smartads_clientes")
      .select("id, smartads_empresas!inner(tipo), smartads_contas_meta(*)")
      .eq("ativo", true)
      .eq("smartads_empresas.tipo", "franquia");

    if (erroClientes) throw new Error(`Falha ao buscar clientes: ${erroClientes.message}`);

    const contas = (clientes ?? []).flatMap((cliente: any) =>
      (cliente.smartads_contas_meta as any[]).filter((conta) => conta.ativo)
    );

    if (diagnosticoId) {
      await supabase
        .from("smartads_cron_diagnostico")
        .update({ contas_encontradas: contas.length })
        .eq("id", diagnosticoId);
    }

    const agora = new Date().toISOString();

    const contagens = await mapearEmLotes(contas, async (conta): Promise<number> => {
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

      // Troca o snapshot só DESSA conta (não a tabela inteira) — uma campanha pausada/encerrada
      // some sozinha da lista dela nessa substituição, sem mexer no que já foi gravado pras outras.
      const { error: erroDelete } = await supabase
        .from("smartads_campanhas_rede_cache")
        .delete()
        .eq("conta_id", conta.id);
      if (erroDelete) throw new Error(`Falha ao limpar cache da conta ${conta.id}: ${erroDelete.message}`);

      if (ativas.length > 0) {
        const { error: erroInsert } = await supabase
          .from("smartads_campanhas_rede_cache")
          .insert(ativas.map((c) => ({ ...c, atualizado_em: agora })));
        if (erroInsert) throw new Error(`Falha ao gravar cache da conta ${conta.id}: ${erroInsert.message}`);
      }

      return ativas.length;
    });

    const campanhasAtivas = contagens.reduce((soma, n) => soma + n, 0);

    if (diagnosticoId) {
      await supabase
        .from("smartads_cron_diagnostico")
        .update({ linhas_gravadas: campanhasAtivas, finalizado_em: new Date().toISOString() })
        .eq("id", diagnosticoId);
    }

    return { contasVerificadas: contas.length, campanhasAtivas };
  } catch (erro) {
    if (diagnosticoId) {
      await supabase
        .from("smartads_cron_diagnostico")
        .update({
          erro: erro instanceof Error ? erro.message : String(erro),
          finalizado_em: new Date().toISOString(),
        })
        .eq("id", diagnosticoId);
    }
    throw erro;
  }
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
