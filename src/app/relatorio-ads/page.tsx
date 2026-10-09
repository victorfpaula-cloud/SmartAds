import Cabecalho from "@/components/Cabecalho";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import AbasRelatorios from "@/components/AbasRelatorios";
import PainelRelatorioAds, { type OpcaoConta } from "./PainelRelatorioAds";

export const dynamic = "force-dynamic";

export default async function RelatorioAdsPage() {
  const supabase = criarClienteAdmin();
  const { data } = await supabase
    .from("smartads_clientes")
    .select("nome, smartads_contas_meta(id, nome_exibicao, meta_ad_account_nome, instagram_username, ativo)")
    .order("nome");

  const contas: OpcaoConta[] = [];
  for (const cliente of data ?? []) {
    for (const c of (cliente as any).smartads_contas_meta ?? []) {
      if (c.ativo === false) continue;
      contas.push({
        id: c.id,
        clienteNome: cliente.nome,
        contaNome: c.nome_exibicao || c.meta_ad_account_nome || "Conta",
        instagram: c.instagram_username ?? null,
      });
    }
  }

  return (
    <>
      <Cabecalho ativo="/relatorio-ads" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Relatórios</h1>
        <div className="mt-3" />
        <AbasRelatorios ativa="conta" />
        <p className="mt-1 text-sm text-neutral-400">
          Só os números do tráfego pago: alcance, engajamento, visitas ao perfil e investimento.
        </p>
        <div className="mt-6">
          <PainelRelatorioAds contas={contas} />
        </div>
      </main>
    </>
  );
}
