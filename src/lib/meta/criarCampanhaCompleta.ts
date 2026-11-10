import { calcularSituacaoTeto, mensagemTeto } from "@/lib/tetoMensal";
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
  criarCriativoDoPostInstagramComLink,
  criarCriativoDoPostDaPagina,
  criarCriativoNovo,
  criarAnuncio,
  diagnosticarContaDeAnuncio,
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
  /** Delivery: "stories" restringe a entrega só aos Stories do Instagram. */
  /** "reels": só Reels — usado sozinho pelo app como segunda tentativa de vídeo que o feed recusou. */
  posicionamento?: "stories" | "reels";
  /** Campanha manual também no Facebook (foto/carrossel só feed; vídeo feed e Reels). */
  tambemNoFacebook?: boolean;
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
  /** Cria mesmo passando do teto de gasto do mês da unidade (só a pessoa, na tela; o boost automático nunca). */
  ignorarTeto?: boolean;
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
  | { ok: false; erro: string; status: number; codigo?: "teto_mensal"; /** true = nada ficou criado na Meta (rollback ok). */ desfeito?: boolean; etapaAlcancada: { campanhaId?: string; adsetId?: string; anuncioIds: string[] } };

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
async function criarCampanhaUmaVez(corpo: ParametrosCriarCampanha): Promise<ResultadoCriarCampanha> {
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
  // A Meta recusa orçamento diário com menos de 24h de veiculação — avisa antes, em português claro,
  // em vez de criar a campanha e desfazer tudo (erro visto em produção em 05/11/2026).
  if (corpo.orcamento.tipo === "diario" && corpo.orcamento.dataFim) {
    const fim = new Date(corpo.orcamento.dataFim).getTime(); // data sem hora = 00:00, como a Meta lê
    const inicio = Math.max(Date.now(), corpo.orcamento.dataInicio ? new Date(corpo.orcamento.dataInicio).getTime() || 0 : 0);
    if (Number.isFinite(fim) && fim - inicio < 24 * 3_600_000) {
      return {
        ok: false,
        erro: "Com orçamento diário a campanha precisa rodar pelo menos 24 horas. Escolha uma data de término pelo menos 2 dias à frente (a data de término conta a partir da meia-noite).",
        status: 400,
        etapaAlcancada: { anuncioIds: [] },
      };
    }
  }
  if (corpo.orcamento.tipo === "vitalicio" && (!corpo.orcamento.dataInicio || !corpo.orcamento.dataFim)) {
    return {
      ok: false,
      erro: "Orçamento vitalício exige data de início e de fim.",
      status: 400,
      etapaAlcancada: { anuncioIds: [] },
    };
  }
  if (corpo.criativo.usarPostExistente && !modelo.permiteUsarPostExistente && !modelo.exigeLink) {
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

  // Teto de gasto do mês da unidade: bloqueia criar campanha que faria a projeção passar dele.
  if ((conta.teto_mensal_centavos as number | null) && !corpo.ignorarTeto) {
    try {
      const situacao = await calcularSituacaoTeto(corpo.contaId, corpo.orcamento);
      if (situacao?.estoura) {
        return { ok: false, erro: mensagemTeto(situacao), status: 409, codigo: "teto_mensal", etapaAlcancada: { anuncioIds: [] } };
      }
    } catch {
      // Falha ao calcular não trava a criação (a Meta também falharia logo depois, com o motivo real).
    }
  }
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
  // Erro da 1ª tentativa de criativo (post do Instagram), guardado no log mesmo quando a 2ª
  // tentativa (post da Página) é que falha e vira a mensagem final — sem isso não dá pra saber
  // em qual das duas etapas a Meta recusou.
  let erroCriativoInstagram = "";
  // Em qual chamada à Meta a criação do anúncio parou — o rollback apaga tudo, então sem isso o log
  // só diz "falhou" e não dá pra saber se foi o criativo ou o anúncio que a Meta recusou.
  const passosConcluidos: string[] = [];
  // Criativos que a Meta aceitou — se ela recusar criar o ANÚNCIO, ainda dá pra tentar criá-lo em
  // pausa com um desses (ver o catch lá embaixo).
  let criativoInstagramId: string | null = null;
  let criativoPaginaId: string | null = null;

  try {
    // Se for turbinar publicação existente, busca o post ANTES de montar o targeting — precisa
    // saber se é vídeo (Reels) pra decidir o posicionamento: foto/carrossel ficam só no feed,
    // vídeo entra em feed + Reels (pedido explícito em 25/09/2026).
    let postExistente: PostInstagram | null = null;
    if (corpo.criativo.usarPostExistente && corpo.criativo.postSelecionadoId) {
      postExistente = await obterPostInstagram(corpo.criativo.postSelecionadoId);
    }
    const targeting = montarTargeting(
      corpo.publico,
      postExistente?.media_type === "VIDEO",
      corpo.posicionamento,
      corpo.tambemNoFacebook ? { video: postExistente?.media_type === "VIDEO" } : undefined
    );

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
      modelo.exigeFormulario || (corpo.criativo.usarPostExistente && !modelo.exigeLink) ? { page_id: conta.page_id } : undefined;

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

    if (postExistente && modelo.exigeLink) {
      // Campanha de link (delivery) com post/Reel que já existe: criativo do próprio post do Instagram
      // + botão com o link. Só Instagram (Stories) — sem a volta pelo post da Página.
      if (corpo.tambemNoFacebook) {
        throw new Error("Post existente com link só roda no Instagram — desmarque \"Também publicar no Facebook\".");
      }
      const criativoLink = await criarCriativoDoPostInstagramComLink(adAccountId, {
        instagramMediaId: postExistente.id,
        instagramUserId: conta.instagram_business_id,
        link: corpo.criativo.link as string,
        callToAction: corpo.criativo.callToAction ?? "LEARN_MORE",
        name: `${corpo.nomeCampanha} - criativo`,
      });
      criativoInstagramId = criativoLink.id;
      passosConcluidos.push("criativo do post do Instagram com link criado");
      const anuncioLink = await criarAnuncio(adAccountId, {
        name: `${corpo.nomeCampanha} - anúncio`,
        adsetId: adset.id,
        creativeId: criativoLink.id,
      });
      anuncioIds.push(anuncioLink.id);
    } else if (postExistente) {
      // Conjunto SEMPRE no formato que a Meta já aceita pra turbinar post (ON_POST + promoted_object
      // da Página). Tentativas de mudar o destino do conjunto pra imitar o "No seu anúncio" do
      // Gerenciador falharam em produção em 29/09/2026 (ON_AD e conjunto sem destino: a Meta
      // recusou os dois), então só o CRIATIVO varia:
      //  1. post do próprio Instagram (source_instagram_media_id) — não depende de cross-post;
      //  2. post correspondente na Página (object_story_id) — caminho de sempre.
      // Nunca recria como anúncio novo: o engajamento precisa acumular no post publicado.
      let anuncioId: string | null = null;
      let erroInstagramTexto = "";
      // Com Facebook marcado, o anúncio precisa ser do post da PÁGINA (o criativo "direto do Instagram"
      // só serve nos posicionamentos do Instagram) — pula a primeira tentativa.
      if (corpo.tambemNoFacebook) erroInstagramTexto = "campanha também no Facebook: usa o post da Página";
      try {
        if (corpo.tambemNoFacebook) throw new Error(erroInstagramTexto);
        const criativoInstagram = await criarCriativoDoPostDoInstagram(adAccountId, {
          instagramMediaId: postExistente.id,
          instagramUserId: conta.instagram_business_id,
          pageId: conta.page_id,
          name: `${corpo.nomeCampanha} - criativo`,
        });
        criativoInstagramId = criativoInstagram.id;
        passosConcluidos.push("criativo do post do Instagram criado");
        const anuncioInstagram = await criarAnuncio(adAccountId, {
          name: `${corpo.nomeCampanha} - anúncio`,
          adsetId: adset.id,
          creativeId: criativoInstagram.id,
        });
        anuncioId = anuncioInstagram.id;
      } catch (erroInstagram) {
        erroInstagramTexto = erroInstagram instanceof Error ? erroInstagram.message : String(erroInstagram);
        erroCriativoInstagram = erroInstagramTexto;
      }

      if (!anuncioId) {
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
            corpo.tambemNoFacebook
              ? `Pra rodar também no Facebook o anúncio precisa ser do post da Página, e não achei essa publicação lá (${detalheFalha}) Desmarque "Também no Facebook" pra rodar só no Instagram.`
              : `A Meta recusou promover direto o post do Instagram (${erroInstagramTexto}) e também não achei essa publicação na Página do Facebook (${detalheFalha}). O SmartAds nunca recria como anúncio novo (o engajamento precisa acumular no post publicado, não numa cópia).`
          );
        }
        const criativoPagina = await criarCriativoDoPostDaPagina(adAccountId, {
          objectStoryId: postDaPaginaId,
          name: `${corpo.nomeCampanha} - criativo`,
        });
        criativoPaginaId = criativoPagina.id;
        passosConcluidos.push(`post da Página encontrado (${postDaPaginaId}) e criativo dele criado`);
        const anuncioPagina = await criarAnuncio(adAccountId, {
          name: `${corpo.nomeCampanha} - anúncio`,
          adsetId: adset.id,
          creativeId: criativoPagina.id,
        });
        anuncioId = anuncioPagina.id;
      }
      anuncioIds.push(anuncioId);
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
    const mensagemBruta = erro instanceof Error ? erro.message : "";

    // A Meta às vezes recusa CRIAR o anúncio com "Autentique sua conta" (code 31) numa conta onde o
    // Gerenciador de Anúncios funciona normalmente. Antes de desfazer tudo, tenta criar o anúncio em
    // PAUSA com o criativo que ela já aceitou: se passar, a campanha fica pronta no Gerenciador (só
    // falta ativar lá) em vez de se perder; se não passar, guarda o retrato da conta segundo a Meta
    // no log, pra saber exatamente o que está bloqueando. Nunca contorna a verificação: ativar
    // continua sendo com a pessoa, no Gerenciador.
    let diagnosticoConta: Record<string, unknown> | undefined;
    let tentativaEmPausa: { ok: boolean; erro?: string; anuncioId?: string } | undefined;
    // "Autentique sua conta" (code 31) e "Nenhuma forma de pagamento" (code 100 / subcode 1359188):
    // a Meta recusa o anúncio ATIVO, mas costuma aceitar criá-lo em pausa — a pessoa ativa depois no
    // Gerenciador, onde a conta (por exemplo, só com saldo pré-pago) funciona normalmente.
    const bloqueioDeConta = /autentique sua conta|nenhuma forma de pagamento/i;
    if (campanhaId && adsetId && bloqueioDeConta.test(mensagemBruta)) {
      diagnosticoConta = await diagnosticarContaDeAnuncio(adAccountId).catch(() => undefined);
      const creativeId = criativoPaginaId ?? criativoInstagramId;
      if (creativeId) {
        try {
          const pausado = await criarAnuncio(adAccountId, {
            name: `${corpo.nomeCampanha} - anúncio`,
            adsetId,
            creativeId,
            status: "PAUSED",
          });
          tentativaEmPausa = { ok: true, anuncioId: pausado.id };
        } catch (erroPausa) {
          tentativaEmPausa = { ok: false, erro: erroPausa instanceof Error ? erroPausa.message : String(erroPausa) };
        }
      }
    }

    if (tentativaEmPausa?.ok && campanhaId && adsetId) {
      const mensagemPausa = `A Meta recusou ativar o anúncio pelo SmartAds — ${mensagemBruta.slice(0, 140)}… Mas a campanha "${nomeCampanhaFinal}" ficou criada em pausa no Gerenciador de Anúncios: é só abrir lá e ativar.`;
      await registrarAcao({
        contaId: corpo.contaId,
        acao: "criar_campanha",
        payload: corpo as unknown as Record<string, unknown>,
        sucesso: false,
        erroMensagem: mensagemPausa,
        resultado: {
          criadoEmPausa: true,
          etapaAlcancada: { campanhaId, adsetId, anuncioIds: [tentativaEmPausa.anuncioId] },
          erroOriginalMeta: erro instanceof ErroGraphAPIException ? erro.original : undefined,
          diagnosticoConta,
          passosConcluidos,
        } as Record<string, unknown>,
      });
      return {
        ok: false,
        erro: mensagemPausa,
        status: 409,
        etapaAlcancada: { campanhaId, adsetId, anuncioIds: [tentativaEmPausa.anuncioId as string] },
      };
    }

    // Rollback: apaga a campanha (a Meta já cascade-apaga conjunto/anúncio/criativo junto) em vez
    // de deixar objeto pela metade na conta do cliente.
    let desfeito = !campanhaId;
    if (campanhaId) {
      // Se nem o rollback funcionar, fica registrado no log abaixo pra investigar manualmente —
      // melhor um log claro do que outro erro escondendo o original.
      desfeito = await excluirObjeto(campanhaId).then(() => true).catch(() => false);
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
          ? {
              erroOriginalMeta: erro.original,
              etapaAlcancada: { campanhaId, adsetId, anuncioIds },
              ...(erroCriativoInstagram ? { erroCriativoInstagram } : {}),
              passosConcluidos,
              ...(diagnosticoConta ? { diagnosticoConta } : {}),
              ...(tentativaEmPausa ? { tentativaEmPausa } : {}),
            }
          : erroCriativoInstagram
            ? { etapaAlcancada: { campanhaId, adsetId, anuncioIds }, erroCriativoInstagram, passosConcluidos }
            : undefined,
    });

    const status = erro instanceof ErroMetaNaoConectado ? 409 : 502;
    return { ok: false, erro: mensagem, status, desfeito, etapaAlcancada: { campanhaId, adsetId, anuncioIds } };
  }
}


