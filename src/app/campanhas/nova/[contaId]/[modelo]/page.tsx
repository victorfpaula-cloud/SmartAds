import Cabecalho from "@/components/Cabecalho";
import { MODELOS_CAMPANHA } from "@/lib/meta/modelos";
import { notFound } from "next/navigation";

export default function FormularioCampanhaPage({
  params,
}: {
  params: { contaId: string; modelo: string };
}) {
  const modelo = MODELOS_CAMPANHA[params.modelo as keyof typeof MODELOS_CAMPANHA];
  if (!modelo) notFound();

  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-display text-2xl font-bold">{modelo.nomeExibicao}</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Em construção — próximo passo: página/público/orçamento/criativo e revisão final antes de
          publicar (pausada) essa campanha.
        </p>
      </main>
    </>
  );
}
