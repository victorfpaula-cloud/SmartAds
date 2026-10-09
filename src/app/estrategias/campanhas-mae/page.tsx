import Cabecalho from "@/components/Cabecalho";
import { AbasCampanhaOficial, AbasCampanhas } from "@/components/AbasRede";
import Link from "next/link";
import PainelCampanhasMae from "./PainelCampanhasMae";

export const dynamic = "force-dynamic";

export default function CampanhasMaePage() {
  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <AbasCampanhas />
        <AbasCampanhaOficial />
        <h1 className="font-display text-2xl font-bold">Campanhas-Mãe</h1>
        <p className="mt-1 text-sm text-neutral-400">
          O padrão oficial de uma campanha da rede — mesmo criativo, mesmo período, uma faixa de
          investimento permitida. Aplique pra quantas unidades quiser sem remontar nada por unidade.
        </p>
        <div className="mt-6">
          <PainelCampanhasMae />
        </div>
      </main>
    </>
  );
}
