import Cabecalho from "@/components/Cabecalho";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import PainelAutomacao from "./PainelAutomacao";

export const dynamic = "force-dynamic";

export default async function AutomacaoPage() {
  const supabase = criarClienteAdmin();
  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select(
      "id, nome, smartads_contas_meta(id, meta_ad_account_nome, nome_exibicao, smartads_campanhas_criadas(id, meta_campaign_id, tipo_modelo, config_criacao))"
    )
    .eq("ativo", true)
    .order("nome");

  return (
    <>
      <Cabecalho ativo="/automacao" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Automação</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Regras, teste A/B e piloto automático — o app age sozinho, você sempre vê o que ele fez.
        </p>
        <div className="mt-6">
          <PainelAutomacao clientes={(clientes as any) ?? []} />
        </div>
      </main>
    </>
  );
}
