import { criarClienteAdmin } from "@/lib/supabase/admin";

/** Eventos de uma unidade: anotações gerais com data (ex.: "cliente pediu pra pausar as campanhas
 * por falta de saldo"). Ficam registrados e saem nos relatórios do período. */
export interface EventoUnidade {
  id: string;
  contaId: string;
  data: string; // AAAA-MM-DD
  texto: string;
}

const linha = (r: { id: string; conta_id: string; data: string; texto: string }): EventoUnidade => ({
  id: r.id,
  contaId: r.conta_id,
  data: r.data,
  texto: r.texto,
});

/** Eventos das contas informadas dentro do período (datas inclusive), mais recentes primeiro. */
export async function listarEventosDasContas(contaIds: string[], desde: string, ate: string): Promise<EventoUnidade[]> {
  if (contaIds.length === 0) return [];
  const { data, error } = await criarClienteAdmin()
    .from("smartads_unidade_eventos")
    .select("id, conta_id, data, texto")
    .in("conta_id", contaIds)
    .gte("data", desde)
    .lte("data", ate)
    .order("data", { ascending: false })
    .limit(1000);
  if (error) throw new Error("Não consegui ler os eventos da unidade.");
  return (data ?? []).map(linha);
}
