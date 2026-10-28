"use client";

import { useState } from "react";

/** E-mail que recebe o relatório mensal em PDF da unidade (até 3, separados por vírgula). O envio é
 * automático nos primeiros dias do mês; aqui dá pra baixar o PDF do mês passado ou mandar agora pra testar. */
export default function EmailRelatorioMensal({ clienteId, inicial }: { clienteId: string; inicial: string | null }) {
  const [valor, setValor] = useState(inicial ?? "");
  const [salvo, setSalvo] = useState(inicial ?? "");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<null | "salvar" | "enviar">(null);

  async function salvar() {
    setOcupado("salvar");
    setMsg(null);
    const r = await fetch(`/api/clientes/${clienteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailRelatorio: valor }),
    });
    const c = await r.json().catch(() => ({}));
    setOcupado(null);
    if (!r.ok) return setMsg({ tipo: "erro", texto: c.erro || "Não consegui salvar." });
    setSalvo(c.emailRelatorio ?? "");
    setValor(c.emailRelatorio ?? "");
    setMsg({ tipo: "ok", texto: c.emailRelatorio ? "Salvo — o relatório mensal vai pra esse e-mail." : "E-mail removido." });
  }

  async function enviarAgora() {
    if (!window.confirm("Enviar agora o relatório do mês passado pra esse e-mail?")) return;
    setOcupado("enviar");
    setMsg(null);
    const r = await fetch("/api/relatorio-mensal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteId }),
    });
    const c = await r.json().catch(() => ({}));
    setOcupado(null);
    setMsg(r.ok ? { tipo: "ok", texto: "Enviado." } : { tipo: "erro", texto: c.motivo || c.erro || "Não consegui enviar." });
  }

  const alterado = valor.trim() !== salvo.trim();
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[11px] font-semibold text-neutral-400">E-mail do relatório mensal (PDF)</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="email"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="unidade@email.com (até 3, separados por vírgula)"
          className="h-8 min-w-0 flex-1 rounded-lg border border-white/14 bg-ink-850 px-2.5 text-xs text-neutral-100"
        />
        <button
          onClick={salvar}
          disabled={!alterado || ocupado !== null}
          className="h-8 rounded-lg bg-white/[0.08] px-3 text-xs font-semibold text-neutral-100 hover:bg-white/15 disabled:opacity-40"
        >
          {ocupado === "salvar" ? "Salvando…" : "Salvar"}
        </button>
        {salvo && !alterado && (
          <>
            <a
              href={`/api/relatorio-mensal?clienteId=${clienteId}`}
              className="h-8 rounded-lg border border-white/14 px-3 text-xs font-medium leading-8 text-neutral-300 hover:bg-white/[0.04]"
            >
              Baixar PDF do mês passado
            </a>
            <button
              onClick={enviarAgora}
              disabled={ocupado !== null}
              className="h-8 rounded-lg border border-white/14 px-3 text-xs font-medium text-neutral-300 hover:bg-white/[0.04] disabled:opacity-40"
            >
              {ocupado === "enviar" ? "Enviando…" : "Enviar agora"}
            </button>
          </>
        )}
      </div>
      {msg && <p className={`mt-1.5 text-[11px] ${msg.tipo === "ok" ? "text-ok" : "text-danger"}`}>{msg.texto}</p>}
      <p className="mt-1 text-[10.5px] text-neutral-600">Chega sozinho nos primeiros dias de cada mês, com o resultado do mês anterior.</p>
    </div>
  );
}
