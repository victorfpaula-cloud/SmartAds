import Cabecalho from "@/components/Cabecalho";

export default function PublicosPage() {
  return (
    <>
      <Cabecalho ativo="/publicos" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold">Públicos salvos</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Em construção — aqui vai entrar o construtor de público (mapa + interesses) e a lista de
          públicos já salvos na Meta.
        </p>
      </main>
    </>
  );
}
