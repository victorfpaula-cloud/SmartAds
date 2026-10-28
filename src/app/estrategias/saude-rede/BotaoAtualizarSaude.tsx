"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise } from "@phosphor-icons/react";

/** Busca na Meta os números do período, uma unidade por vez (cada chamada cabe no limite de tempo), e
 * mostra o andamento. Ao terminar recarrega a página com os totais novos. */
export default function BotaoAtualizarSaude({ contaIds, dias }: { contaIds: string[]; dias: number }) {
  const router = useRouter();
  const [feitas, setFeitas] = useState<number | null>(null);
  const [falhas, setFalhas] = useState(0);
  const rodando = feitas !== null && feitas < contaIds.length;

  async function atualizar() {
    setFeitas(0);
    setFalhas(0);
    let erros = 0;
    for (let i = 0; i < contaIds.length; i++) {
      // Período atual e, na sequência, o anterior (pra comparar).
      for (const anterior of [false, true]) {
        try {
          const r = await fetch("/api/saude-rede", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contaId: contaIds[i], dias, anterior }),
          });
          if (!r.ok) erros++;
        } catch {
          erros++;
        }
      }
      setFeitas(i + 1);
      setFalhas(erros);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={atualizar}
        disabled={rodando || contaIds.length === 0}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ArrowsClockwise size={15} className={rodando ? "animate-spin" : ""} />
        {rodando ? `Atualizando ${feitas}/${contaIds.length}…` : "Atualizar dados"}
      </button>
      {feitas !== null && !rodando && (
        <p className={`text-[11px] ${falhas ? "text-amber-400" : "text-ok"}`}>
          {falhas ? `Pronto, mas ${falhas} unidade(s) não vieram — veja a tabela.` : "Atualizado."}
        </p>
      )}
    </div>
  );
}
