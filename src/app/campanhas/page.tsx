import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { Buildings, Storefront } from "@phosphor-icons/react/dist/ssr";
import { obterCampanhasAtivasRede, ROTULO_OBJETIVO } from "@/lib/campanhasRede";

const FILTRO_REDE = "franquia";

export const dynamic = "force-dynamic";

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatarAtualizacao(iso: string | null): string {
  if (!iso) return "Ainda sem dados — aguardando a primeira atualização automática";
  const horas = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (horas < 1) return "Atualizado há menos de 1h";
  if (horas < 24) return `Atualizado há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `Atualizado há ${dias} dia${dias !== 1 ? "s" : ""}`;
}

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

/** Escolher a unidade primeiro, ver as campanhas dela depois — antes essa tela tentava mostrar
 * tudo junto com dois seletores (cliente + conta) por cima da tabela, e ficava "muita coisa pra
 * clicar pra conseguir ver" (relatado ao vivo). Mesmo padrão de card agrupado por empresa que o
 * resto do app já usa, então aprende uma vez, reconhece em todo lugar. */
export default async function CampanhasPage({
  searchParams,
}: {
  searchParams: { rede?: string };
}) {
  const apenasRede = searchParams.rede === FILTRO_REDE;

  const supabase = criarClienteAdmin();
  const { data: empresas } = await supabase
    .from("smartads_empresas")
    .select(
      "id, nome, tipo, smartads_clientes(id, nome, ativo, smartads_contas_meta(id, nome_exibicao, meta_ad_account_nome, meta_ad_account_id))"
    )
    .order("nome");

  const lista = ((empresas ?? []) as EmpresaResumo[]).filter((e) => !apenasRede || e.tipo === "franquia");
  const totalContas = lista.reduce(
    (soma, e) => soma + e.smartads_clientes.filter((c) => c.ativo).reduce((s, c) => s + c.smartads_contas_meta.length, 0),
    0
  );

  // Panorama abaixo dos cards das unidades — só existe rede pra ter panorama se alguma empresa for
  // franquia; independe do filtro ?rede=franquia, aparece nas duas variantes da tela.
  const temFranquia = ((empresas ?? []) as EmpresaResumo[]).some((e) => e.tipo === "franquia");
  const { campanhas: campanhasRede, atualizadoEm: campanhasRedeAtualizadoEm } = temFranquia
    ? await obterCampanhasAtivasRede()
    : { campanhas: [], atualizadoEm: null };

  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        {apenasRede && (
          <Link href="/estrategias" className="text-xs text-neutral-500 hover:text-neutral-300">
            ← Central da rede
          </Link>
        )}
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">{apenasRede ? "Campanhas da rede" : "Campanhas"}</h1>
            <p className="mt-1 text-sm text-neutral-400">
              {apenasRede
                ? "Só as unidades de franquia — pra ver tudo, inclusive empresas individuais, use Campanhas no menu."
                : "Escolha a unidade pra ver e mexer nas campanhas dela."}
            </p>
          </div>
          <Link
            href="/campanhas/nova"
            className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:bg-accent-strong"
          >
            + Nova campanha
          </Link>
        </div>

        {totalContas === 0 ? (
          <p className="cartao-vidro mt-6 px-5 py-8 text-center text-sm text-neutral-400">
            Nenhuma conta de anúncio associada ainda —{" "}
            <Link href="/contas" className="text-accent-strong hover:underline">
              associe uma em Contas
            </Link>
            .
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {lista.map((empresa) => {
              const clientesAtivos = empresa.smartads_clientes.filter((c) => c.ativo && c.smartads_contas_meta.length > 0);
              if (clientesAtivos.length === 0) return null;
              const Icone = empresa.tipo === "franquia" ? Buildings : Storefront;

              return (
                <section key={empresa.id} className="cartao-vidro overflow-hidden">
                  <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-3.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300">
                      <Icone size={16} weight="fill" />
                    </div>
                    <h2 className="text-sm font-semibold text-neutral-100">{empresa.nome}</h2>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-2">
                    {clientesAtivos.flatMap((cliente) =>
                      cliente.smartads_contas_meta.map((conta) => (
                        <Link
                          key={conta.id}
                          href={`/campanhas/conta/${conta.id}`}
                          className="cartao-vidro-interno flex items-center justify-between gap-2 p-4 transition hover:border-accent/40"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-neutral-100">{cliente.nome}</p>
                            <p className="truncate text-xs text-neutral-500">
                              {conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id}
                            </p>
                          </div>
                          <span className="shrink-0 text-neutral-500">→</span>
                        </Link>
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {temFranquia && (
          <section className="cartao-vidro mt-6 overflow-hidden">
            <div className="border-b border-white/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-neutral-100">Campanhas ativas na rede</h2>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                {campanhasRede.length} campanha{campanhasRede.length !== 1 ? "s" : ""} ativa
                {campanhasRede.length !== 1 ? "s" : ""} agora · {formatarAtualizacao(campanhasRedeAtualizadoEm)}
              </p>
            </div>

            {campanhasRede.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-neutral-500">
                Nenhuma campanha ativa na rede agora.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-4 py-3 font-medium">Unidade</th>
                      <th className="px-4 py-3 font-medium">Campanha</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 font-medium">Orçamento diário</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {campanhasRede.map((campanha, indice) => (
                      <tr key={`${campanha.contaId}-${indice}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-neutral-100">{campanha.clienteNome}</p>
                          <p className="text-[10.5px] text-neutral-600">{campanha.contaNome}</p>
                        </td>
                        <td className="px-4 py-3 text-neutral-300">{campanha.nome}</td>
                        <td className="px-4 py-3 text-neutral-400">
                          {campanha.objetivo ? ROTULO_OBJETIVO[campanha.objetivo] ?? campanha.objetivo : "-"}
                        </td>
                        <td className="px-4 py-3 text-neutral-300">
                          {campanha.orcamentoDiarioCentavos != null
                            ? `${formatoReal.format(campanha.orcamentoDiarioCentavos / 100)}/dia`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </>
  );
}
