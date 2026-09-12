import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";

export default function CampanhasPage() {
  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">Campanhas</h1>
          <Link
            href="/campanhas/nova"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            + Nova campanha
          </Link>
        </div>
        <p className="mt-2 text-sm text-neutral-400">
          Em construção — aqui vai entrar o painel de campanhas no ar (todas as contas, ações
          rápidas de pausar/orçamento/duplicar).
        </p>
      </main>
    </>
  );
}
