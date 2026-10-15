"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise } from "@phosphor-icons/react";

/** Atualiza posts e stories na hora, sem esperar a coleta automática. */
export default function BotaoAtualizarRadar() {
  const router = useRouter();
  const [atualizando, setAtualizando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function atualizar() {
    setAtualizando(true);
    setMsg(null);
    try {
      const r = await fetch("/api/estrategias/postagens/atualizar", { method: "POST" });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error();
      const erros: string[] = c.contasComErro ?? [];
      setMsg(
        erros.length > 0
          ? { tipo: "erro", texto: `Atualizado, mas ${erros.length} unidade(s) deram erro nos stories: ${erros.slice(0, 2).join(" | ")}` }
          : { tipo: "ok", texto: `Atualizado (${c.contasVerificadas ?? 0} unidades verificadas).` }
      );
      router.refresh();
    } catch {
      setMsg({ tipo: "erro", texto: "Não deu certo — tente de novo." });
    } finally {
      setAtualizando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={atualizar}
        disabled={atualizando}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ArrowsClockwise size={14} className={atualizando ? "animate-spin" : ""} />
        {atualizando ? "Atualizando…" : "Atualizar agora"}
      </button>
      {msg && (
        <p className={`max-w-xs text-right text-[11px] ${msg.tipo === "ok" ? "text-ok" : "text-amber-400"}`}>{msg.texto}</p>
      )}
    </div>
  );
}
