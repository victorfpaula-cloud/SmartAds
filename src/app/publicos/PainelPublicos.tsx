"use client";

import { useEffect, useState } from "react";
import ConstrutorDePublico from "@/components/ConstrutorDePublico";
import type { Publico } from "@/lib/meta/tipos";

interface Cliente {
  id: string;
  nome: string;
}

interface PublicoSalvo {
  id: string;
  nome: string;
  origem: string;
  targeting: Publico;
}

const PUBLICO_VAZIO: Publico = { localizacoes: [], interesses: [], idadeMin: 18, idadeMax: 65, genero: "todos" };

export default function PainelPublicos({ clientes }: { clientes: Cliente[] }) {
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? "");
  const [publicos, setPublicos] = useState<PublicoSalvo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [publicoNovo, setPublicoNovo] = useState<Publico>(PUBLICO_VAZIO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!clienteId) return;
    setCarregando(true);
    fetch(`/api/publicos?clienteId=${clienteId}`)
      .then((r) => r.json())
      .then((corpo) => setPublicos(corpo.publicos ?? []))
      .finally(() => setCarregando(false));
  }, [clienteId]);

  async function salvarPublico(evento: React.FormEvent) {
    evento.preventDefault();
    if (!nomeNovo.trim() || publicoNovo.localizacoes.length === 0) return;
    setSalvando(true);

    const resposta = await fetch("/api/publicos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteId, nome: nomeNovo.trim(), publico: publicoNovo }),
    });
    const corpo = await resposta.json();
    setSalvando(false);

    if (resposta.ok) {
      setPublicos((atual) => [...atual, corpo.publico]);
      setNomeNovo("");
      setPublicoNovo(PUBLICO_VAZIO);
      setCriando(false);
    } else {
      alert(corpo.erro || "Falha ao salvar público.");
    }
  }

  if (clientes.length === 0) {
    return (
      <p className="cartao-vidro px-5 py-6 text-sm text-neutral-400">
        Cadastre um cliente em Contas primeiro.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <select
        value={clienteId}
        onChange={(e) => setClienteId(e.target.value)}
        className="h-10 w-full max-w-xs rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
      >
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>

      <section className="cartao-vidro overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-neutral-200">Públicos desse cliente</h2>
          <button
            onClick={() => setCriando(!criando)}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong"
          >
            {criando ? "Cancelar" : "+ Novo público"}
          </button>
        </div>

        {criando && (
          <form onSubmit={salvarPublico} className="flex flex-col gap-4 border-b border-white/10 px-5 py-5">
            <input
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              placeholder="Nome do público (ex: Zona Sul + interior)"
              className="h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3.5 text-sm text-neutral-100"
            />
            <ConstrutorDePublico valor={publicoNovo} onChange={setPublicoNovo} />
            <button
              type="submit"
              disabled={salvando || !nomeNovo.trim() || publicoNovo.localizacoes.length === 0}
              className="h-10 w-fit rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
            >
              {salvando ? "Salvando…" : "Salvar público"}
            </button>
          </form>
        )}

        {carregando ? (
          <p className="px-5 py-6 text-sm text-neutral-500">Carregando…</p>
        ) : publicos.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-500">Nenhum público salvo pra esse cliente ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2 p-3">
            {publicos.map((publico) => (
              <li key={publico.id} className="cartao-vidro-interno px-4 py-3">
                <p className="text-sm font-semibold text-neutral-100">{publico.nome}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {publico.targeting.localizacoes.length} localização
                  {publico.targeting.localizacoes.length !== 1 ? "ões" : ""}
                  {(publico.targeting.interesses?.length ?? 0) > 0
                    ? ` · ${publico.targeting.interesses!.length} interesse(s)`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
