import { criarClienteAdmin } from "@/lib/supabase/admin";
import { adicionarDias, diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";

export interface DataComercial {
  id: string;
  nome: string;
  data: string; // AAAA-MM-DD
  antecedenciaDias: number;
}

export interface CampanhaDaRede {
  id: string;
  nome: string;
  inicio: string;
  fim: string; // início + soma da duração das etapas
  status: "ativa" | "encerrada";
  unidadesAplicadas: number;
}

export interface RegraBoostCalendario {
  id: string;
  nome: string;
  inicio: string;
  fim: string;
  tipoEntrega: string;
}

export interface AlertaCalendario {
  dataId: string;
  nome: string;
  data: string;
  /** Último dia pra começar a campanha e ela estar no ar a tempo. */
  comecarAte: string;
  diasParaComecar: number; // negativo = já passou
}

export interface CalendarioRede {
  empresaId: string;
  totalUnidades: number;
  datas: DataComercial[];
  campanhas: CampanhaDaRede[];
  regrasBoost: RegraBoostCalendario[];
  alertas: AlertaCalendario[];
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** n-ésimo dia da semana (0 = domingo) do mês (1-12). */
function enesimoDiaDaSemana(ano: number, mes: number, diaSemana: number, n: number): string {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
  const dia = 1 + ((diaSemana - primeiro + 7) % 7) + (n - 1) * 7;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Datas comerciais comuns no Brasil pro ano — sugestões que a pessoa adiciona com um clique. */
export function datasSugeridas(ano: number): Array<{ nome: string; data: string; antecedenciaDias: number }> {
  const quintaDeAcaoDeGracas = enesimoDiaDaSemana(ano, 11, 4, 4); // 4ª quinta de novembro
  return [
    { nome: "Dia Internacional da Mulher", data: `${ano}-03-08`, antecedenciaDias: 10 },
    { nome: "Páscoa", data: pascoa(ano), antecedenciaDias: 30 },
    { nome: "Dia das Mães", data: enesimoDiaDaSemana(ano, 5, 0, 2), antecedenciaDias: 21 },
    { nome: "Dia dos Namorados", data: `${ano}-06-12`, antecedenciaDias: 14 },
    { nome: "Dia do Chocolate", data: `${ano}-07-07`, antecedenciaDias: 10 },
    { nome: "Dia dos Pais", data: enesimoDiaDaSemana(ano, 8, 0, 2), antecedenciaDias: 14 },
    { nome: "Dia das Crianças", data: `${ano}-10-12`, antecedenciaDias: 14 },
    { nome: "Black Friday", data: adicionarDias(quintaDeAcaoDeGracas, 1), antecedenciaDias: 14 },
    { nome: "Natal", data: `${ano}-12-25`, antecedenciaDias: 30 },
  ];
}

export async function carregarCalendario(empresaId: string): Promise<CalendarioRede> {
  const supabase = criarClienteAdmin();
  const hoje = diaEmSaoPaulo(new Date().toISOString());
  const desde = adicionarDias(hoje, -45);

  const [{ data: datas }, { data: maes }, { data: regras }, { data: clientes }] = await Promise.all([
    supabase.from("smartads_calendario_rede").select("*").eq("empresa_id", empresaId).gte("data", desde).order("data"),
    supabase
      .from("smartads_campanhas_mae")
      .select("id, nome, data_inicio, status, smartads_estrategias(smartads_estrategia_etapas(duracao_dias))")
      .order("data_inicio"),
    supabase.from("smartads_boost_rede_regras").select("*").eq("empresa_id", empresaId).gte("data_fim", desde).order("data_inicio"),
    supabase.from("smartads_clientes").select("smartads_contas_meta(id, ativo)").eq("empresa_id", empresaId).eq("ativo", true),
  ]);

  const idsMae = (maes ?? []).map((m) => m.id);
  const { data: planos } = idsMae.length
    ? await supabase.from("smartads_planos_execucao").select("campanha_mae_id, conta_id").in("campanha_mae_id", idsMae)
    : { data: [] as Array<{ campanha_mae_id: string; conta_id: string }> };

  const campanhas: CampanhaDaRede[] = (maes ?? [])
    .map((m: any) => {
      const estrategia = Array.isArray(m.smartads_estrategias) ? m.smartads_estrategias[0] : m.smartads_estrategias;
      const dias = ((estrategia?.smartads_estrategia_etapas ?? []) as Array<{ duracao_dias: number }>).reduce(
        (t, e) => t + (e.duracao_dias ?? 0),
        0
      );
      const unidades = new Set((planos ?? []).filter((p) => p.campanha_mae_id === m.id).map((p) => p.conta_id));
      return {
        id: m.id as string,
        nome: m.nome as string,
        inicio: m.data_inicio as string,
        fim: adicionarDias(m.data_inicio, Math.max(dias - 1, 0)),
        status: m.status as "ativa" | "encerrada",
        unidadesAplicadas: unidades.size,
      };
    })
    .filter((c) => c.fim >= desde);

  const datasComerciais: DataComercial[] = (datas ?? []).map((d) => ({
    id: d.id,
    nome: d.nome,
    data: d.data,
    antecedenciaDias: d.antecedencia_dias,
  }));

  // Alerta: data comercial próxima (até 150 dias) sem nenhuma campanha oficial que cubra o período
  // de antecedência até a data.
  const alertas: AlertaCalendario[] = datasComerciais
    .filter((d) => d.data >= hoje && d.data <= adicionarDias(hoje, 150))
    .filter((d) => {
      const janelaIni = adicionarDias(d.data, -d.antecedenciaDias);
      return !campanhas.some((c) => c.inicio <= d.data && c.fim >= janelaIni);
    })
    .map((d) => {
      const comecarAte = adicionarDias(d.data, -d.antecedenciaDias);
      const dias = Math.round((new Date(`${comecarAte}T00:00:00Z`).getTime() - new Date(`${hoje}T00:00:00Z`).getTime()) / 86_400_000);
      return { dataId: d.id, nome: d.nome, data: d.data, comecarAte, diasParaComecar: dias };
    });

  return {
    empresaId,
    totalUnidades: (clientes ?? []).reduce(
      (t: number, c: any) => t + (c.smartads_contas_meta ?? []).filter((x: any) => x.ativo).length,
      0
    ),
    datas: datasComerciais,
    campanhas,
    regrasBoost: (regras ?? []).map((r) => ({
      id: r.id,
      nome: r.nome,
      inicio: r.data_inicio,
      fim: r.data_fim,
      tipoEntrega: r.tipo_entrega,
    })),
    alertas,
  };
}
