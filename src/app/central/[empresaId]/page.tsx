import { notFound, redirect } from "next/navigation";
import Cabecalho from "@/components/Cabecalho";
import AtalhosCentral, { type AtalhoCentral } from "@/components/AtalhosCentral";
import PanoramaCampanhasRede from "@/components/PanoramaCampanhasRede";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterResumoPorUnidade } from "@/lib/campanhasRede";
import { Megaphone, Wallet, PlusCircle, Buildings } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

/** Central de uma empresa — o mesmo ambiente da Central da rede, só que com as opções que fazem
 * sentido pra empresa individual (sem Campanhas-Mãe, moldes, semáforo e radar, que comparam
 * unidades de uma rede). Tudo aqui dentro é só dessa empresa; as abas do topo seguem sendo de todas
 * as contas. Franquia continua na Central da rede (/estrategias). */
export default async function CentralDaEmpresaPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const supabase = criarClienteAdmin();
  const { data: empresa } = await supabase
    .from("smartads_empresas")
    .select("id, nome, tipo")
    .eq("id", empresaId)
    .maybeSingle();

  if (!empresa) notFound();
  if (empresa.tipo === "franquia") redirect("/estrategias");

  const { unidades, atualizadoEm } = await obterResumoPorUnidade({ apenasFranquia: false, empresaId });

  const atalhos: AtalhoCentral[] = [
    {
      href: `/campanhas?empresa=${empresa.id}`,
      nome: "Campanhas",
      descricao: "Campanhas no ar e gasto do mês; clique numa conta pra ver e mexer nas campanhas dela.",
      Icone: Megaphone,
    },
    {
      href: `/financeiro?empresa=${empresa.id}`,
      nome: "Financeiro",
      descricao: "Saldo disponível, ritmo de gasto e previsão de quando o saldo acaba.",
      Icone: Wallet,
    },
    {
      href: "/campanhas/nova",
      nome: "Nova campanha",
      descricao: "Criar uma campanha do zero ou turbinar uma publicação existente.",
      Icone: PlusCircle,
    },
  ];

  return (
    <>
      <Cabecalho ativo="/central" empresa={{ id: empresa.id, nome: empresa.nome }} />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300">
            <Buildings size={18} weight="fill" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">{empresa.nome}</h1>
            <p className="text-sm text-neutral-400">Central da empresa — campanhas, financeiro e boost automático.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-5">
          <AtalhosCentral atalhos={atalhos} />
          <PanoramaCampanhasRede
            unidades={unidades}
            atualizadoEm={atualizadoEm}
            titulo={`Campanhas ativas · ${empresa.nome}`}
            comBoost
          />
        </div>
      </main>
    </>
  );
}
