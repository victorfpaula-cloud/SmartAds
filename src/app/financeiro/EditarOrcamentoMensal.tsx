"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PencilSimple } from "@phosphor-icons/react";

/** Edita o teto de orçamento mensal comprometido pela unidade (ex: R$500) — usado pelo painel de
 * Planejamento em /financeiro?rede=franquia. Começa sempre com um valor (default R$500 no banco),
 * então é sempre "Corrigir", nunca "Configurar" como em EditarSaldo. */
export default function EditarOrcamentoMensal({
  contaId,
  orcamentoAtualCentavos,
}: {
  contaId: string;
  orcamentoAtualCentavos: number;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState((orcamentoAtualCentavos / 100).toFixed(2).replace(".", ","));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const centavos = Math.round(parseFloat(valor.replace(",", ".")) * 100);
    if (!Number.isFinite(centavos) || centavos <= 0) {
      setErro("Valor inválido.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const resposta = await fetch(`/api/contas-meta/${contaId}/orcamento-mensal`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orcamentoCentavos: centavos }),
    });
    setSalvando(false);
    if (!resposta.ok) {
      setErro("Falha ao salvar.");
      return;
    }
    setEditando(false);
    router.refresh();
  }

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        className="flex items-center gap-1 text-[10.5px] font-medium text-accent-strong hover:underline"
      >
        <PencilSimple size={11} />
        Corrigir
      </button>
    );
  }

  return (
    <form onSubmit={salvar} className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-neutral-500">R$</span>
      <input
        type="text"
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="0,00"
        autoFocus
        className="h-8 w-24 rounded-lg border border-white/14 bg-ink-850 px-2 text-sm text-neutral-100 outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
      />
      <button
        type="submit"
        disabled={salvando}
        className="h-8 rounded-lg bg-accent px-3 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
      >
        {salvando ? "Salvando…" : "Salvar"}
      </button>
      <button
        type="button"
        onClick={() => setEditando(false)}
        className="h-8 rounded-lg px-2 text-xs font-medium text-neutral-500 hover:text-neutral-300"
      >
        Cancelar
      </button>
      {erro && <span className="w-full text-[10.5px] text-danger">{erro}</span>}
    </form>
  );
}
