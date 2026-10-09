"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise } from "@phosphor-icons/react";

/** Recalcula o Financeiro na hora (uma conta, ou todas quando não recebe contaId) em vez de esperar
 * o cron diário. */
export default function AtualizarAgora({ contaId, rotulo = "Atualizar agora" }: { contaId?: string; rotulo?: string }) {
  const router = useRouter();
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function atualizar() {
    setAtualizando(true);
    setErro(null);
    try {
      const r = await fetch("/api/financeiro/atualizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contaId }),
      });
      if (!r.ok) throw new Error();
      router.refresh();
    } catch {
      setErro("Falhou — tente de novo.");
    } finally {
      setAtualizando(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={atualizar}
        disabled={atualizando}
        className="botao-icone-vidro gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ArrowsClockwise size={13} className={atualizando ? "animate-spin" : ""} />
        {atualizando ? "Atualizando…" : rotulo}
      </button>
      {erro && <span className="text-[11px] text-danger">{erro}</span>}
    </span>
  );
}
