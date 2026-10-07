import type { DadosRelatorioAds, TotaisAds } from "@/lib/relatorioAds";
import { formatarDiaExibicao } from "@/lib/tempoSaoPaulo";

// Gera o PDF do relatório de tráfego no navegador (jsPDF carregado só na hora do clique, pra não
// pesar o resto do app). Mesma paleta escura/índigo da tela: fundo "ink", cards em vidro, acento
// índigo — e os mesmos números da tela, vindos do mesmo objeto DadosRelatorioAds.

type RGB = [number, number, number];
const COR = {
  fundo: [7, 8, 10] as RGB,
  card: [21, 23, 29] as RGB,
  borda: [43, 46, 66] as RGB,
  texto: [243, 244, 246] as RGB,
  suave: [156, 163, 175] as RGB,
  fraco: [107, 114, 128] as RGB,
  acento: [129, 140, 248] as RGB,
  ok: [52, 211, 153] as RGB,
  ruim: [248, 113, 113] as RGB,
};

export const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
export const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
export const decimal = (n: number, casas = 2) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export interface CartaoKpi {
  rotulo: string;
  valor: string;
}

export function montarKpis(dados: DadosRelatorioAds): { destaque: CartaoKpi[]; engajamento: CartaoKpi[]; custos: CartaoKpi[] } {
  const t: TotaisAds = dados.totais;
  const perfil = t.visitasPerfilAnuncios ?? dados.instagram?.visitasPerfil ?? null;
  return {
    destaque: [
      { rotulo: "Alcance", valor: inteiro(t.alcance) },
      { rotulo: "Impressões", valor: inteiro(t.impressoes) },
      { rotulo: "Engajamentos", valor: inteiro(t.engajamentos) },
      {
        rotulo: "Visitas ao perfil",
        valor: perfil === null ? "—" : inteiro(perfil),
      },
    ],
    engajamento: [
      { rotulo: "Curtidas", valor: inteiro(t.curtidas) },
      { rotulo: "Comentários", valor: inteiro(t.comentarios) },
      { rotulo: "Compartilhamentos", valor: inteiro(t.compartilhamentos) },
      { rotulo: "Salvamentos", valor: inteiro(t.salvamentos) },
    ],
    custos: [
      { rotulo: "Investido", valor: reais(t.gasto) },
      { rotulo: "Cliques no link", valor: inteiro(t.cliquesNoLink) },
      { rotulo: "CTR", valor: `${decimal(t.ctr)}%` },
      { rotulo: "CPM", valor: reais(t.cpm) },
    ],
  };
}

