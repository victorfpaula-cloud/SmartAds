"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise } from "@phosphor-icons/react";

export default function BotaoAtualizarAnalise() {
  const router = useRouter();
  const [estado, setEstado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function atualizar() {
    setOcupado(true);
    setEstado("Buscando as duas últimas semanas na Meta…");
    try {
      const r = await fetch("/api/analise-trafego", { method: "POST" });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(c.erro || "Falha ao calcular.");
      setEstado(c.comErro ? `Pronto. ${c.comErro} unidade(s) sem leitura na Meta.` : "Pronto.");
      router.refresh();
    } catch (e) {
      setEstado(e instanceof Error ? e.message : "Falha ao calcular.");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={atualizar} disabled={ocupado} className="flex items-center gap-1.5 rounded-lg border border-white/14 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-white/[0.04] disabled:opacity-40">
        <ArrowsClockwise size={14} className={ocupado ? "animate-spin" : ""} /> Atualizar agora
      </button>
      {estado && <p className="text-[11px] text-neutral-500">{estado}</p>}
    </div>
  );
}
