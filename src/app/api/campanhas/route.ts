import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { registrarAcao } from "@/lib/meta/acoesLog";
import { MODELOS_CAMPANHA } from "@/lib/meta/modelos";
import { montarTargeting } from "@/lib/meta/api";
import {
  criarCampanha,
  criarConjuntoDeAnuncios,
  criarCriativoDePostExistente,
  criarCriativoNovo,
  criarAnuncio,
  subirImagem,
  excluirObjeto,
} from "@/lib/meta/api";
import { ErroGraphAPIException } from "@/lib/meta/erros";
import { ErroMetaNaoConectado } from "@/lib/meta/token";
import type { TipoModeloCampanha, Publico } from "@/lib/meta/tipos";

export const dynamic = "force-dynamic";

interface CorpoRequisicao {
  contaId: string;
  tipoModelo: TipoModeloCampanha;
  nomeCampanha: string;
  publico: Publico;
  publicoId?: string;
  incluirFacebook: boolean;
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
    imagemBase64?: string;
    link?: string;
    callToAction?: string;
    leadGenFormId?: string;
  };
}

/**
 * Cria a campanha inteira (campanha → conjunto de anúncios → criativo → anúncio) numa sequência
 * com ROLLBACK: se qualquer etapa depois da campanha falhar, apaga o que já foi criado na Meta em
 * vez de deixar objeto pela metade na conta do cliente — sempre com uma mensagem clara de erro,
 * nunca um "talvez foi, talvez não". Nasce pausada sempre (ver criarCampanha).
 */
export async function POST(request: NextRequest) {
  const corpo = (await request.json().catch(() => null)) as CorpoRequisicao | null;
  if (!corpo?.contaId || !corpo.tipoModelo || !corpo.publico || !corpo.orcamento || !corpo.criativo) {
    return NextResponse.json({ erro: "Faltam campos obrigatórios." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data: conta, error: erroConta } = await supabase
    .from("smartads_contas_meta")
    .select("*")
    .eq("id", corpo.contaId)
    .single();

  if (erroConta || !conta) {
    return NextResponse.json({ erro: "Conta de anúncio não encontrada." }, { status: 404 });
  }

  const modelo = MODELOS_CAMPANHA[corpo.tipoModelo];
  if (!modelo) {
    return NextResponse.json({ erro: "Modelo de campanha inválido." }, { status: 400 });
  }

  if (modelo.exigeFormulario && !corpo.criativo.leadGenFormId?.trim()) {
    return NextResponse.json(
      { erro: "Informe o ID do formulário de Leads já criado no Meta Business Suite." },
      { status: 400 }
    );
  }
  if (modelo.exigeLink && !corpo.criativo.link?.trim()) {
    return NextResponse.json({ erro: "Informe a URL de destino." }, { status: 400 });
  }
  if (corpo.orcamento.tipo === "vitalicio" && (!corpo.orcamento.dataInicio || !corpo.orcamento.dataFim)) {
    return NextResponse.json(
      { erro: "Orçamento vitalício exige data de início e de fim." },
      { status: 400 }
    );
  }
  if (corpo.criativo.usarPostExistente && !modelo.permiteUsarPostExistente) {
    return NextResponse.json(
      { erro: "Esse modelo de campanha não permite usar publicação existente." },
      { status: 400 }
    );
  }

  const adAccountId = conta.meta_ad_account_id as string;
  const targeting = montarTargeting(corpo.publico, corpo.incluirFacebook);

  let campanhaId: string | undefined;
  let adsetId: string | undefined;
  let criativoId: string | undefined;
  let anuncioId: string | undefined;

  try {
    const campanha = await criarCampanha(adAccountId, {
      name: corpo.nomeCampanha,
      objective: modelo.objective,
    });
    campanhaId = campanha.id;

    const promotedObject = modelo.exigeFormulario ? { page_id: conta.page_id } : undefined;

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

    let criativo: { id: string };
    if (corpo.criativo.usarPostExistente && corpo.criativo.postSelecionadoId) {
      criativo = await criarCriativoDePostExistente(adAccountId, {
        pageId: conta.page_id,
        instagramActorId: conta.instagram_business_id,
        sourceInstagramMediaId: corpo.criativo.postSelecionadoId,
        name: `${corpo.nomeCampanha} - criativo`,
      });
    } else {
      const imageHash = corpo.criativo.imagemBase64
        ? await subirImagem(adAccountId, corpo.criativo.imagemBase64)
        : undefined;

      criativo = await criarCriativoNovo(adAccountId, {
        name: `${corpo.nomeCampanha} - criativo`,
        pageId: conta.page_id,
        instagramActorId: conta.instagram_business_id,
        imageHash,
        mensagem: corpo.criativo.mensagem,
        titulo: corpo.criativo.titulo,
        link: corpo.criativo.link,
        callToAction: corpo.criativo.callToAction,
        leadGenFormId: corpo.criativo.leadGenFormId,
      });
    }
    criativoId = criativo.id;

    const anuncio = await criarAnuncio(adAccountId, {
      name: `${corpo.nomeCampanha} - anúncio`,
      adsetId: adset.id,
      creativeId: criativo.id,
    });
    anuncioId = anuncio.id;

    const { data: campanhaSalva } = await supabase
      .from("smartads_campanhas_criadas")
      .insert({
        conta_id: corpo.contaId,
        publico_id: corpo.publicoId ?? null,
        meta_campaign_id: campanha.id,
        meta_adset_id: adset.id,
        meta_ad_ids: [anuncio.id],
        tipo_modelo: corpo.tipoModelo,
        config_criacao: corpo,
      })
      .select()
      .single();

    await registrarAcao({
      contaId: corpo.contaId,
      acao: "criar_campanha",
      payload: corpo as unknown as Record<string, unknown>,
      sucesso: true,
      resultado: { campanhaId: campanha.id, adsetId: adset.id, anuncioId: anuncio.id },
    });

    return NextResponse.json({ campanha: campanhaSalva }, { status: 201 });
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
    });

    const status = erro instanceof ErroMetaNaoConectado ? 409 : 502;
    return NextResponse.json({ erro: mensagem, etapaAlcancada: { campanhaId, adsetId, criativoId, anuncioId } }, { status });
  }
}
