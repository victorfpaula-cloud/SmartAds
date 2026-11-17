import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsRelatorio } from "@/lib/meta/api";
import { comContaMeta } from "@/lib/meta/conexao";
import { adicionarDias, diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import { mapearEmLotes } from "@/lib/lotes";

/** Ritmo do saldo por ciclo de recarga.
 *
 * Cada unidade recarrega num ritmo próprio (São Paulo: R$ 1.000 uma vez por mês; Olímpia: R$ 300–350
 * por semana). O dinheiro de uma recarga tem de durar até a próxima: o app mede quanto já foi gasto
 * desde a última recarga, quanto sobra, o ritmo de gasto dos últimos dias e diz se vai faltar (reduzir)
 * ou sobrar (dá pra aumentar), com o orçamento diário que fecha o ciclo certinho. Nada é alterado
 * sozinho: é orientação. */

export type CicloRecarga = "semanal" | "quinzenal" | "mensal";
export const DIAS_DO_CICLO: Record<CicloRecarga, number> = { semanal: 7, quinzenal: 15, mensal: 30 };
export const ROTULO_CICLO: Record<CicloRecarga, string> = { semanal: "Semanal (7 dias)", quinzenal: "Quinzenal (15 dias)", mensal: "Mensal (30 dias)" };

export interface EntradaCiclo {
  ciclo: CicloRecarga | null;
  /** Data (AAAA-MM-DD) da última recarga detectada ou lançada. */
  ultimaRecarga: string | null;
  /** Soma das recargas desse dia (em centavos; o creditado quando informado). */
  valorRecargaCentavos: number | null;
  /** Saldo real lido da Meta (conta pré-paga), quando existe. */
  saldoRealCentavos: number | null;
  /** Gasto desde o dia da recarga (inclusive) até agora. */
  gastoDesdeCentavos: number | null;
  /** Gasto médio por dia nos últimos dias completos (ritmo atual). */
  ritmoDiarioCentavos: number | null;
  /** Intervalo médio entre as últimas recargas (dias), pra sugerir o ciclo quando não está configurado. */
  intervaloMedioDias: number | null;
  boost: { ativo: boolean; orcamentoDiarioCentavos: number | null; duracaoDias: number; postsPorDia: number } | null;
  /** Agora em São Paulo (fração de dia conta). */
  agora: Date;
}

export interface ResultadoCiclo {
  ciclo: CicloRecarga | null;
  cicloSugerido: CicloRecarga | null;
  status: "sem_ciclo" | "sem_recarga" | "falta" | "sobra" | "ok" | "ciclo_encerrado";
  ultimaRecarga: string | null;
  proximaRecarga: string | null;
  diasDecorridos: number | null;
  diasRestantes: number | null;
  saldoCentavos: number | null;
  /** true = saldo calculado (recarga − gasto), não lido da Meta. */
  saldoEstimado: boolean;
  ritmoDiarioCentavos: number | null;
  /** Em quantos dias o saldo acaba no ritmo atual. */
  duraDias: number | null;
  /** Orçamento diário total que faz o saldo durar exatamente até a próxima recarga. */
  idealDiarioCentavos: number | null;
  /** Quanto sobra (positivo) ou falta (negativo) no fim do ciclo no ritmo atual. */
  saldoNoFimCentavos: number | null;
  titulo: string;
  passos: string[];
}

const R = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const D = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const DIA_MS = 86_400_000;
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const arredReais = (c: number) => Math.max(100, Math.round(c / 100) * 100);

export function sugerirCiclo(intervaloMedioDias: number | null): CicloRecarga | null {
  if (!intervaloMedioDias) return null;
  if (intervaloMedioDias <= 10) return "semanal";
  if (intervaloMedioDias <= 21) return "quinzenal";
  return "mensal";
}

/** A conta em si (pura — sem banco nem Meta, testável). */
export function calcularCiclo(e: EntradaCiclo): ResultadoCiclo {
  const cicloSugerido = sugerirCiclo(e.intervaloMedioDias);
  const base: ResultadoCiclo = {
    ciclo: e.ciclo,
    cicloSugerido,
    status: "sem_ciclo",
    ultimaRecarga: e.ultimaRecarga,
    proximaRecarga: null,
    diasDecorridos: null,
    diasRestantes: null,
    saldoCentavos: null,
    saldoEstimado: false,
    ritmoDiarioCentavos: e.ritmoDiarioCentavos,
    duraDias: null,
    idealDiarioCentavos: null,
    saldoNoFimCentavos: null,
    titulo: "",
    passos: [],
  };
  if (!e.ciclo) {
    return {
      ...base,
      titulo: "Defina de quanto em quanto tempo essa unidade recarrega",
      passos: [cicloSugerido ? `Pelas últimas recargas, parece ${ROTULO_CICLO[cicloSugerido].toLowerCase()}.` : "Escolha semanal, quinzenal ou mensal pra o app acompanhar se o saldo vai durar até a próxima recarga."],
    };
  }
  if (!e.ultimaRecarga) {
    return { ...base, status: "sem_recarga", titulo: "Nenhuma recarga encontrada ainda", passos: ["Assim que entrar uma recarga (lida da Meta ou lançada em Investimentos), o acompanhamento começa."] };
  }

  const diasCiclo = DIAS_DO_CICLO[e.ciclo];
  const inicio = new Date(`${e.ultimaRecarga}T00:00:00-03:00`).getTime();
  const decorridos = Math.max(0, (e.agora.getTime() - inicio) / DIA_MS);
  const restantes = diasCiclo - decorridos;
  const proxima = adicionarDias(e.ultimaRecarga, diasCiclo);

  const saldoEstimado = e.saldoRealCentavos === null;
  const saldo =
    e.saldoRealCentavos !== null
      ? Math.max(0, e.saldoRealCentavos)
      : e.valorRecargaCentavos !== null && e.gastoDesdeCentavos !== null
        ? Math.max(0, e.valorRecargaCentavos - e.gastoDesdeCentavos)
        : null;
  // Ritmo: o dos últimos dias; sem histórico, o médio desde a recarga.
  const ritmo = e.ritmoDiarioCentavos ?? (e.gastoDesdeCentavos !== null && decorridos >= 1 ? e.gastoDesdeCentavos / decorridos : null);

  const comum = { ...base, proximaRecarga: proxima, diasDecorridos: decorridos, diasRestantes: Math.max(0, restantes), saldoCentavos: saldo, saldoEstimado, ritmoDiarioCentavos: ritmo };
  if (saldo === null) {
    return { ...comum, status: "sem_recarga", titulo: "Não consegui calcular o saldo", passos: ["A Meta não informa o saldo dessa conta e o gasto desde a recarga não pôde ser lido agora."] };
  }
  const notaEstimado = saldoEstimado ? " (estimado: recarga menos o que já foi gasto; impostos podem deixar o valor real um pouco menor)" : "";

  if (restantes <= 0.5) {
    return {
      ...comum,
      status: "ciclo_encerrado",
      titulo: saldo > 2000 ? `Ciclo terminou e sobraram ${R(saldo)}` : "Ciclo terminou — hora da próxima recarga",
      passos: [
        `A recarga de ${dataBR(e.ultimaRecarga)} era pra durar até ${dataBR(proxima)}.`,
        saldo > 2000 ? `Ainda há ${R(saldo)}${notaEstimado}: dá pra usar antes da próxima recarga ou somar no próximo ciclo.` : "O saldo foi usado no tempo certo.",
      ],
    };
  }

  const ideal = saldo / restantes;
  const dura = ritmo && ritmo > 0 ? saldo / ritmo : null;
  const noFim = ritmo !== null ? saldo - ritmo * restantes : saldo;
  const resultado = { ...comum, duraDias: dura, idealDiarioCentavos: ideal, saldoNoFimCentavos: noFim };
  const passos: string[] = [
    `Saldo de ${R(saldo)}${notaEstimado} pra durar mais ${D(restantes)} dia${restantes >= 1.5 ? "s" : ""}, até a próxima recarga (${dataBR(proxima)}).`,
  ];
  if (ritmo !== null) passos.push(`Ritmo atual: ${R(ritmo)}/dia${dura !== null ? ` — no ritmo de hoje o saldo dura ~${D(dura)} dia${dura >= 1.5 ? "s" : ""}` : ""}.`);
  passos.push(`Orçamento diário que fecha o ciclo certinho: ~${R(arredReais(ideal))}/dia (somando boost e campanhas).`);
  if (e.boost?.ativo && e.boost.orcamentoDiarioCentavos) {
    const noAr = Math.max(1, e.boost.duracaoDias * Math.min(e.boost.postsPorDia, 3));
    passos.push(
      `Boost: com ${e.boost.duracaoDias} dias de duração e ${e.boost.postsPorDia >= 10 ? "todos os posts" : `${e.boost.postsPorDia} post${e.boost.postsPorDia > 1 ? "s" : ""}/dia`}, podem ficar até ${noAr} campanhas no ar ao mesmo tempo. Se o gasto for só do boost, ~${R(arredReais(ideal / noAr))}/dia por boost mantém esse ritmo (hoje: ${R(e.boost.orcamentoDiarioCentavos)}/dia).`
    );
  }

  if (dura !== null && dura < restantes * 0.85) {
    const falta = Math.max(0, -noFim);
    return {
      ...resultado,
      status: "falta",
      titulo: `Vai faltar: o saldo acaba ~${D(restantes - dura)} dia${restantes - dura >= 1.5 ? "s" : ""} antes da próxima recarga`,
      passos: [...passos, `Reduza o gasto de ${R(ritmo!)} para ~${R(arredReais(ideal))}/dia${falta > 0 ? ` (no ritmo atual faltariam ~${R(falta)})` : ""}.`],
    };
  }
  if (dura === null || (dura > restantes * 1.2 && noFim >= 2000)) {
    return {
      ...resultado,
      status: "sobra",
      titulo: ritmo ? `Vai sobrar ~${R(noFim)} no fim do ciclo` : "Saldo parado: nada está gastando",
      passos: [...passos, ritmo ? `Dá pra aumentar de ${R(ritmo)} para ~${R(arredReais(ideal))}/dia e usar o valor no tempo certo.` : `Nenhum gasto nos últimos dias. Com ~${R(arredReais(ideal))}/dia o saldo é usado até a próxima recarga.`],
    };
  }
  return { ...resultado, status: "ok", titulo: "No ritmo: o saldo dura até a próxima recarga", passos };
}

// ---------------------------------------------------------------------------------------------
// Coleta (banco + Meta) e cache
// ---------------------------------------------------------------------------------------------

export interface CicloDaConta extends ResultadoCiclo {
  contaId: string;
  unidade: string;
  prePaga: boolean | null;
  valorRecargaCentavos: number | null;
  calculadoEm: string;
}

/** Calcula o ciclo de uma lista de contas (lendo a Meta) e grava no cache. */
export async function calcularCiclosDasContas(contaIds: string[], agora = new Date()): Promise<CicloDaConta[]> {
  if (contaIds.length === 0) return [];
  const db = criarClienteAdmin();
  const hoje = diaEmSaoPaulo(agora.toISOString());
  const [{ data: contas }, { data: aportes }, { data: fin }] = await Promise.all([
    db
      .from("smartads_contas_meta")
      .select("id, meta_ad_account_id, ciclo_recarga, boost_automatico_ativo, boost_automatico_orcamento_centavos, boost_automatico_duracao_dias, boost_posts_por_dia, smartads_clientes(nome)")
      .in("id", contaIds),
    db
      .from("smartads_investimentos")
      .select("conta_id, data, valor_centavos, valor_creditado_centavos")
      .in("conta_id", contaIds)
      .gte("data", adicionarDias(hoje, -120))
      .order("data", { ascending: false }),
    db.from("smartads_financeiro_cache").select("conta_id, saldo_disponivel_centavos, conta_pre_paga").in("conta_id", contaIds),
  ]);
  const finPorConta = new Map((fin ?? []).map((f) => [f.conta_id as string, f]));

  const resultados = await mapearEmLotes(
    (contas ?? []) as any[],
    async (c): Promise<CicloDaConta> => {
      const cl = Array.isArray(c.smartads_clientes) ? c.smartads_clientes[0] : c.smartads_clientes;
      const lista = (aportes ?? []).filter((a) => a.conta_id === c.id);
      const ultima = (lista[0]?.data as string | undefined) ?? null;
      const valor = ultima ? lista.filter((a) => a.data === ultima).reduce((t, a) => t + ((a.valor_creditado_centavos as number | null) ?? (a.valor_centavos as number)), 0) : null;
      const datas = Array.from(new Set(lista.map((a) => a.data as string))).slice(0, 5);
      const intervalos = datas.slice(0, -1).map((d, i) => (new Date(d).getTime() - new Date(datas[i + 1]).getTime()) / DIA_MS);
      const intervaloMedio = intervalos.length ? intervalos.reduce((t, x) => t + x, 0) / intervalos.length : null;
      const f = finPorConta.get(c.id);
      const prePaga = (f?.conta_pre_paga as boolean | null) ?? null;
      const saldoReal = prePaga !== false ? ((f?.saldo_disponivel_centavos as number | null) ?? null) : null;

      // Gasto por dia desde a recarga (e os últimos dias completos, pro ritmo).
      let gastoDesde: number | null = null;
      let ritmo: number | null = null;
      if (ultima && c.ciclo_recarga) {
        try {
          const desde = [ultima, adicionarDias(hoje, -3)].sort()[0];
          const linhas = await comContaMeta(c.id, () =>
            obterInsightsRelatorio(c.meta_ad_account_id, { nivel: "account", desde, ate: hoje, porDia: true })
          );
          const porDia = new Map(linhas.map((l) => [l.date_start as string, Math.round(Number(l.spend ?? 0) * 100)]));
          gastoDesde = [...porDia.entries()].filter(([d]) => d >= ultima).reduce((t, [, v]) => t + v, 0);
          const completos = [1, 2, 3].map((k) => adicionarDias(hoje, -k)).filter((d) => d >= ultima);
          if (completos.length > 0) ritmo = completos.reduce((t, d) => t + (porDia.get(d) ?? 0), 0) / completos.length;
        } catch {
          // Sem a Meta agora: segue com o saldo real (se houver) e sem ritmo.
        }
      }
      const r = calcularCiclo({
        ciclo: (c.ciclo_recarga as CicloRecarga | null) ?? null,
        ultimaRecarga: ultima,
        valorRecargaCentavos: valor,
        saldoRealCentavos: saldoReal,
        gastoDesdeCentavos: gastoDesde,
        ritmoDiarioCentavos: ritmo,
        intervaloMedioDias: intervaloMedio,
        boost: c.boost_automatico_ativo
          ? { ativo: true, orcamentoDiarioCentavos: c.boost_automatico_orcamento_centavos ?? null, duracaoDias: c.boost_automatico_duracao_dias ?? 3, postsPorDia: c.boost_posts_por_dia ?? 1 }
          : null,
        agora,
      });
      return { ...r, contaId: c.id, unidade: cl?.nome ?? "—", prePaga, valorRecargaCentavos: valor, calculadoEm: agora.toISOString() };
    },
    6
  );

  const comCiclo = resultados.filter((r) => r.ciclo);
  if (comCiclo.length) {
    await db.from("smartads_ciclo_saldo_cache").upsert(comCiclo.map((r) => ({ conta_id: r.contaId, dados: r, calculado_em: r.calculadoEm })));
  }
  return resultados;
}

/** Contas ativas de uma empresa (sem repetir a mesma conta de anúncio). */
export async function contasDaEmpresa(empresaId: string): Promise<string[]> {
  const { data } = await criarClienteAdmin()
    .from("smartads_contas_meta")
    .select("id, meta_ad_account_id, smartads_clientes!inner(empresa_id, ativo, nome)")
    .eq("ativo", true)
    .eq("smartads_clientes.empresa_id", empresaId)
    .eq("smartads_clientes.ativo", true)
    .order("id");
  const vistas = new Set<string>();
  return (data ?? [])
    .filter((c) => {
      if (vistas.has(c.meta_ad_account_id as string)) return false;
      vistas.add(c.meta_ad_account_id as string);
      return true;
    })
    .map((c) => c.id as string);
}

export async function lerCiclosEmCache(contaIds: string[]): Promise<Map<string, CicloDaConta>> {
  if (contaIds.length === 0) return new Map();
  const { data } = await criarClienteAdmin().from("smartads_ciclo_saldo_cache").select("conta_id, dados").in("conta_id", contaIds);
  return new Map((data ?? []).map((l) => [l.conta_id as string, l.dados as CicloDaConta]));
}
