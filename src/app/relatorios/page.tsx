import Cabecalho from "@/components/Cabecalho";
import PainelRelatorios from "./PainelRelatorios";
import AbasRelatorios from "@/components/AbasRelatorios";

export default function RelatoriosPage() {
  return (
    <>
      <Cabecalho ativo="/relatorios" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Relatórios</h1>
        <div className="mt-3" />
        <AbasRelatorios ativa="resumo" />
        <p className="mt-1 text-sm text-neutral-400">
          Visão de todas as contas de todos os clientes, últimos 30 dias.
        </p>
        <div className="mt-6">
          <PainelRelatorios />
        </div>
      </main>
    </>
  );
}
