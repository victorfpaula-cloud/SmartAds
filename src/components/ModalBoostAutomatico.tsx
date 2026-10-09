"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lightning, X } from "@phosphor-icons/react";
import { ROTULO_ENTREGA, custoPorBoostCentavos, type ConfigBoostRede, type RegraBoostRede } from "@/lib/boostRede";

export interface ContaBoost {
  id: string;
  nome_exibicao: string | null;
  meta_ad_account_nome: string | null;
  meta_ad_account_id: string;
  boost_automatico_ativo: boolean;
  boost_automatico_publico_id: string | null;
  boost_automatico_orcamento_centavos: number | null;
  boost_automatico_duracao_dias: number;
}

export interface AlteracoesBoost {
  boost_automatico_ativo: boolean;
  boost_automatico_publico_id: string | null;
  boost_automatico_orcamento_centavos: number | null;
  boost_automatico_duracao_dias: number;
}

interface PublicoSalvo {
  id: string;
  nome: string;
  origem: "smartads" | "meta";
}

/** Liga/desliga o boost automático de uma conta — todo dia, depois da janela de postagem, o cron
 * confere o primeiro post de hoje do Instagram e, se ainda não foi turbinado, dispara uma campanha de
 * engajamento nele (ver src/lib/automacao/boostAutomatico.ts). Só aceita público salvo "nativo" do
 * SmartAds (origem smartads) — um público reaproveitado direto da Meta usa outro caminho de
 * montagem que essa automação ainda não cobre. Compartilhado entre Contas (cadastro) e Início
 * (card com toggle rápido), pra configurar do mesmo jeito nos dois lugares. */
