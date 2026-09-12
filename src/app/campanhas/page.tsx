import Cabecalho from "@/components/Cabecalho";

export default function CampanhasPage() {
  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold">Campanhas</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Em construção — aqui vão entrar as 5 campanhas-modelo e o painel de campanhas no ar.
        </p>
      </main>
    </>
  );
}
