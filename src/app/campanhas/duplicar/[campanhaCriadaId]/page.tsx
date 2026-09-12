import Cabecalho from "@/components/Cabecalho";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { MODELOS_CAMPANHA } from "@/lib/meta/modelos";
import { notFound } from "next/navigation";
import type { TipoModeloCampanha } from "@/lib/meta/tipos";
import FormularioCampanha, {
  type ValoresIniciaisCampanha,
} from "../../nova/[contaId]/[modelo]/FormularioCampanha";

export const dynamic = "force-dynamic";

/** Carrega a config salva da campanha original (smartads_campanhas_criadas.config_criacao) e abre
 * o mesmo formulário de criação já preenchido — passos 1 e 2 prontos, direto no passo 3 (criativo
 * sempre em branco, é sempre conteúdo novo). */
export default async function DuplicarCampanhaPage({
  params,
}: {
  params: { campanhaCriadaId: string };
}) {
  const supabase = criarClienteAdmin();
  const { data: campanhaCriada } = await supabase
    .from("smartads_campanhas_criadas")
    .select("*, smartads_contas_meta(*, smartads_clientes(id, nome))")
    .eq("id", params.campanhaCriadaId)
    .single();

  if (!campanhaCriada) notFound();

  const conta = (campanhaCriada as any).smartads_contas_meta;
  const modelo = MODELOS_CAMPANHA[campanhaCriada.tipo_modelo as TipoModeloCampanha];
  if (!modelo || !conta) notFound();

  const config = campanhaCriada.config_criacao as any;
  const valoresIniciais: ValoresIniciaisCampanha = {
    publico: config.publico,
    publicoId: config.publicoId,
    incluirFacebook: config.incluirFacebook,
    orcamento: config.orcamento,
    nomeCampanha: config.nomeCampanha,
  };

  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <p className="text-xs font-medium text-neutral-500">
          {conta.smartads_clientes?.nome} · {conta.nome_exibicao || conta.meta_ad_account_nome}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold">Duplicar: {modelo.nomeExibicao}</h1>

        <FormularioCampanha
          contaId={conta.id}
          clienteId={conta.smartads_clientes?.id}
          clienteNome={conta.smartads_clientes?.nome ?? ""}
          instagramBusinessId={conta.instagram_business_id}
          modelo={modelo}
          valoresIniciais={valoresIniciais}
          etapaInicial={3}
        />
      </main>
    </>
  );
}
