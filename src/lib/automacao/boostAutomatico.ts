import { criarClienteAdmin } from "@/lib/supabase/admin";
import { listarPostsInstagram, type PostInstagram } from "@/lib/meta/api";
import { ehPostOficial } from "@/lib/automacao/postsOficiais";
import { criarCampanhaCompleta } from "@/lib/meta/criarCampanhaCompleta";
import type { Publico } from "@/lib/meta/tipos";
import { mapearEmLotes } from "@/lib/lotes";
import { configDaConta, regraDeLinha } from "@/lib/boostRedeServidor";
import {
  configEfetiva,
  modelosDaEntrega,
} from "@/lib/boostRede";

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
  return Boolean(mensagem && /autentique sua conta|nenhuma forma de pagamento|teto de gasto do m/i.test(mensagem));
}

function dataEmSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_HORARIO }).format(new Date(iso));
}

function ehPostDeHoje(timestampPost: string): boolean {
  return dataEmSaoPaulo(timestampPost) === dataEmSaoPaulo(new Date().toISOString());
}

/** Franquia: além do post de hoje, aceita post oficial publicado com atraso de até tantos dias. */
const DIAS_ATRASO_OFICIAL = 3;

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
      "id, instagram_business_id, boost_automatico_publico_id, boost_automatico_orcamento_centavos, boost_automatico_duracao_dias, boost_tipo_entrega, boost_posts_por_dia, smartads_clientes(empresa_id, smartads_empresas(tipo))"
    )
    .eq("ativo", true)
    .eq("boost_automatico_ativo", true);

  // Datas especiais por conta, carregadas uma vez só pro cron inteiro.
  const { data: regrasBrutas } = await supabase
    .from("smartads_boost_rede_regras")
    .select("*")
    .not("conta_id", "is", null)
    .order("criado_em", { ascending: true });
  const hojeSP = dataEmSaoPaulo(new Date().toISOString());
  const configDaContaHoje = (conta: any) =>
    configEfetiva(
      configDaConta(conta),
      (regrasBrutas ?? []).filter((r) => r.conta_id === conta.id).map(regraDeLinha),
      hojeSP
    ).config;

  // Franquia: o boost só turbina os posts OFICIAIS da rede (mesma legenda postada por várias
  // unidades — ver postsOficiais.ts). Pra comparar, lê uma vez por rodada os posts recentes de
  // todas as contas do Instagram de cada franquia (só das franquias que têm boost ligado).
  const empresaDaConta = (conta: any): { id: string | null; franquia: boolean } => {
    const cl = Array.isArray(conta.smartads_clientes) ? conta.smartads_clientes[0] : conta.smartads_clientes;
    const emp = Array.isArray(cl?.smartads_empresas) ? cl?.smartads_empresas[0] : cl?.smartads_empresas;
    return { id: cl?.empresa_id ?? null, franquia: emp?.tipo === "franquia" };
  };
  const postsDaRede = new Map<string, Promise<Map<string, PostInstagram[]>>>();
  const carregarPostsDaRede = (empresaId: string) => {
    if (!postsDaRede.has(empresaId)) {
      postsDaRede.set(
        empresaId,
        (async () => {
          const { data: daRede } = await supabase
            .from("smartads_contas_meta")
            .select("instagram_business_id, smartads_clientes!inner(empresa_id, ativo)")
            .eq("ativo", true)
            .eq("smartads_clientes.empresa_id", empresaId)
            .eq("smartads_clientes.ativo", true)
            .not("instagram_business_id", "is", null);
          const ids = Array.from(new Set((daRede ?? []).map((c) => c.instagram_business_id as string)));
          const porConta = new Map<string, PostInstagram[]>();
          await mapearEmLotes(ids, async (igId) => {
            try {
              porConta.set(igId, await listarPostsInstagram(igId));
            } catch {
              // Conta que a Meta não deixou ler só não entra na comparação.
            }
          });
          return porConta;
        })()
      );
    }
    return postsDaRede.get(empresaId)!;
  };

  const criadasPorConta = await mapearEmLotes(contas ?? [], async (conta): Promise<boolean> => {
    try {
      const rede = configDaContaHoje(conta);
      const orcamentoDiarioCentavos = rede.orcamentoDiarioCentavos;
      const duracaoDias = rede.duracaoDias ?? 3;

      if (!conta.instagram_business_id || !conta.boost_automatico_publico_id || !orcamentoDiarioCentavos) {
        return false; // Ligado mas sem configurar público/orçamento ainda — nada a fazer.
      }

      // Limite de boosts por dia (padrão 1, sempre começando pelos primeiros posts do dia) — um
      // perfil que posta sem parar não pode empilhar campanha a cada rodada do cron. Cada post
      // turbinado conta 1, mesmo quando recebe duas campanhas (engajamento + alcance).
      const inicioDoDia = new Date(`${hojeSP}T00:00:00-03:00`).toISOString();
      const { data: sucessosHoje } = await supabase
        .from("smartads_boost_automatico_log")
        .select("id")
        .eq("conta_id", conta.id)
        .eq("sucesso", true)
        .gte("created_at", inicioDoDia);
      if ((sucessosHoje ?? []).length >= rede.boostsPorDia) return false;

      const empresa = empresaDaConta(conta);
      let postsDeHoje: PostInstagram[];
      if (empresa.franquia && empresa.id) {
        // Franquia: só posts oficiais da rede, de hoje ou publicados com até DIAS_ATRASO_OFICIAL dias de atraso.
        const rede = await carregarPostsDaRede(empresa.id);
        const proprios = rede.get(conta.instagram_business_id) ?? (await listarPostsInstagram(conta.instagram_business_id));
        const outras = new Map([...rede].filter(([igId]) => igId !== conta.instagram_business_id));
        const limite = Date.now() - DIAS_ATRASO_OFICIAL * 86_400_000;
        postsDeHoje = proprios
          .filter((p) => new Date(p.timestamp).getTime() >= limite && ehPostOficial(p, outras))
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      } else {
        const posts = await listarPostsInstagram(conta.instagram_business_id);
        postsDeHoje = posts
          .filter((p) => ehPostDeHoje(p.timestamp))
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }
      if (postsDeHoje.length === 0) return false;

      // Primeiro post de hoje que ainda não foi turbinado e ainda tem tentativas sobrando.
      const { data: registros } = await supabase
        .from("smartads_boost_automatico_log")
        .select("instagram_media_id, sucesso, tentativas, tipos_criados")
        .eq("conta_id", conta.id)
        .in(
          "instagram_media_id",
          postsDeHoje.map((p) => p.id)
        );
      const registroDoPost = new Map((registros ?? []).map((r) => [r.instagram_media_id, r]));
      const alvo = postsDeHoje.find((p) => {
        const r = registroDoPost.get(p.id);
        return !r?.sucesso && (r?.tentativas ?? 0) < MAX_TENTATIVAS_POR_POST;
      });
      if (!alvo) return false;

      const registro = registroDoPost.get(alvo.id);
      const tentativasAnteriores = registro?.tentativas ?? 0;
      const jaCriados: string[] = registro?.tipos_criados ?? [];

      const gravarResultado = async (dados: {
        campanha_criada_id?: string | null;
        sucesso: boolean;
        erro_mensagem: string | null;
        tipos_criados: string[];
      }) => {
        await supabase.from("smartads_boost_automatico_log").upsert(
          {
            conta_id: conta.id,
            instagram_media_id: alvo.id,
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
          tipos_criados: jaCriados,
        });
        return false;
      }

      const dataFim = new Date();
      dataFim.setDate(dataFim.getDate() + duracaoDias);

      // Uma campanha por tipo de entrega, cada uma com o orçamento diário completo. Num retry só
      // cria o que faltou (tipos_criados), pra nunca duplicar a campanha que já foi.
      const criados = [...jaCriados];
      let primeiroId: string | null = null;
      let erro: string | null = null;
      for (const tipo of modelosDaEntrega(rede.tipoEntrega)) {
        if (criados.includes(tipo)) continue;
        const resultado = await criarCampanhaCompleta({
          contaId: conta.id,
          tipoModelo: tipo,
          nomeCampanha: `Boost ${tipo === "alcance" ? "alcance" : "engajamento"} ${new Date().toLocaleDateString("pt-BR")}`,
          publico: publicoSalvo.targeting as Publico,
          publicoId: conta.boost_automatico_publico_id,
          orcamento: {
            tipo: "diario",
            valorCentavos: orcamentoDiarioCentavos,
            dataFim: dataFim.toISOString(),
          },
          criativo: { usarPostExistente: true, postSelecionadoId: alvo.id, mensagem: "" },
        });
        if (resultado.ok) {
          criados.push(tipo);
          primeiroId = primeiroId ?? (resultado.campanhaSalva as { id: string })?.id ?? null;
        } else {
          erro = resultado.erro;
          break;
        }
      }

      const completo = modelosDaEntrega(rede.tipoEntrega).every((t) => criados.includes(t));
      await gravarResultado({
        campanha_criada_id: primeiroId,
        sucesso: completo,
        erro_mensagem: completo ? null : erro,
        tipos_criados: criados,
      });

      return completo;
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
