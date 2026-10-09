import Cabecalho from "@/components/Cabecalho";
import { AbasUnidades } from "@/components/AbasRede";
import Link from "next/link";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { empresaDaPagina } from "@/lib/ambiente";
import PainelBoost, { type UnidadeBoost } from "./PainelBoost";

export const dynamic = "force-dynamic";

export default async function BoostPage({ searchParams }: { searchParams: { empresa?: string } }) {
  const supabase = criarClienteAdmin();
  const { data: empresas } = await supabase.from("smartads_empresas").select("id, nome, tipo").order("nome");
  const lista = (empresas ?? []).sort((a, b) => (a.tipo === b.tipo ? a.nome.localeCompare(b.nome) : a.tipo === "franquia" ? -1 : 1));
  const empresaAlvo = await empresaDaPagina(searchParams.empresa);
  const empresa = lista.find((e) => e.id === empresaAlvo) ?? lista[0];

  let unidades: UnidadeBoost[] = [];
  if (empresa) {
    const { data: clientes } = await supabase
      .from("smartads_clientes")
      .select(
        "id, nome, smartads_contas_meta(id, nome_exibicao, meta_ad_account_nome, meta_ad_account_id, ativo, boost_automatico_ativo, boost_automatico_publico_id, boost_automatico_orcamento_centavos, boost_automatico_duracao_dias, boost_tipo_entrega, boost_posts_por_dia)"
      )
      .eq("empresa_id", empresa.id)
      .eq("ativo", true)
      .order("nome");
    unidades = (clientes ?? []).flatMap((cl: any) =>
      (cl.smartads_contas_meta ?? [])
        .filter((c: any) => c.ativo)
        .map((c: any) => ({ clienteId: cl.id, clienteNome: cl.nome, conta: c }))
    );
  }

  return (
    <>
      <Cabecalho ativo="/boost" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <AbasUnidades />
        <h1 className="font-display text-2xl font-bold">Boost</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Cada conta tem o seu próprio boost. Clique em Configurar na linha da conta para definir o que entrega, o público, quanto gasta e as datas especiais.
        </p>

        {lista.length > 1 && !empresaAlvo && (
          <div className="mt-4 flex flex-wrap gap-2">
            {lista.map((e) => (
              <Link
                key={e.id}
                href={`/boost?empresa=${e.id}`}
                className={
                  e.id === empresa?.id
                    ? "pilula-ativa rounded-lg px-3.5 py-2 text-[13px] font-semibold text-neutral-100"
                    : "rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-400 hover:text-neutral-200"
                }
              >
                {e.nome}
              </Link>
            ))}
          </div>
        )}

        {!empresa ? (
          <p className="cartao-vidro mt-6 px-5 py-6 text-sm text-neutral-400">Nenhuma rede cadastrada ainda.</p>
        ) : (
          <PainelBoost key={empresa.id} unidades={unidades} />
        )}
      </main>
    </>
  );
}
