import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsConta } from "@/lib/meta/api";

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
}

/** Verde/amarelo/vermelho por unidade, baseado no desvio da MEDIANA DA REDE (não um limiar fixo)
 * — só faz sentido porque várias unidades usam o mesmo molde de estratégia; o que é "normal" de
 * CTR muda por setor/público, então comparar contra a própria rede é mais honesto que um número
 * mágico universal. Sem campanha ativa na semana já é vermelho direto, independente de mediana. */
export async function calcularSemaforo(): Promise<UnidadeSemaforo[]> {
  const supabase = criarClienteAdmin();
  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select("id, nome, smartads_contas_meta(*)")
    .eq("ativo", true)
    .order("nome");

  const unidades = (clientes ?? []).flatMap((cliente) =>
    ((cliente as any).smartads_contas_meta as any[])
      .filter((conta) => conta.ativo)
      .map((conta) => ({ cliente, conta }))
  );

  const comInsights = await Promise.all(
    unidades.map(async ({ cliente, conta }) => {
      const insights = await obterInsightsConta(conta.meta_ad_account_id, {
        nivel: "account",
        datePreset: "last_7d",
        porDia: false,
      }).catch(() => []);
      const total = insights[0];
      return {
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        contaId: conta.id,
        contaNome: conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id,
        spend7dias: Number(total?.spend ?? 0),
        ctr7dias: Number(total?.ctr ?? 0),
      };
    })
  );

  const ctrsComGasto = comInsights.filter((u) => u.spend7dias > 0).map((u) => u.ctr7dias);
  const ordenado = [...ctrsComGasto].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  const medianaCtr =
    ordenado.length === 0 ? null : ordenado.length % 2 === 0 ? (ordenado[meio - 1] + ordenado[meio]) / 2 : ordenado[meio];

  return comInsights.map((u): UnidadeSemaforo => {
    if (u.spend7dias === 0) {
      return { ...u, cor: "vermelho", motivo: "Sem campanha ativa nos últimos 7 dias." };
    }
    if (medianaCtr === null || medianaCtr === 0) {
      return { ...u, cor: "verde", motivo: "Sem outras unidades pra comparar ainda." };
    }
    const razao = u.ctr7dias / medianaCtr;
    if (razao < 0.7) {
      return { ...u, cor: "vermelho", motivo: `CTR bem abaixo da mediana da rede (${(razao * 100).toFixed(0)}%).` };
    }
    if (razao < 0.9) {
      return { ...u, cor: "amarelo", motivo: `CTR um pouco abaixo da mediana da rede (${(razao * 100).toFixed(0)}%).` };
    }
    return { ...u, cor: "verde", motivo: "Dentro ou acima da mediana da rede." };
  });
}
