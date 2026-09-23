"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MODELOS_CAMPANHA } from "@/lib/meta/modelos";
import type { TipoModeloCampanha } from "@/lib/meta/tipos";
import type { Estrategia } from "@/lib/estrategias/tipos";

interface EtapaForm {
  nomeEtapa: string;
  tipoModelo: TipoModeloCampanha;
  percentualOrcamento: string;
  offsetDiasInicio: string;
  duracaoDias: string; // vazio = contínua até pausar manualmente
}

function etapaVazia(): EtapaForm {
  return { nomeEtapa: "", tipoModelo: "alcance", percentualOrcamento: "", offsetDiasInicio: "0", duracaoDias: "" };
}

export default function PainelEstrategias() {
  const [estrategias, setEstrategias] = useState<Estrategia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [etapas, setEtapas] = useState<EtapaForm[]>([etapaVazia()]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    fetch("/api/estrategias")
      .then((r) => r.json())
      .then((corpo) => setEstrategias(corpo.estrategias ?? []))
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  const somaPercentual = etapas.reduce((soma, e) => soma + (Number(e.percentualOrcamento) || 0), 0);

  function atualizarEtapa(indice: number, campo: keyof EtapaForm, valor: string) {
    setEtapas((atual) => atual.map((e, i) => (i === indice ? { ...e, [campo]: valor } : e)));
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (!nome.trim() || etapas.some((e) => !e.nomeEtapa.trim() || !e.percentualOrcamento)) {
      setErro("Preencha o nome da estratégia e o nome/orçamento de cada etapa.");
      return;
    }
    if (Math.round(somaPercentual) !== 100) {
      setErro(`A soma do orçamento das etapas precisa fechar 100% (está em ${somaPercentual}%).`);
      return;
    }

    setSalvando(true);
    const resposta = await fetch("/api/estrategias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        etapas: etapas.map((e) => ({
          nomeEtapa: e.nomeEtapa.trim(),
          tipoModelo: e.tipoModelo,
          percentualOrcamento: Number(e.percentualOrcamento),
          offsetDiasInicio: Number(e.offsetDiasInicio) || 0,
          duracaoDias: e.duracaoDias ? Number(e.duracaoDias) : null,
        })),
      }),
    });
    const corpo = await resposta.json();
    setSalvando(false);

    if (!resposta.ok) {
      setErro(corpo.erro || "Falha ao salvar a estratégia.");
      return;
    }
    setEstrategias((atual) => [corpo.estrategia, ...atual]);
    setNome("");
    setDescricao("");
    setEtapas([etapaVazia()]);
    setCriando(false);
  }

  async function arquivar(id: string) {
    if (!confirm("Arquivar essa estratégia? Ela some da lista pra aplicar de novo, mas as unidades que já usam ela continuam normalmente.")) return;
    const resposta = await fetch(`/api/estrategias/${id}`, { method: "DELETE" });
    if (resposta.ok) setEstrategias((atual) => atual.filter((e) => e.id !== id));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/estrategias/semaforo"
          className="cartao-vidro-interno flex flex-1 items-center justify-between px-4 py-3 text-sm font-medium text-neutral-200 hover:border-accent/40"
        >
          Semáforo das unidades
          <span className="text-neutral-500">→</span>
        </Link>
        <Link
          href="/estrategias/planos"
          className="cartao-vidro-interno flex flex-1 items-center justify-between px-4 py-3 text-sm font-medium text-neutral-200 hover:border-accent/40"
        >
          Planos já aplicados
          <span className="text-neutral-500">→</span>
        </Link>
      </div>

      <section className="cartao-vidro overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-neutral-200">Moldes disponíveis</h2>
          <button
            onClick={() => setCriando(!criando)}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong"
          >
            {criando ? "Cancelar" : "+ Nova estratégia"}
          </button>
        </div>

        {criando && (
          <form onSubmit={salvar} className="flex flex-col gap-4 border-b border-white/10 px-5 py-5">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome da estratégia (ex: Lançamento de Unidade Nova)"
              className="h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3.5 text-sm text-neutral-100"
            />
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição (opcional) — pra que serve essa estratégia"
              rows={2}
              className="w-full resize-none rounded-lg border border-white/14 bg-ink-850 px-3.5 py-2.5 text-sm text-neutral-100"
            />

            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Sequência de campanhas
              </p>
              {etapas.map((etapa, indice) => (
                <div key={indice} className="cartao-vidro-interno flex flex-col gap-2.5 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-400">Etapa {indice + 1}</span>
                    {etapas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEtapas((atual) => atual.filter((_, i) => i !== indice))}
                        className="text-xs text-neutral-500 hover:text-red-400"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  <input
                    value={etapa.nomeEtapa}
                    onChange={(e) => atualizarEtapa(indice, "nomeEtapa", e.target.value)}
                    placeholder="Nome da etapa (ex: Aquecimento)"
                    className="h-9 w-full rounded-lg border border-white/14 bg-ink-900 px-3 text-sm text-neutral-100"
                  />
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <select
                      value={etapa.tipoModelo}
                      onChange={(e) => atualizarEtapa(indice, "tipoModelo", e.target.value)}
                      className="h-9 rounded-lg border border-white/14 bg-ink-900 px-2 text-xs text-neutral-100"
                    >
                      {Object.values(MODELOS_CAMPANHA).map((modelo) => (
                        <option key={modelo.tipo} value={modelo.tipo}>
                          {modelo.nomeExibicao}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={etapa.percentualOrcamento}
                      onChange={(e) => atualizarEtapa(indice, "percentualOrcamento", e.target.value)}
                      placeholder="% verba"
                      min={1}
                      max={100}
                      className="h-9 rounded-lg border border-white/14 bg-ink-900 px-2 text-xs text-neutral-100"
                    />
                    <input
                      type="number"
                      value={etapa.offsetDiasInicio}
                      onChange={(e) => atualizarEtapa(indice, "offsetDiasInicio", e.target.value)}
                      placeholder="Começa no dia"
                      min={0}
                      className="h-9 rounded-lg border border-white/14 bg-ink-900 px-2 text-xs text-neutral-100"
                    />
                    <input
                      type="number"
                      value={etapa.duracaoDias}
                      onChange={(e) => atualizarEtapa(indice, "duracaoDias", e.target.value)}
                      placeholder="Dura (dias) — vazio = contínua"
                      min={1}
                      className="h-9 rounded-lg border border-white/14 bg-ink-900 px-2 text-xs text-neutral-100"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setEtapas((atual) => [...atual, etapaVazia()])}
                className="w-fit rounded-lg border border-white/14 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/[0.04]"
              >
                + Adicionar etapa
              </button>
              <p className={`text-xs font-medium ${Math.round(somaPercentual) === 100 ? "text-emerald-400" : "text-neutral-500"}`}>
                Soma do orçamento das etapas: {somaPercentual}% (precisa fechar 100%)
              </p>
            </div>

            {erro && <p className="text-xs text-red-400">{erro}</p>}

            <button
              type="submit"
              disabled={salvando}
              className="h-10 w-fit rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
            >
              {salvando ? "Salvando…" : "Salvar estratégia"}
            </button>
          </form>
        )}

        {carregando ? (
          <p className="px-5 py-6 text-sm text-neutral-500">Carregando…</p>
        ) : estrategias.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-500">Nenhuma estratégia montada ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2 p-3">
            {estrategias.map((estrategia) => (
              <li key={estrategia.id} className="cartao-vidro-interno flex flex-col gap-2.5 px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-neutral-100">{estrategia.nome}</p>
                    {estrategia.descricao && (
                      <p className="mt-0.5 text-xs text-neutral-500">{estrategia.descricao}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/estrategias/${estrategia.id}/aplicar`}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong"
                    >
                      Aplicar numa unidade
                    </Link>
                    <button
                      onClick={() => arquivar(estrategia.id)}
                      className="rounded-lg border border-white/14 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-white/[0.04]"
                    >
                      Arquivar
                    </button>
                  </div>
                </div>
                <ol className="flex flex-col gap-1 border-t border-white/10 pt-2.5">
                  {estrategia.etapas.map((etapa) => (
                    <li key={etapa.id} className="text-xs text-neutral-400">
                      <span className="font-semibold text-neutral-300">{etapa.ordem}. {etapa.nomeEtapa}</span>
                      {" — "}
                      {MODELOS_CAMPANHA[etapa.tipoModelo]?.nomeExibicao ?? etapa.tipoModelo}
                      {" · "}
                      {etapa.percentualOrcamento}% da verba
                      {etapa.offsetDiasInicio > 0 ? ` · começa no dia ${etapa.offsetDiasInicio}` : ""}
                      {etapa.duracaoDias ? ` · dura ${etapa.duracaoDias} dias` : " · contínua"}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
