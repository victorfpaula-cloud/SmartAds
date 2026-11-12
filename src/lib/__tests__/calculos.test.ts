import { describe, expect, it } from "vitest";
import { reaisDigitadosParaCentavos } from "@/lib/valorEmReais";
import { calcularPrevisaoSaldo } from "@/lib/financeiro/previsaoSaldo";
import { diasRestantesNoMes } from "@/lib/financeiro/atualizarCacheFinanceiro";
import { gastoRestanteNoMes } from "@/lib/tetoMensal";
import { montarTargeting } from "@/lib/meta/api";
import { acessoDoUsuario } from "@/lib/acessoBase";

const sp = (iso: string) => new Date(`${iso}-03:00`);
const publico = { localizacoes: [{ tipo: "pais", codigo: "BR" }] } as never;

describe("valor digitado em reais", () => {
  it("entende o formato brasileiro", () => {
    expect(reaisDigitadosParaCentavos("1.000")).toBe(100000);
    expect(reaisDigitadosParaCentavos("1.234,56")).toBe(123456);
    expect(reaisDigitadosParaCentavos("500,5")).toBe(50050);
    expect(reaisDigitadosParaCentavos("R$ 500")).toBe(50000);
    expect(reaisDigitadosParaCentavos("abc")).toBeNull();
    expect(reaisDigitadosParaCentavos("")).toBeNull();
  });
});

describe("previsão de saldo", () => {
  it("calcula os dias e a gravidade", () => {
    expect(calcularPrevisaoSaldo(10000, 2000).dias).toBe(5);
    expect(calcularPrevisaoSaldo(10000, 2000).nivel).toBe("atencao");
    expect(calcularPrevisaoSaldo(5000, 2000).nivel).toBe("critico");
    expect(calcularPrevisaoSaldo(100000, 2000).nivel).toBe("ok");
  });
  it("não inventa previsão sem dado", () => {
    expect(calcularPrevisaoSaldo(null, 2000).dias).toBeNull();
    expect(calcularPrevisaoSaldo(null, 2000, new Date(), false).texto).toBe("Cartão");
    expect(calcularPrevisaoSaldo(10000, 0).dias).toBeNull();
    expect(calcularPrevisaoSaldo(0, 0).nivel).toBe("neutro");
    expect(calcularPrevisaoSaldo(0, 500).nivel).toBe("critico");
  });
});

describe("dias restantes no mês", () => {
  it("conta a parte de hoje que falta", () => {
    const r = diasRestantesNoMes(sp("2026-11-10T12:00:00"));
    expect(r.diasNoMes).toBe(30);
    expect(r.restantes).toBeCloseTo(20.5, 5);
    expect(diasRestantesNoMes(sp("2026-11-30T23:59:00")).restantes).toBeLessThan(0.01);
  });
});

describe("teto mensal: gasto que falta no mês", () => {
  const agora = sp("2026-11-10T12:00:00"); // faltam 20,5 dias
  it("orçamento diário sem fim vai até o fim do mês", () => {
    expect(gastoRestanteNoMes({ tipo: "diario", valorCentavos: 1000 }, agora)).toBe(20500);
  });
  it("orçamento diário respeita a data de término", () => {
    expect(gastoRestanteNoMes({ tipo: "diario", valorCentavos: 1000, fim: sp("2026-11-13T12:00:00") }, agora)).toBe(3000);
  });
  it("campanha que já terminou ou só começa no mês que vem não conta", () => {
    expect(gastoRestanteNoMes({ tipo: "diario", valorCentavos: 1000, fim: sp("2026-11-09T00:00:00") }, agora)).toBe(0);
    expect(gastoRestanteNoMes({ tipo: "diario", valorCentavos: 1000, inicio: sp("2026-12-02T00:00:00") }, agora)).toBe(0);
  });
  it("vitalício conta só a fatia que cai neste mês", () => {
    // 40 dias a partir de agora; 20,5 caem em novembro
    const fim = new Date(agora.getTime() + 40 * 86_400_000);
    expect(gastoRestanteNoMes({ tipo: "vitalicio", valorCentavos: 40000, inicio: agora, fim }, agora)).toBe(20500);
    // inteiro dentro do mês
    expect(gastoRestanteNoMes({ tipo: "vitalicio", valorCentavos: 40000, inicio: agora, fim: sp("2026-11-20T12:00:00") }, agora)).toBe(40000);
  });
});

describe("posicionamento das campanhas", () => {
  it("foto e carrossel: só feed do Instagram", () => {
    const t = montarTargeting(publico, false);
    expect(t.publisher_platforms).toEqual(["instagram"]);
    expect(t.instagram_positions).toEqual(["stream"]);
  });
  it("vídeo (Reels): feed + Reels; segunda tentativa só Reels", () => {
    expect(montarTargeting(publico, true).instagram_positions).toEqual(["stream", "reels"]);
    expect(montarTargeting(publico, true, "reels").instagram_positions).toEqual(["reels"]);
  });
  it("delivery: só Stories", () => {
    expect(montarTargeting(publico, false, "stories").instagram_positions).toEqual(["story"]);
  });
  it("também no Facebook nunca usa Facebook Stories sozinho", () => {
    expect(montarTargeting(publico, false, undefined, { video: false }).facebook_positions).toEqual(["feed"]);
    expect(montarTargeting(publico, true, undefined, { video: true }).facebook_positions).toEqual(["feed", "facebook_reels"]);
  });
});

