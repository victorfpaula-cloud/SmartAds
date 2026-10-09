import { criarClienteAdmin } from "@/lib/supabase/admin";
import { mesAtualEmSaoPaulo } from "@/lib/tempoSaoPaulo";

export interface AporteUnidade {
  id: string;
  data: string; // AAAA-MM-DD
  valorCentavos: number;
  origem: "meta" | "manual";
  observacao: string | null;
}

export interface SugestaoInvestimento {
  tom: "ok" | "atencao" | "critico";
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
  investidoCentavos: number;
  aportes: AporteUnidade[];
  /** Gasto real do mês (só o mês corrente tem; meses passados ficam null). */
  gastoMesCentavos: number | null;
  saldoCentavos: number | null;
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

  if (u.investidoCentavos >= u.combinadoCentavos && u.combinadoCentavos > 0) {
    sugestoes.push({ tom: "ok", texto: "Combinado do mês cumprido." });
  } else if (faltaCombinado > 0) {
    sugestoes.push({
      tom: ehMesAtual ? "atencao" : "critico",
      texto: `Faltam ${reais(faltaCombinado)} pra completar o combinado de ${reais(u.combinadoCentavos)}.`,
    });
  }

  if (ehMesAtual) {
    const [ano, m] = mes.split("-").map(Number);
    const diasNoMes = new Date(ano, m, 0).getDate();
    const diaDoMes = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "2-digit" }).format(hoje));
    const diasRestantes = Math.max(0, diasNoMes - diaDoMes);

    if (u.gastoMesCentavos !== null && diaDoMes >= 5) {
      const ritmo = Math.round((u.gastoMesCentavos / diaDoMes) * diasNoMes);
      if (ritmo > u.combinadoCentavos * 1.1) {
        sugestoes.push({
          tom: "atencao",
          texto: `No ritmo atual o gasto fecha o mês em ~${reais(ritmo)}, acima do combinado (${reais(u.combinadoCentavos)}). Vale ajustar o combinado ou reduzir o ritmo.`,
        });
      }
      if (u.saldoCentavos !== null && diasRestantes > 0) {
        const aindaVaiGastar = Math.round((u.gastoMesCentavos / diaDoMes) * diasRestantes);
        if (aindaVaiGastar > u.saldoCentavos) {
          sugestoes.push({
            tom: "critico",
            texto: `O saldo (${reais(Math.max(u.saldoCentavos, 0))}) não cobre o resto do mês: recarregar ~${reais(aindaVaiGastar - Math.max(u.saldoCentavos, 0))} evita as campanhas pararem.`,
          });
        }
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
      .select("id, conta_id, data, valor_centavos, origem, observacao")
      .in("conta_id", ids)
      .gte("data", inicio)
      .lt("data", proximoMes)
      .order("data", { ascending: false }),
    supabase.from("smartads_meta_mensal").select("conta_id, valor_centavos").eq("mes", mes).in("conta_id", ids),
    supabase
      .from("smartads_financeiro_cache")
      .select("conta_id, saldo_disponivel_centavos, gasto_mes_centavos, conta_pre_paga")
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
      investidoCentavos: lista.reduce((t, a) => t + a.valor_centavos, 0),
      aportes: lista.map((a) => ({
        id: a.id,
        data: a.data,
        valorCentavos: a.valor_centavos,
        origem: a.origem as "meta" | "manual",
        observacao: a.observacao ?? null,
      })),
      gastoMesCentavos: mesAtual ? fin?.gasto_mes_centavos ?? null : null,
      saldoCentavos: fin?.saldo_disponivel_centavos ?? null,
    };
    unidades.push({ ...base, sugestoes: gerarSugestoes(base, mes) });
  }
  return { mes, mesAtual, unidades };
}
