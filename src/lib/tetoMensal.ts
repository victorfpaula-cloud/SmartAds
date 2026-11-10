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

export interface CampanhaNoPlano {
  id: string;
  nome: string;
  /** Soma do orçamento diário dos conjuntos ativos (0 quando é vitalício). */
  diarioCentavos: number;
  /** O que ainda deve gastar até o fim do mês. */
  restanteCentavos: number;
  /** Data de término da campanha (ISO) ou null = roda até pausar. */
  fim: string | null;
}

interface Coleta {
  tetoCentavos: number | null;
  gasto: number | null;
  aoVivo: boolean;
  campanhas: CampanhaNoPlano[];
  /** false = a Meta não devolveu a lista de campanhas (o comprometido fica incompleto). */
  campanhasLidas: boolean;
}

async function coletar(contaId: string, agora: Date): Promise<Coleta | null> {
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

  // Campanhas ativas × orçamento dos conjuntos ativos até o fim do mês.
  const campanhas: CampanhaNoPlano[] = [];
  let campanhasLidas = true;
  try {
    const [todas, conjuntos] = await Promise.all([
      (async () => {
        // Até 3 páginas (300 campanhas): uma ativa fora da 1ª página ficaria fora da projeção.
        const lista = [];
        let after: string | undefined;
        for (let i = 0; i < 3; i++) {
          const pagina = await listarCampanhas(conta.adAccountId, { limit: 100, after });
          lista.push(...pagina.campanhas);
          if (!pagina.proximoCursor) break;
          after = pagina.proximoCursor;
        }
        return lista;
      })(),
      listarConjuntosDaConta(conta.adAccountId),
    ]);
    const porId = new Map<string, CampanhaNoPlano>();
    const ativas = new Map(todas.filter((c) => campanhaAtivaAgora(c)).map((c) => [c.id, c]));
    for (const cj of conjuntos) {
      const camp = ativas.get(cj.campaign_id);
      if (!camp || cj.effective_status !== "ACTIVE") continue;
      const inicio = camp.start_time ? new Date(camp.start_time) : null;
      const fim = camp.stop_time ? new Date(camp.stop_time) : null;
      const linha = porId.get(camp.id) ?? { id: camp.id, nome: camp.name, diarioCentavos: 0, restanteCentavos: 0, fim: camp.stop_time ?? null };
      if (cj.daily_budget) {
        linha.diarioCentavos += Number(cj.daily_budget);
        linha.restanteCentavos += gastoRestanteNoMes({ tipo: "diario", valorCentavos: Number(cj.daily_budget), inicio, fim }, agora);
      } else if (cj.lifetime_budget) {
        linha.restanteCentavos += gastoRestanteNoMes({ tipo: "vitalicio", valorCentavos: Number(cj.lifetime_budget), inicio, fim }, agora);
      }
      porId.set(camp.id, linha);
    }
    campanhas.push(...[...porId.values()].sort((x, y) => y.restanteCentavos - x.restanteCentavos));
  } catch {
    // Sem a lista de campanhas segue só com o gasto — melhor um aviso incompleto que nenhum.
    campanhasLidas = false;
  }
  return { tetoCentavos: conta.tetoCentavos, gasto, aoVivo, campanhas, campanhasLidas };
}

/** Situação do teto da conta. Sem teto configurado devolve só os números (estoura = false). */
export async function calcularSituacaoTeto(
  contaId: string,
  novo?: OrcamentoNovo,
  agora = new Date()
): Promise<SituacaoTeto | null> {
  const c = await coletar(contaId, agora);
  if (!c) return null;
  const comprometido = c.campanhas.reduce((t, x) => t + x.restanteCentavos, 0);
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
  const projetado = (c.gasto ?? 0) + comprometido + novoCentavos;
  return {
    tetoCentavos: c.tetoCentavos,
    gastoMesCentavos: c.gasto,
    comprometidoCentavos: comprometido,
    novoCentavos,
    projetadoCentavos: projetado,
    folgaCentavos: c.tetoCentavos === null ? null : c.tetoCentavos - (c.gasto ?? 0) - comprometido,
    estoura: c.tetoCentavos !== null && projetado > c.tetoCentavos,
    gastoAoVivo: c.aoVivo,
  };
}

export interface PlanoTeto {
  tetoCentavos: number | null;
  gastoMesCentavos: number | null;
  comprometidoCentavos: number;
  projetadoCentavos: number;
  /** Quanto ainda dá pra gastar no mês (teto − gasto), nunca negativo. */
  disponivelCentavos: number | null;
  diasRestantes: number;
  /** Soma do orçamento diário das campanhas ativas. */
  ritmoDiarioCentavos: number;
  /** Orçamento diário total que fecha o mês exatamente no teto. */
  ritmoIdealCentavos: number | null;
  /** Dia (AAAA-MM-DD) em que o teto é atingido no ritmo atual; null = não atinge neste mês. */
  dataDoTeto: string | null;
  status: "sem_teto" | "dentro" | "vai_passar" | "atingido";
  /** O que fazer, em ordem, pra fechar o mês dentro do teto. Só orientação: o app não pausa nada sozinho. */
  passos: string[];
  campanhas: CampanhaNoPlano[];
  campanhasLidas: boolean;
  gastoAoVivo: boolean;
}

