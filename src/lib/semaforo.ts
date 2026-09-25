import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsConta } from "@/lib/meta/api";
import { mapearEmLotes } from "@/lib/lotes";

export type CorSemaforo = "verde" | "amarelo" | "vermelho";

export interface UnidadeSemaforo {
  clienteId: string;
  clienteNome: string;
  contaId: string;
  contaNome: string;
  spend7dias: number;
  ctr7dias: number;
  cor: CorSemaforo;
  motivo: string;
  /** Quando o cache foi calculado (ver recalcularSemaforo) — null se essa unidade ainda nunca
   * passou pelo cron. */
  calculadoEm: string | null;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 === 0 ? (ordenado[meio - 1] + ordenado[meio]) / 2 : ordenado[meio];
}

/** Verde/amarelo/vermelho por unidade, baseado no desvio da MEDIANA DA REDE (não um limiar fixo)
 * — só faz sentido porque várias unidades da MESMA empresa franquia usam o mesmo molde de
 * estratégia; o que é "normal" de CTR muda por setor/público, então comparar contra a própria
 * rede é mais honesto que um número mágico universal. Empresas do tipo "individual" não entram
 * aqui — não tem rede pra comparar, e comparar contra o negócio de outro cliente seria enganoso.
 * A mediana também é calculada só dentro de cada empresa franquia, nunca misturando redes
 * diferentes. Sem campanha ativa na semana já é vermelho direto, independente de mediana. */
function classificar(spend7dias: number, ctr7dias: number, medianaCtr: number | null): { cor: CorSemaforo; motivo: string } {
  if (spend7dias === 0) {
    return { cor: "vermelho", motivo: "Sem campanha ativa nos últimos 7 dias." };
  }
  if (medianaCtr === null || medianaCtr === 0) {
    return { cor: "verde", motivo: "Sem outras unidades pra comparar ainda." };
  }
  const razao = ctr7dias / medianaCtr;
  if (razao < 0.7) {
    return { cor: "vermelho", motivo: `CTR bem abaixo da mediana da rede (${(razao * 100).toFixed(0)}%).` };
  }
  if (razao < 0.9) {
    return { cor: "amarelo", motivo: `CTR um pouco abaixo da mediana da rede (${(razao * 100).toFixed(0)}%).` };
  }
  return { cor: "verde", motivo: "Dentro ou acima da mediana da rede." };
}

/** Recalcula o semáforo de TODAS as unidades de franquia batendo na Meta — só é chamado pelo cron
 * diário (ver /api/cron/semaforo e vercel.json), nunca por uma visita à tela. Antes disso, a tela
 * batia na Meta pra cada unidade a cada acesso (sem cache nenhum) — a rota mais cara do app em
 * invocações de function. Grava o resultado em smartads_semaforo_cache; calcularSemaforo (abaixo)
 * só lê esse cache. Em lotes (mapearEmLotes) em vez de tudo em paralelo de uma vez só — corta o
 * tempo total sem arriscar estourar rate limit da Meta quando o catálogo de clientes crescer. */
export async function recalcularSemaforo(): Promise<{ unidadesAvaliadas: number }> {
  const supabase = criarClienteAdmin();
  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select("id, empresa_id, smartads_empresas!inner(tipo), smartads_contas_meta(*)")
    .eq("ativo", true)
    .eq("smartads_empresas.tipo", "franquia");

  const unidades = (clientes ?? []).flatMap((cliente: any) =>
    (cliente.smartads_contas_meta as any[]).filter((conta) => conta.ativo).map((conta) => ({ cliente, conta }))
  );

  const comInsights = await mapearEmLotes(unidades, async ({ cliente, conta }) => {
    const insights = await obterInsightsConta(conta.meta_ad_account_id, {
      nivel: "account",
      datePreset: "last_7d",
      porDia: false,
    }).catch(() => []);
    const total = insights[0];
    return {
      empresaId: (cliente as any).empresa_id as string,
      contaId: conta.id as string,
      spend7dias: Number(total?.spend ?? 0),
      ctr7dias: Number(total?.ctr ?? 0),
    };
  });

  // Mediana calculada por empresa — a rede de "Dona Baunilha" nunca se mistura com a de outra
  // franquia que venha a existir depois.
  const medianaPorEmpresa = new Map<string, number | null>();
  for (const empresaId of new Set(comInsights.map((u) => u.empresaId))) {
    const ctrsComGasto = comInsights
      .filter((u) => u.empresaId === empresaId && u.spend7dias > 0)
      .map((u) => u.ctr7dias);
    medianaPorEmpresa.set(empresaId, mediana(ctrsComGasto));
  }

  const agora = new Date().toISOString();
  const linhas = comInsights.map((u) => {
    const { cor, motivo } = classificar(u.spend7dias, u.ctr7dias, medianaPorEmpresa.get(u.empresaId) ?? null);
    return {
      conta_id: u.contaId,
      cor,
      motivo,
      spend_7d_centavos: Math.round(u.spend7dias * 100),
      ctr_7d: u.ctr7dias,
      calculado_em: agora,
    };
  });

  if (linhas.length > 0) {
    await supabase.from("smartads_semaforo_cache").upsert(linhas, { onConflict: "conta_id" });
  }

  return { unidadesAvaliadas: linhas.length };
}

/** Lê o semáforo já calculado (ver recalcularSemaforo) — a tela nunca bate na Meta ao vivo. Unidade
 * sem entrada no cache ainda (conta nova, cron não rodou pra ela ainda) aparece como "verde" com
 * motivo explicando a espera, não como erro. */
export async function calcularSemaforo(): Promise<UnidadeSemaforo[]> {
  const supabase = criarClienteAdmin();
  const [{ data: clientes }, { data: cache }] = await Promise.all([
    supabase
      .from("smartads_clientes")
      .select("id, nome, smartads_empresas!inner(tipo), smartads_contas_meta(*)")
      .eq("ativo", true)
      .eq("smartads_empresas.tipo", "franquia")
      .order("nome"),
    supabase
      .from("smartads_semaforo_cache")
      .select("conta_id, cor, motivo, spend_7d_centavos, ctr_7d, calculado_em"),
  ]);

  const cachePorConta = new Map((cache ?? []).map((linha) => [linha.conta_id as string, linha]));

  const unidades = (clientes ?? []).flatMap((cliente: any) =>
    (cliente.smartads_contas_meta as any[])
      .filter((conta) => conta.ativo)
      .map((conta) => ({ cliente, conta }))
  );

  return unidades.map(({ cliente, conta }): UnidadeSemaforo => {
    const linhaCache = cachePorConta.get(conta.id as string);
    return {
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      contaId: conta.id,
      contaNome: conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id,
      spend7dias: (linhaCache?.spend_7d_centavos ?? 0) / 100,
      ctr7dias: linhaCache?.ctr_7d ?? 0,
      cor: (linhaCache?.cor as CorSemaforo) ?? "verde",
      motivo: linhaCache?.motivo ?? "Ainda sem dado calculado — aguardando a primeira rodada do cron diário.",
      calculadoEm: linhaCache?.calculado_em ?? null,
    };
  });
}
