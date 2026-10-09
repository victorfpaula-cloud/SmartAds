import Cabecalho from "@/components/Cabecalho";
import { MODELOS_CAMPANHA } from "@/lib/meta/modelos";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import type { TipoModeloCampanha } from "@/lib/meta/tipos";
import FormularioCampanha from "./FormularioCampanha";

export const dynamic = "force-dynamic";

export default async function FormularioCampanhaPage({
  params,
  searchParams,
}: {
  params: { contaId: string; modelo: string };
  searchParams: { canal?: string };
}) {
  const modelo = MODELOS_CAMPANHA[params.modelo as TipoModeloCampanha];
  if (!modelo) notFound();

  const supabase = criarClienteAdmin();
  const { data: conta } = await supabase
    .from("smartads_contas_meta")
    .select("*, smartads_clientes(id, nome)")
    .eq("id", params.contaId)
    .single();

  if (!conta) notFound();

  const canal: "ifood" | "whatsapp" | undefined =
    searchParams.canal === "ifood" || searchParams.canal === "whatsapp" ? searchParams.canal : undefined;
  const linkSalvo = canal === "ifood" ? (conta as any).link_ifood : canal === "whatsapp" ? (conta as any).link_whatsapp : null;
  const delivery =
    canal && modelo.tipo === "cliques_link"
      ? { canal, link: (linkSalvo as string | null) ?? "", cta: canal === "ifood" ? "ORDER_NOW" : "CONTACT_US" }
      : undefined;

  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <p className="text-xs font-medium text-neutral-500">
          {(conta as any).smartads_clientes?.nome} · {conta.nome_exibicao || conta.meta_ad_account_nome}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold">{delivery ? `Delivery · ${canal === "ifood" ? "iFood" : "WhatsApp"}` : modelo.nomeExibicao}</h1>

        <FormularioCampanha
          contaId={params.contaId}
          clienteId={(conta as any).smartads_clientes?.id}
          clienteNome={(conta as any).smartads_clientes?.nome ?? ""}
          instagramBusinessId={conta.instagram_business_id}
          modelo={modelo}
          delivery={delivery}
        />
      </main>
    </>
  );
}
