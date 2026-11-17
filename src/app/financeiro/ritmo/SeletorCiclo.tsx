"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Escolhe de quanto em quanto tempo a unidade recarrega. Salvar já recalcula o ritmo. */
export default function SeletorCiclo({ contaId, inicial, sugerido }: { contaId: string; inicial: string | null; sugerido: string | null }) {
  const router = useRouter();
  const [valor, setValor] = useState(inicial ?? "");
  const [estado, setEstado] = useState<string | null>(null);

  async function mudar(novo: string) {
    setValor(novo);
    setEstado("Salvando…");
    const r = await fetch("/api/ciclo-recarga", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contaId, ciclo: novo || null }),
    });
    const c = await r.json().catch(() => ({}));
    if (!r.ok) {
      setEstado(c.erro || "Não consegui salvar.");
      setValor(inicial ?? "");
      return;
    }
    setEstado(null);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] text-neutral-500">Recarga:</label>
      <select
        value={valor}
        onChange={(e) => mudar(e.target.value)}
        className="h-8 rounded-lg border border-white/14 bg-ink-850 px-2 text-xs text-neutral-100"
      >
        <option value="">{sugerido ? `não definido (parece ${sugerido})` : "não definido"}</option>
        <option value="semanal">Semanal (7 dias)</option>
        <option value="quinzenal">Quinzenal (15 dias)</option>
        <option value="mensal">Mensal (30 dias)</option>
      </select>
      {estado && <span className="text-[11px] text-neutral-500">{estado}</span>}
    </div>
  );
}
