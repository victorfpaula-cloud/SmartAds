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
  criarCriativoDoPostDoInstagram,
  criarCriativoDoPostDaPagina,
  criarCriativoNovo,
  criarAnuncio,
  subirImagem,
  excluirObjeto,
  type PostInstagram,
} from "@/lib/meta/api";
import { ErroGraphAPIException } from "@/lib/meta/erros";
import { comContaMeta } from "@/lib/meta/conexao";
import { ErroMetaNaoConectado } from "@/lib/meta/token";
import type { TipoModeloCampanha, Publico } from "@/lib/meta/tipos";

export interface ParametrosCriarCampanha {
  contaId: string;
  tipoModelo: TipoModeloCampanha;
  nomeCampanha: string;
  publico: Publico;
  publicoId?: string;
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
  // Campanha, conjunto, anúncio e mídia são IDs que não dizem de qual conta são — roda tudo com a
  // conexão da Meta dessa conta (cada conta pode ter o seu próprio login/portfólio).
  return comContaMeta(corpo.contaId, () => criarCampanhaCompletaComConexao(corpo));
}

async function criarCampanhaCompletaComConexao(corpo: ParametrosCriarCampanha): Promise<ResultadoCriarCampanha> {
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
    // Se for turbinar publicação existente, busca o post ANTES de montar o targeting — precisa
    // saber se é vídeo (Reels) pra decidir o posicionamento: foto/carrossel ficam só no feed,
    // vídeo entra em feed + Reels (pedido explícito em 25/09/2026).
    let postExistente: PostInstagram | null = null;
    if (corpo.criativo.usarPostExistente && corpo.criativo.postSelecionadoId) {
      postExistente = await obterPostInstagram(corpo.criativo.postSelecionadoId);
    }
    const targeting = montarTargeting(corpo.publico, postExistente?.media_type === "VIDEO");

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

    // Turbinar publicação existente: o criativo é resolvido ANTES do conjunto, porque o tipo de
    // destino do conjunto depende de qual criativo vai ser usado.
    //  1. Post do próprio Instagram (source_instagram_media_id) — é o que o Gerenciador de Anúncios faz
    //     em "Post do Instagram" (conjunto com local da conversão "No seu anúncio" = ON_AD) e não
    //     depende de cross-post nenhum no Facebook (visto nos prints do Gerenciador em 29/09/2026).
    //  2. Post correspondente na Página (object_story_id, conjunto ON_POST) — caminho de sempre, só
    //     se o do Instagram for recusado.
    // Nunca recria como anúncio novo: o engajamento precisa acumular no post publicado, não numa cópia.
    let criativoDoPostId: string | null = null;
    let destinoDoConjunto = modelo.destinationType;
    if (postExistente) {
      let erroInstagramTexto = "";
      try {
        const criativoInstagram = await criarCriativoDoPostDoInstagram(adAccountId, {
          instagramMediaId: postExistente.id,
          instagramUserId: conta.instagram_business_id,
          pageId: conta.page_id,
          name: `${corpo.nomeCampanha} - criativo`,
        });
        criativoDoPostId = criativoInstagram.id;
        // Só o Engajamento tem destino no conjunto (ON_POST); o do post do Instagram é "No seu anúncio".
        if (modelo.destinationType === "ON_POST") destinoDoConjunto = "ON_AD";
      } catch (erroInstagram) {
        erroInstagramTexto = erroInstagram instanceof Error ? erroInstagram.message : String(erroInstagram);
      }

      if (!criativoDoPostId) {
        let postDaPaginaId: string | null = null;
        let detalheFalha = "não foi possível checar (falha ao chamar a Meta).";
        try {
          const tokenPagina = await obterTokenDePagina(conta.page_id);
          if (!tokenPagina) {
            detalheFalha = "não encontrei um token de acesso pra essa Página (conexão com o Facebook pode ter expirado).";
          } else {
            const resultado = await encontrarPostDaPaginaCorrespondente(
              conta.page_id,
              tokenPagina,
              postExistente.timestamp,
              postExistente.caption
            );
            postDaPaginaId = resultado.postId;
            detalheFalha =
              resultado.totalPostsNoPeriodo > 0
                ? `a publicação mais próxima na Página estava a ${resultado.diferencaMaisProximaMin} min de distância — fora da janela aceita.`
                : postExistente.media_type === "CAROUSEL_ALBUM"
                  ? "a Página não teve nenhuma publicação nesse período — carrossel costuma não ser replicado automaticamente pro Facebook pela Meta, mesmo com o cross-post ligado (só feed simples e Reels costumam replicar)."
                  : "a Página não teve nenhuma publicação nesse período (o cross-post pode estar desligado nessa conta).";
          }
        } catch (erroBusca) {
          detalheFalha = `erro ao consultar a Página no Facebook: ${erroBusca instanceof Error ? erroBusca.message : String(erroBusca)}`;
        }

        if (!postDaPaginaId) {
          throw new Error(
            `A Meta recusou promover direto o post do Instagram (${erroInstagramTexto}) e também não achei essa publicação na Página do Facebook (${detalheFalha}). O SmartAds nunca recria como anúncio novo (o engajamento precisa acumular no post publicado, não numa cópia).`
          );
        }
        const criativoPagina = await criarCriativoDoPostDaPagina(adAccountId, {
          objectStoryId: postDaPaginaId,
          name: `${corpo.nomeCampanha} - criativo`,
        });
        criativoDoPostId = criativoPagina.id;
      }
    }

    const adset = await criarConjuntoDeAnuncios(adAccountId, {
      name: `${corpo.nomeCampanha} - conjunto`,
      campaignId: campanha.id,
      optimizationGoal: modelo.optimizationGoal,
      billingEvent: modelo.billingEvent,
      destinationType: destinoDoConjunto,
      promotedObject,
      targeting,
      orcamentoCentavos: corpo.orcamento.valorCentavos,
      tipoOrcamento: corpo.orcamento.tipo,
      dataInicio: corpo.orcamento.dataInicio,
      dataFim: corpo.orcamento.dataFim,
    });
    adsetId = adset.id;

    if (postExistente && criativoDoPostId) {
      const anuncio = await criarAnuncio(adAccountId, {
        name: `${corpo.nomeCampanha} - anúncio`,
        adsetId: adset.id,
        creativeId: criativoDoPostId,
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
