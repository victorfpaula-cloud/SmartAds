"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UnidadeElegivel {
  clienteId: string;
  clienteNome: string;
  contaId: string;
  contaNome: string;
}

interface PublicoSalvoResumo {
  id: string;
  nome: string;
}

interface LinhaSelecao {
  marcada: boolean;
  publicoId: string;
  investimentoReais: string;
}

export default function AplicarCampanhaMaeForm({
  campanhaId,
  investimentoMinimoCentavos,
  investimentoMaximoCentavos,
  unidades,
  publicosPorCliente,
}: {
  campanhaId: string;
  investimentoMinimoCentavos: number;
  investimentoMaximoCentavos: number;
  unidades: UnidadeElegivel[];
  publicosPorCliente: Record<string, PublicoSalvoResumo[]>;
}) {
  const router = useRouter();
  const valorMinimoInicial = String(investimentoMinimoCentavos / 100).replace(".", ",");

  const [selecao, setSelecao] = useState<Record<string, LinhaSelecao>>(
    Object.fromEntries(
      unidades.map((u) => [u.contaId, { marcada: false, publicoId: "", investimentoReais: valorMinimoInicial }])
    )
  );
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ criados: number; falhas: { contaId: string; erro: string }[] } | null>(null);

  function atualizar(contaId: string, campo: keyof LinhaSelecao, valor: string | boolean) {
    setSelecao((atual) => ({ ...atual, [contaId]: { ...atual[contaId], [campo]: valor } }));
  }

  const marcadas = unidades.filter((u) => selecao[u.contaId]?.marcada);

  async function aplicar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setResultado(null);

    if (marcadas.length === 0) {
      setErro("Selecione pelo menos uma unidade.");
      return;
    }

    const unidadesParaEnviar: {
      clienteId: string;
      contaId: string;
      investimentoCentavos: number;
      publicoId?: string;
    }[] = [];

    for (const u of marcadas) {
      const linha = selecao[u.contaId];
      const investimentoCentavos = Math.round(Number(linha.investimentoReais.replace(",", ".")) * 100) || 0;
      if (!linha.publicoId) {
        setErro(`Selecione um público salvo pra ${u.clienteNome} (${u.contaNome}).`);
        return;
      }
      if (investimentoCentavos < investimentoMinimoCentavos || investimentoCentavos > investimentoMaximoCentavos) {
        setErro(`Investimento de ${u.clienteNome} (${u.contaNome}) fora da faixa permitida.`);
        return;
      }
      unidadesParaEnviar.push({
        clienteId: u.clienteId,
        contaId: u.contaId,
        investimentoCentavos,
        publicoId: linha.publicoId,
      });
    }

    setAplicando(true);
    const resposta = await fetch(`/api/campanhas-mae/${campanhaId}/aplicar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unidades: unidadesParaEnviar }),
    });
    const corpo = await resposta.json();
    setAplicando(false);

    if (!resposta.ok) {
      setErro(corpo.erro || "Falha ao aplicar a Campanha-Mãe.");
      return;
    }
    if (corpo.falhas?.length > 0) {
      setResultado(corpo);
      return;
    }
    router.push(`/estrategias/campanhas-mae/${campanhaId}`);
  }

  if (unidades.length === 0) {
    return (
      <p className="cartao-vidro px-5 py-6 text-sm text-neutral-500">
        Todas as unidades da franquia já participam dessa Campanha-Mãe.
      </p>
    );
  }

  return (
    <form onSubmit={aplicar} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {unidades.map((u) => {
          const linha = selecao[u.contaId];
          const publicos = publicosPorCliente[u.clienteId] ?? [];
          return (
            <div key={u.contaId} className="cartao-vidro-interno flex flex-col gap-2.5 p-4">
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={linha.marcada}
                  onChange={(e) => atualizar(u.contaId, "marcada", e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span className="text-sm font-semibold text-neutral-100">{u.clienteNome}</span>
                <span className="text-xs text-neutral-500">{u.contaNome}</span>
              </label>

              {linha.marcada && (
                <div className="grid grid-cols-1 gap-2.5 pl-6 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-neutral-500">Público salvo</label>
                    {publicos.length === 0 ? (
                      <p className="text-xs text-amber-400">
                        Sem público salvo pra {u.clienteNome} — monte um antes na tela de Estratégias.
                      </p>
                    ) : (
                      <select
                        value={linha.publicoId}
                        onChange={(e) => atualizar(u.contaId, "publicoId", e.target.value)}
                        className="h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-xs text-neutral-100"
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
                    <label className="mb-1 block text-[11px] font-semibold text-neutral-500">Investimento</label>
                    <div className="flex h-9 items-center rounded-lg border border-white/14 bg-ink-850 px-2.5">
                      <span className="mr-1 text-xs text-neutral-500">R$</span>
                      <input
                        value={linha.investimentoReais}
                        onChange={(e) => atualizar(u.contaId, "investimentoReais", e.target.value)}
                        inputMode="decimal"
                        className="h-full w-full bg-transparent text-xs text-neutral-100 outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      {resultado && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
          <p>{resultado.criados} unidade(s) aplicada(s) com sucesso. {resultado.falhas.length} falharam:</p>
          <ul className="mt-1 list-disc pl-4">
            {resultado.falhas.map((f) => (
              <li key={f.contaId}>{f.erro}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={aplicando || marcadas.length === 0}
        className="h-12 w-full rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
      >
        {aplicando ? "Aplicando…" : `Aplicar em ${marcadas.length} unidade${marcadas.length !== 1 ? "s" : ""}`}
      </button>
    </form>
  );
}