describe("acesso do usuário", () => {
  it("sem papel é administrador", () => {
    const a = acessoDoUsuario({ email: "a@b.c", app_metadata: {} });
    expect(a.restrito).toBe(false);
    expect(a.podeEditar).toBe(true);
  });
  it("restrito só vê as empresas liberadas e não edita por padrão", () => {
    const a = acessoDoUsuario({ email: "r@b.c", app_metadata: { papel: "restrito", empresas: ["e1", 5] } });
    expect(a).toMatchObject({ restrito: true, empresas: ["e1"], podeEditar: false });
    expect(acessoDoUsuario({ app_metadata: { papel: "restrito", empresas: [], pode_editar: true } }).podeEditar).toBe(true);
  });
});

import { montarPlanoTeto } from "@/lib/tetoMensal";

describe("plano do teto mensal", () => {
  const agora = sp("2026-11-10T12:00:00"); // faltam 20,5 dias
  const camp = (diario: number) => ({ id: "c" + diario, nome: "Camp " + diario, diarioCentavos: diario, restanteCentavos: Math.round(diario * 20.5), fim: null });
  const base = { aoVivo: true, campanhasLidas: true };
  it("sem teto só informa", () => {
    const p = montarPlanoTeto({ ...base, tetoCentavos: null, gasto: 10000, campanhas: [camp(1000)] }, agora);
    expect(p.status).toBe("sem_teto");
    expect(p.projetadoCentavos).toBe(30500);
  });
  it("dentro do teto diz quanto ainda cabe", () => {
    const p = montarPlanoTeto({ ...base, tetoCentavos: 100000, gasto: 20000, campanhas: [camp(1000)] }, agora);
    expect(p.status).toBe("dentro");
    expect(p.dataDoTeto).toBeNull();
    expect(p.disponivelCentavos).toBe(80000);
  });
  it("vai passar: calcula o dia e o ritmo ideal", () => {
    // teto 1000, gastou 400, R$ 60/dia no ar → sobra 600 = 10 dias → 20/11
    const p = montarPlanoTeto({ ...base, tetoCentavos: 100000, gasto: 40000, campanhas: [camp(6000)] }, agora);
    expect(p.status).toBe("vai_passar");
    expect(p.dataDoTeto).toBe("2026-11-20");
    expect(p.ritmoIdealCentavos).toBe(Math.floor(60000 / 20.5));
    expect(p.passos.length).toBeGreaterThan(1);
  });
  it("atingido", () => {
    const p = montarPlanoTeto({ ...base, tetoCentavos: 100000, gasto: 100500, campanhas: [camp(1000)] }, agora);
    expect(p.status).toBe("atingido");
    expect(p.disponivelCentavos).toBe(0);
  });
});

import { ehCampanhaDeBoost } from "@/lib/alertas";

describe("alertas", () => {
  it("reconhece campanha de boost automático (não avisa que está terminando)", () => {
    expect(ehCampanhaDeBoost("🤖 (RP) Boost engajamento 03/11/2026")).toBe(true);
    expect(ehCampanhaDeBoost("🤖 Boost alcance 01/11/2026")).toBe(true);
    expect(ehCampanhaDeBoost("🤖 (RP) Ribeirão - Engajamento")).toBe(false);
    expect(ehCampanhaDeBoost(null)).toBe(false);
  });
});

import { ehPostOficial, palavrasDaLegenda, similaridadeLegendas } from "@/lib/automacao/postsOficiais";

