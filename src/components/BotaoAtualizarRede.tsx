"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise } from "@phosphor-icons/react";

/** Recalcula na hora (direto na Meta) as campanhas no ar e o gasto do mês da rede — o cron faz isso
 * sozinho 2x/dia, este botão é pra quando o número precisa estar exato agora. Demora alguns segundos
 * (uma consulta por conta de anúncio). */
export default function BotaoAtualizarRede() {
  const router = useRouter();
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function atualizar() {
    setAtualizando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/campanhas/rede-atualizar", { method: "POST" });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        throw new Error(corpo.erro || "Falha ao atualizar.");
      }
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar.");
    } finally {
      setAtualizando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={atualizar}
        disabled={atualizando}
        className="flex items-center gap-1.5 rounded-lg border border-white/14 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:text-neutral-100 disabled:opacity-50"
      >
        <ArrowsClockwise size={13} className={atualizando ? "animate-spin" : ""} />
        {atualizando ? "Atualizando…" : "Atualizar agora"}
      </button>
      {erro && <p className="max-w-[16rem] text-right text-[10.5px] text-danger">{erro}</p>}
    </div>
  );
}
