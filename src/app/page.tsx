import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { Storefront, Buildings, ArrowRight } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

interface ContaResumo {
  id: string;
  nome_exibicao: string | null;
  meta_ad_account_nome: string | null;
  meta_ad_account_id: string;
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
 * Mostra as empresas cadastradas (franquia ou individual) e as unidades/contas de cada uma. É o
 * link que faltava entre "várias contas de anúncio" e "uma empresa dona delas": o tipo da empresa
 * decide se as funções de comparação entre unidades (semáforo, mediana da rede no diagnóstico)
 * fazem sentido pra ela — franquia sim, individual não, mas ambas mantêm campanha fácil, insights
 * do Gemini, dados e piloto automático. */
export default async function Home() {
  const supabase = criarClienteAdmin();
  const { data: empresas } = await supabase
    .from("smartads_empresas")
    .select(
      "id, nome, tipo, smartads_clientes(id, nome, ativo, smartads_contas_meta(id, nome_exibicao, meta_ad_account_nome, meta_ad_account_id))"
    )
    .order("nome");

  const lista = (empresas ?? []) as EmpresaResumo[];

  return (
    <>
      <Cabecalho ativo="/" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Suas empresas</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Selecione uma unidade pra criar campanhas, ver diagnóstico ou dados.
            </p>
          </div>
          <Link
            href="/contas"
            className="rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:bg-accent-strong"
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
          <div className="mt-6 flex flex-col gap-4">
            {lista.map((empresa) => {
              const clientesAtivos = empresa.smartads_clientes.filter((c) => c.ativo);
              const totalContas = clientesAtivos.reduce((soma, c) => soma + c.smartads_contas_meta.length, 0);
              const Icone = empresa.tipo === "franquia" ? Buildings : Storefront;

              return (
                <section key={empresa.id} className="cartao-vidro overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300">
                        <Icone size={16} weight="fill" />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold text-neutral-100">{empresa.nome}</h2>
                        <p className="text-[11px] text-neutral-500">
                          {empresa.tipo === "franquia"
                            ? `Franquia · ${clientesAtivos.length} unidade${clientesAtivos.length !== 1 ? "s" : ""}`
                            : "Empresa individual"}
                          {" · "}
                          {totalContas} conta{totalContas !== 1 ? "s" : ""} de anúncio
                        </p>
                      </div>
                    </div>
                    {empresa.tipo === "franquia" && (
                      <Link
                        href="/estrategias/semaforo"
                        className="rounded-lg border border-white/14 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/[0.04]"
                      >
                        Semáforo das unidades
                      </Link>
                    )}
                  </div>

                  {clientesAtivos.length === 0 ? (
                    <p className="px-5 py-5 text-sm text-neutral-500">Nenhuma unidade ativa ainda.</p>
                  ) : (
                    <ul className="flex flex-col gap-2 p-3">
                      {clientesAtivos.map((cliente) => (
                        <li key={cliente.id} className="cartao-vidro-interno px-4 py-3">
                          <p className="text-sm font-semibold text-neutral-100">{cliente.nome}</p>
                          {cliente.smartads_contas_meta.length === 0 ? (
                            <p className="mt-1 text-xs text-neutral-500">
                              Sem conta de anúncio associada —{" "}
                              <Link href="/contas" className="text-accent-strong hover:underline">
                                associar agora
                              </Link>
                              .
                            </p>
                          ) : (
                            <div className="mt-2 flex flex-col gap-1.5">
                              {cliente.smartads_contas_meta.map((conta) => (
                                <div
                                  key={conta.id}
                                  className="flex flex-wrap items-center justify-between gap-2 selo-vidro px-3 py-2 text-xs"
                                >
                                  <span className="font-medium text-neutral-300">
                                    {conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id}
                                  </span>
                                  <div className="flex items-center gap-3">
                                    <Link
                                      href={`/campanhas/nova/${conta.id}`}
                                      className="font-semibold text-accent-strong hover:underline"
                                    >
                                      Nova campanha
                                    </Link>
                                    <Link
                                      href={`/estrategias/diagnostico/${conta.id}`}
                                      className="font-semibold text-accent-strong hover:underline"
                                    >
                                      Diagnóstico
                                    </Link>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
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
