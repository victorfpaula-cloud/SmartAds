import Cabecalho from "@/components/Cabecalho";
import { AbasCampanhas } from "@/components/AbasRede";
import { exigirAmbiente } from "@/lib/ambiente";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { contasDaEmpresa } from "@/lib/cicloSaldo";
import PainelUltimas24h from "./PainelUltimas24h";

export const dynamic = "force-dynamic";

/** Resultado recente do tráfego: hoje até agora e ontem, por unidade, e o que cada campanha no ar
 * entregou desde que entrou no ar (com há quantas horas está rodando). */
export default async function Ultimas24hPage() {
  const ambiente = await exigirAmbiente();
  const ids = await contasDaEmpresa(ambiente.id);
  const { data } = await criarClienteAdmin().from("smartads_contas_meta").select("id, smartads_clientes(nome)").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const unidades = (data ?? [])
    .map((c: any) => ({ contaId: c.id as string, nome: (Array.isArray(c.smartads_clientes) ? c.smartads_clientes[0] : c.smartads_clientes)?.nome ?? "—" }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <AbasCampanhas />
        <h1 className="font-display text-2xl font-bold">Resultado das últimas 24h</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          O que o tráfego pago entregou hoje (até agora) e ontem, por unidade. Toque numa unidade pra ver cada campanha no
          ar: há quantas horas está rodando e quantas curtidas e quanto alcance trouxe desde que entrou no ar. Só anúncio
          (nada de orgânico).
        </p>
        <div className="mt-4">
          <PainelUltimas24h unidades={unidades} />
        </div>
      </main>
    </>
  );
}
