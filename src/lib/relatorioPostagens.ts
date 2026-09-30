import { criarClienteAdmin } from "@/lib/supabase/admin";
import { listarPostsInstagram, type PostInstagram } from "@/lib/meta/api";
import { diaEmSaoPaulo, horaEmSaoPaulo, formatarDiaExibicao, adicionarDias, FUSO_HORARIO_SP } from "@/lib/tempoSaoPaulo";

const DIAS_JANELA = 30;
const DIAS_LIMITE_ATENCAO = 5;

export interface DiaRelatorioPostagem {
  diaExibicao: string;
  horasPost: string[];
  /** Não-nulo só no dia em que a sequência sem postar bate um múltiplo de DIAS_LIMITE_ATENCAO (5,
   * 10, 15...) — o valor é a contagem real naquele dia, pro aviso poder dizer "10 dias sem postar"
   * de verdade, não repetir "5 dias" pra sempre num hiato que já passou disso. */
  diasSemPostarDestaque: number | null;
  /** Quantidade de stories vistos naquele dia — vem de smartads_stories_vistos (ver
   * src/lib/stories.ts), nunca da Meta ao vivo: diferente do feed, a API só expõe stories ATIVOS
   * (últimas 24h), sem histórico, então o contador só existe a partir de quando o cron passou a
   * rodar. Não participa de nenhum aviso/sinalização — é só informativo. */
  storiesPostados: number;
  /** True a partir do primeiro dia em que a coleta de stories tem registro (em qualquer unidade da
   * rede) e sempre em hoje. Nesses dias, storiesPostados zero é um dado real — "0 stories" — porque
   * o cron já estava rodando. Antes desse marco, "—" continua sendo o certo: zero ali só
   * significaria que ainda não havia coleta, não que a unidade não postou. */
  temRegistroStories: boolean;
}

export interface UnidadeRelatorioPostagens {
  clienteId: string;
  clienteNome: string;
  contaId: string;
  instagramUsername: string | null;
  instagramVinculado: boolean;
  totalPostagens: number;
  /** Timestamp ISO do post mais recente (feed, Reels ou carrossel) — null se nunca postou ou sem
   * Instagram vinculado. Usado tanto pelo relatório quanto pela grade de cards em
   * /estrategias/postagens, que precisa da data/hora crua (não só "DD/MM" formatado). */
  ultimoPostEm: string | null;
  dias: DiaRelatorioPostagem[];
}

/** Formato salvo em smartads_relatorio_postagens_cache.dias — versão "crua" de DiaRelatorioPostagem
 * (chave do dia em vez de já formatada, sem storiesPostados porque isso vem sempre fresco da
 * mesma consulta local que já roda em toda chamada, cache ou não). */
interface DiaBruto {
  dia: string;
  horasPost: string[];
  diasSemPostarDestaque: number | null;
}

/** Relatório dia a dia dos últimos 30 dias, uma linha por dia, pra cada unidade de franquia — fonte
 * única pra tudo que envolve postagens: o download/e-mail (ver src/lib/email/relatorioPostagens.ts
 * e /api/relatorios/postagens), a página de detalhe por unidade
 * (src/app/estrategias/postagens/[contaId]/page.tsx) e a grade de cards
 * (src/app/estrategias/postagens/page.tsx). A sequência de dias sem postar é calculada desde o
 * post mais antigo que `listarPostsInstagram` devolve (até 30 itens), não só desde o início da
 * janela de exibição — senão um hiato que já vinha de antes apareceria como se tivesse começado do
 * zero no primeiro dia do relatório, subestimando o atraso real.
 *
 * Sempre busca ao vivo na Meta — SEM cache — exceto uma otimização pontual: uma unidade que já
 * teve o post de hoje confirmado numa chamada anterior, hoje mesmo, não bate na Meta de novo (ver
 * smartads_relatorio_postagens_cache). É bem improvável postar duas vezes no mesmo dia, e mesmo
 * que aconteça, "0 dias sem postar" já está certo do mesmo jeito — só economiza chamada em quem já
 * sabidamente não precisa ser checado nesse dia. Unidade que ainda não postou hoje continua sendo
 * checada em TODA visita, porque aí sim a resposta pode mudar a qualquer momento. */
