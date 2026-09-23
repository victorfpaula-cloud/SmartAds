import Cabecalho from "@/components/Cabecalho";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { MODELOS_CAMPANHA } from "@/lib/meta/modelos";
import { notFound } from "next/navigation";
import type { TipoModeloCampanha, Publico } from "@/lib/meta/tipos";
import FormularioCampanha, {
  type ValoresIniciaisCampanha,
} from "../../nova/[contaId]/[modelo]/FormularioCampanha";

export const dynamic = "force-dynamic";

/** Abre o formulário de criação já preenchido a partir de uma etapa de Plano de Execução —
 * público, investimento (a fatia dessa etapa) e nome sugerido prontos, direto no passo do
 * criativo (é sempre conteúdo novo, igual "Duplicar"). Ao publicar, /api/campanhas marca a etapa
 * como concluída automaticamente (ver planoEtapaId ali). */
export default async function NovaCampanhaDoPlanoPage({
  params,
}: {
  params: Promise<{ planoEtapaId: string }>;
}) {
  const { planoEtapaId } = await params;
  const supabase = criarClienteAdmin();

  const { data: planoEtapa } = await supabase
    .from("smartads_plano_etapas")
    .select(
      "*, smartads_estrategia_etapas(*), smartads_planos_execucao(*, smartads_contas_meta(*, smartads_clientes(id, nome)))"
    )
    .eq("id", planoEtapaId)
    .single();

  if (!planoEtapa) notFound();

  const etapa = (planoEtapa as any).smartads_estrategia_etapas;
  const plano = (planoEtapa as any).smartads_planos_execucao;
  const conta = plano?.smartads_contas_meta;
  const modelo = MODELOS_CAMPANHA[etapa?.tipo_modelo as TipoModeloCampanha];
  if (!etapa || !plano || !conta || !modelo) notFound();

  let publico: Publico | undefined = plano.publico ?? undefined;
  if (!publico && plano.publico_id) {
    const { data: publicoSalvo } = await supabase
      .from("smartads_publicos_salvos")
      .select("targeting")
      .eq("id", plano.publico_id)
      .single();
    publico = publicoSalvo?.targeting as Publico | undefined;
  }
  if (!publico) notFound();

  const valorEtapaCentavos = Math.round(
    (plano.investimento_total_centavos * etapa.percentual_orcamento) / 100
  );
  const orcamento: ValoresIniciaisCampanha["orcamento"] = etapa.duracao_dias
    ? {
        tipo: "vitalicio",
        valorCentavos: valorEtapaCentavos,
        dataInicio: planoEtapa.data_prevista_inicio,
        dataFim: new Date(
          new Date(`${planoEtapa.data_prevista_inicio}T00:00:00Z`).getTime() + etapa.duracao_dias * 86_400_000
        )
          .toISOString()
          .slice(0, 10),
      }
    : { tipo: "diario", valorCentavos: valorEtapaCentavos };

  // Criativo oficial da Campanha-Mãe, se essa etapa específica tiver um definido — o link é por
  // (campanha_mae_id, estrategia_etapa_id), não algo embutido no plano, porque cada etapa da
  // mesma estratégia pode ter um criativo diferente (ou nenhum, se for "livre por unidade"). Uma
  // etapa marcada "oficial" mas ainda sem mídia definida (pendente) cai pro fluxo normal, sem
  // travar nada — não faz sentido bloquear a publicação por causa disso.
  let criativoOficial: ValoresIniciaisCampanha["criativoOficial"];
  if (plano.campanha_mae_id) {
    const { data: criativo } = await supabase
      .from("smartads_campanha_mae_criativos")
      .select("modo, criativo_titulo, criativo_mensagem, criativo_imagem_base64, criativo_cta")
      .eq("campanha_mae_id", plano.campanha_mae_id)
      .eq("estrategia_etapa_id", planoEtapa.estrategia_etapa_id)
      .maybeSingle();

    if (criativo?.modo === "oficial_upload" && criativo.criativo_imagem_base64 && criativo.criativo_mensagem) {
      criativoOficial = {
        titulo: criativo.criativo_titulo,
        mensagem: criativo.criativo_mensagem,
        imagemBase64: criativo.criativo_imagem_base64,
        cta: criativo.criativo_cta ?? "LEARN_MORE",
      };
    }
  }

  const valoresIniciais: ValoresIniciaisCampanha = {
    publico,
    publicoId: plano.publico_id ?? undefined,
    incluirFacebook: plano.incluir_facebook,
    orcamento,
    nomeCampanha: `${plano.nome} - ${etapa.nome_etapa}`,
    criativoOficial,
  };

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <p className="text-xs font-medium text-neutral-500">
          {conta.smartads_clientes?.nome} · {plano.nome}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold">
          Etapa: {etapa.nome_etapa} ({modelo.nomeExibicao})
        </h1>

        <FormularioCampanha
          contaId={conta.id}
          clienteId={conta.smartads_clientes?.id}
          clienteNome={conta.smartads_clientes?.nome ?? ""}
          instagramBusinessId={conta.instagram_business_id}
          modelo={modelo}
          valoresIniciais={valoresIniciais}
          etapaInicial={3}
          planoEtapaId={planoEtapaId}
        />
      </main>
    </>
  );
}