describe("posts oficiais da rede (boost da franquia)", () => {
  const legenda = "Novidade na Dona Baunilha! O bolo de pote de ninho com nutella chegou 🍰 Peça já pelo iFood ou venha nos visitar #donabaunilha";
  const post = (id: string, caption: string, dia: string) => ({ id, caption, timestamp: `${dia}T15:00:00-03:00` });
  it("mesma legenda com @ e cidade diferentes conta como igual", () => {
    const a = palavrasDaLegenda(legenda + " @donabaunilha.ribeirao");
    const b = palavrasDaLegenda(legenda.replace("Novidade", "NOVIDADE") + " @donabaunilha.olimpia");
    expect(similaridadeLegendas(a, b)).toBeGreaterThanOrEqual(0.9);
  });
  it("oficial quando 2 outras unidades postaram igual (mesmo com atraso)", () => {
    const outras = new Map([
      ["ig1", [post("1", legenda, "2026-11-10")]],
      ["ig2", [post("2", legenda + " Unidade Olímpia", "2026-11-12")]],
      ["ig3", [post("3", "Bom dia! Hoje tem café fresquinho", "2026-11-11")]],
    ]);
    expect(ehPostOficial(post("x", legenda, "2026-11-11"), outras)).toBe(true);
  });
  it("basta uma outra unidade ter postado igual; legenda própria não é oficial", () => {
    const umaSo = new Map([["ig1", [post("1", legenda, "2026-11-11")]], ["ig2", [post("2", "Outra coisa totalmente diferente sobre o nosso café da manhã especial", "2026-11-10")]]]);
    expect(ehPostOficial(post("x", legenda, "2026-11-11"), umaSo)).toBe(true);
    const nenhuma = new Map([["ig2", [post("2", "Outra coisa totalmente diferente sobre o nosso café da manhã especial", "2026-11-10")]]]);
    expect(ehPostOficial(post("x", legenda, "2026-11-11"), nenhuma)).toBe(false);
    const todas = new Map([["ig1", [post("1", legenda, "2026-11-10")]], ["ig2", [post("2", legenda, "2026-11-10")]]]);
    expect(ehPostOficial(post("x", "Fotos do nosso evento de sábado com os clientes queridos da unidade", "2026-11-11"), todas)).toBe(false);
  });
  it("fora da janela de dias não conta; legenda curta nunca é oficial", () => {
    const longe = new Map([["ig1", [post("1", legenda, "2026-10-01")]], ["ig2", [post("2", legenda, "2026-10-02")]]]);
    expect(ehPostOficial(post("x", legenda, "2026-11-11"), longe)).toBe(false);
    const curtas = new Map([["ig1", [post("1", "Bom dia!", "2026-11-11")]], ["ig2", [post("2", "Bom dia!", "2026-11-11")]]]);
    expect(ehPostOficial(post("x", "Bom dia!", "2026-11-11"), curtas)).toBe(false);
  });
});

import { gerarInsights, somarLinhas, type AnaliseTrafego, type Metricas } from "@/lib/analiseTrafego";

describe("análise do tráfego", () => {
  const m = (gasto: number, alcance: number, curtidas: number, interacoes = curtidas * 3, impressoes = alcance * 1.3): Metricas => ({ gasto, alcance, impressoes, interacoes, curtidas, comentarios: 2, salvamentos: 1, compartilhamentos: 1, campanhas: 2 });
  const unidade = (nome: string, atual: Metricas, anterior: Metricas = atual) => ({
    contaId: nome, unidade: nome, erro: null, boostLigado: true, boostDiario: 10,
    atual: { boost: atual, tudo: atual }, anterior: { boost: anterior, tudo: anterior },
  });
  const analise = (u: ReturnType<typeof unidade>[]): AnaliseTrafego => ({ calculadoEm: "", periodo: { desde: "2026-11-05", ate: "2026-11-11" }, unidades: u });

  it("separa boost do resto pelas campanhas", () => {
    const r = somarLinhas([
      { campaign_name: "🤖 (OL) Boost engajamento 05/11/2026", spend: "10", reach: "1000", impressions: "1200", actions: [{ action_type: "post_reaction", value: "50" }] },
      { campaign_name: "🤖 Ribeirão - Engajamento", spend: "20", reach: "2000", impressions: "2500", actions: [{ action_type: "post_reaction", value: "30" }] },
    ]);
    expect(r.boost.gasto).toBe(10);
    expect(r.boost.curtidas).toBe(50);
    expect(r.tudo.gasto).toBe(30);
    expect(r.tudo.curtidas).toBe(80);
  });

  it("compara quem investe parecido e recomenda orçamento pra alcançar o líder", () => {
    const ins = gerarInsights(analise([unidade("Olímpia", m(70, 14000, 700)), unidade("Ribeirão", m(70, 10000, 350)), unidade("Bauru", m(140, 20000, 900))]), "boost");
    const textos = ins.map((i) => `${i.unidade}: ${i.titulo}`).join("\n");
    expect(textos).toContain("Ribeirão: Investe parecido com Olímpia, mas tem 100% menos curtidas por real");
    expect(textos).toMatch(/Ribeirão: .*Bauru/);
    expect(textos).toContain("Olímpia: Curtida mais barata da rede");
  });

  it("aponta saturação e piora contra a semana anterior", () => {
    const ins = gerarInsights(
      analise([unidade("A", m(70, 5000, 200, 600, 15000), m(70, 5000, 400)), unidade("B", m(70, 9000, 300))]),
      "boost"
    );
    expect(ins.some((i) => i.unidade === "A" && /saturado/.test(i.titulo))).toBe(true);
    expect(ins.some((i) => i.unidade === "A" && /mais cara que na semana anterior/.test(i.titulo))).toBe(true);
  });

  it("boost ligado sem gasto vira atenção; uma unidade só não compara", () => {
    const ins = gerarInsights(analise([unidade("A", m(0, 0, 0)), unidade("B", m(70, 9000, 300))]), "boost");
    expect(ins.some((i) => i.unidade === "A" && /não gastou/.test(i.titulo))).toBe(true);
    expect(ins.some((i) => /Só uma unidade/.test(i.titulo))).toBe(true);
  });
});
