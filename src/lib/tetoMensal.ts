import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  campanhaAtivaAgora,
  listarCampanhas,
  listarConjuntosDaConta,
  obterInsightsConta,
} from "@/lib/meta/api";
import { mesAtualEmSaoPaulo } from "@/lib/tempoSaoPaulo";

/** Teto de gasto mensal de uma unidade (ex.: Ribeirão Preto, R$ 1.000/mês em tráfego).
 *
 * Projeção = o que já gastou no mês + o que as campanhas JÁ no ar ainda vão gastar até o fim do mês
 * (orçamento diário × dias restantes, respeitando a data de término) + a campanha que está sendo
 * criada agora. É uma estimativa pelos orçamentos configurados (a Meta pode gastar até ~25% a mais
 * num dia), não um limite imposto pela Meta — o bloqueio é do SmartAds ao CRIAR campanha. */

export interface SituacaoTeto {
  tetoCentavos: number | null;
  gastoMesCentavos: number | null;
  /** O que as campanhas ativas ainda devem gastar até o fim do mês. */
  comprometidoCentavos: number;
  /** O que a campanha nova (em criação) vai gastar ainda neste mês. */
  novoCentavos: number;
  projetadoCentavos: number;
  /** Quanto cabe de orçamento novo (teto - gasto - comprometido); negativo = já passou. */
  folgaCentavos: number | null;
  estoura: boolean;
  /** Fonte do gasto: leitura ao vivo na Meta ou o último cache. */
  gastoAoVivo: boolean;
}

export interface OrcamentoNovo {
  tipo: "diario" | "vitalicio";
  valorCentavos: number;
  dataInicio?: string;
  dataFim?: string;
}

const DIA_MS = 86_400_000;

function fimDoMesSP(agora: Date): Date {
  const [ano, mes] = mesAtualEmSaoPaulo(agora).split("-").map(Number);
  const prox = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  return new Date(`${prox}-01T00:00:00-03:00`);
}

/** Dias (fracionados) entre dois instantes, nunca negativo. */
function diasEntre(de: number, ate: number): number {
  return Math.max(0, (ate - de) / DIA_MS);
}

/** Quanto um orçamento ainda gasta entre agora e o fim do mês. */
export function gastoRestanteNoMes(
  orc: { tipo: "diario" | "vitalicio"; valorCentavos: number; inicio?: Date | null; fim?: Date | null },
  agora: Date
): number {
  const eom = fimDoMesSP(agora).getTime();
  const de = Math.max(agora.getTime(), orc.inicio?.getTime() ?? 0);
  const ate = Math.min(eom, orc.fim?.getTime() ?? eom);
  const diasNoMes = diasEntre(de, ate);
  if (diasNoMes <= 0) return 0;
  if (orc.tipo === "diario") return Math.round(orc.valorCentavos * diasNoMes);
  // Vitalício: distribui o valor pelo período todo e pega a parte que cai no que resta do mês.
  const inicioTotal = orc.inicio?.getTime() ?? agora.getTime();
  const fimTotal = orc.fim?.getTime() ?? eom;
  const total = diasEntre(inicioTotal, fimTotal);
  return total <= 0 ? orc.valorCentavos : Math.round(orc.valorCentavos * Math.min(1, diasNoMes / total));
}

export async function lerTetoDaConta(contaId: string): Promise<{ tetoCentavos: number | null; adAccountId: string } | null> {
  const { data } = await criarClienteAdmin()
    .from("smartads_contas_meta")
    .select("meta_ad_account_id, teto_mensal_centavos")
    .eq("id", contaId)
    .maybeSingle();
  if (!data) return null;
  return { tetoCentavos: (data.teto_mensal_centavos as number | null) ?? null, adAccountId: data.meta_ad_account_id as string };
}