export async function obterRelatorioPostagens(): Promise<UnidadeRelatorioPostagens[]> {
  const supabase = criarClienteAdmin();
  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select("id, nome, smartads_empresas!inner(tipo), smartads_contas_meta(*)")
    .eq("ativo", true)
    .eq("smartads_empresas.tipo", "franquia")
    .order("nome");

  const unidades = (clientes ?? []).flatMap((cliente) =>
    ((cliente as any).smartads_contas_meta as any[])
      .filter((conta) => conta.ativo)
      .map((conta) => ({ cliente, conta }))
  );

  const hojeSP = diaEmSaoPaulo(new Date().toISOString());
  const diasJanela: string[] = [];
  for (let i = DIAS_JANELA - 1; i >= 0; i--) diasJanela.push(adicionarDias(hojeSP, -i));

  // Busca os stories já vistos de todas as unidades numa query só (não uma por conta) — mesma
  // janela de 30 dias da tabela, agrupado por conta+dia pra montar o contador de cada célula.
  const contaIds = unidades.map(({ conta }) => conta.id as string);
  const { data: storiesLinhas } =
    contaIds.length > 0
      ? await supabase.from("smartads_stories_vistos").select("conta_id, dia").in("conta_id", contaIds).gte("dia", diasJanela[0])
      : { data: [] as Array<{ conta_id: string; dia: string }> };

  const storiesPorConta = new Map<string, Map<string, number>>();
  let primeiroDiaComRegistro: string | null = null;
  for (const linha of storiesLinhas ?? []) {
    if (primeiroDiaComRegistro === null || linha.dia < primeiroDiaComRegistro) primeiroDiaComRegistro = linha.dia;
    const porDia = storiesPorConta.get(linha.conta_id) ?? new Map<string, number>();
    porDia.set(linha.dia, (porDia.get(linha.dia) ?? 0) + 1);
    storiesPorConta.set(linha.conta_id, porDia);
  }

  // Cache do resultado do dia por conta (ver DiaBruto acima) — só é reaproveitado quando a
  // unidade já tinha post confirmado de HOJE numa chamada anterior, hoje mesmo.
  const contaIdsComInstagram = unidades
    .filter(({ conta }) => conta.instagram_business_id)
    .map(({ conta }) => conta.id as string);
  const { data: cacheLinhas } =
    contaIdsComInstagram.length > 0
      ? await supabase
          .from("smartads_relatorio_postagens_cache")
          .select("conta_id, dia_calculado, ultimo_post_em, ultimo_post_dia, total_postagens, dias")
          .in("conta_id", contaIdsComInstagram)
      : { data: [] as any[] };
  const cachePorConta = new Map((cacheLinhas ?? []).map((l: any) => [l.conta_id as string, l]));

  return Promise.all(
    unidades.map(async ({ cliente, conta }): Promise<UnidadeRelatorioPostagens> => {
      const base = {
        clienteId: cliente.id as string,
        clienteNome: cliente.nome as string,
        contaId: conta.id as string,
        instagramUsername: (conta.instagram_username ?? null) as string | null,
      };
      if (!conta.instagram_business_id) {
        return { ...base, instagramVinculado: false, totalPostagens: 0, ultimoPostEm: null, dias: [] };
      }

      const storiesPorDia = storiesPorConta.get(conta.id as string) ?? new Map<string, number>();
      const cache = cachePorConta.get(conta.id as string);
      const podeReaproveitar = cache && cache.dia_calculado === hojeSP && cache.ultimo_post_dia === hojeSP;

      let diasBrutos: DiaBruto[];
      let ultimoPostEm: string | null;
      let totalPostagens: number;

      if (podeReaproveitar) {
        diasBrutos = cache.dias as DiaBruto[];
        ultimoPostEm = cache.ultimo_post_em;
        totalPostagens = cache.total_postagens;
      } else {
        const postsBrutos = await listarPostsInstagram(conta.instagram_business_id).catch(() => [] as PostInstagram[]);
        // Deduplica por id — proteção contra a Meta devolver o mesmo post mais de uma vez (não
        // deveria acontecer numa chamada só sem paginação, mas é barato garantir e evita contagem
        // inflada). Map preserva a ordem de inserção = ordem original da Meta (mais recente
        // primeiro), então posts[0] continua sendo "o último post" depois da deduplicação.
        const posts = [...new Map(postsBrutos.map((p) => [p.id, p])).values()];
        ultimoPostEm = posts[0]?.timestamp ?? null;

        const horasPorDia = new Map<string, string[]>();
        for (const post of posts) {
          const dia = diaEmSaoPaulo(post.timestamp);
          const hora = horaEmSaoPaulo(post.timestamp);
          const lista = horasPorDia.get(dia) ?? [];
          lista.push(hora);
          horasPorDia.set(dia, lista);
        }
        for (const lista of horasPorDia.values()) lista.sort();

        const diaMaisAntigoComPost =
          posts.length > 0
            ? posts.reduce((menor, p) => (p.timestamp < menor ? p.timestamp : menor), posts[0].timestamp)
            : null;
        const diaInicioCalculo = diaMaisAntigoComPost ? diaEmSaoPaulo(diaMaisAntigoComPost) : diasJanela[0];

        let streak = 0;
        const destaquePorDia = new Map<string, number>();
        for (let cursor = diaInicioCalculo; cursor <= hojeSP; cursor = adicionarDias(cursor, 1)) {
          if (horasPorDia.has(cursor)) {
            streak = 0;
          } else {
            streak += 1;
            // Acende em todo múltiplo de DIAS_LIMITE_ATENCAO (5, 10, 15...) — não só uma vez no
            // primeiro corte, senão um hiato de 20 dias mostraria só um aviso de "5 dias" lá atrás
            // e nada mais, escondendo o tamanho real do problema.
            if (streak % DIAS_LIMITE_ATENCAO === 0) destaquePorDia.set(cursor, streak);
          }
        }

        diasBrutos = diasJanela.map((dia) => ({
          dia,
          horasPost: horasPorDia.get(dia) ?? [],
          diasSemPostarDestaque: destaquePorDia.get(dia) ?? null,
        }));
        totalPostagens = diasBrutos.reduce((soma, d) => soma + d.horasPost.length, 0);

        await supabase.from("smartads_relatorio_postagens_cache").upsert({
          conta_id: conta.id,
          dia_calculado: hojeSP,
          ultimo_post_em: ultimoPostEm,
          ultimo_post_dia: ultimoPostEm ? diaEmSaoPaulo(ultimoPostEm) : null,
          total_postagens: totalPostagens,
          dias: diasBrutos,
          atualizado_em: new Date().toISOString(),
        });
      }

      const dias: DiaRelatorioPostagem[] = diasBrutos.map((d) => ({
        diaExibicao: formatarDiaExibicao(d.dia),
        horasPost: d.horasPost,
        diasSemPostarDestaque: d.diasSemPostarDestaque,
        storiesPostados: storiesPorDia.get(d.dia) ?? 0,
        temRegistroStories: d.dia === hojeSP || (primeiroDiaComRegistro !== null && d.dia >= primeiroDiaComRegistro),
      }));

      return { ...base, instagramVinculado: true, totalPostagens, ultimoPostEm, dias };
    })
  );
}

