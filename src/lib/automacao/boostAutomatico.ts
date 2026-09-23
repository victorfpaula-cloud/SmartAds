import { criarClienteAdmin } from "@/lib/supabase/admin";
import { listarPostsInstagram } from "@/lib/meta/api";
import { criarCampanhaCompleta } from "@/lib/meta/criarCampanhaCompleta";
import type { Publico } from "@/lib/meta/tipos";

const FUSO_HORARIO = "America/Sao_Paulo";
const DIAS_DE_DURACAO = 3;

function dataEmSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_HORARIO }).format(new Date(iso));
}

function ehPostDeHoje(timestampPost: string): boolean {
  return dataEmSaoPaulo(timestampPost) === dataEmSaoPaulo(new Date().toISOString());
}

/** Chamado 1x/dia pelo cron (ver /api/cron/boost-automatico e vercel.json), depois da janela de
 * postagem do dia (a pessoa liga a função e diz o horário na tela — ver PainelContas). Pra cada
 * conta com boost_automatico_ativo: pega o post mais recente do Instagram, confere se é de hoje e
 * se ainda não foi turbinado (smartads_boost_automatico_log), e se sim dispara uma campanha de
 * engajamento nele — mesmo caminho de "turbinar publicação existente" que já existe manualmente em
 * /campanhas/nova, só que automático. Uma conta com erro (Instagram sem post, público apagado,
 * falha na Meta) não impede as outras — fica registrada no log pra investigar depois. */
export async function avaliarBoostAutomatico(): Promise<{
  contasAvaliadas: number;
  campanhasCriadas: number;
}> {
  const supabase = criarClienteAdmin();
  const { data: contas } = await supabase
    .from("smartads_contas_meta")
    .select(
      "id, instagram_business_id, boost_automatico_publico_id, boost_automatico_orcamento_centavos"
    )
    .eq("ativo", true)
    .eq("boost_automatico_ativo", true);

  let campanhasCriadas = 0;

  for (const conta of contas ?? []) {
    try {
      if (!conta.instagram_business_id || !conta.boost_automatico_publico_id || !conta.boost_automatico_orcamento_centavos) {
        continue; // Ligado mas sem configurar público/orçamento ainda — nada a fazer.
      }

      const posts = await listarPostsInstagram(conta.instagram_business_id);
      const maisRecente = posts[0];
      if (!maisRecente || !ehPostDeHoje(maisRecente.timestamp)) continue;

      const { data: jaTurbinado } = await supabase
        .from("smartads_boost_automatico_log")
        .select("id")
        .eq("conta_id", conta.id)
        .eq("instagram_media_id", maisRecente.id)
        .maybeSingle();
      if (jaTurbinado) continue;

      const { data: publicoSalvo } = await supabase
        .from("smartads_publicos_salvos")
        .select("targeting")
        .eq("id", conta.boost_automatico_publico_id)
        .single();

      if (!publicoSalvo) {
        await supabase.from("smartads_boost_automatico_log").insert({
          conta_id: conta.id,
          instagram_media_id: maisRecente.id,
          sucesso: false,
          erro_mensagem: "O público salvo configurado pro boost automático não existe mais.",
        });
        continue;
      }

      const dataFim = new Date();
      dataFim.setDate(dataFim.getDate() + DIAS_DE_DURACAO);

      const resultado = await criarCampanhaCompleta({
        contaId: conta.id,
        tipoModelo: "engajamento",
        nomeCampanha: `Boost automático ${new Date().toLocaleDateString("pt-BR")}`,
        publico: publicoSalvo.targeting as Publico,
        publicoId: conta.boost_automatico_publico_id,
        incluirFacebook: true,
        orcamento: {
          tipo: "diario",
          valorCentavos: conta.boost_automatico_orcamento_centavos,
          dataFim: dataFim.toISOString(),
        },
        criativo: { usarPostExistente: true, postSelecionadoId: maisRecente.id, mensagem: "" },
      });

      await supabase.from("smartads_boost_automatico_log").insert({
        conta_id: conta.id,
        instagram_media_id: maisRecente.id,
        campanha_criada_id: resultado.ok ? (resultado.campanhaSalva as { id: string })?.id ?? null : null,
        sucesso: resultado.ok,
        erro_mensagem: resultado.ok ? null : resultado.erro,
      });

      if (resultado.ok) campanhasCriadas++;
    } catch (e) {
      await supabase.from("smartads_boost_automatico_log").insert({
        conta_id: conta.id,
        instagram_media_id: "erro-inesperado-" + Date.now(),
        sucesso: false,
        erro_mensagem: e instanceof Error ? e.message : "Falha inesperada ao avaliar o boost automático.",
      });
    }
  }

  return { contasAvaliadas: (contas ?? []).length, campanhasCriadas };
}
