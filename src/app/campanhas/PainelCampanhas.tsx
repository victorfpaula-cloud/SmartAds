"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NotePencil, X } from "@phosphor-icons/react";

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
  if (!centavosTexto) return "-";
  return `R$ ${(Number(centavosTexto) / 100).toFixed(2).replace(".", ",")}`;
}

export default function PainelCampanhas({ clientes }: { clientes: Cliente[] }) {
  const clientesComConta = clientes.filter((c) => c.smartads_contas_meta.length > 0);
  const [clienteId, setClienteId] = useState(clientesComConta[0]?.id ?? "");
  const [contaId, setContaId] = useState(clientesComConta[0]?.smartads_contas_meta[0]?.id ?? "");
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [proximoCursor, setProximoCursor] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [executando, setExecutando] = useState<string | null>(null);
  const [campanhaComNotas, setCampanhaComNotas] = useState<Campanha | null>(null);

  const contasDoCliente = clientesComConta.find((c) => c.id === clienteId)?.smartads_contas_meta ?? [];

  useEffect(() => {
    if (!contasDoCliente.some((c) => c.id === contaId)) {
      setContaId(contasDoCliente[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  // Paginado (20 por vez) — contas com muitas campanhas travavam a tela carregando tudo de uma
  // vez só. `carregar()` recarrega a primeira página do zero; `carregarMais()` busca a próxima
  // leva e acrescenta na lista.
  function carregar() {
    if (!contaId) return;
    setCarregando(true);
    setErro(null);
    fetch(`/api/campanhas/status?contaId=${contaId}`)
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro || "Falha ao carregar campanhas.");
        setCampanhas(corpo.campanhas ?? []);
        setProximoCursor(corpo.proximoCursor ?? null);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }

  function carregarMais() {
    if (!contaId || !proximoCursor) return;
    setCarregandoMais(true);
    fetch(`/api/campanhas/status?contaId=${contaId}&after=${proximoCursor}`)
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro || "Falha ao carregar mais campanhas.");
        setCampanhas((atual) => [...atual, ...(corpo.campanhas ?? [])]);
        setProximoCursor(corpo.proximoCursor ?? null);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregandoMais(false));
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
      <p className="cartao-vidro px-5 py-6 text-sm text-neutral-400">
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

      <div className="cartao-vidro overflow-hidden">
        {carregando ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Carregando campanhas…</p>
        ) : campanhas.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Nenhuma campanha nessa conta ainda.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
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
                    {campanha.local ? NOME_MODELO[campanha.local.tipo_modelo] : "-"}
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
                      <button
                        onClick={() => setCampanhaComNotas(campanha)}
                        className="text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:underline"
                      >
                        Notas
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
          </div>
        )}
      </div>

      {proximoCursor && !carregando && (
        <button
          onClick={carregarMais}
          disabled={carregandoMais}
          className="w-fit rounded-lg border border-white/14 bg-ink-850 px-4 py-2 text-sm font-medium text-neutral-300 hover:text-neutral-100 disabled:opacity-40"
        >
          {carregandoMais ? "Carregando…" : "Carregar mais campanhas"}
        </button>
      )}

      <Link href="/campanhas/nova" className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong">
        + Nova campanha
      </Link>

      {campanhaComNotas && (
        <ModalAnotacoes campanha={campanhaComNotas} onFechar={() => setCampanhaComNotas(null)} />
      )}
    </div>
  );
}

interface Anotacao {
  id: string;
  texto: string;
  created_at: string;
}

/** Anotações livres por campanha — "cliente pediu pra pausar dia 20", esse tipo de coisa que não
 * cabe em nenhum campo estruturado do app. Ficam salvas pelo ID da campanha na Meta, então
 * funcionam pra qualquer campanha do painel, mesmo uma que já existia antes do SmartAds. */
function ModalAnotacoes({ campanha, onFechar }: { campanha: Campanha; onFechar: () => void }) {
  const [anotacoes, setAnotacoes] = useState<Anotacao[] | null>(null);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    fetch(`/api/anotacoes?campaignId=${campanha.id}`)
      .then((r) => r.json())
      .then((corpo) => setAnotacoes(corpo.anotacoes ?? []))
      .catch(() => setAnotacoes([]));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanha.id]);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!texto.trim()) return;
    setSalvando(true);

    const resposta = await fetch("/api/anotacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campanha.id, texto }),
    });
    setSalvando(false);

    if (resposta.ok) {
      setTexto("");
      carregar();
    } else {
      const corpo = await resposta.json();
      alert(corpo.erro || "Falha ao salvar a anotação.");
    }
  }

  async function excluir(id: string) {
    setAnotacoes((atual) => atual?.filter((a) => a.id !== id) ?? null);
    await fetch(`/api/anotacoes/${id}`, { method: "DELETE" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-white/10 bg-ink-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-ink-900 px-5 py-3.5">
          <div className="flex items-center gap-2 overflow-hidden">
            <NotePencil size={16} className="shrink-0 text-neutral-400" />
            <h3 className="truncate text-sm font-semibold text-neutral-100">{campanha.name}</h3>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="botao-icone-vidro h-8 w-8 shrink-0">
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <form onSubmit={salvar} className="flex flex-col gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex: cliente pediu pra pausar dia 20"
              rows={2}
              className="w-full resize-none rounded-lg border border-white/14 bg-ink-850 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
            />
            <button
              type="submit"
              disabled={salvando || !texto.trim()}
              className="h-9 w-fit rounded-lg bg-accent px-4 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
            >
              {salvando ? "Salvando…" : "Adicionar anotação"}
            </button>
          </form>

          <div className="flex flex-col gap-2">
            {anotacoes === null ? (
              <p className="text-xs text-neutral-500">Carregando…</p>
            ) : anotacoes.length === 0 ? (
              <p className="text-xs text-neutral-500">Nenhuma anotação ainda nessa campanha.</p>
            ) : (
              anotacoes.map((anotacao) => (
                <div key={anotacao.id} className="cartao-vidro-interno flex items-start justify-between gap-2 px-3 py-2.5">
                  <div>
                    <p className="text-xs leading-relaxed text-neutral-300">{anotacao.texto}</p>
                    <p className="mt-1 text-[10.5px] text-neutral-600">
                      {new Date(anotacao.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => excluir(anotacao.id)}
                    aria-label="Excluir anotação"
                    className="shrink-0 text-neutral-600 hover:text-danger"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
