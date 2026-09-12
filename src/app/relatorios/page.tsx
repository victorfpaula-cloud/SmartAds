import Cabecalho from "@/components/Cabecalho";

export default function RelatoriosPage() {
  return (
    <>
      <Cabecalho ativo="/relatorios" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold">Relatórios</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Em construção — visão agregada de todas as contas/clientes com gráficos.
        </p>
      </main>
    </>
  );
}
