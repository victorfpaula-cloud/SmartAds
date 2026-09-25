import { criarClienteAdmin } from "@/lib/supabase/admin";
import { registrarAcao } from "@/lib/meta/acoesLog";
import { MODELOS_CAMPANHA } from "@/lib/meta/modelos";
import {
  montarTargeting,
  criarCampanha,
  criarConjuntoDeAnuncios,
  obterPostInstagram,
  obterTokenDePagina,
  encontrarPostDaPaginaCorrespondente,
  criarCriativoDoPostDaPagina,
  criarCriativoNovo,
  criarAnuncio,
  subirImagem,
  excluirObjeto,
} from "@/lib/meta/api";
import { ErroGraphAPIException } from "@/lib/meta/erros";
import { ErroMetaNaoConectado } from "@/lib/meta/token";
import type { TipoModeloCampanha, Publico } from "@/lib/meta/tipos";

export interface ParametrosCriarCampanha {
  contaId: string;
  tipoModelo: TipoModeloCampanha;
  nomeCampanha: string;
  publico: Publico;
  publicoId?: string;
  incluirFacebook: boolean;
  /** Preenchido quando essa campanha nasce de uma etapa de um Plano de Execução — ao concluir com
   * sucesso, marca a etapa como 'concluida' no checklist e guarda o id da campanha criada, sem
   * precisar de um passo manual extra pra "vincular" depois. */
  planoEtapaId?: string;
  orcamento: {
    tipo: "diario" | "vitalicio";
    valorCentavos: number;
    dataInicio?: string;
    dataFim?: string;
  };
  criativo: {
    usarPostExistente: boolean;
    postSelecionadoId?: string;
    mensagem: string;
    titulo?: string;
    /** Uma imagem por Anúncio, todos dentro do MESMO Conjunto de Anúncios — não um conjunto por
     * imagem. É assim que o algoritmo da Meta (Andromeda) testa as variações e distribui verba
     * entre elas sozinho; espalhar em conjuntos separados fragmenta o público/orçamento e faz
     * cada um entrar em aprendizado do zero. Ver explicação equivalente na tela (FormularioCampanha). */
    imagensBase64?: string[];
    link?: string;
    callToAction?: string;
    leadGenFormId?: string;
  };
}

export type ResultadoCriarCampanha =
  | { ok: true; campanhaSalva: unknown }
  | { ok: false; erro: string; status: number; etapaAlcancada: { campanhaId?: string; adsetId?: string; anuncioIds: string[] } };

/**
 * Cria a campanha inteira (campanha → conjunto de anúncios → criativo → anúncio) numa sequência
 * com ROLLBACK: se qualquer etapa depois da campanha falhar, apaga o que já foi criado na Meta em
 * vez de deixar objeto pela metade na conta do cliente — sempre com uma mensagem clara de erro,
 * nunca um "talvez foi, talvez não". Nasce pausada sempre (ver criarCampanha).
 *
 * Extraído de src/app/api/campanhas/route.ts (que agora só traduz isso pra HTTP) pra também ser
 * chamado pelo boost automático (src/lib/automacao/boostAutomatico.ts) — mesmo caminho, mesmo
 * rollback, mesmo log, sem duplicar a lógica.
 */
