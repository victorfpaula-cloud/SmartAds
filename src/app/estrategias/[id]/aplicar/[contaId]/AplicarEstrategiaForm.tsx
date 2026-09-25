"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConstrutorDePublico from "@/components/ConstrutorDePublico";
import { MODELOS_CAMPANHA } from "@/lib/meta/modelos";
import type { Publico } from "@/lib/meta/tipos";

const PUBLICO_VAZIO: Publico = { localizacoes: [], interesses: [], idadeMin: 18, idadeMax: 65, genero: "todos" };

interface EtapaEstrategiaLinha {
  id: string;
  ordem: number;
  nome_etapa: string;
  tipo_modelo: string;
  percentual_orcamento: number;
  offset_dias_inicio: number;
  duracao_dias: number | null;
}

interface PublicoSalvoLinha {
  id: string;
  nome: string;
  targeting: Publico;
}

export default function AplicarEstrategiaForm({
  estrategiaId,
  estrategiaNome,
  etapas,
  clienteId,
  clienteNome,
  contaId,
  publicosSalvos,
}: {
  estrategiaId: string;
  estrategiaNome: string;
  etapas: EtapaEstrategiaLinha[];
  clienteId: string;
  clienteNome: string;
  contaId: string;
  publicosSalvos: PublicoSalvoLinha[];
}) {
  const router = useRouter();
  const [nomePlano, setNomePlano] = useState(`${clienteNome} - ${estrategiaNome}`);
  const [modoPublico, setModoPublico] = useState<"salvo" | "novo">(publicosSalvos.length > 0 ? "salvo" : "novo");
  const [publicoSalvoId, setPublicoSalvoId] = useState(publicosSalvos[0]?.id ?? "");
  const [publicoNovo, setPublicoNovo] = useState<Publico>(PUBLICO_VAZIO);
  const [valorReais, setValorReais] = useState("");
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [metaNegocio, setMetaNegocio] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const investimentoCentavos = Math.round(Number(valorReais.replace(",", ".")) * 100) || 0;

  async function aplicar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (!nomePlano.trim() || investimentoCentavos <= 0) {
      setErro("Informe o nome do plano e um investimento total maior que zero.");
      return;
    }
    if (modoPublico === "salvo" && !publicoSalvoId) {
      setErro("Selecione um público salvo, ou monte um novo.");
      return;
    }
    if (modoPublico === "novo" && publicoNovo.localizacoes.length === 0) {
      setErro("Adicione pelo menos uma localização no público.");
      return;
    }

    setPublicando(true);
    const resposta = await fetch("/api/planos-execucao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estrategiaId,
        clienteId,
        contaId,
        nome: nomePlano.trim(),
        publicoId: modoPublico === "salvo" ? publicoSalvoId : undefined,
        publico: modoPublico === "novo" ? publicoNovo : undefined,
        investimentoTotalCentavos: investimentoCentavos,
        dataInicio,
        metaNegocio: metaNegocio.trim() || undefined,
      }),
    });
    const corpo = await resposta.json();
    setPublicando(false);

    if (!resposta.ok) {
      setErro(corpo.erro || "Falha ao aplicar a estratégia.");
      return;
    }
    router.push(`/estrategias/planos/${corpo.plano.id}`);
  }

  return (
    <form onSubmit={aplicar} className="flex flex-col gap-5">
      <section className="cartao-vidro flex flex-col gap-4 p-5">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Nome do plano</label>
          <input
            value={nomePlano}
            onChange={(e) => setNomePlano(e.target.value)}
            className="h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3.5 text-sm text-neutral-100"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Investimento total</label>
            <div className="flex h-10 items-center rounded-lg border border-white/14 bg-ink-850 px-3.5">
              <span className="mr-1.5 text-sm text-neutral-500">R$</span>
              <input
                value={valorReais}
                onChange={(e) => setValorReais(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className="h-full w-full bg-transparent text-sm text-neutral-100 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Data de início</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3.5 text-sm text-neutral-100"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-neutral-400">
            Meta de negócio (opcional)
          </label>
          <input
            value={metaNegocio}
            onChange={(e) => setMetaNegocio(e.target.value)}
            placeholder="Ex: 40 pedidos/semana"
            className="h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3.5 text-sm text-neutral-100"
          />
        </div>
      </section>

      <section className="cartao-vidro flex flex-col gap-4 p-5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setModoPublico("salvo")}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${modoPublico === "salvo" ? "border-accent bg-accent/10 text-accent-strong" : "border-white/10 text-neutral-400"}`}
          >
            Usar público salvo
          </button>
          <button
            type="button"
            onClick={() => setModoPublico("novo")}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${modoPublico === "novo" ? "border-accent bg-accent/10 text-accent-strong" : "border-white/10 text-neutral-400"}`}
          >
            Montar novo agora
          </button>
        </div>

        {modoPublico === "salvo" ? (
          publicosSalvos.length === 0 ? (
            <p className="text-xs text-neutral-500">Nenhum público salvo pra {clienteNome} ainda. Monte um novo abaixo.</p>
          ) : (
            <select
              value={publicoSalvoId}
              onChange={(e) => setPublicoSalvoId(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
            >
              <option value="">Selecione…</option>
              {publicosSalvos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          )
        ) : (
          <ConstrutorDePublico valor={publicoNovo} onChange={setPublicoNovo} />
        )}
      </section>

      <section className="cartao-vidro p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Como o investimento se divide
        </p>
        <ul className="flex flex-col gap-2">
          {etapas.map((etapa) => {
            const valorEtapa = (investimentoCentavos * etapa.percentual_orcamento) / 100;
            return (
              <li key={etapa.id} className="flex items-center justify-between text-sm">
                <span className="text-neutral-300">
                  {etapa.ordem}. {etapa.nome_etapa}{" "}
                  <span className="text-neutral-500">
                    ({MODELOS_CAMPANHA[etapa.tipo_modelo as keyof typeof MODELOS_CAMPANHA]?.nomeExibicao})
                  </span>
                </span>
                <span className="font-semibold text-neutral-100">
                  R$ {(valorEtapa / 100).toFixed(2)} ({etapa.percentual_orcamento}%)
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <button
        type="submit"
        disabled={publicando}
        className="h-12 w-full rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
      >
        {publicando ? "Aplicando…" : "Aplicar estratégia"}
      </button>
    </form>
  );
}
