import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarCalendario, datasSugeridas } from "@/lib/calendarioRede";
import { diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import PainelCalendario from "./PainelCalendario";

export const dynamic = "force-dynamic";

export default async function CalendarioPage({ searchParams }: { searchParams: { empresa?: string } }) {
  const { data: empresas } = await criarClienteAdmin().from("smartads_empresas").select("id, nome, tipo").order("nome");
  const lista = (empresas ?? []).sort((a, b) => (a.tipo === b.tipo ? a.nome.localeCompare(b.nome) : a.tipo === "franquia" ? -1 : 1));
  const empresa = lista.find((e) => e.id === searchParams.empresa) ?? lista[0];
  const ano = Number(diaEmSaoPaulo(new Date().toISOString()).slice(0, 4));

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-4xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/estrategias" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Central da rede
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold">Calendário da rede</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Tudo que a rede roda, por data: datas comerciais, campanhas oficiais e mudanças do boost. O calendário avisa quando
          uma data importante está chegando sem campanha.
        </p>

        {lista.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {lista.map((e) => (
              <Link
                key={e.id}
                href={`/estrategias/calendario?empresa=${e.id}`}
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

        {empresa ? (
          <PainelCalendario
            key={empresa.id}
            calendario={await carregarCalendario(empresa.id)}
            sugestoes={[...datasSugeridas(ano), ...datasSugeridas(ano + 1)]}
            hoje={diaEmSaoPaulo(new Date().toISOString())}
          />
        ) : (
          <p className="cartao-vidro mt-6 px-5 py-6 text-sm text-neutral-400">Nenhuma rede cadastrada ainda.</p>
        )}
      </main>
    </>
  );
}
