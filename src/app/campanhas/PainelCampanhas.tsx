"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ContaMeta {
  id: string;
  meta_ad_account_nome: string | null;
  nome_exibicao: string | null;
}
interface Cliente {
  id: string;
  nome: string;
  smartads_contas_meta: ContaMeta[];
}
interface Campanha {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  spend: string;
  local: { id: string; meta_adset_id: string | null; tipo_modelo: string } | null;
}

const NOME_MODELO: Record<string, string> = {
  engajamento: "Engajamento",
  alcance: "Alcance",
  formulario: "Formulário",
  visita_perfil: "Visita ao perfil",
  cliques_link: "Cliques no link",
};

function formatarReais(centavosTexto?: string): string {
  if (!centavosTexto) return "—";
  return `R$ ${(Number(centavosTexto) / 100).toFixed(2).replace(".", ",")}`;
}

export default function PainelCampanhas({ clientes }: { clientes: Cliente[] }) {
  const clientesComConta = clientes.filter((c) => c.smartads_contas_meta.length > 0);
  const [clienteId, setClienteId] = useState(clientesComConta[0]?.id ?? "");
  const [contaId, setContaId] = useState(clientesComConta[0]?.smartads_contas_meta[0]?.id ?? "");
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [executando, setExecutando] = useState<string | null>(null);

  const contasDoCliente = clientesComConta.find((c) => c.id === clienteId)?.smartads_contas_meta ?? [];

  useEffect(() => {
    if (!contasDoCliente.some((c) => c.id === contaId)) {
      setContaId(contasDoCliente[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  function carregar() {
    if (!contaId) return;
    setCarregando(true);
    setErro(null);
    fetch(`/api/campanhas/status?contaId=${contaId}`)
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro || "Falha ao carregar campanhas.");
        setCampanhas(corpo.campanhas ?? []);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contaId]);

  async function alternarStatus(campanha: Campanha) {
    const pausada = campanha.effective_status !== "ACTIVE";
    setExecutando(campanha.id);
    const resposta = await fetch("/api/campanhas/acao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao: pausada ? "ativar" : "pausar",
        campaignId: campanha.id,
        contaId,
      }),
    });
    setExecutando(null);
    if (resposta.ok) {
      carregar();
    } else {
      const corpo = await resposta.json();
      alert(corpo.erro || "Falha ao alterar status.");
    }
  }

  async function editarOrcamento(campanha: Campanha) {
    if (!campanha.local?.meta_adset_id) {
      alert("Essa campanha não tem conjunto de anúncios rastreado localmente pra editar por aqui.");
      return;
    }
    const tipo = campanha.daily_budget ? "diario" : "vitalicio";
    const atual = Number(campanha.daily_budget ?? campanha.lifetime_budget ?? 0) / 100;
    const novoValor = prompt(`Novo orçamento ${tipo === "diario" ? "diário" : "total"} (R$):`, String(atual));
    if (!novoValor) return;

    const valorCentavos = Math.round(parseFloat(novoValor.replace(",", ".")) * 100);
    setExecutando(campanha.id);
    const resposta = await fetch("/api/campanhas/acao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "orcamento", adsetId: campanha.local.meta_adset_id, tipo, valorCentavos, contaId }),
    });
    setExecutando(null);
    if (resposta.ok) {
      carregar();
    } else {
      const corpo = await resposta.json();
      alert(corpo.erro || "Falha ao alterar orçamento.");
    }
  }

  if (clientesComConta.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-neutral-400">
        Associe uma conta de anúncio em Contas primeiro.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
          className="h-10 rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
        >
          {clientesComConta.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select
          value={contaId}
          onChange={(e) => setContaId(e.target.value)}
          className="h-10 rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
        >
          {contasDoCliente.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome_exibicao || c.meta_ad_account_nome}
            </option>
          ))}
        </select>
      </div>

      {erro && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{erro}</div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
        {carregando ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Carregando campanhas…</p>
        ) : campanhas.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Nenhuma campanha nessa conta ainda.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-3 font-medium">Campanha</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Orçamento</th>
                <th className="px-4 py-3 font-medium">Gasto</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {campanhas.map((campanha) => (
                <tr key={campanha.id}>
                  <td className="px-4 py-3 font-medium text-neutral-100">{campanha.name}</td>
                  <td className="px-4 py-3 text-neutral-400">
                    {campanha.local ? NOME_MODELO[campanha.local.tipo_modelo] : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => alternarStatus(campanha)}
                      disabled={executando === campanha.id}
                      className={
                        campanha.effective_status === "ACTIVE"
                          ? "rounded-full bg-ok/15 px-2.5 py-1 text-xs font-semibold text-ok"
                          : "rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-neutral-400"
                      }
                    >
                      {campanha.effective_status === "ACTIVE" ? "Ativa" : "Pausada"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-neutral-300">
                    {formatarReais(campanha.daily_budget ?? campanha.lifetime_budget)}
                    <span className="ml-1 text-neutral-600">{campanha.daily_budget ? "/dia" : ""}</span>
                  </td>
                  <td className="px-4 py-3 text-neutral-300">{formatarReais(campanha.spend)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => editarOrcamento(campanha)}
                        disabled={executando === campanha.id}
                        className="text-xs font-medium text-accent-strong hover:underline"
                      >
                        Orçamento
                      </button>
                      {campanha.local && (
                        <Link
                          href={`/campanhas/duplicar/${campanha.local.id}`}
                          className="text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:underline"
                        >
                          Duplicar
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Link href="/campanhas/nova" className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong">
        + Nova campanha
      </Link>
    </div>
  );
}