export async function baixarPdfRelatorioAds(dados: DadosRelatorioAds): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = doc.internal.pageSize.getWidth();
  const A = doc.internal.pageSize.getHeight();
  const M = 36;
  const W = L - M * 2;
  let y = 0;

  const fundo = () => {
    doc.setFillColor(...COR.fundo);
    doc.rect(0, 0, L, A, "F");
  };
  const texto = (t: string, x: number, yy: number, tam: number, cor: RGB, negrito = false, alinhar: "left" | "right" | "center" = "left") => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tam);
    doc.setTextColor(...cor);
    doc.text(t, x, yy, { align: alinhar });
  };
  const cartao = (x: number, yy: number, w: number, h: number) => {
    doc.setFillColor(...COR.card);
    doc.setDrawColor(...COR.borda);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, yy, w, h, 8, 8, "FD");
  };
  const garantir = (h: number) => {
    if (y + h > A - 40) {
      doc.addPage();
      fundo();
      y = M;
    }
  };
  const titulo = (t: string) => {
    garantir(34);
    texto(t.toUpperCase(), M, y + 10, 8.5, COR.acento, true);
    y += 20;
  };
  const linhaKpis = (kpis: CartaoKpi[]) => {
    garantir(62);
    const gap = 10;
    const w = (W - gap * (kpis.length - 1)) / kpis.length;
    kpis.forEach((k, i) => {
      const x = M + i * (w + gap);
      cartao(x, y, w, 52);
      texto(k.rotulo, x + 12, y + 18, 8.5, COR.suave);
      texto(k.valor, x + 12, y + 38, 16, COR.texto, true);
    });
    y += 64;
  };

  fundo();
  y = M;

  // Cabeçalho
  cartao(M, y, W, 74);
  texto("SmartAds · Relatório de anúncios", M + 16, y + 20, 8.5, COR.acento, true);
  texto(dados.conta.clienteNome ? `${dados.conta.clienteNome} — ${dados.conta.contaNome}` : dados.conta.contaNome, M + 16, y + 42, 15, COR.texto, true);
  const sub = [
    dados.conta.instagramUsername ? `@${dados.conta.instagramUsername}` : null,
    dados.conta.paginaNome,
    `Conta ${dados.conta.adAccountId.replace("act_", "")}`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  texto(sub, M + 16, y + 58, 8.5, COR.suave);
  texto(`Últimos ${dados.periodo.dias} dias`, L - M - 16, y + 42, 11, COR.texto, true, "right");
  texto(`${formatarDiaExibicao(dados.periodo.desde)} a ${formatarDiaExibicao(dados.periodo.ate)}`, L - M - 16, y + 58, 8.5, COR.suave, false, "right");
  y += 90;

  const kpis = montarKpis(dados);

  if (dados.organico && dados.organico.length > 0) {
    titulo("Orgânico x tráfego");
    const porLinha = 4;
    const gap = 10;
    const w = (W - gap * (porLinha - 1)) / porLinha;
    for (let ini = 0; ini < dados.organico.length; ini += porLinha) {
      garantir(100);
      dados.organico.slice(ini, ini + porLinha).forEach((i, n) => {
        const x = M + n * (w + gap);
        cartao(x, y, w, 90);
        texto(i.rotulo, x + 12, y + 18, 8.5, COR.suave);
        texto(i.total === null ? "—" : inteiro(i.total), x + 12, y + 38, 18, COR.texto, true);
        if (i.total !== null && i.organico !== null && i.trafego !== null && i.total > 0) {
          const larg = w - 24;
          doc.setFillColor(...COR.acento);
          doc.roundedRect(x + 12, y + 47, larg, 4, 2, 2, "F");
          if (i.organico > 0) {
            doc.setFillColor(...COR.ok);
            doc.roundedRect(x + 12, y + 47, Math.max((i.organico / i.total) * larg, 3), 4, 2, 2, "F");
          }
          texto(`${inteiro(i.organico)} orgânico`, x + 12, y + 66, 7.5, COR.ok, true);
          texto(`${inteiro(i.trafego)} tráfego`, x + 12, y + 79, 7.5, COR.acento, true);
        } else {
          texto(
            i.total === null
              ? i.trafego !== null
                ? `${inteiro(i.trafego)} pelo tráfego`
                : "Meta não liberou"
              : "Total da conta (sem divisão)",
            x + 12,
            y + 64,
            7.5,
            COR.fraco
          );
        }
      });
      y += 102;
    }
  }

  titulo("Resultado do tráfego");
  linhaKpis(kpis.destaque);
  titulo("Engajamento");
  linhaKpis(kpis.engajamento);
  titulo("Investimento e cliques");
  linhaKpis(kpis.custos);

  if (dados.instagram && (dados.instagram.novosSeguidores !== null || dados.instagram.alcance !== null || dados.instagram.visitasPerfil !== null)) {
    titulo("Instagram (orgânico + pago)");
    linhaKpis([
      { rotulo: "Novos seguidores", valor: dados.instagram.novosSeguidores === null ? "—" : `${dados.instagram.novosSeguidores > 0 ? "+" : ""}${inteiro(dados.instagram.novosSeguidores)}` },
      { rotulo: "Alcance da conta", valor: dados.instagram.alcance === null ? "—" : inteiro(dados.instagram.alcance) },
      { rotulo: "Visitas ao perfil", valor: dados.instagram.visitasPerfil === null ? "—" : inteiro(dados.instagram.visitasPerfil) },
      { rotulo: "Frequência (anúncios)", valor: decimal(dados.totais.frequencia) },
    ]);
  }

  // Evolução diária — barras de alcance
  if (dados.serieDiaria.length > 1) {
    const h = 110;
    garantir(h + 28 + 24);
    titulo("Alcance por dia");
    cartao(M, y, W, h + 24);
    const serie = dados.serieDiaria;
    const max = Math.max(...serie.map((d) => d.alcance), 1);
    const areaX = M + 14;
    const areaW = W - 28;
    const passo = areaW / serie.length;
    const larg = Math.max(2, passo * 0.62);
    serie.forEach((d, i) => {
      const bh = (d.alcance / max) * (h - 22);
      doc.setFillColor(...COR.acento);
      doc.rect(areaX + i * passo + (passo - larg) / 2, y + 10 + (h - 22) - bh, larg, Math.max(bh, 0.5), "F");
    });
    const rotuloCada = Math.ceil(serie.length / 8);
    serie.forEach((d, i) => {
      if (i % rotuloCada === 0) texto(formatarDiaExibicao(d.dia), areaX + i * passo + passo / 2, y + h + 14, 7, COR.fraco, false, "center");
    });
    texto(`pico: ${inteiro(max)}`, L - M - 14, y + 16, 7.5, COR.suave, false, "right");
    y += h + 38;
  }

  // Campanhas
  if (dados.campanhas.length > 0) {
    garantir(100);
    titulo("Campanhas");
    const colunas = [
      { r: "Campanha", x: M + 12, a: "left" as const },
      { r: "Alcance", x: M + W * 0.52, a: "right" as const },
      { r: "Engaj.", x: M + W * 0.64, a: "right" as const },
      { r: "Cliques", x: M + W * 0.76, a: "right" as const },
      { r: "Investido", x: M + W - 12, a: "right" as const },
    ];
    const cabecalho = () => {
      colunas.forEach((c) => texto(c.r, c.x, y + 12, 8, COR.suave, true, c.a));
      y += 20;
    };
    garantir(60);
    cabecalho();
    for (const c of dados.campanhas.slice(0, 25)) {
      if (y + 22 > A - 40) {
        doc.addPage();
        fundo();
        y = M;
        cabecalho();
      }
      doc.setDrawColor(...COR.borda);
      doc.line(M, y, M + W, y);
      let nome = c.nome;
      doc.setFontSize(8.5);
      const maxNome = W * 0.4;
      while (nome.length > 4 && doc.getTextWidth(nome) > maxNome) nome = nome.slice(0, -2);
      if (nome !== c.nome) nome += "…";
      texto(nome, colunas[0].x, y + 14, 8.5, COR.texto);
      texto(inteiro(c.alcance), colunas[1].x, y + 14, 8.5, COR.texto, false, "right");
      texto(inteiro(c.engajamentos), colunas[2].x, y + 14, 8.5, COR.texto, false, "right");
      texto(inteiro(c.cliquesNoLink), colunas[3].x, y + 14, 8.5, COR.texto, false, "right");
      texto(reais(c.gasto), colunas[4].x, y + 14, 8.5, COR.texto, false, "right");
      y += 22;
    }
    y += 8;
  }

  if (dados.avisos.length > 0) {
    garantir(30 + dados.avisos.length * 11);
    dados.avisos.forEach((av) => {
      texto(`• ${av}`, M, y + 8, 7.5, COR.fraco);
      y += 11;
    });
  }

  // Rodapé em todas as páginas
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    texto(
      `Gerado pelo SmartAds em ${new Date(dados.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      M,
      A - 20,
      7,
      COR.fraco
    );
    texto(`${p}/${paginas}`, L - M, A - 20, 7, COR.fraco, false, "right");
  }

  const slug = (dados.conta.clienteNome || dados.conta.contaNome).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  doc.save(`relatorio-ads-${slug}-${dados.periodo.dias}d.pdf`);
}
