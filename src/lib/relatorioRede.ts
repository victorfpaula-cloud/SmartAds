import { criarClienteAdmin } from "@/lib/supabase/admin";
import { gerarRelatorioAds, type DadosRelatorioAds } from "@/lib/relatorioAds";
import { contasRepetidas, enxugar, listarContasDaRede } from "@/lib/saudeRede";
import { ganhoSeguidoresEntre } from "@/lib/seguidoresHistorico";
import { mesDoRelatorio, type MesRelatorio } from "@/lib/relatorioMensal";
import { enviarEmail } from "@/lib/email/resend";
import { diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";

/** Relatório mensal da REDE (pra franqueadora): um PDF só, comparando todas as unidades.
 *
 * Buscar o mês de ~17 unidades na Meta não cabe numa execução (60s), então o trabalho é por etapas:
 * cada chamada de `avancarRelatorioRede` calcula algumas unidades e guarda em
 * smartads_relatorio_rede_cache; quando todas têm resultado, `enviarRelatorioRede` monta o PDF e manda. */

export const DESTINATARIO_REDE = "victorfpaula@gmail.com";

type Dados = Omit<DadosRelatorioAds, "campanhas">;

export interface LinhaRede {
  contaId: string;
  unidade: string;
  erro: string | null;
  gasto: number;
  alcance: number | null;
  interacoes: number | null;
  taxaEngajamento: number | null;
  posts: number | null;
  novosSeguidores: number | null;
  alcanceAnuncios: number;
}

async function contasDoRelatorio(empresaId: string) {
  const contas = await listarContasDaRede(empresaId);
  const repetidas = contasRepetidas(contas);
  return contas.filter((c) => !repetidas.has(c.contaId) && c.adAccountId);
}

/** Calcula as unidades que ainda faltam, até o tempo acabar. Devolve o andamento. */
export async function avancarRelatorioRede(
  empresaId: string,
  mes: MesRelatorio = mesDoRelatorio(),
  limiteMs = 40_000
): Promise<{ prontas: number; total: number }> {
  const inicio = Date.now();
  const db = criarClienteAdmin();
  const contas = await contasDoRelatorio(empresaId);
  const { data: feitas } = await db
    .from("smartads_relatorio_rede_cache")
    .select("conta_id, dados")
    .eq("empresa_id", empresaId)
    .eq("mes", mes.mes);
  // Quem deu erro é tentado de novo a cada rodada; quem já tem dados não é refeito.
  const prontas = new Set((feitas ?? []).filter((f) => f.dados).map((f) => f.conta_id as string));
  const jaTentadas = new Set((feitas ?? []).map((f) => f.conta_id as string));
  const fila = [
    ...contas.filter((c) => !jaTentadas.has(c.contaId)),
    ...contas.filter((c) => jaTentadas.has(c.contaId) && !prontas.has(c.contaId)),
  ];
  const hoje = diaEmSaoPaulo(new Date().toISOString());
  const terminaDiasAtras = Math.round((new Date(`${hoje}T00:00:00Z`).getTime() - new Date(`${mes.ate}T00:00:00Z`).getTime()) / 86_400_000);

  const trabalhar = async () => {
    for (;;) {
      const c = fila.shift();
      // Só começa uma unidade nova se ainda houver folga de tempo pra ela terminar.
      if (!c || Date.now() - inicio > limiteMs - 15_000) return;
      try {
        const d = await gerarRelatorioAds(c.contaId, mes.dias, true, { terminaDiasAtras });
        await db
          .from("smartads_relatorio_rede_cache")
          .upsert({ empresa_id: empresaId, mes: mes.mes, conta_id: c.contaId, dados: enxugar(d), erro: null, calculado_em: new Date().toISOString() });
        prontas.add(c.contaId);
      } catch (e) {
        await db
          .from("smartads_relatorio_rede_cache")
          .upsert({ empresa_id: empresaId, mes: mes.mes, conta_id: c.contaId, dados: null, erro: (e instanceof Error ? e.message : "Falha na Meta.").slice(0, 300), calculado_em: new Date().toISOString() });
      }
    }
  };
  await Promise.all([trabalhar(), trabalhar(), trabalhar()]);
  return { prontas: prontas.size, total: contas.length };
}

export async function carregarLinhasRede(empresaId: string, mes: MesRelatorio): Promise<{ linhas: LinhaRede[]; faltam: number }> {
  const contas = await contasDoRelatorio(empresaId);
  const { data } = await criarClienteAdmin()
    .from("smartads_relatorio_rede_cache")
    .select("conta_id, dados, erro")
    .eq("empresa_id", empresaId)
    .eq("mes", mes.mes);
  const porConta = new Map((data ?? []).map((l) => [l.conta_id as string, l]));
  const linhas: LinhaRede[] = [];
  let faltam = 0;
  for (const c of contas) {
    const l = porConta.get(c.contaId);
    if (!l) {
      faltam++;
      continue;
    }
    const d = l.dados as Dados | null;
    if (!d) {
      linhas.push({ contaId: c.contaId, unidade: c.unidade, erro: (l.erro as string | null) ?? "Sem dados.", gasto: 0, alcance: null, interacoes: null, taxaEngajamento: null, posts: null, novosSeguidores: null, alcanceAnuncios: 0 });
      continue;
    }
    const item = (chave: string) => d.organico?.find((i) => i.chave === chave)?.total ?? null;
    const alcance = item("alcance") ?? d.instagram?.alcance ?? null;
    const interacoes = item("interacoes");
    linhas.push({
      contaId: c.contaId,
      unidade: c.unidade,
      erro: null,
      gasto: d.totais.gasto,
      alcance,
      interacoes,
      taxaEngajamento: alcance && interacoes !== null ? (interacoes / alcance) * 100 : null,
      posts: d.instagram?.postsPublicados ?? null,
      // Do histórico próprio de seguidores (a Meta só informa os últimos 30 dias).
      novosSeguidores: await ganhoSeguidoresEntre(c.contaId, mes.desde, mes.ate).catch(() => null),
      alcanceAnuncios: d.totais.alcance,
    });
  }
  return { linhas, faltam };
}

const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type RGB = [number, number, number];
const COR = { fundo: [255, 255, 255] as RGB, texto: [17, 24, 39] as RGB, suave: [107, 114, 128] as RGB, borda: [229, 231, 235] as RGB, acento: [79, 70, 229] as RGB, faixa: [248, 250, 252] as RGB };

export async function montarPdfRede(empresaNome: string, mes: MesRelatorio, linhas: LinhaRede[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = doc.internal.pageSize.getWidth();
  const A = doc.internal.pageSize.getHeight();
  const M = 36;
  const W = L - M * 2;
  let y = M;
  const texto = (t: string, x: number, yy: number, tam: number, cor: RGB, negrito = false, alinhar: "left" | "right" = "left") => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tam);
    doc.setTextColor(...cor);
    doc.text(t, x, yy, { align: alinhar });
  };

  const ok = linhas.filter((l) => !l.erro);
  const soma = (f: (l: LinhaRede) => number | null) => ok.reduce((t, l) => t + (f(l) ?? 0), 0);
  const totalAlcance = soma((l) => l.alcance);
  const totalInteracoes = soma((l) => l.interacoes);

  texto("RELATÓRIO MENSAL DA REDE", M, y + 8, 8.5, COR.acento, true);
  texto(empresaNome, M, y + 32, 20, COR.texto, true);
  texto(`${mes.rotulo} · ${ok.length} unidade${ok.length !== 1 ? "s" : ""} com dados`, M, y + 50, 10, COR.suave);
  y += 70;

  const kpis: Array<[string, string]> = [
    ["Investido em anúncios", reais(soma((l) => l.gasto))],
    ["Alcance no Instagram", inteiro(totalAlcance)],
    ["Interações", inteiro(totalInteracoes)],
    ["Posts publicados", inteiro(soma((l) => l.posts))],
    ["Novos seguidores", ok.some((l) => l.novosSeguidores !== null) ? inteiro(soma((l) => l.novosSeguidores)) : "—"],
  ];
  const gap = 8;
  const wk = (W - gap * (kpis.length - 1)) / kpis.length;
  kpis.forEach(([rotulo, valor], i) => {
    const x = M + i * (wk + gap);
    doc.setFillColor(...COR.faixa);
    doc.setDrawColor(...COR.borda);
    doc.roundedRect(x, y, wk, 50, 6, 6, "FD");
    texto(rotulo, x + 8, y + 17, 7.5, COR.suave);
    texto(valor, x + 8, y + 37, 12.5, COR.texto, true);
  });
  y += 66;
  texto("O alcance somado conta a mesma pessoa em mais de uma unidade; é a soma das unidades, não pessoas únicas da rede.", M, y, 7, COR.suave);
  y += 18;

  // Destaques
  const melhor = (f: (l: LinhaRede) => number | null) => [...ok].filter((l) => f(l) !== null).sort((a, b) => (f(b) ?? 0) - (f(a) ?? 0))[0];
  const destaques: string[] = [];
  const mAlc = melhor((l) => l.alcance);
  if (mAlc?.alcance) destaques.push(`Maior alcance: ${mAlc.unidade} (${inteiro(mAlc.alcance)})`);
  const mEng = melhor((l) => (l.alcance && l.alcance >= 1000 ? l.taxaEngajamento : null));
  if (mEng?.taxaEngajamento) destaques.push(`Maior engajamento: ${mEng.unidade} (${mEng.taxaEngajamento.toFixed(1).replace(".", ",")} interações a cada 100 alcançados)`);
  const mSeg = melhor((l) => l.novosSeguidores);
  if (mSeg?.novosSeguidores && mSeg.novosSeguidores > 0) destaques.push(`Mais seguidores novos: ${mSeg.unidade} (+${inteiro(mSeg.novosSeguidores)})`);
  const semInvestir = ok.filter((l) => l.gasto <= 0).map((l) => l.unidade);
  if (semInvestir.length) destaques.push(`Sem investimento em anúncios no mês: ${semInvestir.join(", ")}`);
  const semPostar = ok.filter((l) => l.posts === 0).map((l) => l.unidade);
  if (semPostar.length) destaques.push(`Sem posts no mês: ${semPostar.join(", ")}`);
  if (destaques.length) {
    texto("DESTAQUES", M, y + 8, 8.5, COR.acento, true);
    y += 22;
    for (const d of destaques) {
      const partes = doc.setFontSize(9.5).splitTextToSize(`• ${d}`, W) as string[];
      partes.forEach((p) => {
        texto(p, M, y, 9.5, COR.texto);
        y += 13;
      });
    }
    y += 10;
  }

  // Tabela por unidade (ordenada por alcance)
  const col = [
    { r: "Unidade", x: M + 6, a: "left" as const },
    { r: "Investido", x: M + W * 0.36, a: "right" as const },
    { r: "Alcance", x: M + W * 0.5, a: "right" as const },
    { r: "Interações", x: M + W * 0.64, a: "right" as const },
    { r: "Eng. /100", x: M + W * 0.76, a: "right" as const },
    { r: "Posts", x: M + W * 0.86, a: "right" as const },
    { r: "Seguidores", x: M + W - 6, a: "right" as const },
  ];
  const cabecalho = () => {
    texto("UNIDADES", M, y + 8, 8.5, COR.acento, true);
    y += 20;
    col.forEach((c) => texto(c.r, c.x, y, 7.5, COR.suave, true, c.a));
    y += 8;
  };
  cabecalho();
  const ordenadas = [...linhas].sort((a, b) => (b.alcance ?? -1) - (a.alcance ?? -1));
  ordenadas.forEach((l, i) => {
    if (y + 20 > A - 44) {
      doc.addPage();
      y = M;
      cabecalho();
    }
    if (i % 2 === 0) {
      doc.setFillColor(...COR.faixa);
      doc.rect(M, y, W, 18, "F");
    }
    let nome = l.unidade;
    doc.setFontSize(9);
    while (nome.length > 4 && doc.getTextWidth(nome) > W * 0.24) nome = nome.slice(0, -2);
    if (nome !== l.unidade) nome += "…";
    texto(nome, col[0].x, y + 12.5, 9, COR.texto, true);
    if (l.erro) {
      texto("sem leitura na Meta neste mês", col[1].x - 40, y + 12.5, 8, COR.suave);
    } else {
      const v = (n: number | null, f: (x: number) => string = inteiro) => (n === null ? "—" : f(n));
      texto(reais(l.gasto), col[1].x, y + 12.5, 9, COR.texto, false, "right");
      texto(v(l.alcance), col[2].x, y + 12.5, 9, COR.texto, false, "right");
      texto(v(l.interacoes), col[3].x, y + 12.5, 9, COR.texto, false, "right");
      texto(v(l.taxaEngajamento, (x) => x.toFixed(1).replace(".", ",")), col[4].x, y + 12.5, 9, COR.texto, false, "right");
      texto(v(l.posts), col[5].x, y + 12.5, 9, COR.texto, false, "right");
      texto(v(l.novosSeguidores, (x) => `${x >= 0 ? "+" : ""}${inteiro(x)}`), col[6].x, y + 12.5, 9, COR.texto, false, "right");
    }
    y += 18;
  });

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    texto(`Gerado pelo SmartAds em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · Instagram (orgânico + anúncios) e Meta Ads`, M, A - 22, 7, COR.suave);
    texto(`${p}/${paginas}`, L - M, A - 22, 7, COR.suave, false, "right");
  }
  return doc;
}

