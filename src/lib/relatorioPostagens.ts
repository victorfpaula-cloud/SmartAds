import { criarClienteAdmin } from "@/lib/supabase/admin";
import { listarPostsInstagram, type PostInstagram } from "@/lib/meta/api";

const FUSO_HORARIO = "America/Sao_Paulo";
const DIAS_JANELA = 30;
const DIAS_LIMITE_ATENCAO = 5;

function diaEmSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_HORARIO }).format(new Date(iso));
}

function horaEmSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_HORARIO, hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

function formatarDiaExibicao(diaISO: string): string {
  const [, mes, dia] = diaISO.split("-");
  return `${dia}/${mes}`;
}

// Aritmética de calendário pura (sem passar por Date com fuso horário) — diaISO já é a data no
// fuso de São Paulo, então somar/subtrair dias aqui não pode reintroduzir erro de fuso.
function adicionarDias(diaISO: string, quantidade: number): string {
  const [ano, mes, dia] = diaISO.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + quantidade)).toISOString().slice(0, 10);
}

export interface DiaRelatorioPostagem {
  diaExibicao: string;
  horasPost: string[];
  destaqueAtraso: boolean;
}

export interface UnidadeRelatorioPostagens {
  clienteId: string;
  clienteNome: string;
  contaId: string;
  instagramUsername: string | null;
  instagramVinculado: boolean;
  totalPostagens: number;
  dias: DiaRelatorioPostagem[];
}

/** Relatório dia a dia dos últimos 30 dias, uma linha por dia, pra cada unidade de franquia — base
 * tanto do download quanto do e-mail automático (ver src/lib/email/relatorioPostagens.ts e
 * /api/relatorios/postagens). Igual à aba "Última postagem" (src/lib/postagens.ts), só que aqui
 * olha o histórico inteiro dos posts recentes, não só o mais novo, pra marcar dia a dia quando
 * postou e quando não. A sequência de dias sem postar é calculada desde o post mais antigo que
 * `listarPostsInstagram` devolve (até 30 itens), não só desde o início da janela de exibição —
 * senão um hiato que já vinha de antes apareceria como se tivesse começado do zero no primeiro dia
 * do relatório, subestimando o atraso real. */
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
  const diasJanelaSet = new Set(diasJanela);

  return Promise.all(
    unidades.map(async ({ cliente, conta }): Promise<UnidadeRelatorioPostagens> => {
      const base = {
        clienteId: cliente.id as string,
        clienteNome: cliente.nome as string,
        contaId: conta.id as string,
        instagramUsername: (conta.instagram_username ?? null) as string | null,
      };

      if (!conta.instagram_business_id) {
        return { ...base, instagramVinculado: false, totalPostagens: 0, dias: [] };
      }

      const postsBrutos = await listarPostsInstagram(conta.instagram_business_id).catch(() => [] as PostInstagram[]);
      // Deduplica por id — proteção contra a Meta devolver o mesmo post mais de uma vez (não deveria
      // acontecer numa chamada só sem paginação, mas é barato garantir e evita contagem inflada).
      const posts = [...new Map(postsBrutos.map((p) => [p.id, p])).values()];

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
      const destaquePorDia = new Set<string>();
      for (let cursor = diaInicioCalculo; cursor <= hojeSP; cursor = adicionarDias(cursor, 1)) {
        if (horasPorDia.has(cursor)) {
          streak = 0;
        } else {
          streak += 1;
          if (streak === DIAS_LIMITE_ATENCAO + 1) destaquePorDia.add(cursor);
        }
      }

      const dias: DiaRelatorioPostagem[] = diasJanela.map((dia) => ({
        diaExibicao: formatarDiaExibicao(dia),
        horasPost: horasPorDia.get(dia) ?? [],
        destaqueAtraso: destaquePorDia.has(dia),
      }));

      // Vem da MESMA estrutura (horasPorDia, já restrita à janela de 30 dias pelos `dia` gerados
      // acima) que alimenta a tabela — garante que o número do cabeçalho nunca destoe do que a
      // pessoa vê célula por célula.
      const totalPostagens = dias.reduce((soma, d) => soma + d.horasPost.length, 0);

      return { ...base, instagramVinculado: true, totalPostagens, dias };
    })
  );
}

// Risquinho claro entre um dia e outro — só pra separar visualmente as linhas da tabela (antes
// grudadas, sem nenhuma marcação entre elas), sem virar grade pesada.
const BORDA_LINHA = "border-bottom:1px solid #f0f0f0";