export async function criarCampanhaCompleta(corpo: ParametrosCriarCampanha): Promise<ResultadoCriarCampanha> {
  const modelo = MODELOS_CAMPANHA[corpo.tipoModelo];
  if (!modelo) {
    return { ok: false, erro: "Modelo de campanha inválido.", status: 400, etapaAlcancada: { anuncioIds: [] } };
  }
  if (modelo.exigeFormulario && !corpo.criativo.leadGenFormId?.trim()) {
    return {
      ok: false,
      erro: "Informe o ID do formulário de Leads já criado no Meta Business Suite.",
      status: 400,
      etapaAlcancada: { anuncioIds: [] },
    };
  }
  if (modelo.exigeLink && !corpo.criativo.link?.trim()) {
    return { ok: false, erro: "Informe a URL de destino.", status: 400, etapaAlcancada: { anuncioIds: [] } };
  }
  if (corpo.orcamento.tipo === "vitalicio" && (!corpo.orcamento.dataInicio || !corpo.orcamento.dataFim)) {
    return {
      ok: false,
      erro: "Orçamento vitalício exige data de início e de fim.",
      status: 400,
      etapaAlcancada: { anuncioIds: [] },
    };
  }
  if (corpo.criativo.usarPostExistente && !modelo.permiteUsarPostExistente) {
    return {
      ok: false,
      erro: "Esse modelo de campanha não permite usar publicação existente.",
      status: 400,
      etapaAlcancada: { anuncioIds: [] },
    };
  }
  if (!corpo.criativo.usarPostExistente && !corpo.criativo.imagensBase64?.length) {
    return { ok: false, erro: "Envie pelo menos uma imagem.", status: 400, etapaAlcancada: { anuncioIds: [] } };
  }

  const supabase = criarClienteAdmin();
  const { data: conta, error: erroConta } = await supabase
    .from("smartads_contas_meta")
    .select("*")
    .eq("id", corpo.contaId)
    .single();

  if (erroConta || !conta) {
    return { ok: false, erro: "Conta de anúncio não encontrada.", status: 404, etapaAlcancada: { anuncioIds: [] } };
  }

  const adAccountId = conta.meta_ad_account_id as string;
  const targeting = montarTargeting(corpo.publico, corpo.incluirFacebook);
  // Regra máxima: TODA campanha criada pelo SmartAds nasce com 🤖 na frente de tudo, sempre — é o
  // jeito de bater o olho no Gerenciador de Anúncios e saber na hora que essa campanha veio do
  // app, mesmo antes da sigla (ver sigla_campanha em smartads_contas_meta, que identifica de qual
  // "grupo" ela veio quando a mesma conta está associada a mais de um cliente aqui dentro).
  const nomeCampanhaFinal = conta.sigla_campanha
    ? `🤖 (${conta.sigla_campanha}) ${corpo.nomeCampanha}`
    : `🤖 ${corpo.nomeCampanha}`;

  let campanhaId: string | undefined;
  let adsetId: string | undefined;
  const anuncioIds: string[] = [];

  try {
    const campanha = await criarCampanha(adAccountId, {
      name: nomeCampanhaFinal,
      objective: modelo.objective,
    });
    campanhaId = campanha.id;

    // promoted_object com o page_id também é obrigatório pro conjunto de anúncios quando vai
    // turbinar publicação existente (não só no Formulário) — sem isso a Meta nunca reconhece o
    // conjunto como "isso é pra promover um post dessa Página", e nenhuma tentativa no CRIATIVO
    // resolve, porque o problema real tava aqui, não lá (achado em 23/09/2026 testando direto
    // contra a API real via Windsor.ai).
    const promotedObject =
      modelo.exigeFormulario || corpo.criativo.usarPostExistente ? { page_id: conta.page_id } : undefined;

    const adset = await criarConjuntoDeAnuncios(adAccountId, {
      name: `${corpo.nomeCampanha} - conjunto`,
      campaignId: campanha.id,
      optimizationGoal: modelo.optimizationGoal,
      billingEvent: modelo.billingEvent,
      destinationType: modelo.destinationType,
      promotedObject,
      targeting,
      orcamentoCentavos: corpo.orcamento.valorCentavos,
      tipoOrcamento: corpo.orcamento.tipo,
      dataInicio: corpo.orcamento.dataInicio,
      dataFim: corpo.orcamento.dataFim,
    });
    adsetId = adset.id;

    if (corpo.criativo.usarPostExistente && corpo.criativo.postSelecionadoId) {
      const post = await obterPostInstagram(corpo.criativo.postSelecionadoId);

      // Tenta achar o mesmo post cross-postado na Página pra turbinar o post de verdade —
      // engajamento acumulando nele, sem duplicar conteúdo. A Meta nunca aceita o ID do Instagram
      // como referência de "post existente" (testado exaustivamente em 13/09/2026 e 23/09/2026), só
      // o ID do post da própria Página.
      let postDaPaginaId: string | null = null;
      try {
        const tokenPagina = await obterTokenDePagina(conta.page_id);
        if (tokenPagina) {
          postDaPaginaId = await encontrarPostDaPaginaCorrespondente(conta.page_id, tokenPagina, post.timestamp);
        }
      } catch {
        // Segue sem cross-post encontrado — cai no erro abaixo, sem fallback.
      }

      // Proposital: SEM fallback pra "recriar como anúncio novo" quando não acha o cross-post. Um
      // anúncio novo é visualmente idêntico pra quem vê, mas o engajamento (curtidas, comentários)
      // acumula nele, não no post publicado de verdade — e é exatamente esse número que a unidade
      // precisa ver aparecendo no post dela. Preferível falhar aqui (a pessoa vê o erro, ou o boost
      // automático loga a falha e simplesmente não cria nada naquele dia) do que turbinar do jeito
      // errado sem avisar.
      if (!postDaPaginaId) {
        throw new Error(
          "Essa publicação ainda não tem o cross-post correspondente na Página do Facebook — sem ele não dá pra turbinar o post real. O SmartAds nunca recria como anúncio novo (o engajamento precisa acumular no post publicado, não numa cópia). Confirme se o cross-post automático Instagram→Facebook está ligado nessa conta, ou tente de novo em alguns minutos."
        );
      }

      const criativo = await criarCriativoDoPostDaPagina(adAccountId, {
        objectStoryId: postDaPaginaId,
        name: `${corpo.nomeCampanha} - criativo`,
      });

      const anuncio = await criarAnuncio(adAccountId, {
        name: `${corpo.nomeCampanha} - anúncio`,
        adsetId: adset.id,
        creativeId: criativo.id,
      });
      anuncioIds.push(anuncio.id);
    } else {
      // Uma imagem = um Anúncio, todos no MESMO conjunto criado acima — não um conjunto por
      // imagem (ver comentário no tipo ParametrosCriarCampanha.criativo.imagensBase64 do porquê).
      const imagens = corpo.criativo.imagensBase64 ?? [];
      for (let i = 0; i < imagens.length; i++) {
        const sufixo = imagens.length > 1 ? ` ${i + 1}` : "";
        const imageHash = await subirImagem(adAccountId, imagens[i]);

        const criativo = await criarCriativoNovo(adAccountId, {
          name: `${corpo.nomeCampanha} - criativo${sufixo}`,
          pageId: conta.page_id,
          instagramUserId: conta.instagram_business_id,
          imageHash,
          mensagem: corpo.criativo.mensagem,
          titulo: corpo.criativo.titulo,
          link: corpo.criativo.link,
          callToAction: corpo.criativo.callToAction,
          leadGenFormId: corpo.criativo.leadGenFormId,
        });
        const anuncio = await criarAnuncio(adAccountId, {
          name: `${corpo.nomeCampanha} - anúncio${sufixo}`,
          adsetId: adset.id,
          creativeId: criativo.id,
        });
        anuncioIds.push(anuncio.id);
      }
    }

    const { data: campanhaSalva } = await supabase
      .from("smartads_campanhas_criadas")
      .insert({
        conta_id: corpo.contaId,
        publico_id: corpo.publicoId ?? null,
        meta_campaign_id: campanha.id,
        meta_adset_id: adset.id,
        meta_ad_ids: anuncioIds,
        tipo_modelo: corpo.tipoModelo,
        config_criacao: corpo,
      })
      .select()
      .single();

    if (corpo.planoEtapaId && campanhaSalva) {
      await supabase
        .from("smartads_plano_etapas")
        .update({ status: "concluida", campanha_id: campanhaSalva.id, observacao: null })
        .eq("id", corpo.planoEtapaId);
    }

    await registrarAcao({
      contaId: corpo.contaId,
      acao: "criar_campanha",
      payload: corpo as unknown as Record<string, unknown>,
      sucesso: true,
      resultado: { campanhaId: campanha.id, adsetId: adset.id, anuncioIds },
    });

    return { ok: true, campanhaSalva };
  } catch (erro) {
    // Rollback: apaga a campanha (a Meta já cascade-apaga conjunto/anúncio/criativo junto) em vez
    // de deixar objeto pela metade na conta do cliente.
    if (campanhaId) {
      await excluirObjeto(campanhaId).catch(() => {
        // Se nem o rollback funcionar, fica registrado no log abaixo pra investigar manualmente —
        // melhor um log claro do que outro erro escondendo o original.
      });
    }

    const mensagem =
      erro instanceof ErroMetaNaoConectado || erro instanceof ErroGraphAPIException
        ? erro.message
        : erro instanceof Error
          ? erro.message
          : "Falha desconhecida ao criar a campanha.";

    await registrarAcao({
      contaId: corpo.contaId,
      acao: "criar_campanha",
      payload: corpo as unknown as Record<string, unknown>,
      sucesso: false,
      erroMensagem: mensagem,
      // Guarda o erro CRU da Meta (code, error_subcode, type, error_user_msg...) mesmo quando a
      // mensagem já traduzida não mostra esse detalhe na tela (ex: quando vem por error_user_msg,
      // que não tem "Detalhe técnico" anexado) — sem isso, alguns erros ficam impossíveis de
      // diagnosticar de novo (achado em 13/09/2026 numa campanha real que travava sempre na mesma
      // etapa sem pista suficiente). Também guarda em qual etapa (campanha/conjunto/criativo)
      // chegou antes de falhar — sem isso não dá pra saber se o erro veio da criação do conjunto
      // de anúncios ou do criativo, já que os dois passam pelo mesmo catch.
      resultado:
        erro instanceof ErroGraphAPIException
          ? { erroOriginalMeta: erro.original, etapaAlcancada: { campanhaId, adsetId, anuncioIds } }
          : undefined,
    });

    const status = erro instanceof ErroMetaNaoConectado ? 409 : 502;
    return { ok: false, erro: mensagem, status, etapaAlcancada: { campanhaId, adsetId, anuncioIds } };
  }
}
