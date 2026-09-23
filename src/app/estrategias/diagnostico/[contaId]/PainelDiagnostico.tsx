"use client";

import { useEffect, useState } from "react";

interface Sugestao {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string;
  status: string;
}

interface Diagnostico {
  id: string;
  texto: string;
  gerado_em: string;
}

const RUBRICA_TIPO: Record<string, string> = {
  nova_campanha: "Nova campanha",
  ajustar_orcamento: "Ajustar orçamento",
  pausar_campanha: "Pausar campanha",
  turbinar_post: "Turbinar post",
  outro: "Outro",
};

const RUBRICA_STATUS: Record<string, { texto: string; classe: string }> = {
  pendente: { texto: "Aguardando decisão", classe: "bg-amber-500/15 text-amber-400" },
  aprovada: { texto: "Aprovada", classe: "bg-emerald-500/15 text-emerald-400" },
  aplicada: { texto: "Aplicada na Meta", classe: "bg-emerald-500/15 text-emerald-400" },
  rejeitada: { texto: "Rejeitada", classe: "bg-white/10 text-neutral-500" },
  erro: { texto: "Erro ao aplicar", classe: "bg-red-500/15 text-red-400" },
};

export default function PainelDiagnostico({ contaId, clienteId }: { contaId: string; clienteId: string }) {
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    fetch(`/api/diagnostico?contaId=${contaId}`)
      .then((r) => r.json())
      .then((corpo) => {
        setDiagnostico(corpo.diagnostico);
        setSugestoes(corpo.sugestoes ?? []);
      })
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, [contaId]);

  async function gerarNovo() {
    setGerando(true);
    setErro(null);
    const resposta = await fetch("/api/diagnostico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteId, contaId }),
    });
    const corpo = await resposta.json();
    setGerando(false);
    if (!resposta.ok) {
      setErro(corpo.erro || "Falha ao gerar o diagnóstico.");
      return;
    }
    setDiagnostico(corpo.diagnostico);
    setSugestoes(corpo.sugestoes ?? []);
  }

  async function decidir(sugestaoId: string, decisao: "aprovar" | "rejeitar") {
    setDecidindo(sugestaoId);
    const resposta = await fetch(`/api/sugestoes/${sugestaoId}/decidir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisao }),
    });
    const corpo = await resposta.json();
    setDecidindo(null);
    if (!resposta.ok) {
      alert(corpo.erro || "Falha ao decidir a sugestão.");
      return;
    }
    carregar();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          {diagnostico ? `Gerado em ${new Date(diagnostico.gerado_em).toLocaleString("pt-BR")}` : "Nenhum diagnóstico gerado ainda."}
        </p>
        <button
          onClick={gerarNovo}
          disabled={gerando}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
        >
          {gerando ? "Gerando…" : diagnostico ? "Gerar diagnóstico novo" : "Gerar diagnóstico"}
        </button>
      </div>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      {carregando ? (
        <p className="cartao-vidro px-5 py-6 text-sm text-neutral-500">Carregando…</p>
      ) : diagnostico ? (
        <>
          <div className="cartao-vidro p-5">
            <p className="text-sm leading-relaxed text-neutral-200">{diagnostico.texto}</p>
          </div>

          {sugestoes.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Sugestões</p>
              {sugestoes.map((s) => {
                const status = RUBRICA_STATUS[s.status] ?? RUBRICA_STATUS.pendente;
                return (
                  <div key={s.id} className="cartao-vidro flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-neutral-100">
                        {s.titulo}{" "}
                        <span className="font-normal text-neutral-500">({RUBRICA_TIPO[s.tipo] ?? s.tipo})</span>
                      </p>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.classe}`}>
                        {status.texto}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400">{s.descricao}</p>
                    {s.status === "pendente" && (
                      <div className="mt-1 flex gap-2">
                        <button
                          onClick={() => decidir(s.id, "aprovar")}
                          disabled={decidindo === s.id}
                          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
                        >
                          {decidindo === s.id ? "Aplicando…" : "Aprovar"}
                        </button>
                        <button
                          onClick={() => decidir(s.id, "rejeitar")}
                          disabled={decidindo === s.id}
                          className="rounded-lg border border-white/14 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-white/[0.04]"
                        >
                          Rejeitar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <p className="cartao-vidro px-5 py-6 text-sm text-neutral-400">
          Clique em "Gerar diagnóstico" pra cruzar os dados dessa unidade agora.
        </p>
      )}
    </div>
  );
}
