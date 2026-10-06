import { criarClienteAdmin } from "@/lib/supabase/admin";
import { listarPostsInstagram } from "@/lib/meta/api";
import { criarCampanhaCompleta } from "@/lib/meta/criarCampanhaCompleta";
import type { Publico } from "@/lib/meta/tipos";
import { mapearEmLotes } from "@/lib/lotes";

const FUSO_HORARIO = "America/Sao_Paulo";

// O cron roda algumas vezes por dia (ver vercel.json) e cada rodada retenta os posts que falharam,
// até esse limite — mais que isso é erro que não se resolve sozinho, e ficar criando e apagando
// campanha na conta do cliente a cada rodada só chama a atenção do antifraude da Meta.
const MAX_TENTATIVAS_POR_POST = 3;

// Erros que a Meta devolve quando a PRÓPRIA conta/usuário está bloqueado pra criar anúncio (ex.:
// "Autentique sua conta", code 31 / subcode 3858385). Repetir não adianta — só depende de alguém
// resolver lá na Meta — e cada tentativa cria e apaga uma campanha na conta do cliente, o que só
// reforça o alerta de segurança. Esses erros esgotam as tentativas na hora, em vez de retentar a
// cada rodada do cron.
function erroNaoRetentavel(mensagem: string | null | undefined): boolean {
  // "Autentique sua conta" (code 31) e "Nenhuma forma de pagamento" (code 100 / subcode 1359188):
  // os dois dependem de alguém resolver na Meta (autenticar, cadastrar pagamento).
  return Boolean(mensagem && /autentique sua conta|nenhuma forma de pagamento/i.test(mensagem));
}

function dataEmSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_HORARIO }).format(new Date(iso));
}

function ehPostDeHoje(timestampPost: string): boolean {
  return dataEmSaoPaulo(timestampPost) === dataEmSaoPaulo(new Date().toISOString());
}

/** Chamado 1x/dia pelo cron (ver /api/cron/boost-automatico e vercel.json), depois da janela de
 * postagem do dia (a pessoa liga a função e diz o horário na tela — ver PainelContas). Pra cada
 * conta com boost_automatico_ativo: pega o PRIMEIRO post de hoje do Instagram (no máximo 1 boost por
 * dia por conta) e confere se ainda não foi turbinado (smartads_boost_automatico_log), e se sim dispara uma campanha de
 * engajamento nele — mesmo caminho de "turbinar publicação existente" que já existe manualmente em
 * /campanhas/nova, só que automático. Uma conta com erro (Instagram sem post, público apagado,
 * falha na Meta) não impede as outras — fica registrada no log pra investigar depois. Processa as
 * contas em lotes (mapearEmLotes) em vez de uma por uma — corta o tempo total sem arriscar
 * estourar rate limit da Meta quando o catálogo de clientes crescer. */
