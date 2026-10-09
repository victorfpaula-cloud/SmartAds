import Cabecalho from "@/components/Cabecalho";
import { exigirAmbiente } from "@/lib/ambiente";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import PainelDelivery, { type ContaDelivery } from "./PainelDelivery";

export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const ambiente = await exigirAmbiente();
  const { data } = await criarClienteAdmin()
    .from("smartads_clientes")
    .select("nome, smartads_contas_meta(id, nome_exibicao, meta_ad_account_nome, ativo, link_ifood, link_whatsapp)")
    .eq("empresa_id", ambiente.id)
    .order("nome");

  const contas: ContaDelivery[] = (data ?? []).flatMap((c: any) =>
    (c.smartads_contas_meta ?? [])
      .filter((conta: any) => conta.ativo)
      .map((conta: any) => ({
        id: conta.id,
        nome: conta.nome_exibicao || conta.meta_ad_account_nome || c.nome,
        unidade: c.nome,
        linkIfood: conta.link_ifood ?? "",
        linkWhatsapp: conta.link_whatsapp ?? "",
      }))
  );

  return (
    <>
      <Cabecalho ativo="/delivery" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Delivery · {ambiente.nome}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Deixe o link do iFood e o do WhatsApp salvos em cada conta e crie a campanha de clique no link em poucos
          passos. A entrega é só nos Stories do Instagram.
        </p>
        <PainelDelivery contas={contas} />
      </main>
    </>
  );
}
