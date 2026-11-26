"use client";

import { useEffect, useState } from "react";
import { Trash } from "@phosphor-icons/react";
import type { EventoUnidade } from "@/lib/unidadeEventos";

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Eventos da unidade: anotações gerais com data, que ficam registradas e saem nos relatórios. */
export default function EventosUnidade({ contaId, podeEditar }: { contaId: string; podeEditar: boolean }) {
  const [eventos, setEventos] = useState<EventoUnidade[] | null>(null);
  const [data, setData] = useState(hojeSP());
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const r = await fetch(`/api/unidade-eventos?contaId=${encodeURIComponent(contaId)}`);
    const corpo = await r.json();
    if (!r.ok) throw new Error(corpo.erro || "Falha ao carregar os eventos.");
    setEventos(corpo.eventos);
  }

  useEffect(() => {
    carregar().catch((e) => setErro(e.message));
  }, [contaId]);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setSalvando(true);
    setErro(null);
    const r = await fetch("/api/unidade-eventos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contaId, data, texto }),
    });
    const corpo = await r.json();
    setSalvando(false);
    if (!r.ok) return setErro(corpo.erro || "Não consegui salvar.");
    setTexto("");
    await carregar();
  }

  async function apagar(id: string) {
    if (!window.confirm("Apagar este evento? Ele deixa de aparecer nos relatórios.")) return;
    const r = await fetch(`/api/unidade-eventos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const corpo = await r.json();
    if (!r.ok) return setErro(corpo.erro || "Não consegui apagar.");
    await carregar();
  }

  return (
    <section className="cartao-vidro p-5">
      <h2 className="font-display text-base font-bold">Eventos da unidade</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Registro com data do que aconteceu com a unidade (ex.: pausa de campanhas a pedido do cliente). Os eventos do período saem nos relatórios em PDF.
      </p>

      {podeEditar && (
        <form onSubmit={salvar} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start">
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
            className="h-9 rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100 sm:w-40"
          />
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={1000}
            rows={2}
            required
            placeholder="Ex.: Cliente pediu pausa das campanhas por falta de saldo para recarga."
            className="min-h-9 flex-1 rounded-lg border border-white/14 bg-ink-850 px-2.5 py-2 text-sm text-neutral-100"
          />
          <button
            type="submit"
            disabled={salvando || !texto.trim()}
            className="h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
          >
            {salvando ? "Salvando…" : "Registrar"}
          </button>
        </form>
      )}

      {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}

      {eventos === null ? (
        <p className="mt-4 text-sm text-neutral-500">Carregando…</p>
      ) : eventos.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">Nenhum evento registrado ainda.</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-white/5">
          {eventos.map((e) => (
            <li key={e.id} className="flex items-start gap-3 py-3">
              <span className="w-24 shrink-0 text-[12px] font-semibold tabular-nums text-accent-strong">{dataBR(e.data)}</span>
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-neutral-300">{e.texto}</p>
              {podeEditar && (
                <button onClick={() => apagar(e.id)} aria-label="Apagar evento" className="shrink-0 rounded-md p-1.5 text-neutral-500 hover:text-danger">
                  <Trash size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
