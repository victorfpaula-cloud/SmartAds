"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkle } from "@phosphor-icons/react";
import { MODELOS_CAMPANHA } from "@/lib/meta/modelos";
import type { TipoModeloCampanha } from "@/lib/meta/tipos";
import type { Estrategia, EtapaEstrategia } from "@/lib/estrategias/tipos";

// Opacidade decrescente por índice — a mesma cor (accent), variações de intensidade, em vez de um
// arco-íris de cores diferentes por etapa. Cobre até 6 etapas antes de repetir o padrão, mais que
// suficiente (estratégia com mais de 4-5 etapas já é incomum).
const OPACIDADE_ETAPA = [1, 0.8, 0.62, 0.46, 0.32, 0.2];

interface EtapaForm {
  nomeEtapa: string;
  tipoModelo: TipoModeloCampanha;
  duracaoDias: string;
}

function etapaVazia(): EtapaForm {
  return { nomeEtapa: "", tipoModelo: "alcance", duracaoDias: "3" };
}

const PRESETS: { nome: string; descricao: string; etapas: EtapaForm[] }[] = [
  {
    nome: "Reconhecimento → Conversão",
    descricao: "Aquece a audiência antes de pedir a ação — bom ponto de partida padrão.",
    etapas: [
      { nomeEtapa: "Reconhecimento", tipoModelo: "alcance", duracaoDias: "5" },
      { nomeEtapa: "Conversão", tipoModelo: "cliques_link", duracaoDias: "5" },
    ],
  },
  {
    nome: "Funil completo",
    descricao: "Reconhecimento → Engajamento → Conversão — pra campanhas maiores, mais tempo de maturação.",
    etapas: [
      { nomeEtapa: "Reconhecimento", tipoModelo: "alcance", duracaoDias: "4" },
      { nomeEtapa: "Engajamento", tipoModelo: "engajamento", duracaoDias: "3" },
      { nomeEtapa: "Conversão", tipoModelo: "cliques_link", duracaoDias: "3" },
    ],
  },
  {
    nome: "Captação de leads direta",
    descricao: "Só formulário, sem aquecimento — pra quando o público já chega com intenção alta.",
    etapas: [{ nomeEtapa: "Captação de leads", tipoModelo: "formulario", duracaoDias: "7" }],
  },
];

/** Barra proporcional + legenda — mostra a "forma" de uma sequência de etapas de relance (quantos
 * dias cada uma leva, em que ordem) em vez de só números soltos numa lista. Usada tanto no
 * construtor (com os valores sendo editados) quanto na listagem de estratégias já salvas. */
