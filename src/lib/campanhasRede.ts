import { criarClienteAdmin } from "@/lib/supabase/admin";
import { listarCampanhas, campanhaAtivaAgora, obterInsightsConta } from "@/lib/meta/api";
import { mesAtualEmSaoPaulo } from "@/lib/tempoSaoPaulo";
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
  vitalicio: boolean;
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
 * última rodada, em vez de continuar tentando corrigir às cegas.
 *
 * Agrupa por meta_ad_account_id ANTES de bater na Meta — duas contas locais (ex: "Dona Baunilha
 * Principal" e "Dona Baunilha Expansão") podem apontar pra a MESMA conta de anúncio (ver
 * sigla_campanha em smartads_contas_meta), e antes disso cada uma buscava e gravava a lista
 * inteira de campanhas daquela conta de anúncio, duplicando tudo nas duas. Agora busca a Meta uma
 * vez só por conta de anúncio, e quando mais de uma conta local compartilha ela, separa as
 * campanhas por sigla: a que tem "(SIGLA)" no nome (mesmo prefixo que criarCampanhaCompleta grava,
 * "🤖 (SIGLA) nome") vai pra conta local com essa sigla configurada; o resto vai pra conta local
 * SEM sigla (a "base"). Efeito colateral bom: também corta chamada repetida à Meta pra mesma conta
 * de anúncio. */
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
      .select("id, smartads_contas_meta(*)")
      .eq("ativo", true);

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

    const gruposPorContaDeAnuncio = new Map<string, typeof contas>();
    for (const conta of contas) {
      const grupo = gruposPorContaDeAnuncio.get(conta.meta_ad_account_id) ?? [];
      grupo.push(conta);
      gruposPorContaDeAnuncio.set(conta.meta_ad_account_id, grupo);
    }

    const contagens = await mapearEmLotes([...gruposPorContaDeAnuncio.values()], async (contasDoGrupo): Promise<number> => {
      const campanhasAtivasMeta: Array<{
        id: string;
        name: string;
        objective?: string;
        daily_budget?: string;
        lifetime_budget?: string;
      }> = [];
      let after: string | undefined;

      // Pagina até 5 páginas (250 campanhas) por conta de anúncio como trava de segurança — mesmo
      // limite já usado em obterResumoCampanhasAtivas, raríssima conta de agência chega perto disso.
      for (let pagina = 0; pagina < 5; pagina++) {
        const { campanhas, proximoCursor } = await listarCampanhas(contasDoGrupo[0].meta_ad_account_id, {
          limit: 50,
          after,
        }).catch(() => ({ campanhas: [], proximoCursor: null }));

        for (const campanha of campanhas) {
          if (campanhaAtivaAgora(campanha)) campanhasAtivasMeta.push(campanha);
        }

        if (!proximoCursor) break;
        after = proximoCursor;
      }

      // Uma conta local só (caso comum): tudo é dela. Mais de uma compartilhando a mesma conta de
      // anúncio: separa por sigla (ver comentário da função).
      const comSigla = contasDoGrupo.filter((c) => c.sigla_campanha);
      const semSigla = contasDoGrupo.filter((c) => !c.sigla_campanha);

      function contaDaCampanha(nomeCampanha: string): (typeof contasDoGrupo)[number] | undefined {
        if (contasDoGrupo.length === 1) return contasDoGrupo[0];
        const porSigla = comSigla.find((c) => nomeCampanha.includes(`(${c.sigla_campanha})`));
        return porSigla ?? semSigla[0];
      }

      const linhasPorConta = new Map<string, LinhaCache[]>();
      for (const campanha of campanhasAtivasMeta) {
        const conta = contaDaCampanha(campanha.name);
        if (!conta) continue; // compartilhada, sem sigla batendo e sem conta "base" configurada — ignora
        const linhas = linhasPorConta.get(conta.id) ?? [];
        linhas.push({
          conta_id: conta.id,
          meta_campaign_id: campanha.id,
          nome: campanha.name,
          objetivo: campanha.objective ?? null,
          orcamento_diario_centavos: campanha.daily_budget ? Number(campanha.daily_budget) : null,
          vitalicio: !campanha.daily_budget && !!campanha.lifetime_budget,
        });
        linhasPorConta.set(conta.id, linhas);
      }

      // Gasto do mês corrente (Meta "this_month", em reais). Conta de anúncio de uma unidade só: o
      // total da própria conta (nível "account") — é o número exato que o Gerenciador mostra, inclui
      // campanha já excluída ou encerrada. Conta compartilhada por mais de uma unidade: soma campanha
      // a campanha, dividindo por sigla como nas campanhas. Se a Meta falhar aqui, não grava nada
      // (mantém o valor anterior em vez de zerar por engano).
      const gastoMesPorConta = new Map<string, number>(contasDoGrupo.map((c) => [c.id, 0]));
      let gastoMesOk = false;
      if (contasDoGrupo.length === 1) {
        const linhas = await obterInsightsConta(contasDoGrupo[0].meta_ad_account_id, {
          nivel: "account",
          datePreset: "this_month",
          porDia: false,
        }).catch(() => null);
        if (linhas) {
          const totalReais = linhas.reduce((soma, l) => soma + Number(l.spend ?? 0), 0);
          gastoMesPorConta.set(contasDoGrupo[0].id, Math.round(totalReais * 100));
          gastoMesOk = true;
        }
      } else {
        const linhas = await obterInsightsConta(contasDoGrupo[0].meta_ad_account_id, {
          nivel: "campaign",
          datePreset: "this_month",
          porDia: false,
        }).catch(() => null);
        if (linhas) {
          for (const linha of linhas) {
            const conta = contaDaCampanha(linha.campaign_name ?? "");
            if (!conta) continue;
            gastoMesPorConta.set(
              conta.id,
              (gastoMesPorConta.get(conta.id) ?? 0) + Math.round(Number(linha.spend ?? 0) * 100)
            );
          }
          gastoMesOk = true;
        }
      }
      if (gastoMesOk) {
        await supabase.from("smartads_gasto_mes_cache").upsert(
          [...gastoMesPorConta.entries()].map(([contaId, gasto]) => ({
            conta_id: contaId,
            mes: mesAtualEmSaoPaulo(),
            gasto_mes_centavos: gasto,
            atualizado_em: agora,
          })),
          { onConflict: "conta_id" }
        );
      }

      // Troca o snapshot de CADA conta local do grupo (não a tabela inteira) — uma campanha
      // pausada/encerrada, ou que mudou de sigla, some sozinha da lista dela nessa substituição.
      let totalGrupo = 0;
      for (const conta of contasDoGrupo) {
        const linhas = linhasPorConta.get(conta.id) ?? [];
        const { error: erroDelete } = await supabase
          .from("smartads_campanhas_rede_cache")
          .delete()
          .eq("conta_id", conta.id);
        if (erroDelete) throw new Error(`Falha ao limpar cache da conta ${conta.id}: ${erroDelete.message}`);

        if (linhas.length > 0) {
          const { error: erroInsert } = await supabase
            .from("smartads_campanhas_rede_cache")
            .insert(linhas.map((l) => ({ ...l, atualizado_em: agora })));
          if (erroInsert) throw new Error(`Falha ao gravar cache da conta ${conta.id}: ${erroInsert.message}`);
        }
        totalGrupo += linhas.length;
      }

      return totalGrupo;
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
  vitalicio: boolean;
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
      .select("conta_id, nome, objetivo, orcamento_diario_centavos, vitalicio, atualizado_em"),
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
        vitalicio: c.vitalicio,
      };
    })
    .filter((c): c is CampanhaRedeResumo => c !== null)
    .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome) || a.nome.localeCompare(b.nome));

  // Todas as linhas nascem na mesma rodada do cron — o timestamp da primeira serve pro conjunto
  // inteiro, não precisa guardar/calcular um "mais recente" separado.
  const atualizadoEm = cache && cache.length > 0 ? cache[0].atualizado_em : null;

  return { campanhas, atualizadoEm };
}


