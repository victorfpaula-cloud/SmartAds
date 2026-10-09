import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { empresaDaPagina } from "@/lib/ambiente";
import { carregarInvestimentos } from "@/lib/investimentos";
import { mesAtualEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import PainelInvestimentos from "./PainelInvestimentos";

export const dynamic = "force-dynamic";

function deslocarMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const nomeDoMes = (mes: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-01T00:00:00Z`));

export default async function InvestimentosPage({ searchParams }: { searchParams: { mes?: string; empresa?: string } }) {
  const mesAtual = mesAtualEmSaoPaulo();
  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "") ? (searchParams.mes as string) : mesAtual;
  const { data: empresas } = await criarClienteAdmin().from("smartads_empresas").select("id, nome, tipo").order("nome");
  const lista = (empresas ?? []).sort((a, b) => (a.tipo === b.tipo ? a.nome.localeCompare(b.nome) : a.tipo === "franquia" ? -1 : 1));
  const alvo = await empresaDaPagina(searchParams.empresa);
  const empresaId = lista.find((e) => e.id === alvo)?.id ?? lista.find((e) => e.tipo === "franquia")?.id ?? lista[0]?.id;
  const resumo = await carregarInvestimentos(mes, empresaId);
  const qs = (m: string) => `?mes=${m}${empresaId ? `&empresa=${empresaId}` : ""}`;

  return (
    <>
      <Cabecalho ativo="/financeiro" />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/financeiro" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Financeiro
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold">Investimento por unidade</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Quanto cada unidade combinou investir no mês, quanto já investiu e quando. Recargas que a Meta registra entram
          sozinhas; o resto você lança à mão.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={`/financeiro/investimentos${qs(deslocarMes(mes, -1))}`} className="botao-icone-vidro h-8 w-8" aria-label="Mês anterior">
              ‹
            </Link>
            <span className="min-w-36 text-center text-sm font-semibold capitalize text-neutral-100">{nomeDoMes(mes)}</span>
            {mes !== mesAtual ? (
              <Link href={`/financeiro/investimentos${qs(deslocarMes(mes, 1))}`} className="botao-icone-vidro h-8 w-8" aria-label="Próximo mês">
                ›
              </Link>
            ) : (
              <span className="h-8 w-8" />
            )}
          </div>
          {lista.length > 1 && !alvo && (
            <div className="flex flex-wrap gap-2">
              {lista.map((e) => (
                <Link
                  key={e.id}
                  href={`/financeiro/investimentos?mes=${mes}&empresa=${e.id}`}
                  className={
                    e.id === empresaId
                      ? "pilula-ativa rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-100"
                      : "rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200"
                  }
                >
                  {e.nome}
                </Link>
              ))}
            </div>
          )}
        </div>

        <PainelInvestimentos key={`${mes}-${empresaId}`} resumo={resumo} />
      </main>
    </>
  );
}
