import Cabecalho from "@/components/Cabecalho";
import { AbasCampanhas } from "@/components/AbasRede";
import { exigirAmbiente } from "@/lib/ambiente";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import FormularioCampanhaRede, { type UnidadeRede } from "./FormularioCampanhaRede";

export const dynamic = "force-dynamic";

/** Mesma campanha (alcance, com a arte enviada aqui) criada de uma vez em várias unidades. */
export default async function NovaCampanhaRedePage() {
  const ambiente = await exigirAmbiente();
  const { data: clientes } = await criarClienteAdmin()
    .from("smartads_clientes")
    .select("id, nome, smartads_contas_meta(id, ativo, nome_exibicao, meta_ad_account_nome), smartads_publicos_salvos(id, nome, origem, targeting)")
    .eq("empresa_id", ambiente.id)
    .eq("ativo", true)
    .order("nome");

  const unidades: UnidadeRede[] = (clientes ?? []).flatMap((c: any) =>
    (c.smartads_contas_meta ?? [])
      .filter((conta: any) => conta.ativo !== false)
      .map((conta: any) => ({
        contaId: conta.id,
        nome: c.nome,
        detalhe: conta.nome_exibicao || conta.meta_ad_account_nome || "",
        publicos: (c.smartads_publicos_salvos ?? [])
          .filter((p: any) => p.origem === "smartads")
          .map((p: any) => ({ id: p.id, nome: p.nome, targeting: p.targeting })),
      }))
  );

  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <AbasCampanhas />
        <h1 className="font-display text-2xl font-bold">Nova campanha para várias unidades</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Escolha as unidades, envie a arte e publique a mesma campanha de alcance em todas. Cada unidade usa o público
          salvo dela. As campanhas nascem pausadas, pra você conferir antes de ligar.
        </p>
        <FormularioCampanhaRede unidades={unidades} />
      </main>
    </>
  );
}