/** Monta o plano a partir dos números já coletados (separado pra poder ser testado sem a Meta). */
export function montarPlanoTeto(
  c: { tetoCentavos: number | null; gasto: number | null; aoVivo: boolean; campanhas: CampanhaNoPlano[]; campanhasLidas: boolean },
  agora: Date
): PlanoTeto {
  const fimMes = fimDoMesSP(agora).getTime();
  const diasRestantes = diasEntre(agora.getTime(), fimMes);
  const gasto = c.gasto ?? 0;
  const comprometido = c.campanhas.reduce((t, x) => t + x.restanteCentavos, 0);
  const ritmo = c.campanhas.reduce((t, x) => t + x.diarioCentavos, 0);
  const projetado = gasto + comprometido;
  const base = {
    tetoCentavos: c.tetoCentavos,
    gastoMesCentavos: c.gasto,
    comprometidoCentavos: comprometido,
    projetadoCentavos: projetado,
    diasRestantes,
    ritmoDiarioCentavos: ritmo,
    campanhas: c.campanhas,
    campanhasLidas: c.campanhasLidas,
    gastoAoVivo: c.aoVivo,
  };
  if (c.tetoCentavos === null) {
    return { ...base, disponivelCentavos: null, ritmoIdealCentavos: null, dataDoTeto: null, status: "sem_teto", passos: [] };
  }
  const teto = c.tetoCentavos;
  const disponivel = Math.max(0, teto - gasto);
  const ideal = diasRestantes > 0 ? Math.floor(disponivel / diasRestantes) : 0;
  const passos: string[] = [];
  let status: PlanoTeto["status"] = "dentro";
  let dataDoTeto: string | null = null;

  if (gasto >= teto) {
    status = "atingido";
    passos.push(`O teto de ${reais(teto)} já foi atingido (gasto ${reais(gasto)}).`);
    if (c.campanhas.length > 0) {
      passos.push(`Pra não passar mais, pause as ${c.campanhas.length} campanha${c.campanhas.length !== 1 ? "s" : ""} no ar — elas ainda devem gastar ~${reais(comprometido)} até o fim do mês.`);
    } else {
      passos.push("Não há campanha no ar gastando. Novas campanhas e boosts ficam bloqueados até o mês virar ou o teto aumentar.");
    }
  } else if (projetado > teto) {
    status = "vai_passar";
    // Em quantos dias o disponível acaba: percorre as campanhas no ritmo diário (aproximação linear).
    if (ritmo > 0) {
      const dias = disponivel / ritmo;
      if (dias < diasRestantes) dataDoTeto = diaEmSaoPauloLocal(new Date(agora.getTime() + dias * DIA_MS));
    }
    const excesso = projetado - teto;
    passos.push(`No ritmo atual o mês fecha em ~${reais(projetado)}, ${reais(excesso)} acima do teto de ${reais(teto)}${dataDoTeto ? `; o teto é atingido por volta de ${dataBR(dataDoTeto)}` : ""}.`);
    passos.push(`Pra fechar dentro do teto, o orçamento diário somado precisa cair de ${reais(ritmo)} pra até ${reais(ideal)} por dia.`);
    // Sugestão concreta: pausar as de menor gasto restante primeiro até cobrir o excesso? Não —
    // mostra quanto cada uma libera e deixa a escolha com a pessoa.
    const maior = c.campanhas[0];
    if (maior) passos.push(`A campanha que mais pesa é "${maior.nome}" (~${reais(maior.restanteCentavos)} até o fim do mês). Pausar ou reduzir o orçamento dela é o ajuste que mais resolve.`);
    if (dataDoTeto) passos.push(`Outra opção: deixar tudo rodando e pausar as campanhas em ${dataBR(dataDoTeto)}, quando o teto for atingido.`);
  } else {
    const sobra = teto - projetado;
    passos.push(`Dentro do teto: projeção de ~${reais(projetado)} de ${reais(teto)}.`);
    if (sobra > 0 && diasRestantes >= 1) passos.push(`Ainda cabem ~${reais(sobra)} em campanhas novas neste mês (até ${reais(Math.floor(sobra / diasRestantes))} por dia a mais).`);
  }
  if (!c.campanhasLidas) passos.push("A Meta não devolveu a lista de campanhas agora — a projeção considera só o que já foi gasto.");
  return { ...base, disponivelCentavos: disponivel, ritmoIdealCentavos: ideal, dataDoTeto, status, passos };
}

export async function calcularPlanoTeto(contaId: string, agora = new Date()): Promise<PlanoTeto | null> {
  const c = await coletar(contaId, agora);
  return c ? montarPlanoTeto(c, agora) : null;
}

const diaEmSaoPauloLocal = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const dataBR = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

const reais = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

export function mensagemTeto(s: SituacaoTeto): string {
  return (
    `Passa do teto de gasto do mês desta unidade (${reais(s.tetoCentavos ?? 0)}): já gastou ${reais(s.gastoMesCentavos ?? 0)}, ` +
    `as campanhas no ar ainda devem gastar ~${reais(s.comprometidoCentavos)} e esta nova ~${reais(s.novoCentavos)} ` +
    `(projeção ${reais(s.projetadoCentavos)}).`
  );
}
