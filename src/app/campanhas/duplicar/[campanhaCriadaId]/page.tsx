import Link from "next/link";
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
  // Datas da campanha original que já passaram não servem pra cópia: limpa e, se faltar alguma
  // obrigatória (orçamento total precisa de início e fim), abre direto no passo do orçamento.
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const dia = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : "");
  const orcamento = { ...(config.orcamento ?? {}) };
  if (orcamento.dataInicio && dia(orcamento.dataInicio) < hoje) delete orcamento.dataInicio;
  if (orcamento.dataFim && dia(orcamento.dataFim) <= hoje) delete orcamento.dataFim;
  const faltaData = orcamento.tipo === "vitalicio" && (!orcamento.dataInicio || !orcamento.dataFim);
  const datasLimpas = orcamento.dataInicio !== config.orcamento?.dataInicio || orcamento.dataFim !== config.orcamento?.dataFim;
  const valoresIniciais: ValoresIniciaisCampanha = {
    publico: config.publico,
    publicoId: config.publicoId,
    orcamento,
    nomeCampanha: config.nomeCampanha,
  };

  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/campanhas" className="mb-1 block text-xs text-neutral-500 hover:text-neutral-300">
          ← Campanhas
        </Link>
        <p className="text-xs font-medium text-neutral-500">
          {conta.smartads_clientes?.nome} · {conta.nome_exibicao || conta.meta_ad_account_nome}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold">Duplicar: {modelo.nomeExibicao}</h1>
        {datasLimpas && (
          <p className="mt-2 text-xs text-amber-300">As datas da campanha original já passaram — escolha as novas datas no passo do orçamento.</p>
        )}

        <FormularioCampanha
          contaId={conta.id}
          clienteId={conta.smartads_clientes?.id}
          clienteNome={conta.smartads_clientes?.nome ?? ""}
          instagramBusinessId={conta.instagram_business_id}
          modelo={modelo}
          valoresIniciais={valoresIniciais}
          etapaInicial={faltaData ? 2 : 3}
        />
      </main>
    </>
  );
}