function BarraDeEtapas({ etapas }: { etapas: { nomeEtapa: string; duracaoDias: number }[] }) {
  const duracaoTotal = etapas.reduce((soma, e) => soma + e.duracaoDias, 0);
  if (duracaoTotal <= 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
        {etapas.map((etapa, indice) =>
          etapa.duracaoDias > 0 ? (
            <div
              key={indice}
              style={{
                width: `${(etapa.duracaoDias / duracaoTotal) * 100}%`,
                opacity: OPACIDADE_ETAPA[indice % OPACIDADE_ETAPA.length],
              }}
              className="h-full bg-accent"
              title={`${etapa.nomeEtapa || `Etapa ${indice + 1}`} — ${etapa.duracaoDias} dia(s)`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1">
        {etapas.map((etapa, indice) => (
          <span key={indice} className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-accent"
              style={{ opacity: OPACIDADE_ETAPA[indice % OPACIDADE_ETAPA.length] }}
            />
            {etapa.nomeEtapa || `Etapa ${indice + 1}`} · {etapa.duracaoDias}d
          </span>
        ))}
      </div>
      <p className="text-[11px] text-neutral-500">
        Duração total: {duracaoTotal} dia{duracaoTotal !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

/** Criar/listar Moldes de campanhas (Estratégias) — extraído de PainelEstrategias.tsx pra ter
 * página própria (ver src/app/estrategias/moldes/page.tsx), no mesmo padrão de Campanhas-Mãe e
 * Semáforo: um botão no grid de atalhos da Central da rede leva até aqui, em vez de aparecer
 * inline na tela principal. */
export default function PainelMoldes() {
  const [estrategias, setEstrategias] = useState<Estrategia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [etapas, setEtapas] = useState<EtapaForm[]>([etapaVazia()]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [sugerindoComIa, setSugerindoComIa] = useState(false);
  const [objetivoIa, setObjetivoIa] = useState("");
  const [duracaoIa, setDuracaoIa] = useState("10");
  const [carregandoIa, setCarregandoIa] = useState(false);
  const [erroIa, setErroIa] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    fetch("/api/estrategias")
      .then((r) => r.json())
      .then((corpo) => setEstrategias(corpo.estrategias ?? []))
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  const duracaoTotal = etapas.reduce((soma, e) => soma + (Number(e.duracaoDias) || 0), 0);

  function atualizarEtapa(indice: number, campo: keyof EtapaForm, valor: string) {
    setEtapas((atual) => atual.map((e, i) => (i === indice ? { ...e, [campo]: valor } : e)));
  }

  function aplicarPreset(preset: (typeof PRESETS)[number]) {
    setNome(preset.nome);
    setDescricao(preset.descricao);
    setEtapas(preset.etapas.map((e) => ({ ...e })));
    setErro(null);
  }

  async function sugerirComIa() {
    setErroIa(null);
    const duracao = Number(duracaoIa);
    if (!objetivoIa.trim() || !duracao || duracao <= 0) {
      setErroIa("Descreva o objetivo e informe uma duração total em dias.");
      return;
    }
    setCarregandoIa(true);
    const resposta = await fetch("/api/estrategias/sugerir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objetivo: objetivoIa.trim(), duracaoTotalDias: duracao }),
    });
    const corpo = await resposta.json();
    setCarregandoIa(false);

    if (!resposta.ok) {
      setErroIa(corpo.erro || "Não deu pra gerar uma sugestão agora.");
      return;
    }
    setEtapas(
      corpo.etapas.map((e: { nomeEtapa: string; tipoModelo: TipoModeloCampanha; duracaoDias: number }) => ({
        nomeEtapa: e.nomeEtapa,
        tipoModelo: e.tipoModelo,
        duracaoDias: String(e.duracaoDias),
      }))
    );
    setSugerindoComIa(false);
    setErro(null);
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (!nome.trim() || etapas.some((e) => !e.nomeEtapa.trim() || !Number(e.duracaoDias))) {
      setErro("Preencha o nome da estratégia e o nome/duração de cada etapa.");
      return;
    }

    // % de orçamento e o dia de início de cada etapa agora são derivados da duração em dias — o
    // dono não precisa mais fazer essa conta de cabeça, só dizer quanto tempo cada pedaço leva.
    let offsetAcumulado = 0;
    const etapasParaEnviar = etapas.map((e) => {
      const duracao = Number(e.duracaoDias);
      const percentual = Math.round((duracao / duracaoTotal) * 10000) / 100;
      const linha = {
        nomeEtapa: e.nomeEtapa.trim(),
        tipoModelo: e.tipoModelo,
        percentualOrcamento: percentual,
        offsetDiasInicio: offsetAcumulado,
        duracaoDias: duracao,
      };
      offsetAcumulado += duracao;
      return linha;
    });

    setSalvando(true);
    const resposta = await fetch("/api/estrategias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        etapas: etapasParaEnviar,
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

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-neutral-400">Começar de um pronto (opcional)</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.nome}
                  type="button"
                  onClick={() => aplicarPreset(preset)}
                  title={preset.descricao}
                  className="rounded-lg border border-white/14 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/[0.04]"
                >
                  {preset.nome}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSugerindoComIa(!sugerindoComIa)}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/15"
              >
                <Sparkle size={13} weight="fill" />
                Sugerir com IA
              </button>
            </div>

            {sugerindoComIa && (
              <div className="cartao-vidro-interno flex flex-col gap-2.5 p-3.5">
                <textarea
                  value={objetivoIa}
                  onChange={(e) => setObjetivoIa(e.target.value)}
                  placeholder="Objetivo geral (ex: lançar um produto novo e converter em vendas até o fim do mês)"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-white/14 bg-ink-900 px-3 py-2 text-xs text-neutral-100"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-neutral-400">Duração total:</label>
                  <input
                    type="number"
                    value={duracaoIa}
                    onChange={(e) => setDuracaoIa(e.target.value)}
                    min={1}
                    className="h-8 w-20 rounded-lg border border-white/14 bg-ink-900 px-2 text-xs text-neutral-100"
                  />
                  <span className="text-xs text-neutral-500">dias</span>
                  <button
                    type="button"
                    onClick={sugerirComIa}
                    disabled={carregandoIa}
                    className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
                  >
                    {carregandoIa ? "Gerando…" : "Gerar sugestão"}
                  </button>
                </div>
                {erroIa && <p className="text-xs text-red-400">{erroIa}</p>}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Sequência de campanhas
            </p>

            <BarraDeEtapas
              etapas={etapas.map((e) => ({ nomeEtapa: e.nomeEtapa, duracaoDias: Number(e.duracaoDias) || 0 }))}
            />

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
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[1fr_auto]">
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
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={etapa.duracaoDias}
                      onChange={(e) => atualizarEtapa(indice, "duracaoDias", e.target.value)}
                      min={1}
                      className="h-9 w-20 rounded-lg border border-white/14 bg-ink-900 px-2 text-xs text-neutral-100"
                    />
                    <span className="text-xs text-neutral-500">dias</span>
                  </div>
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
            <li key={estrategia.id} className="cartao-vidro-interno flex flex-col gap-3 px-4 py-3.5">
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

              <BarraDeEtapas
                etapas={estrategia.etapas.map((e: EtapaEstrategia) => ({
                  nomeEtapa: e.nomeEtapa,
                  duracaoDias: e.duracaoDias ?? 0,
                }))}
              />

              <ol className="flex flex-col gap-1 border-t border-white/10 pt-2.5">
                {estrategia.etapas.map((etapa) => (
                  <li key={etapa.id} className="text-xs text-neutral-400">
                    <span className="font-semibold text-neutral-300">{etapa.ordem}. {etapa.nomeEtapa}</span>
                    {" — "}
                    {MODELOS_CAMPANHA[etapa.tipoModelo]?.nomeExibicao ?? etapa.tipoModelo}
                    {" · "}
                    {etapa.duracaoDias ? `${etapa.duracaoDias} dias` : "contínua"}
                    {" · "}
                    {etapa.percentualOrcamento}% da verba
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
