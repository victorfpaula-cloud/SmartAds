import { criarClienteAdmin } from "@/lib/supabase/admin";
import { mesAtualEmSaoPaulo } from "@/lib/tempoSaoPaulo";

export interface AporteUnidade {
  id: string;
  data: string; // AAAA-MM-DD
  /** O que a unidade pagou (a recarga que a Meta registra, ou o valor lançado à mão). */
  valorCentavos: number;
  /** O que caiu de crédito na conta depois de impostos/taxas, quando informado (null = igual ao pago). */
  valorCreditadoCentavos: number | null;
  origem: "meta" | "manual";
  observacao: string | null;
}

export interface SugestaoInvestimento {
  tom: "ok" | "neutro" | "atencao" | "critico";
  texto: string;
}

export interface InvestimentoUnidade {
  contaId: string;
  clienteNome: string;
  empresaNome: string;
  contaNome: string;
  /** Valor mensal de sempre da unidade (ex.: R$500; São Paulo pode ser R$1.000). */
  padraoMensalCentavos: number;
  /** Combinado DESTE mês — o padrão, ou um valor específico só pra esse mês. */
  combinadoCentavos: number;
  combinadoEspecial: boolean;
  /** Soma do que foi creditado (quando informado) ou pago (quando não). */
  investidoCentavos: number;
  /** Soma do que foi pago, sem descontar impostos/taxas. */
  pagoCentavos: number;
  aportes: AporteUnidade[];
  /** Gasto real do mês (só o mês corrente tem; meses passados ficam null). */
  gastoMesCentavos: number | null;
  saldoCentavos: number | null;
  /** Projeção de fechamento do mês e ritmo diário, do mesmo cache do Financeiro. */
  projecaoMesCentavos: number | null;
  mediaDiariaCentavos: number | null;
  /** Só conta pré-paga fica sem campanhas quando o saldo acaba; cartão é cobrado depois. */
  prePaga: boolean | null;
  sugestoes: SugestaoInvestimento[];
}

export interface ResumoInvestimentos {
  mes: string;
  mesAtual: boolean;
  unidades: InvestimentoUnidade[];
}

const reais = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

/** Sugestões simples e explicáveis, só a partir de números que o app já tem (nada de palpite). */
export function gerarSugestoes(u: Omit<InvestimentoUnidade, "sugestoes">, mes: string, hoje = new Date()): SugestaoInvestimento[] {
  const sugestoes: SugestaoInvestimento[] = [];
  const ehMesAtual = mes === mesAtualEmSaoPaulo(hoje);
  const faltaCombinado = u.combinadoCentavos - u.investidoCentavos;
  const [ano, m] = mes.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const diaDoMes = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "2-digit" }).format(hoje));
  const diasRestantes = ehMesAtual ? Math.max(0, diasNoMes - diaDoMes) : 0;

  if (u.investidoCentavos >= u.combinadoCentavos && u.combinadoCentavos > 0) {
    sugestoes.push({ tom: "ok", texto: "Combinado do mês cumprido." });
  } else if (faltaCombinado > 0) {
    // Mês passado sem completar é falha; mês corrente só vira alerta na última semana (antes disso é só andamento).
    const tom: SugestaoInvestimento["tom"] = !ehMesAtual ? "critico" : diasRestantes <= 7 ? "atencao" : "neutro";
    sugestoes.push({
      tom,
      texto: ehMesAtual
        ? `Investido ${reais(u.investidoCentavos)} de ${reais(u.combinadoCentavos)} — faltam ${reais(faltaCombinado)} até o dia ${diasNoMes}.`
        : `Faltaram ${reais(faltaCombinado)} pra completar o combinado de ${reais(u.combinadoCentavos)}.`,
    });
  }

  if (ehMesAtual) {
    // O combinado é um valor mínimo a investir: gastar acima dele não é problema, só vale saber.
    if (u.projecaoMesCentavos !== null && diaDoMes >= 5 && u.projecaoMesCentavos > u.combinadoCentavos * 1.1) {
      sugestoes.push({
        tom: "neutro",
        texto: `No ritmo atual o gasto fecha o mês em ~${reais(u.projecaoMesCentavos)}, acima do combinado (${reais(u.combinadoCentavos)}).`,
      });
    }
    // Saldo que não cobre o resto do mês: só faz sentido em conta pré-paga (cartão não "fica sem saldo").
    if (u.prePaga !== false && u.saldoCentavos !== null && u.mediaDiariaCentavos !== null && u.mediaDiariaCentavos > 0 && diasRestantes > 0) {
      const aindaVaiGastar = Math.round(u.mediaDiariaCentavos * diasRestantes);
      const saldo = Math.max(u.saldoCentavos, 0);
      if (aindaVaiGastar > saldo) {
        sugestoes.push({
          tom: "critico",
          texto: `No ritmo dos últimos dias, o saldo (${reais(saldo)}) não cobre o resto do mês: faltam ~${reais(aindaVaiGastar - saldo)} pra as campanhas não pararem.`,
        });
      }
    }
  }
  return sugestoes;
}

