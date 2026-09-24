"use client";

import { useState } from "react";
import { EnvelopeSimple } from "@phosphor-icons/react";

/** Dispara na hora o mesmo e-mail que o cron semanal manda sozinho (ver
 * /api/relatorios/postagens/enviar e /api/cron/relatorio-postagens) — útil pra conferir o
 * relatório sem esperar a próxima segunda-feira. */
export default function BotaoEnviarRelatorio() {
  const [estado, setEstado] = useState<"ocioso" | "enviando" | "enviado" | "erro">("ocioso");
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    setEstado("enviando");
    setErro(null);
    const resposta = await fetch("/api/relatorios/postagens/enviar", { method: "POST" });
    const corpo = await resposta.json();

    if (resposta.ok) {
      setEstado("enviado");
      setTimeout(() => setEstado("ocioso"), 4000);
    } else {
      setEstado("erro");
      setErro(corpo.erro || "Falha ao enviar.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={enviar}
        disabled={estado === "enviando"}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
      >
        <EnvelopeSimple size={14} weight="bold" />
        {estado === "enviando" ? "Enviando…" : estado === "enviado" ? "Enviado!" : "Enviar por e-mail"}
      </button>
      {erro && <p className="text-[11px] text-danger">{erro}</p>}
    </div>
  );
}