/** Situação do teto da conta. Sem teto configurado devolve só os números (estoura = false). */
export async function calcularSituacaoTeto(
  contaId: string,
  novo?: OrcamentoNovo,
  agora = new Date()
): Promise<SituacaoTeto | null> {
  const conta = await lerTetoDaConta(contaId);
  if (!conta) return null;
  const db = criarClienteAdmin();

  // Gasto do mês: leitura ao vivo; se a Meta falhar, usa o último cache do Financeiro.
  let gasto: number | null = null;
  let aoVivo = false;
  try {
    const linhas = await obterInsightsConta(conta.adAccountId, { nivel: "account", datePreset: "this_month", porDia: false });
    gasto = Math.round(linhas.reduce((t, l) => t + Number(l.spend ?? 0), 0) * 100);
    aoVivo = true;
  } catch {
    const { data } = await db
      .from("smartads_financeiro_cache")
      .select("gasto_mes_centavos, gasto_mes_ref")
      .eq("conta_id", contaId)
      .maybeSingle();
    if (data?.gasto_mes_ref === mesAtualEmSaoPaulo(agora)) gasto = (data.gasto_mes_centavos as number | null) ?? null;
  }

  // Comprometido: campanhas ativas × orçamento dos conjuntos ativos até o fim do mês.
  let comprometido = 0;
  try {
    const [{ campanhas }, conjuntos] = await Promise.all([
      listarCampanhas(conta.adAccountId, { limit: 100 }),
      listarConjuntosDaConta(conta.adAccountId),
    ]);
    const ativas = new Map(campanhas.filter((c) => campanhaAtivaAgora(c)).map((c) => [c.id, c]));
    for (const cj of conjuntos) {
      const camp = ativas.get(cj.campaign_id);
      if (!camp || cj.effective_status !== "ACTIVE") continue;
      const inicio = camp.start_time ? new Date(camp.start_time) : null;
      const fim = camp.stop_time ? new Date(camp.stop_time) : null;
      if (cj.daily_budget) comprometido += gastoRestanteNoMes({ tipo: "diario", valorCentavos: Number(cj.daily_budget), inicio, fim }, agora);
      else if (cj.lifetime_budget) comprometido += gastoRestanteNoMes({ tipo: "vitalicio", valorCentavos: Number(cj.lifetime_budget), inicio, fim }, agora);
    }
  } catch {
    // Sem a lista de campanhas segue só com o gasto — melhor um aviso incompleto que nenhum.
  }

  const novoCentavos = novo
    ? gastoRestanteNoMes(
        {
          tipo: novo.tipo,
          valorCentavos: novo.valorCentavos,
          inicio: novo.dataInicio ? new Date(novo.dataInicio) : null,
          fim: novo.dataFim ? new Date(novo.dataFim.length <= 10 ? `${novo.dataFim}T23:59:59-03:00` : novo.dataFim) : null,
        },
        agora
      )
    : 0;

  const projetado = (gasto ?? 0) + comprometido + novoCentavos;
  return {
    tetoCentavos: conta.tetoCentavos,
    gastoMesCentavos: gasto,
    comprometidoCentavos: comprometido,
    novoCentavos,
    projetadoCentavos: projetado,
    folgaCentavos: conta.tetoCentavos === null ? null : conta.tetoCentavos - (gasto ?? 0) - comprometido,
    estoura: conta.tetoCentavos !== null && projetado > conta.tetoCentavos,
    gastoAoVivo: aoVivo,
  };
}

const reais = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

export function mensagemTeto(s: SituacaoTeto): string {
  return (
    `Passa do teto de gasto do mês desta unidade (${reais(s.tetoCentavos ?? 0)}): já gastou ${reais(s.gastoMesCentavos ?? 0)}, ` +
    `as campanhas no ar ainda devem gastar ~${reais(s.comprometidoCentavos)} e esta nova ~${reais(s.novoCentavos)} ` +
    `(projeção ${reais(s.projetadoCentavos)}).`
  );
}