export default function ModalBoostAutomatico({
  clienteId,
  conta,
  onFechar,
  onSalvo,
}: {
  clienteId: string;
  conta: ContaBoost;
  onFechar: () => void;
  onSalvo: (alteracoes: AlteracoesBoost) => void;
}) {
  const [ativo, setAtivo] = useState(conta.boost_automatico_ativo);
  const [publicoId, setPublicoId] = useState(conta.boost_automatico_publico_id ?? "");
  const [orcamento, setOrcamento] = useState(
    conta.boost_automatico_orcamento_centavos != null
      ? (conta.boost_automatico_orcamento_centavos / 100).toFixed(2).replace(".", ",")
      : ""
  );
  const [duracaoDias, setDuracaoDias] = useState(conta.boost_automatico_duracao_dias ?? 3);
  const [publicos, setPublicos] = useState<PublicoSalvo[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [montado, setMontado] = useState(false);
  // O que a rede já definiu pra essa unidade (tipo de entrega, orçamento/duração padrão, regra por data).
  const [rede, setRede] = useState<{ config: ConfigBoostRede; regra: RegraBoostRede | null } | null>(null);

  // O modal é aberto de dentro de cards com blur (.cartao-vidro): um ancestral com backdrop-filter
  // vira o "bloco de contenção" do position:fixed, então o modal ficava preso e cortado dentro do
  // card (botão Salvar fora da tela). Renderizar direto no <body> (portal) escapa disso.
  useEffect(() => {
    setMontado(true);
    // Trava o scroll da página por baixo enquanto o modal está aberto.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflowAnterior;
    };
  }, []);

  useEffect(() => {
    fetch(`/api/publicos?clienteId=${clienteId}`)
      .then((r) => r.json())
      .then((corpo) => setPublicos(((corpo.publicos ?? []) as PublicoSalvo[]).filter((p) => p.origem === "smartads")))
      .catch(() => setPublicos([]));
  }, [clienteId]);

  useEffect(() => {
    fetch(`/api/boost-rede/efetivo?contaId=${conta.id}`)
      .then((r) => r.json())
      .then((corpo) => corpo.config && setRede({ config: corpo.config, regra: corpo.regra ?? null }))
      .catch(() => {});
  }, [conta.id]);

  const orcamentoDaRede = rede?.config.orcamentoDiarioCentavos ?? null;
  const duracaoDaRede = rede?.config.duracaoDias ?? null;
  const tipoEntrega = rede?.config.tipoEntrega ?? "engajamento";

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    const valorDigitado = orcamento.trim() ? Math.round(parseFloat(orcamento.replace(",", ".")) * 100) : null;
    const valorCentavos = orcamentoDaRede ?? valorDigitado;
    if (ativo && (!publicoId || !valorCentavos || valorCentavos <= 0)) {
      setErro("Selecione um público e informe um orçamento diário maior que zero.");
      return;
    }

    setSalvando(true);
    const resposta = await fetch(`/api/contas-meta/${conta.id}/boost-automatico`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo, publicoId: publicoId || null, orcamentoCentavos: valorCentavos, duracaoDias: duracaoDaRede ?? duracaoDias }),
    });
    const corpo = await resposta.json();
    setSalvando(false);

    if (!resposta.ok) {
      setErro(corpo.erro || "Falha ao salvar.");
      return;
    }
    onSalvo({
      boost_automatico_ativo: ativo,
      boost_automatico_publico_id: publicoId || null,
      boost_automatico_orcamento_centavos: valorCentavos,
      boost_automatico_duracao_dias: duracaoDaRede ?? duracaoDias,
    });
  }

  if (!montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-white/10 bg-ink-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-ink-900 px-5 py-3.5">
          <div className="flex items-center gap-2 overflow-hidden">
            <Lightning size={16} className="shrink-0 text-neutral-400" />
            <h3 className="truncate text-sm font-semibold text-neutral-100">
              Boost automático — {conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id}
            </h3>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="botao-icone-vidro h-8 w-8 shrink-0">
            <X size={16} weight="bold" />
          </button>
        </div>

        <form onSubmit={salvar} className="flex flex-col gap-4 p-5">
          <p className="text-xs leading-relaxed text-neutral-400">
            De hora em hora, das 10h às 20h, o SmartAds confere os posts do dia no Instagram dessa
            conta. O primeiro post de hoje, se ainda não tiver sido turbinado, ganha sozinho{" "}
            <span className="font-semibold text-neutral-200">
              {tipoEntrega === "ambos" ? "duas campanhas (engajamento + alcance)" : `uma campanha de ${ROTULO_ENTREGA[tipoEntrega].toLowerCase()}`}
            </span>
            , com o público escolhido abaixo. O que ele entrega e quantos posts por dia vêm do{" "}
            <a href="/boost" className="font-semibold text-accent underline underline-offset-2">
              padrão da rede
            </a>
            .
          </p>
          {rede?.regra && (
            <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-neutral-200">
              Data especial em vigor: <span className="font-semibold">{rede.regra.nome}</span> —{" "}
              {ROTULO_ENTREGA[rede.regra.tipoEntrega]}.
            </p>
          )}

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-ink-850 accent-accent"
            />
            <span className="text-sm font-medium text-neutral-200">Ligado</span>
          </label>

          <div>
            <label className="text-xs font-semibold text-neutral-400">Público</label>
            {publicos === null ? (
              <p className="mt-1 text-xs text-neutral-500">Carregando públicos salvos…</p>
            ) : publicos.length === 0 ? (
              <p className="mt-1 text-xs text-neutral-500">
                Nenhum público salvo nesse cliente ainda —{" "}
                <a href="/publicos" className="font-semibold text-accent underline underline-offset-2">
                  cadastre um em Públicos
                </a>{" "}
                antes de ligar.
              </p>
            ) : (
              <select
                value={publicoId}
                onChange={(e) => setPublicoId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
              >
                <option value="">Selecione…</option>
                {publicos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-400">Orçamento diário (R$)</label>
            {orcamentoDaRede ? (
              <p className="mt-1 text-sm text-neutral-200">
                R$ {(orcamentoDaRede / 100).toFixed(2).replace(".", ",")}{" "}
                <span className="text-xs text-neutral-500">· definido pelo padrão da rede</span>
              </p>
            ) : (
              <input
                type="text"
                inputMode="decimal"
                value={orcamento}
                onChange={(e) => setOrcamento(e.target.value)}
                placeholder="0,00"
                className="mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
              />
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-400">Duração da campanha</label>
            {duracaoDaRede ? (
              <p className="mt-1 text-sm text-neutral-200">
                {duracaoDaRede} dias <span className="text-xs text-neutral-500">· definido pelo padrão da rede</span>
              </p>
            ) : (
            <select
              value={duracaoDias}
              onChange={(e) => setDuracaoDias(Number(e.target.value))}
              className="mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
            >
              <option value={3}>3 dias</option>
              <option value={7}>7 dias</option>
            </select>
            )}
          </div>

          {(() => {
            const orc = orcamentoDaRede ?? (orcamento.trim() ? Math.round(parseFloat(orcamento.replace(",", ".")) * 100) : 0);
            const dias = duracaoDaRede ?? duracaoDias;
            if (!orc || !Number.isFinite(orc)) return null;
            const custo = custoPorBoostCentavos(orc, dias, tipoEntrega);
            const fmt = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
            return (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-xs text-neutral-300">
                Cada boost custa até <span className="font-semibold text-neutral-100">{fmt(custo)}</span> (
                {fmt(orc)}/dia × {dias} dias{tipoEntrega === "ambos" ? " × 2 campanhas" : ""}). Postando todo dia:
                cerca de <span className="font-semibold text-neutral-100">{fmt(custo * 30)}</span> por mês.
              </div>
            );
          })()}

          {erro && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={salvando}
            className="h-10 w-full rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