export async function carregarInvestimentos(mes: string, empresaId?: string): Promise<ResumoInvestimentos> {
  const supabase = criarClienteAdmin();
  const inicio = `${mes}-01`;
  const [ano, m] = mes.split("-").map(Number);
  const proximoMes = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, "0")}-01`;

  let consulta = supabase
    .from("smartads_clientes")
    .select("id, nome, smartads_empresas(id, nome, tipo), smartads_contas_meta(id, nome_exibicao, meta_ad_account_nome, meta_ad_account_id, ativo, orcamento_mensal_centavos)")
    .eq("ativo", true)
    .order("nome");
  if (empresaId) consulta = consulta.eq("empresa_id", empresaId);
  const { data: clientes } = await consulta;

  const contas = ((clientes ?? []) as any[]).flatMap((cl) =>
    (cl.smartads_contas_meta ?? [])
      .filter((c: any) => c.ativo)
      .map((c: any) => ({ cl, c }))
  );
  const ids = contas.map(({ c }) => c.id as string);

  const [{ data: aportes }, { data: metas }, { data: financeiro }] = await Promise.all([
    supabase
      .from("smartads_investimentos")
      .select("id, conta_id, data, valor_centavos, valor_creditado_centavos, origem, observacao")
      .in("conta_id", ids)
      .gte("data", inicio)
      .lt("data", proximoMes)
      .order("data", { ascending: false }),
    supabase.from("smartads_meta_mensal").select("conta_id, valor_centavos").eq("mes", mes).in("conta_id", ids),
    supabase
      .from("smartads_financeiro_cache")
      .select("conta_id, saldo_disponivel_centavos, gasto_mes_centavos, gasto_mes_ref, projecao_mensal_centavos, media_diaria_centavos, conta_pre_paga")
      .in("conta_id", ids),
  ]);

  const mesAtual = mes === mesAtualEmSaoPaulo();
  const unidades: InvestimentoUnidade[] = [];
  for (const { cl, c } of contas) {
    const lista = (aportes ?? []).filter((a) => a.conta_id === c.id);
    const meta = (metas ?? []).find((x) => x.conta_id === c.id);
    const fin = (financeiro ?? []).find((f) => f.conta_id === c.id);
    const padrao = c.orcamento_mensal_centavos ?? 50000;
    const combinado = meta?.valor_centavos ?? padrao;
    const base = {
      contaId: c.id as string,
      clienteNome: cl.nome as string,
      empresaNome: (Array.isArray(cl.smartads_empresas) ? cl.smartads_empresas[0] : cl.smartads_empresas)?.nome ?? "—",
      contaNome: (c.nome_exibicao || c.meta_ad_account_nome || c.meta_ad_account_id) as string,
      padraoMensalCentavos: padrao as number,
      combinadoCentavos: combinado as number,
      combinadoEspecial: Boolean(meta),
      investidoCentavos: lista.reduce((t, a) => t + (a.valor_creditado_centavos ?? a.valor_centavos), 0),
      pagoCentavos: lista.reduce((t, a) => t + a.valor_centavos, 0),
      aportes: lista.map((a) => ({
        id: a.id,
        data: a.data,
        valorCentavos: a.valor_centavos,
        valorCreditadoCentavos: a.valor_creditado_centavos ?? null,
        origem: a.origem as "meta" | "manual",
        observacao: a.observacao ?? null,
      })),
      gastoMesCentavos: mesAtual && fin?.gasto_mes_ref === mes ? fin?.gasto_mes_centavos ?? null : null,
      saldoCentavos: fin?.saldo_disponivel_centavos ?? null,
      projecaoMesCentavos: mesAtual && fin?.gasto_mes_ref === mes ? fin?.projecao_mensal_centavos ?? null : null,
      mediaDiariaCentavos: mesAtual ? fin?.media_diaria_centavos ?? null : null,
      prePaga: fin?.conta_pre_paga ?? null,
    };
    unidades.push({ ...base, sugestoes: gerarSugestoes(base, mes) });
  }
  return { mes, mesAtual, unidades };
}