/** Regra de posicionamento ao promover publicação existente: foto e carrossel só no feed; vídeo
 * (Reels) em feed + Reels e, se a Meta recusar por causa do formato do vídeo no feed, uma segunda
 * tentativa só em Reels. Foto/carrossel nunca caem pra outro posicionamento. */
export async function criarCampanhaCompleta(corpo: ParametrosCriarCampanha): Promise<ResultadoCriarCampanha> {
  const primeira = await criarCampanhaUmaVez(corpo);
  if (primeira.ok || primeira.codigo === "teto_mensal") return primeira;
  const recusaDeFormato = /propor[cç][aã]o|aspect ratio/i.test(primeira.erro);
  if (!recusaDeFormato || corpo.posicionamento || corpo.tambemNoFacebook) return primeira;
  if (!corpo.criativo.usarPostExistente || !corpo.criativo.postSelecionadoId) return primeira;
  // Só tenta de novo se a 1ª tentativa foi desfeita por completo na Meta — nunca arrisca duplicar.
  if (!primeira.desfeito) return primeira;
  try {
    const post = await obterPostInstagram(corpo.criativo.postSelecionadoId);
    if (post.media_type !== "VIDEO") return primeira;
  } catch {
    return primeira;
  }
  const segunda = await criarCampanhaUmaVez({ ...corpo, posicionamento: "reels" });
  return segunda.ok ? segunda : { ...segunda, erro: `${primeira.erro} | Segunda tentativa só em Reels: ${segunda.erro}` };
}
