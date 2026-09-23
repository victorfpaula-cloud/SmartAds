import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import PainelInicio from "./PainelInicio";

export const dynamic = "force-dynamic";

interface ContaResumo {
  id: string;
  nome_exibicao: string | null;
  meta_ad_account_nome: string | null;
  meta_ad_account_id: string;
  boost_automatico_ativo: boolean;
}

interface ClienteResumo {
  id: string;
  nome: string;
  ativo: boolean;
  smartads_contas_meta: ContaResumo[];
}

interface EmpresaResumo {
  id: string;
  nome: string;
  tipo: "individual" | "franquia";
  smartads_clientes: ClienteResumo[];
}

/** Dashboard inicial — a primeira coisa que a gente vê ao logar, antes de qualquer outra tela.
 * Busca só a estrutura (empresas/clientes/contas, direto do banco); os números ao vivo por conta
 * (saúde, campanhas ativas, gasto) são responsabilidade do PainelInicio (client component), que
 * busca isso depois do primeiro paint — ver ali o porquê. */
export default async function Home() {
  const supabase = criarClienteAdmin();
  const { data: empresas } = await supabase
    .from("smartads_empresas")
    .select(
      "id, nome, tipo, smartads_clientes(id, nome, ativo, smartads_contas_meta(id, nome_exibicao, meta_ad_account_nome, meta_ad_account_id, boost_automatico_ativo))"
    )
    .order("nome");

  const lista = (empresas ?? []) as EmpresaResumo[];

  return (
    <>
      <Cabecalho ativo="/" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Início</h1>
            <p className="mt-1 text-sm text-neutral-400">
              O que fazer agora, por unidade — criar campanha, ver diagnóstico. Pra cadastrar
              cliente novo ou conectar a Meta, isso é em Contas.
            </p>
          </div>
          <Link
            href="/contas"
            className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:bg-accent-strong"
          >
            + Empresa ou cliente
          </Link>
        </div>

        {lista.length === 0 ? (
          <div className="cartao-vidro mt-6 flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-sm text-neutral-400">Nenhuma empresa cadastrada ainda.</p>
            <Link
              href="/contas"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
            >
              Cadastrar a primeira
            </Link>
          </div>
        ) : (
          <PainelInicio empresas={lista} />
        )}

        <Link
          href="/campanhas"
          className="mt-6 flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm text-neutral-300 hover:bg-white/[0.04]"
        >
          Ver todas as campanhas no ar
          <ArrowRight size={16} />
        </Link>
      </main>
    </>
  );
}
