// PDF do detalhe de postagens de UMA unidade (o que a tela "Radar de posts → card" mostra), gerado no
// navegador com jsPDF — mesma paleta escura dos outros relatórios.

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

export interface DiaDetalheRadar {
  dia: string;
  tipo: "alerta" | "post" | "vazio";
  /** "OK · 14:32" ou "Post 1 · 09:10" */
  posts: string[];
  stories: string;
  alerta?: string;
}

export interface DadosDetalheRadar {
  unidade: string;
  instagram: string | null;
  resumo: Array<{ selo: string; midia: string; texto: string }>;
  dias: DiaDetalheRadar[];
  geradoEm: string;
}

export async function baixarPdfDetalheRadar(d: DadosDetalheRadar): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = doc.internal.pageSize.getWidth();
  const A = doc.internal.pageSize.getHeight();
  const M = 36;
  const W = L - M * 2;

  doc.setFillColor(...COR.fundo);
  doc.rect(0, 0, L, A, "F");
  const texto = (t: string, x: number, y: number, tam: number, cor: RGB, negrito = false, alinhar: "left" | "right" = "left") => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tam);
    doc.setTextColor(...cor);
    doc.text(t, x, y, { align: alinhar });
  };
  const cartao = (x: number, y: number, w: number, h: number) => {
    doc.setFillColor(...COR.card);
    doc.setDrawColor(...COR.borda);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, w, h, 8, 8, "FD");
  };

  let y = M;
  cartao(M, y, W, 64);
  texto("SmartAds · Radar de posts", M + 16, y + 20, 8.5, COR.acento, true);
  texto(d.unidade, M + 16, y + 42, 16, COR.texto, true);
  if (d.instagram) texto(`@${d.instagram}`, L - M - 16, y + 42, 10, COR.suave, false, "right");
  y += 80;

  if (d.resumo.length > 0) {
    const h = 14 + d.resumo.length * 22;
    cartao(M, y, W, h);
    d.resumo.forEach((r, i) => {
      const yy = y + 24 + i * 22;
      texto(r.selo, M + 16, yy, 9, COR.acento, true);
      texto(r.midia, M + 170, yy, 9.5, COR.texto, true);
      texto(r.texto, M + 250, yy, 9.5, COR.suave);
    });
    y += h + 16;
  }

  // 30 dias em duas colunas
  const metade = Math.ceil(d.dias.length / 2);
  const colunas = [d.dias.slice(0, metade), d.dias.slice(metade)];
  const colW = (W - 12) / 2;
  const altLinha = 26;
  const altCard = Math.max(...colunas.map((c) => c.length)) * altLinha + 8;
  colunas.forEach((coluna, ci) => {
    const x = M + ci * (colW + 12);
    cartao(x, y, colW, altCard);
    coluna.forEach((dia, i) => {
      const yy = y + 4 + i * altLinha;
      if (i > 0) {
        doc.setDrawColor(...COR.borda);
        doc.line(x + 10, yy, x + colW - 10, yy);
      }
      if (dia.tipo === "alerta") {
        doc.setFillColor(...COR.ruim);
        doc.rect(x, yy + 2, 2.5, altLinha - 4, "F");
        texto(`${dia.dia} — ${dia.alerta ?? "atenção"}`, x + 12, yy + 17, 8.5, COR.ruim, true);
        return;
      }
      texto(dia.dia, x + 12, yy + 17, 8.5, dia.tipo === "post" ? COR.suave : COR.fraco);
      texto(dia.tipo === "post" ? dia.posts.join("  ·  ") : "—", x + colW * 0.34, yy + 17, 8.5, dia.tipo === "post" ? COR.ok : COR.fraco, dia.tipo === "post");
      texto(dia.stories, x + colW - 12, yy + 17, 8, COR.fraco, false, "right");
    });
  });
  y += altCard + 16;

  texto(`Gerado pelo SmartAds em ${new Date(d.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · últimos 30 dias`, M, A - 22, 7.5, COR.fraco);

  const slug = d.unidade.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  doc.save(`radar-de-posts-${slug}.pdf`);
}