// Fonte só de tipos web-safe — nada de fonte customizada: metade dos clientes de e-mail ignora
// @font-face e cai no fallback de qualquer jeito, então o fallback já É a fonte.
const FONTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Risquinho claro entre um dia e outro — só pra separar visualmente as linhas da tabela (antes
// grudadas, sem nenhuma marcação entre elas), sem virar grade pesada.
const BORDA_LINHA = "border-bottom:1px solid #f1f1f1";

// Coluna de stories: só informativa, não participa do aviso de "dias sem postar" nem tem cor de
// alerta própria — por isso fica fora do `if` do destaque acima e sempre em cinza neutro.
function celulaStories(dia: DiaRelatorioPostagem): string {
  // "—" só antes da coleta de stories começar (ver temRegistroStories); depois disso, zero é zero.
  const texto = dia.storiesPostados > 0 ? dia.storiesPostados : dia.temRegistroStories ? "0" : "—";
  return `<td style="padding:6px 10px;font-size:11px;color:#a1a1aa;text-align:right;vertical-align:top;${BORDA_LINHA}">${texto}</td>`;
}

function celulaDia(dia: DiaRelatorioPostagem): string {
  if (dia.diasSemPostarDestaque !== null) {
    return `<tr style="background:#fef2f2"><td colspan="3" style="padding:7px 10px 7px 8px;font-size:11px;color:#991b1b;font-weight:700;border-left:3px solid #dc2626;${BORDA_LINHA}">${dia.diaExibicao} — atenção: ${dia.diasSemPostarDestaque} dias sem postar</td></tr>`;
  }
  if (dia.horasPost.length > 0) {
    // Um post só: "OK · 08:20", sem numerar — não precisa. Mais de um: numera cada um (Post 1,
    // Post 2...) empilhado na mesma célula, pra dar pra conferir olhando o relatório mesmo, sem
    // ter que ir contar no Instagram.
    const status =
      dia.horasPost.length === 1
        ? `OK · ${dia.horasPost[0]}`
        : dia.horasPost.map((hora, i) => `Post ${i + 1} · ${hora}`).join("<br>");
    return `<tr><td style="padding:6px 10px;font-size:11px;color:#71717a;vertical-align:top;${BORDA_LINHA}">${dia.diaExibicao}</td><td style="padding:6px 10px;font-size:11px;font-weight:600;color:#15803d;line-height:1.6;vertical-align:top;${BORDA_LINHA}">${status}</td>${celulaStories(dia)}</tr>`;
  }
  return `<tr><td style="padding:6px 10px;font-size:11px;color:#a1a1aa;vertical-align:top;${BORDA_LINHA}">${dia.diaExibicao}</td><td style="padding:6px 10px;font-size:11px;color:#d4d4d8;vertical-align:top;${BORDA_LINHA}">—</td>${celulaStories(dia)}</tr>`;
}

// Cabeçalho pequeno acima de cada coluna de dias — antes a tabela começava direto nos dados, sem
// dizer o que cada coluna é.
const CABECALHO_COLUNA =
  `<tr><td style="padding:0 10px 6px;font-size:9.5px;font-weight:700;letter-spacing:.05em;color:#a1a1aa;text-transform:uppercase">Dia</td>` +
  `<td style="padding:0 10px 6px;font-size:9.5px;font-weight:700;letter-spacing:.05em;color:#a1a1aa;text-transform:uppercase">Postagem</td>` +
  `<td style="padding:0 10px 6px;font-size:9.5px;font-weight:700;letter-spacing:.05em;color:#a1a1aa;text-transform:uppercase;text-align:right">Stories</td></tr>`;

export type ComparativoRede = "acima" | "na_media" | "abaixo" | "critico" | "sem_base";

// Limiar bem mais severo que "abaixo" (razão <= 0.85) — pra unidade que não está só um pouco
// atrás da rede, está postando quase nada. Dispara por dois caminhos: proporção (menos de 40% da
// média) OU número absoluto muito baixo (4 posts ou menos em 30 dias já é grave, mesmo se a rede
// inteira estiver com a média baixa naquele momento e a proporção "disfarçar" o problema).
const RAZAO_CRITICA = 0.4;
const POSTAGENS_MINIMAS_CRITICO = 4;

// Banda de tolerância em torno da média pra "na média" não ficar oscilando com diferença de 1
// post — mesma ideia da faixa usada no Semáforo (ver src/lib/semaforo.ts), só que mais folgada
// porque aqui é contagem inteira de posts, não uma taxa como CTR. Devolve só a classificação (sem
// cor nem texto) — cada lugar que exibe isso (o HTML do relatório aqui embaixo, e a página de
// detalhe no app, ver src/app/estrategias/postagens/[contaId]/page.tsx) decide sua própria cor,
// mas o limiar é um só, definido aqui.
export function classificarComparativoRede(totalPostagens: number, media: number): ComparativoRede {
  if (media <= 0) return "sem_base";
  const razao = totalPostagens / media;
  if (totalPostagens <= POSTAGENS_MINIMAS_CRITICO || razao <= RAZAO_CRITICA) return "critico";
  if (razao >= 1.15) return "acima";
  if (razao <= 0.85) return "abaixo";
  return "na_media";
}

/** Mesma régua de classificarComparativoRede, pra média de STORIES POR DIA (número com casa decimal,
 * não contagem inteira de posts): sem o piso absoluto de "poucos posts", só a razão contra a média
 * da rede — zerada com a rede postando já cai em "crítico" pela razão. */
export function classificarStoriesRede(mediaDia: number, mediaRede: number): ComparativoRede {
  if (mediaRede <= 0) return "sem_base";
  const razao = mediaDia / mediaRede;
  if (razao <= RAZAO_CRITICA) return "critico";
  if (razao >= 1.15) return "acima";
  if (razao <= 0.85) return "abaixo";
  return "na_media";
}

export interface EstatisticasStoriesUnidade {
  /** Total de stories desde que a coleta começou (dentro da janela de 30 dias). */
  total: number;
  /** Média por dia nesse mesmo período; null se ainda não há coleta nenhuma. */
  mediaDia: number | null;
  /** Comparativo da média com a da rede; null sem Instagram vinculado ou com menos de 3 dias de coleta. */
  comparativo: ComparativoRede | null;
}

export interface EstatisticasStoriesRede {
  porConta: Map<string, EstatisticasStoriesUnidade>;
  /** Dias da janela em que já existe coleta (0 a 30). */
  diasDeColeta: number;
}

const DIAS_MINIMOS_COMPARAR_STORIES = 3;

/** Stories não têm histórico na Meta: só existe contagem a partir de quando a coleta começou. O
 * primeiro dia da janela em que QUALQUER unidade tem story marca esse começo, e todas são medidas
 * desde ele — senão quem tem 30 dias de janela "vazia" ficaria injustamente abaixo da média. A soma
 * e a média usam só os dias com coleta, sem extrapolar. Fonte única pro card do Radar, a página de
 * detalhe e o relatório (download e e-mail). */
export function calcularEstatisticasStories(unidades: UnidadeRelatorioPostagens[]): EstatisticasStoriesRede {
  const vinculadas = unidades.filter((u) => u.instagramVinculado);
  let inicio = -1;
  for (let i = 0; i < DIAS_JANELA && inicio === -1; i++) {
    if (vinculadas.some((u) => (u.dias[i]?.storiesPostados ?? 0) > 0)) inicio = i;
  }
  const diasDeColeta = inicio === -1 ? 0 : DIAS_JANELA - inicio;
  const totalDe = (u: UnidadeRelatorioPostagens) =>
    inicio === -1 ? 0 : u.dias.slice(inicio).reduce((soma, d) => soma + d.storiesPostados, 0);
  const mediaDe = (u: UnidadeRelatorioPostagens): number | null => (diasDeColeta > 0 ? totalDe(u) / diasDeColeta : null);

  const medias = vinculadas.map(mediaDe).filter((m): m is number => m !== null);
  const mediaRede = medias.length > 0 ? medias.reduce((a, b) => a + b, 0) / medias.length : 0;

  const porConta = new Map<string, EstatisticasStoriesUnidade>();
  for (const u of unidades) {
    const mediaDia = u.instagramVinculado ? mediaDe(u) : null;
    porConta.set(u.contaId, {
      total: totalDe(u),
      mediaDia,
      comparativo:
        u.instagramVinculado && diasDeColeta >= DIAS_MINIMOS_COMPARAR_STORIES
          ? classificarStoriesRede(mediaDia ?? 0, mediaRede)
          : null,
    });
  }
  return { porConta, diasDeColeta };
}

/** "~5" (inteiro); abaixo de 1 mantém uma casa ("~0,8") pra não virar "~0". */
export function formatarMediaStories(mediaDia: number): string {
  const texto = mediaDia >= 1 ? Math.round(mediaDia).toString() : mediaDia.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `~${texto}`;
}

/** "42 stories em 30 dias" — ou "em N dias de coleta" enquanto a coleta não cobre a janela toda. */
export function descricaoTotalStories(total: number, diasDeColeta: number): string {
  const periodo = diasDeColeta >= DIAS_JANELA || diasDeColeta === 0 ? "em 30 dias" : `em ${diasDeColeta} dias de coleta`;
  return `${total} ${total === 1 ? "story" : "stories"} ${periodo}`;
}

export const ROTULO_COMPARATIVO: Record<ComparativoRede, string> = {
  acima: "Acima da média da rede",
  na_media: "Na média da rede",
  abaixo: "Abaixo da média da rede",
  critico: "Alerta crítico",
  sem_base: "Sem base de comparação ainda",
};

function estiloComparativo(classificacao: ComparativoRede): { rotulo: string; cor: string; fundo: string } {
  const cores: Record<ComparativoRede, { cor: string; fundo: string }> = {
    acima: { cor: "#15803d", fundo: "#dcfce7" },
    na_media: { cor: "#52525b", fundo: "#f4f4f5" },
    abaixo: { cor: "#b45309", fundo: "#fef3c7" },
    critico: { cor: "#b91c1c", fundo: "#fee2e2" },
    sem_base: { cor: "#71717a", fundo: "#f4f4f5" },
  };
  return { rotulo: ROTULO_COMPARATIVO[classificacao], ...cores[classificacao] };
}

// Círculo com a(s) inicial(is) do nome da unidade — técnica compatível com e-mail (display:inline-
// block + line-height, nada de flex, que o Outlook ignora): dá uma âncora visual pra cada card sem
// precisar de foto nenhuma.
function iniciais(nome: string): string {
  const palavras = nome.replace(/^DB\s*-\s*/i, "").trim().split(/\s+/);
  return (palavras[0]?.[0] ?? "").toUpperCase() + (palavras.length > 1 ? (palavras[1]?.[0] ?? "").toUpperCase() : "");
}

function montarSecaoUnidade(unidade: UnidadeRelatorioPostagens, mediaRede: number, estatisticas: EstatisticasStoriesRede): string {
  const avatar = `<div style="width:34px;height:34px;border-radius:50%;background:#f4f4f5;color:#71717a;font-size:12.5px;font-weight:700;text-align:center;line-height:34px">${iniciais(unidade.clienteNome)}</div>`;

  if (!unidade.instagramVinculado) {
    return `<div style="margin-bottom:14px;border:1px solid #ececef;border-radius:14px;padding:16px 18px">
      <table style="width:100%;border-collapse:collapse"><tr>
        <td style="width:44px;vertical-align:top">${avatar}</td>
        <td style="vertical-align:top">
          <p style="margin:0;font-size:14.5px;font-weight:700;color:#18181b">${unidade.clienteNome}</p>
          <p style="margin:2px 0 0;font-size:12px;color:#a1a1aa">Instagram não vinculado</p>
        </td>
      </tr></table>
    </div>`;
  }

  const metade = Math.ceil(unidade.dias.length / 2);
  const colunas = [unidade.dias.slice(0, metade), unidade.dias.slice(metade)];
  const tabela = (dias: DiaRelatorioPostagem[]) =>
    `<table style="width:100%;border-collapse:collapse">${CABECALHO_COLUNA}${dias.map(celulaDia).join("")}</table>`;

  const comparativo = estiloComparativo(classificarComparativoRede(unidade.totalPostagens, mediaRede));
  const stats = estatisticas.porConta.get(unidade.contaId);
  const comparativoStories = estiloComparativo(stats?.comparativo ?? "sem_base");
  const selo = (estilo: { rotulo: string; cor: string; fundo: string }) =>
    `<span style="display:inline-block;padding:3px 10px;border-radius:99px;background:${estilo.fundo};color:${estilo.cor};font-size:10.5px;font-weight:700">${estilo.rotulo}</span>`;
  const textoStories = stats
    ? `${descricaoTotalStories(stats.total, estatisticas.diasDeColeta)}${stats.mediaDia !== null ? `<span style="margin:0 6px;color:#e4e4e7">·</span>média ${formatarMediaStories(stats.mediaDia)}/dia` : ""}`
    : "";

  // Cabeçalho em três linhas (nome / postagens + selo / stories + selo) — cada métrica tem o
  // próprio selo de comparativo com a rede, alinhado à linha dela.
  return `<div style="margin-bottom:14px;border:1px solid #ececef;border-radius:14px;padding:18px">
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
      <tr>
        <td rowspan="3" style="width:44px;vertical-align:top">${avatar}</td>
        <td colspan="2" style="vertical-align:top">
          <p style="margin:0;font-size:14.5px;font-weight:700;color:#18181b">${unidade.clienteNome}</p>
        </td>
      </tr>
      <tr>
        <td style="vertical-align:middle;padding-top:5px">
          <p style="margin:0;font-size:11.5px;color:#a1a1aa">
            ${unidade.instagramUsername ? `@${unidade.instagramUsername}<span style="margin:0 6px;color:#e4e4e7">·</span>` : ""}${unidade.totalPostagens} ${unidade.totalPostagens === 1 ? "postagem" : "postagens"} em 30 dias
          </p>
        </td>
        <td style="width:1%;white-space:nowrap;vertical-align:middle;text-align:right;padding-top:5px">${selo(comparativo)}</td>
      </tr>
      <tr>
        <td style="vertical-align:middle;padding-top:6px">
          <p style="margin:0;font-size:11.5px;color:#a1a1aa">${textoStories}</p>
        </td>
        <td style="width:1%;white-space:nowrap;vertical-align:middle;text-align:right;padding-top:6px">${selo(comparativoStories)}</td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse"><tr>
      <td style="width:50%;vertical-align:top;padding-right:14px">${tabela(colunas[0])}</td>
      <td style="width:50%;vertical-align:top;padding-left:14px;border-left:1px solid #ececef">${tabela(colunas[1])}</td>
    </tr></table>
  </div>`;
}

/** HTML pronto pra e-mail (estilo inline, largura fixa) e também usado como o próprio arquivo do
 * download — o relatório visto num não é diferente do outro. `<meta charset="utf-8">` é
 * obrigatório aqui: sem ele, o Content-Type da resposta HTTP diz UTF-8 mas some assim que o
 * arquivo é salvo e reaberto fora do navegador (ex: app Arquivos do iPad), e sem a tag o leitor
 * assume Latin-1/Windows-1252 e todo acento vira "Ã³", "â€”" etc.
 *
 * Visual pensado pra caber num e-mail de verdade (Gmail, Outlook incluso) — por isso nada de
 * flexbox, blur ou sombra: só cor de fundo, borda, raio de canto e tabela pra alinhar colunas,
 * que é o que sobrevive em qualquer cliente. O "cartão branco sobre fundo cinza claro" é o que dá
 * a sensação de página impressa sem precisar de mais que isso. */
export function montarHtmlRelatorioPostagens(unidades: UnidadeRelatorioPostagens[]): string {
  // Média só entre unidades com Instagram vinculado — sem isso, uma unidade sem conexão nenhuma
  // (sempre 0 postagens) puxaria a média pra baixo e distorceria o comparativo das outras.
  const vinculadas = unidades.filter((u) => u.instagramVinculado);
  const mediaRede =
    vinculadas.length > 0 ? vinculadas.reduce((soma, u) => soma + u.totalPostagens, 0) / vinculadas.length : 0;

  const estatisticas = calcularEstatisticasStories(unidades);
  const corpo =
    unidades.length > 0
      ? unidades.map((u) => montarSecaoUnidade(u, mediaRede, estatisticas)).join("")
      : `<p style="font-size:13px;color:#a1a1aa">Nenhuma unidade de franquia ativa ainda.</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatório de postagens — últimos 30 dias</title>
</head>
<body style="background:#f4f4f5;margin:0;padding:28px 16px;font-family:${FONTE}">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px 28px 8px;border:1px solid #ececef">
    <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:.12em;color:#a1a1aa;text-transform:uppercase">SmartAds · Central da rede</p>
    <h1 style="font-size:21px;margin:0 0 4px;font-weight:700;color:#18181b;letter-spacing:-.01em">Relatório de postagens</h1>
    <p style="font-size:12px;color:#a1a1aa;margin:0 0 22px">Últimos 30 dias · gerado em ${new Date().toLocaleDateString("pt-BR", { timeZone: FUSO_HORARIO_SP })}</p>
    ${corpo}
    <p style="margin:14px 0 0;padding:14px 0;border-top:1px solid #f1f1f1;font-size:10.5px;color:#d4d4d8;text-align:center">Gerado automaticamente pelo SmartAds</p>
  </div>
</body>
</html>`;
}