export async function avaliarBoostAutomatico(): Promise<{
  contasAvaliadas: number;
  campanhasCriadas: number;
}> {
  const supabase = criarClienteAdmin();
  const { data: contas } = await supabase
    .from("smartads_contas_meta")
    .select(
      "id, instagram_business_id, boost_automatico_publico_id, boost_automatico_orcamento_centavos, boost_automatico_duracao_dias"
    )
    .eq("ativo", true)
    .eq("boost_automatico_ativo", true);

  const criadasPorConta = await mapearEmLotes(contas ?? [], async (conta): Promise<boolean> => {
    try {
      if (!conta.instagram_business_id || !conta.boost_automatico_publico_id || !conta.boost_automatico_orcamento_centavos) {
        return false; // Ligado mas sem configurar público/orçamento ainda — nada a fazer.
      }

      // No máximo 1 boost automático por conta por dia, sempre do PRIMEIRO post publicado no dia —
      // um perfil que posta sem parar não pode empilhar uma campanha nova a cada rodada do cron
      // (até 3 por dia, cada uma rodando por 3 a 7 dias). Posts seguintes do mesmo dia ficam de
      // fora do automático (continuam podendo ser turbinados à mão).
      const inicioDoDia = new Date(`${dataEmSaoPaulo(new Date().toISOString())}T00:00:00-03:00`).toISOString();
      const { data: sucessosHoje } = await supabase
        .from("smartads_boost_automatico_log")
        .select("id")
        .eq("conta_id", conta.id)
        .eq("sucesso", true)
        .gte("created_at", inicioDoDia)
        .limit(1);
      if ((sucessosHoje ?? []).length > 0) return false;

      const posts = await listarPostsInstagram(conta.instagram_business_id);
      const postsDeHoje = posts.filter((p) => ehPostDeHoje(p.timestamp));
      if (postsDeHoje.length === 0) return false;
      const primeiroDoDia = postsDeHoje.reduce((primeiro, p) => (p.timestamp < primeiro.timestamp ? p : primeiro));

      // Só sucesso conta como "já turbinado". Falha anterior é retentada (até MAX_TENTATIVAS_POR_POST):
      // antes qualquer linha no log, inclusive de falha, travava o post pra sempre — um erro
      // passageiro às 15h significava que o post nunca mais era tentado (29/09/2026).
      const { data: registro } = await supabase
        .from("smartads_boost_automatico_log")
        .select("sucesso, tentativas")
        .eq("conta_id", conta.id)
        .eq("instagram_media_id", primeiroDoDia.id)
        .maybeSingle();
      if (registro?.sucesso) return false;
      const tentativasAnteriores = registro?.tentativas ?? 0;
      if (tentativasAnteriores >= MAX_TENTATIVAS_POR_POST) return false;

      const gravarResultado = async (dados: {
        campanha_criada_id?: string | null;
        sucesso: boolean;
        erro_mensagem: string | null;
      }) => {
        await supabase.from("smartads_boost_automatico_log").upsert(
          {
            conta_id: conta.id,
            instagram_media_id: primeiroDoDia.id,
            tentativas: erroNaoRetentavel(dados.erro_mensagem) ? MAX_TENTATIVAS_POR_POST : tentativasAnteriores + 1,
            created_at: new Date().toISOString(),
            campanha_criada_id: null,
            ...dados,
          },
          { onConflict: "conta_id,instagram_media_id" }
        );
      };

      const { data: publicoSalvo } = await supabase
        .from("smartads_publicos_salvos")
        .select("targeting")
        .eq("id", conta.boost_automatico_publico_id)
        .single();

      if (!publicoSalvo) {
        await gravarResultado({
          sucesso: false,
          erro_mensagem: "O público salvo configurado pro boost automático não existe mais.",
        });
        return false;
      }

      const dataFim = new Date();
      dataFim.setDate(dataFim.getDate() + (conta.boost_automatico_duracao_dias ?? 3));

      const resultado = await criarCampanhaCompleta({
        contaId: conta.id,
        tipoModelo: "engajamento",
        nomeCampanha: `Boost automático ${new Date().toLocaleDateString("pt-BR")}`,
        publico: publicoSalvo.targeting as Publico,
        publicoId: conta.boost_automatico_publico_id,
        orcamento: {
          tipo: "diario",
          valorCentavos: conta.boost_automatico_orcamento_centavos,
          dataFim: dataFim.toISOString(),
        },
        criativo: { usarPostExistente: true, postSelecionadoId: primeiroDoDia.id, mensagem: "" },
      });

      await gravarResultado({
        campanha_criada_id: resultado.ok ? (resultado.campanhaSalva as { id: string })?.id ?? null : null,
        sucesso: resultado.ok,
        erro_mensagem: resultado.ok ? null : resultado.erro,
      });

      return resultado.ok;
    } catch (e) {
      await supabase.from("smartads_boost_automatico_log").insert({
        conta_id: conta.id,
        instagram_media_id: "erro-inesperado-" + Date.now(),
        sucesso: false,
        erro_mensagem: e instanceof Error ? e.message : "Falha inesperada ao avaliar o boost automático.",
      });
      return false;
    }
  });

  const campanhasCriadas = criadasPorConta.filter(Boolean).length;
  return { contasAvaliadas: (contas ?? []).length, campanhasCriadas };
}