function celulaDia(dia: DiaRelatorioPostagem): string {
  if (dia.destaqueAtraso) {
    return `<tr style="background:#fef2f2"><td colspan="2" style="padding:5px 8px;font-size:11px;color:#7f1d1d;font-weight:600;${BORDA_LINHA}">${dia.diaExibicao} — mais de 5 dias sem postar nada</td></tr>`;
  }
  if (dia.horasPost.length > 0) {
    // Um post só: "OK · 08:20", sem numerar — não precisa. Mais de um: numera cada um (Post 1,
    // Post 2...) empilhado na mesma célula, pra dar pra conferir olhando o relatório mesmo, sem
    // ter que ir contar no Instagram.
    const status =
      dia.horasPost.length === 1
        ? `OK · ${dia.horasPost[0]}`
        : dia.horasPost.map((hora, i) => `Post ${i + 1} · ${hora}`).join("<br>");
    return `<tr><td style="padding:5px 8px;font-size:11px;color:#666;vertical-align:top;${BORDA_LINHA}">${dia.diaExibicao}</td><td style="padding:5px 8px;font-size:11px;font-weight:600;color:#15803d;line-height:1.6;${BORDA_LINHA}">${status}</td></tr>`;
  }
  return `<tr><td style="padding:5px 8px;font-size:11px;color:#999;${BORDA_LINHA}">${dia.diaExibicao}</td><td style="padding:5px 8px;font-size:11px;color:#ccc;${BORDA_LINHA}">—</td></tr>`;
}

// Banda de tolerância em torno da média pra "na média" não ficar oscilando com diferença de 1
// post — mesma ideia da faixa usada no Semáforo (ver src/lib/semaforo.ts), só que mais folgada
// porque aqui é contagem inteira de posts, não uma taxa como CTR.
function compararComMedia(totalPostagens: number, media: number): { rotulo: string; cor: string } {
  if (media <= 0) return { rotulo: "Sem base de comparação ainda", cor: "#999" };
  const razao = totalPostagens / media;
  if (razao >= 1.15) return { rotulo: "Acima da média da rede", cor: "#15803d" };
  if (razao <= 0.85) return { rotulo: "Abaixo da média da rede", cor: "#b45309" };
  return { rotulo: "Na média da rede", cor: "#666" };
}

function montarSecaoUnidade(unidade: UnidadeRelatorioPostagens, mediaRede: number): string {
  if (!unidade.instagramVinculado) {
    return `<div style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #eee">
      <h2 style="font-size:15px;margin:0 0 4px;font-weight:600">${unidade.clienteNome}</h2>
      <p style="font-size:12px;color:#999;margin:0">Instagram não vinculado.</p>
    </div>`;
  }

  const metade = Math.ceil(unidade.dias.length / 2);
  const colunas = [unidade.dias.slice(0, metade), unidade.dias.slice(metade)];
  const tabela = (dias: DiaRelatorioPostagem[]) =>
    `<table style="width:100%;border-collapse:collapse">${dias.map(celulaDia).join("")}</table>`;

  const comparativo = compararComMedia(unidade.totalPostagens, mediaRede);

  return `<div style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #eee">
    <h2 style="font-size:15px;margin:0 0 2px;font-weight:600">${unidade.clienteNome}</h2>
    <p style="font-size:11px;color:#999;margin:0 0 10px">
      ${unidade.instagramUsername ? `@${unidade.instagramUsername}<span style="margin:0 6px;color:#ddd">·</span>` : ""}${unidade.totalPostagens} postagem${unidade.totalPostagens !== 1 ? "s" : ""} em 30 dias<span style="margin:0 6px;color:#ddd">·</span><span style="font-weight:600;color:${comparativo.cor}">${comparativo.rotulo}</span>
    </p>
    <table style="width:100%;border-collapse:collapse"><tr>
      <td style="width:50%;vertical-align:top;padding-right:12px">${tabela(colunas[0])}</td>
      <td style="width:50%;vertical-align:top;padding-left:12px;border-left:1px solid #e5e5e5">${tabela(colunas[1])}</td>
    </tr></table>
  </div>`;
}

/** HTML pronto pra e-mail (estilo inline, largura fixa) e também usado como o próprio arquivo do
 * download — o relatório visto num não é diferente do outro. `<meta charset="utf-8">` é
 * obrigatório aqui: sem ele, o Content-Type da resposta HTTP diz UTF-8 mas some assim que o
 * arquivo é salvo e reaberto fora do navegador (ex: app Arquivos do iPad), e sem a tag o leitor
 * assume Latin-1/Windows-1252 e todo acento vira "Ã³", "â€”" etc. */
export function montarHtmlRelatorioPostagens(unidades: UnidadeRelatorioPostagens[]): string {
  // Média só entre unidades com Instagram vinculado — sem isso, uma unidade sem conexão nenhuma
  // (sempre 0 postagens) puxaria a média pra baixo e distorceria o comparativo das outras.
  const vinculadas = unidades.filter((u) => u.instagramVinculado);
  const mediaRede =
    vinculadas.length > 0 ? vinculadas.reduce((soma, u) => soma + u.totalPostagens, 0) / vinculadas.length : 0;

  const corpo =
    unidades.length > 0
      ? unidades.map((u) => montarSecaoUnidade(u, mediaRede)).join("")
      : `<p style="font-size:13px;color:#999">Nenhuma unidade de franquia ativa ainda.</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatório de postagens — últimos 30 dias</title>
</head>
<body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111;max-width:640px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;margin:0 0 4px;font-weight:700">Relatório de postagens — últimos 30 dias</h1>
  <p style="font-size:12px;color:#888;margin:0 0 24px">Gerado em ${new Date().toLocaleDateString("pt-BR", { timeZone: FUSO_HORARIO })}</p>
  ${corpo}
</body>
</html>`;
}
