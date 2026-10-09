"use client";

import { useState } from "react";
import Link from "next/link";

export interface ContaDelivery {
  id: string;
  nome: string;
  unidade: string;
  linkIfood: string;
  linkWhatsapp: string;
}

const campo = "mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100";

function Cartao({ conta }: { conta: ContaDelivery }) {
  const [ifood, setIfood] = useState(conta.linkIfood);
  const [whats, setWhats] = useState(conta.linkWhatsapp);
  const [salvo, setSalvo] = useState({ ifood: conta.linkIfood, whats: conta.linkWhatsapp });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const alterado = ifood !== salvo.ifood || whats !== salvo.whats;

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    const r = await fetch("/api/delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contaId: conta.id, linkIfood: ifood, linkWhatsapp: whats }),
    });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) return setMsg(j.erro ?? "Não consegui salvar.");
    const novo = { ifood: j.linkIfood ?? "", whats: j.linkWhatsapp ?? "" };
    setIfood(novo.ifood);
    setWhats(novo.whats);
    setSalvo(novo);
    setMsg("Salvo.");
  }

  const base = `/campanhas/nova/${conta.id}/cliques_link`;
  const botao = "rounded-lg px-3 py-2 text-sm font-semibold";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="font-semibold">{conta.nome}</p>
      {conta.unidade !== conta.nome && <p className="text-xs text-neutral-500">{conta.unidade}</p>}
      <label className="mt-3 block text-xs font-semibold text-neutral-400">Link do iFood</label>
      <input value={ifood} onChange={(e) => setIfood(e.target.value)} placeholder="https://www.ifood.com.br/…" className={campo} />
      <label className="mt-3 block text-xs font-semibold text-neutral-400">Link ou número do WhatsApp</label>
      <input value={whats} onChange={(e) => setWhats(e.target.value)} placeholder="https://wa.me/55… ou (19) 99999-9999" className={campo} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={salvar}
          disabled={!alterado || salvando}
          className={`${botao} border border-white/14 text-neutral-100 disabled:opacity-40`}
        >
          {salvando ? "Salvando…" : "Salvar links"}
        </button>
        {msg && <span className="text-xs text-neutral-400">{msg}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
        {salvo.ifood ? (
          <Link href={`${base}?canal=ifood`} className={`${botao} bg-accent text-white hover:bg-accent-strong`}>
            Campanha iFood
          </Link>
        ) : (
          <span className={`${botao} cursor-not-allowed bg-white/5 text-neutral-500`}>Campanha iFood</span>
        )}
        {salvo.whats ? (
          <Link href={`${base}?canal=whatsapp`} className={`${botao} bg-accent text-white hover:bg-accent-strong`}>
            Campanha WhatsApp
          </Link>
        ) : (
          <span className={`${botao} cursor-not-allowed bg-white/5 text-neutral-500`}>Campanha WhatsApp</span>
        )}
      </div>
    </div>
  );
}

export default function PainelDelivery({ contas }: { contas: ContaDelivery[] }) {
  if (!contas.length) return <p className="mt-6 text-sm text-neutral-400">Nenhuma conta ativa neste ambiente.</p>;
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {contas.map((c) => (
        <Cartao key={c.id} conta={c} />
      ))}
    </div>
  );
}
