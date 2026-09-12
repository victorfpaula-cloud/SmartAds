import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsConta } from "@/lib/meta/api";
import { ErroMetaNaoConectado } from "@/lib/meta/token";

export interface LinhaResumo {
  clienteId: string;
  clienteNome: string;
  contaId: string;
  contaNome: string;
  spend?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  erro?: string;
}

/** Resumo agregado de TODAS as contas de TODOS os clientes, últimos 30 dias — a mesma busca
 * alimenta tanto os números crus do painel de Relatórios (/api/relatorios/resumo) quanto o texto
 * gerado por IA (/api/ia/resumo), pra nunca os dois contarem uma história diferente por terem
 * ido buscar o dado de jeito ligeiramente diferente. Uma conta com erro individual (token
 * revogado pro cliente específico, conta pausada etc.) não derruba o resumo inteiro: aparece com
 * `erro` preenchido e o resto segue. */
export async function buscarLinhasResumo(): Promise<LinhaResumo[]> {
  const supabase = criarClienteAdmin();
  const { data: clientes, error } = await supabase
    .from("smartads_clientes")
    .select("id, nome, smartads_contas_meta(id, meta_ad_account_id, nome_exibicao, meta_ad_account_nome)")
    .eq("ativo", true)
    .order("nome");

  if (error) throw new Error(error.message);

  return Promise.all(
    (clientes ?? []).flatMap((cliente) =>
      (cliente as any).smartads_contas_meta.map(async (conta: any): Promise<LinhaResumo> => {
        try {
          const insights = await obterInsightsConta(conta.meta_ad_account_id, {
            nivel: "account",
            datePreset: "last_30d",
            porDia: false,
          });
          const total = insights[0];
          return {
            clienteId: cliente.id,
            clienteNome: cliente.nome,
            contaId: conta.id,
            contaNome: conta.nome_exibicao || conta.meta_ad_account_nome,
            spend: Number(total?.spend ?? 0),
            impressions: Number(total?.impressions ?? 0),
            clicks: Number(total?.clicks ?? 0),
            ctr: Number(total?.ctr ?? 0),
          };
        } catch (erro) {
          return {
            clienteId: cliente.id,
            clienteNome: cliente.nome,
            contaId: conta.id,
            contaNome: conta.nome_exibicao || conta.meta_ad_account_nome,
            erro: erro instanceof ErroMetaNaoConectado ? erro.message : "Falha ao buscar dados dessa conta.",
          };
        }
      })
    )
  );
}
