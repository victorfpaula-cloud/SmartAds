import type { DadosGeraisRede } from "@/lib/dadosGeraisRede";
import { formatarDiaExibicao } from "@/lib/tempoSaoPaulo";

// PDF dos dados gerais da franquia, gerado no navegador com jsPDF (carregado só no clique), na mesma
// paleta escura da tela e com os mesmos números e cards da tela.

type RGB = [number, number, number];
const COR = {
  fundo: [7, 8, 10] as RGB,
  card: [21, 23, 29] as RGB,
  borda: [43, 46, 66] as RGB,
  texto: [243, 244, 246] as RGB,
  suave: [156, 163, 175] as RGB,
  fraco: [107, 114, 128] as RGB,
  acento: [129, 140, 248] as RGB,
};

const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function montarCardsDadosGerais(dados: DadosGeraisRede) {
  const seg = dados.seguidoresGanhos;
  const nota = dados.periodo.dias > 30 ? "A Meta só informa ganho de seguidores dos últimos 30 dias" : seg.semLeitura > 0 ? `no período · ${inteiro(seg.semLeitura)} sem leitura` : "no período";
  return [
    { rotulo: "Visualizações", valor: inteiro(dados.visualizacoes), sub: "vezes que os anúncios apareceram" },
    { rotulo: "Alcance", valor: inteiro(dados.alcance), sub: "soma das campanhas" },
    { rotulo: "Curtidas", valor: inteiro(dados.curtidas), sub: "trazidas pelas campanhas" },
    { rotulo: "Engajamento total", valor: dados.engajamentoTotal === null ? "—" : inteiro(dados.engajamentoTotal), sub: "curtidas, comentários, compartilhamentos e salvamentos" },
    { rotulo: "Investido", valor: reais(dados.investido), sub: "em todas as unidades" },
    { rotulo: "Seguidores ganhos", valor: seg.total === null ? "—" : `+${inteiro(seg.total)}`, sub: nota },
  ];
}

export async function baixarPdfDadosGerais(dados: DadosGeraisRede): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = doc.internal.pageSize.getWidth();
  const A = doc.internal.pageSize.getHeight();
  const M = 36;
  const W = L - M * 2;
  let y = M;

  const fundo = () => {
    doc.setFillColor(...COR.fundo);
    doc.rect(0, 0, L, A, "F");
  };
  // Helvetica do PDF só tem Latin-1: o texto passa por aqui para não sair com caracteres quebrados.
  const texto = (t: string, x: number, yy: number, tam: number, cor: RGB, negrito = false, alinhar: "left" | "right" = "left") => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tam);
    doc.setTextColor(...cor);
    doc.text(t.replace(/[^\u0000-ÿ]/g, "").replace(/\s{2,}/g, " ").trim(), x, yy, { align: alinhar });
  };
  const cartao = (x: number, yy: number, w: number, h: number) => {
    doc.setFillColor(...COR.card);
    doc.setDrawColor(...COR.borda);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, yy, w, h, 8, 8, "FD");
  };
  const novaPaginaSe = (h: number) => {
    if (y + h > A - 40) {
      doc.addPage();
      fundo();
      y = M;
    }
  };

  fundo();

  // Cabeçalho
  cartao(M, y, W, 74);
  texto("DADOS GERAIS DA FRANQUIA", M + 14, y + 20, 8.5, COR.acento, true);
  texto(`Últimos ${dados.periodo.dias} dias · ${formatarDiaExibicao(dados.periodo.desde)} a ${formatarDiaExibicao(dados.periodo.ate)}`, M + 14, y + 40, 11, COR.texto, true);
  texto(
    `${inteiro(dados.unidades)} unidades ativas (com boost ligado)${dados.unidadesSemLeitura > 0 ? ` · ${inteiro(dados.unidadesSemLeitura)} sem leitura agora` : ""}. A conta Expansão fica de fora.`,
    M + 14,
    y + 58,
    8.5,
    COR.suave
  );
  y += 88;

  // Cards em grade de 2 colunas, na mesma ordem da tela
  const cards = montarCardsDadosGerais(dados);
  const gap = 10;
  const w = (W - gap) / 2;
  // Card de campanhas criadas: ocupa as duas colunas, altura menor, número sem muito destaque.
  novaPaginaSe(70);
  cartao(M, y, W, 56);
  texto("CAMPANHAS CRIADAS", M + 14, y + 22, 8, COR.suave, true);
  texto("criadas pelo SmartAds no período, em todas as unidades", M + 14, y + 38, 8, COR.fraco);
  texto(inteiro(dados.campanhasPorUnidade.reduce((soma, u) => soma + u.campanhas, 0)), M + W - 14, y + 34, 16, COR.texto, true, "right");
  y += 66;
  for (let i = 0; i < cards.length; i += 2) {
    novaPaginaSe(92);
    [cards[i], cards[i + 1]].forEach((c, j) => {
      if (!c) return;
      const x = M + j * (w + gap);
      cartao(x, y, w, 80);
      texto(c.rotulo.toUpperCase(), x + 14, y + 20, 8, COR.suave, true);
      texto(c.valor, x + 14, y + 47, 20, COR.texto, true);
      texto(c.sub, x + 14, y + 66, 8, COR.fraco);
    });
    y += 92;
  }

  // Tabela de campanhas criadas por unidade
  y += 8;
  novaPaginaSe(60);
  texto("CAMPANHAS CRIADAS POR UNIDADE", M, y + 10, 8.5, COR.acento, true);
  texto("Criadas pelo SmartAds no período, incluindo as unidades sem nenhuma.", M, y + 24, 8, COR.fraco);
  y += 36;
  dados.campanhasPorUnidade.forEach((u, i) => {
    novaPaginaSe(22);
    if (i % 2 === 0) {
      doc.setFillColor(...COR.card);
      doc.rect(M, y - 13, W, 20, "F");
    }
    texto(u.unidade, M + 10, y, 9.5, COR.texto);
    texto(inteiro(u.campanhas), M + W - 10, y, 9.5, COR.texto, true, "right");
    y += 20;
  });

  y += 14;
  novaPaginaSe(40);
  texto(
    "Só entram as campanhas criadas pelo SmartAds. Alcance soma as campanhas, então a mesma pessoa vista em duas campanhas conta duas vezes. Visualizações são as vezes que os anúncios apareceram.",
    M,
    y,
    7.5,
    COR.fraco
  );

  const nome = `dados-gerais-${dados.periodo.dias}d-${dados.periodo.desde}.pdf`;
  doc.save(nome);
}