export interface UnidadeRedeResumo {
  contaId: string;
  empresaId: string | null;
  empresaNome: string;
  empresaTipo: "individual" | "franquia" | null;
  clienteNome: string;
  contaNome: string;
  /** null = essa conta ainda não foi calculada pelo cron (conta nova, ou o cron ainda não rodou desde
   * que ela entrou) — diferente de 0, que é "calculada e sem campanha no ar". */
  campanhasAtivas: number | null;
  /** Gasto do mês corrente, em centavos; null = ainda não calculado neste mês. */
  gastoMesCentavos: number | null;
}

/** Uma linha por unidade: quantas campanhas ativas e quanto já gastou no mês. Tudo do cache
 * (campanhas ativas + gasto do mês, atualizados juntos pelo cron 2x/dia) — a tela nunca bate na
 * Meta. Unidade sem campanha ativa também entra, com 0. `apenasFranquia` limita às unidades de rede
 * (Central da rede); sem isso vêm todas as contas, de qualquer empresa (menu Campanhas). */
export async function obterResumoPorUnidade(opcoes: { apenasFranquia: boolean }): Promise<{
  unidades: UnidadeRedeResumo[];
  atualizadoEm: string | null;
}> {
  const supabase = criarClienteAdmin();
  let consultaClientes = supabase
    .from("smartads_clientes")
    .select(
      opcoes.apenasFranquia
        ? "id, nome, smartads_empresas!inner(id, nome, tipo), smartads_contas_meta(*)"
        : "id, nome, smartads_empresas(id, nome, tipo), smartads_contas_meta(*)"
    )
    .eq("ativo", true);
  if (opcoes.apenasFranquia) consultaClientes = consultaClientes.eq("smartads_empresas.tipo", "franquia");

  const [{ data: cacheCampanhas }, { data: cacheGasto }, { data: clientes }] = await Promise.all([
    supabase.from("smartads_campanhas_rede_cache").select("conta_id, atualizado_em"),
    supabase.from("smartads_gasto_mes_cache").select("conta_id, mes, gasto_mes_centavos, atualizado_em"),
    consultaClientes,
  ]);

  const ativasPorConta = new Map<string, number>();
  for (const linha of cacheCampanhas ?? []) {
    ativasPorConta.set(linha.conta_id, (ativasPorConta.get(linha.conta_id) ?? 0) + 1);
  }
  const mesAtual = mesAtualEmSaoPaulo();
  const gastoPorConta = new Map(
    (cacheGasto ?? []).filter((g) => g.mes === mesAtual).map((g) => [g.conta_id, g.gasto_mes_centavos as number])
  );

  const unidades: UnidadeRedeResumo[] = [];
  for (const cliente of (clientes ?? []) as any[]) {
    const empresa = cliente.smartads_empresas;
    for (const conta of (cliente.smartads_contas_meta as any[]).filter((c) => c.ativo)) {
      unidades.push({
        contaId: conta.id,
        empresaId: empresa?.id ?? null,
        empresaNome: empresa?.nome ?? "Sem empresa",
        empresaTipo: empresa?.tipo ?? null,
        clienteNome: cliente.nome,
        contaNome: conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id,
        campanhasAtivas:
          ativasPorConta.has(conta.id) || gastoPorConta.has(conta.id) ? ativasPorConta.get(conta.id) ?? 0 : null,
        gastoMesCentavos: gastoPorConta.has(conta.id) ? gastoPorConta.get(conta.id)! : null,
      });
    }
  }
  unidades.sort(
    (a, b) => (b.campanhasAtivas ?? 0) - (a.campanhasAtivas ?? 0) || a.clienteNome.localeCompare(b.clienteNome)
  );

  // Todas as linhas de cada tabela nascem na mesma rodada do cron: o mais recente serve pro conjunto.
  const datas = [...(cacheCampanhas ?? []).map((c) => c.atualizado_em), ...(cacheGasto ?? []).map((g) => g.atualizado_em)]
    .filter(Boolean)
    .sort();
  return { unidades, atualizadoEm: datas.length > 0 ? datas[datas.length - 1] : null };
}

/** Central da rede: só as unidades de franquia. */
export function obterResumoRedePorUnidade() {
  return obterResumoPorUnidade({ apenasFranquia: true });
}
