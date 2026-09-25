import { criarClienteAdmin } from "@/lib/supabase/admin";
import { listarPostsInstagram } from "@/lib/meta/api";

export interface UnidadePostagem {
  clienteId: string;
  clienteNome: string;
  contaId: string;
  contaNome: string;
  instagramUsername: string | null;
  instagramVinculado: boolean;
  ultimoPostEm: string | null;
  diasSemPostar: number | null;
  precisaAtencao: boolean;
}

const DIAS_LIMITE_ATENCAO = 5;

/** Data do post mais recente de cada unidade da franquia, direto do Instagram — o endpoint de
 * mídia (`{id}/media`) devolve tudo junto (feed, Reels, carrossel), já ordenado do mais novo pro
 * mais velho, então o primeiro item da lista já é "o último post" sem precisar filtrar por tipo
 * (mesma leitura que o boost automático já faz pra saber se a unidade postou hoje, ver
 * src/lib/automacao/boostAutomatico.ts). Só entra unidade de empresa franquia (mesmo escopo do
 * Semáforo, ver src/lib/semaforo.ts) — é uma comparação de ritmo de postagem dentro da mesma rede,
 * não faz sentido pra empresa individual sozinha. Unidade sem Instagram vinculado aparece à parte
 * (não dá pra saber se postou ou não), não entra na contagem de atrasada. */
export async function obterUltimasPostagensPorUnidade(): Promise<UnidadePostagem[]> {
  const supabase = criarClienteAdmin();
  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select("id, nome, smartads_empresas!inner(tipo), smartads_contas_meta(*)")
    .eq("ativo", true)
    .eq("smartads_empresas.tipo", "franquia")
    .order("nome");

  const unidades = (clientes ?? []).flatMap((cliente) =>
    ((cliente as any).smartads_contas_meta as any[])
      .filter((conta) => conta.ativo)
      .map((conta) => ({ cliente, conta }))
  );

  const agora = Date.now();

  return Promise.all(
    unidades.map(async ({ cliente, conta }): Promise<UnidadePostagem> => {
      const base = {
        clienteId: cliente.id as string,
        clienteNome: cliente.nome as string,
        contaId: conta.id as string,
        contaNome: (conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id) as string,
        instagramUsername: (conta.instagram_username ?? null) as string | null,
      };

      if (!conta.instagram_business_id) {
        return { ...base, instagramVinculado: false, ultimoPostEm: null, diasSemPostar: null, precisaAtencao: false };
      }

      const posts = await listarPostsInstagram(conta.instagram_business_id).catch(() => []);
      const maisRecente = posts[0];
      if (!maisRecente) {
        return { ...base, instagramVinculado: true, ultimoPostEm: null, diasSemPostar: null, precisaAtencao: true };
      }

      const diasSemPostar = Math.floor((agora - new Date(maisRecente.timestamp).getTime()) / 86_400_000);
      return {
        ...base,
        instagramVinculado: true,
        ultimoPostEm: maisRecente.timestamp,
        diasSemPostar,
        precisaAtencao: diasSemPostar >= DIAS_LIMITE_ATENCAO,
      };
    })
  );
}