/** Monta e envia o PDF se todas as unidades já têm resultado. `forcar` reenvia mesmo já enviado. */
export async function enviarRelatorioRede(
  empresaId: string,
  mes: MesRelatorio = mesDoRelatorio(),
  forcar = false
): Promise<{ enviado: boolean; motivo?: string; faltam?: number }> {
  const db = criarClienteAdmin();
  if (!forcar) {
    const { data: ja } = await db.from("smartads_relatorio_rede_envios").select("mes").eq("empresa_id", empresaId).eq("mes", mes.mes).maybeSingle();
    if (ja) return { enviado: false, motivo: "Já enviado." };
  }
  const { linhas, faltam } = await carregarLinhasRede(empresaId, mes);
  if (faltam > 0) return { enviado: false, motivo: "Ainda calculando as unidades.", faltam };
  if (linhas.length === 0) return { enviado: false, motivo: "Rede sem unidades com conta de anúncio." };
  const { data: empresa } = await db.from("smartads_empresas").select("nome").eq("id", empresaId).maybeSingle();
  const nome = (empresa?.nome as string | undefined) ?? "Rede";
  const doc = await montarPdfRede(nome, mes, linhas);
  const ok = linhas.filter((l) => !l.erro);
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;margin:0 0 4px">Relatório mensal da rede — ${nome}</h1>
  <p style="font-size:13px;color:#6b7280;margin:0 0 16px">${mes.rotulo} · ${ok.length} unidade${ok.length !== 1 ? "s" : ""}. O PDF em anexo compara todas as unidades (investimento, alcance, interações, posts e seguidores).</p>
  <p style="font-size:13px;margin:0">Investido: <strong>${reais(ok.reduce((t, l) => t + l.gasto, 0))}</strong> · Alcance somado: <strong>${inteiro(ok.reduce((t, l) => t + (l.alcance ?? 0), 0))}</strong></p>
  <p style="font-size:11px;color:#9ca3af;margin-top:24px">Enviado pelo SmartAds.</p></body></html>`;
  await enviarEmail({
    destinatario: DESTINATARIO_REDE,
    assunto: `Relatório mensal da rede · ${mes.rotulo} — ${nome}`,
    html,
    anexos: [{ nome: `relatorio-rede-${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${mes.mes}.pdf`, conteudo: Buffer.from(doc.output("arraybuffer")) }],
  });
  await db.from("smartads_relatorio_rede_envios").upsert({ empresa_id: empresaId, mes: mes.mes, destinatario: DESTINATARIO_REDE, enviado_em: new Date().toISOString() });
  return { enviado: true };
}

/** Cron: avança todas as franquias e envia as que ficarem prontas. */
export async function rodarRelatorioRede(limiteMs = 42_000): Promise<{ redes: number; enviados: number; pendentes: number }> {
  const inicio = Date.now();
  const mes = mesDoRelatorio();
  const db = criarClienteAdmin();
  const { data: franquias } = await db.from("smartads_empresas").select("id").eq("tipo", "franquia");
  const { data: enviadas } = await db.from("smartads_relatorio_rede_envios").select("empresa_id").eq("mes", mes.mes);
  const feitas = new Set((enviadas ?? []).map((e) => e.empresa_id as string));
  let enviados = 0;
  let pendentes = 0;
  for (const f of franquias ?? []) {
    if (feitas.has(f.id)) continue;
    const resta = limiteMs - (Date.now() - inicio);
    if (resta < 18_000) {
      pendentes++;
      continue;
    }
    const a = await avancarRelatorioRede(f.id, mes, resta);
    const tentadas = (await carregarLinhasRede(f.id, mes)).faltam === 0;
    if (tentadas && a.total > 0) {
      const r = await enviarRelatorioRede(f.id, mes);
      if (r.enviado) enviados++;
      else pendentes++;
    } else if (a.total > 0) pendentes++;
  }
  return { redes: (franquias ?? []).length, enviados, pendentes };
}
