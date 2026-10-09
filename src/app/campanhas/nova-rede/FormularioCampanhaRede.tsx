"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Publico } from "@/lib/meta/tipos";

export interface UnidadeRede {
  contaId: string;
  nome: string;
  detalhe: string;
  publicos: { id: string; nome: string; targeting: Publico }[];
}

type Estado = { tipo: "espera" | "enviando" | "ok" | "erro"; msg?: string };

const campo = "mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100";

/** Reduz a arte antes de enviar: a mesma imagem vai uma vez por unidade e o corpo de cada requisição
 * tem limite de tamanho. */
function reduzir(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, 1440 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = () => reject(new Error("Imagem inválida."));
    img.src = url;
  });
}

export default function FormularioCampanhaRede({ unidades }: { unidades: UnidadeRede[] }) {
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({});
  const [publicoPorConta, setPublicoPorConta] = useState<Record<string, string>>(() =>
    Object.fromEntries(unidades.map((u) => [u.contaId, u.publicos[0]?.id ?? ""]))
  );
  const [nomeBase, setNomeBase] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [titulo, setTitulo] = useState("");
  const [imagens, setImagens] = useState<string[]>([]);
  const [tipoOrc, setTipoOrc] = useState<"diario" | "vitalicio">("diario");
  const [valor, setValor] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [enviando, setEnviando] = useState(false);
  const [erroImagem, setErroImagem] = useState<string | null>(null);

  const valorCentavos = Math.round(parseFloat((valor || "0").replace(",", ".")) * 100) || 0;
  const escolhidas = unidades.filter((u) => marcadas[u.contaId] && publicoPorConta[u.contaId]);
  const orcOk = valorCentavos > 0 && (tipoOrc === "diario" || (inicio && fim && fim >= inicio));
  const pronto = escolhidas.length > 0 && nomeBase.trim() && mensagem.trim() && imagens.length > 0 && orcOk && !enviando;

  const todasMarcadas = useMemo(() => unidades.filter((u) => u.publicos.length).every((u) => marcadas[u.contaId]), [unidades, marcadas]);

  async function adicionarImagens(arquivos: FileList | null) {
    setErroImagem(null);
    if (!arquivos) return;
    try {
      const novas = await Promise.all(Array.from(arquivos).map(reduzir));
      setImagens((a) => [...a, ...novas]);
    } catch {
      setErroImagem("Não consegui ler essa imagem.");
    }
  }

  async function publicar() {
    setEnviando(true);
    setEstados(Object.fromEntries(escolhidas.map((u) => [u.contaId, { tipo: "espera" } as Estado])));
    for (const u of escolhidas) {
      setEstados((e) => ({ ...e, [u.contaId]: { tipo: "enviando" } }));
      const publicoId = publicoPorConta[u.contaId];
      const publico = u.publicos.find((p) => p.id === publicoId)!;
      try {
        const r = await fetch("/api/campanhas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contaId: u.contaId,
            tipoModelo: "alcance",
            nomeCampanha: `${nomeBase.trim()} - ${u.nome}`,
            publico: publico.targeting,
            publicoId,
            orcamento: {
              tipo: tipoOrc,
              valorCentavos,
              dataInicio: inicio || undefined,
              dataFim: fim || undefined,
            },
            criativo: { usarPostExistente: false, mensagem, titulo: titulo || undefined, imagensBase64: imagens },
          }),
        });
        const c = await r.json().catch(() => ({}));
        setEstados((e) => ({ ...e, [u.contaId]: r.ok ? { tipo: "ok" } : { tipo: "erro", msg: c.erro || "Falhou." } }));
      } catch {
        setEstados((e) => ({ ...e, [u.contaId]: { tipo: "erro", msg: "Sem conexão." } }));
      }
    }
    setEnviando(false);
  }

  const terminou = Object.keys(estados).length > 0 && !enviando;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <section className="cartao-vidro p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-200">1. Unidades</h2>
          <button
            type="button"
            className="text-xs font-semibold text-accent-strong hover:underline"
            onClick={() =>
              setMarcadas(Object.fromEntries(unidades.map((u) => [u.contaId, !todasMarcadas && u.publicos.length > 0])))
            }
          >
            {todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
          </button>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {unidades.map((u) => {
            const sem = u.publicos.length === 0;
            const est = estados[u.contaId];
            return (
              <li key={u.contaId} className={`rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 ${sem ? "opacity-60" : ""}`}>
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    disabled={sem || enviando}
                    checked={!!marcadas[u.contaId]}
                    onChange={(e) => setMarcadas((m) => ({ ...m, [u.contaId]: e.target.checked }))}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="text-sm font-medium text-neutral-100">{u.nome}</span>
                  {est && (
                    <span
                      className={`ml-auto text-[11px] font-semibold ${
                        est.tipo === "ok" ? "text-ok" : est.tipo === "erro" ? "text-danger" : "text-neutral-400"
                      }`}
                    >
                      {est.tipo === "ok" ? "Criada (pausada)" : est.tipo === "erro" ? "Erro" : est.tipo === "enviando" ? "Enviando…" : "Na fila"}
                    </span>
                  )}
                </label>
                {sem ? (
                  <p className="mt-1 pl-6 text-[11px] text-amber-400">
                    Sem público salvo —{" "}
                    <Link href="/publicos" className="underline">
                      crie um em Públicos
                    </Link>
                  </p>
                ) : (
                  <select
                    value={publicoPorConta[u.contaId]}
                    onChange={(e) => setPublicoPorConta((p) => ({ ...p, [u.contaId]: e.target.value }))}
                    disabled={enviando}
                    className="mt-1.5 h-8 w-full rounded-md border border-white/14 bg-ink-850 px-2 text-xs text-neutral-200"
                  >
                    {u.publicos.map((p) => (
                      <option key={p.id} value={p.id}>
                        Público: {p.nome}
                      </option>
                    ))}
                  </select>
                )}
                {est?.tipo === "erro" && <p className="mt-1 pl-6 text-[11px] text-danger">{est.msg}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="cartao-vidro flex flex-col gap-4 p-5">
        <h2 className="text-sm font-semibold text-neutral-200">2. A campanha (alcance)</h2>
        <div>
          <label className="text-xs font-semibold text-neutral-400">Nome da campanha</label>
          <input value={nomeBase} onChange={(e) => setNomeBase(e.target.value)} placeholder="Ex.: Dia das Mães" className={campo} />
          <p className="mt-1 text-[11px] text-neutral-500">Cada unidade recebe “nome - Unidade”.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-neutral-400">Arte (imagem)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => adicionarImagens(e.target.files)}
            className="mt-1 block w-full text-xs text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-neutral-100"
          />
          {erroImagem && <p className="mt-1 text-xs text-danger">{erroImagem}</p>}
          {imagens.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {imagens.map((im, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:image/jpeg;base64,${im}`} alt="" className="h-20 w-20 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => setImagens((a) => a.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-ink-900 text-[11px] text-neutral-200 ring-1 ring-white/20"
                    aria-label="Remover imagem"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-neutral-400">Texto do anúncio</label>
          <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} className={`${campo} h-auto py-2`} />
        </div>
        <div>
          <label className="text-xs font-semibold text-neutral-400">Título (opcional)</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-neutral-400">Orçamento</label>
            <select value={tipoOrc} onChange={(e) => setTipoOrc(e.target.value as "diario" | "vitalicio")} className={campo}>
              <option value="diario">Diário</option>
              <option value="vitalicio">Total da campanha</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-400">Valor por unidade (R$)</label>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} />
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-400">Início {tipoOrc === "diario" && "(opcional)"}</label>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} />
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-400">Fim {tipoOrc === "diario" && "(opcional)"}</label>
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={campo} />
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-xs text-neutral-300">
          {escolhidas.length} unidade{escolhidas.length === 1 ? "" : "s"} ×{" "}
          {valorCentavos ? `R$ ${(valorCentavos / 100).toFixed(2).replace(".", ",")}` : "R$ 0,00"}
          {tipoOrc === "diario" ? "/dia" : " no total"}
          {valorCentavos && tipoOrc === "vitalicio"
            ? ` = R$ ${((valorCentavos * escolhidas.length) / 100).toFixed(2).replace(".", ",")} somando todas`
            : ""}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={publicar}
            disabled={!pronto}
            className="h-11 rounded-lg bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
          >
            {enviando ? "Criando…" : `Criar em ${escolhidas.length || ""} unidade${escolhidas.length === 1 ? "" : "s"}`}
          </button>
          {terminou && (
            <Link href="/campanhas" className="text-sm font-semibold text-accent-strong hover:underline">
              Ver campanhas →
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
