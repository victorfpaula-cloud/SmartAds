"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash } from "@phosphor-icons/react";
import { ROTULO_ENTREGA, type RegraBoostRede, type TipoEntregaBoost } from "@/lib/boostRede";

const TIPOS: TipoEntregaBoost[] = ["engajamento", "alcance", "ambos"];
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const campo = "mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100";

/** Datas especiais do boost de UMA conta (ex.: 01/12 a 25/12 entrega engajamento + alcance). Salva
 * na hora, separado do botão Salvar do modal. */
export default function DatasEspeciaisConta({ contaId }: { contaId: string }) {
  const [regras, setRegras] = useState<RegraBoostRede[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [tipo, setTipo] = useState<TipoEntregaBoost>("ambos");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const valido = useMemo(() => nome.trim() && inicio && fim && fim >= inicio, [nome, inicio, fim]);

  useEffect(() => {
    fetch(`/api/boost-rede/regras?contaId=${contaId}`)
      .then((r) => r.json())
      .then((c) => setRegras(c.regras ?? []))
      .catch(() => setRegras([]));
  }, [contaId]);

  async function criar() {
    setSalvando(true);
    setErro(null);
    const r = await fetch("/api/boost-rede/regras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contaId, nome, dataInicio: inicio, dataFim: fim, tipoEntrega: tipo }),
    });
    const c = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) return setErro(c.erro || "Falha ao criar.");
    setRegras((a) =>
      [...(a ?? []), { id: c.id, nome: nome.trim(), dataInicio: inicio, dataFim: fim, tipoEntrega: tipo, boostsPorDia: null }].sort((x, y) =>
        x.dataInicio.localeCompare(y.dataInicio)
      )
    );
    setNome("");
    setInicio("");
    setFim("");
    setAberto(false);
  }

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <div>
      <p className="text-xs font-semibold text-neutral-400">Datas especiais (opcional)</p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-neutral-500">
        Num período, esta conta troca o que o boost entrega (ex.: Natal com engajamento + alcance). Depois volta ao normal.
      </p>
      {regras === null ? (
        <p className="mt-2 text-xs text-neutral-500">Carregando…</p>
      ) : (
        regras.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {regras.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <div>
                  <p className="text-[13px] font-semibold text-neutral-100">
                    {r.nome}
                    {r.dataInicio <= hoje && hoje <= r.dataFim && (
                      <span className="ml-2 rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-semibold text-ok">em vigor</span>
                    )}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {dataBR(r.dataInicio)} a {dataBR(r.dataFim)} · {ROTULO_ENTREGA[r.tipoEntrega]}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Apagar data especial"
                  className="botao-icone-vidro h-8 w-8"
                  onClick={async () => {
                    if (!window.confirm(`Apagar "${r.nome}"?`)) return;
                    const resp = await fetch(`/api/boost-rede/regras?id=${r.id}`, { method: "DELETE" });
                    if (resp.ok) setRegras((a) => (a ?? []).filter((x) => x.id !== r.id));
                  }}
                >
                  <Trash size={14} />
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {!aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="mt-2 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-white/10"
        >
          + Nova data especial
        </button>
      ) : (
        <div className="mt-2 grid gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-neutral-400">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Natal" className={campo} />
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-400">De</label>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} />
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-400">Até</label>
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={campo} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-neutral-400">Nesse período o boost entrega</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEntregaBoost)} className={campo}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_ENTREGA[t]}
                </option>
              ))}
            </select>
          </div>
          {erro && <p className="text-xs text-danger sm:col-span-2">{erro}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={criar}
              disabled={!valido || salvando}
              className="h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
            >
              {salvando ? "Salvando…" : "Adicionar"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="h-9 rounded-lg px-4 text-sm text-neutral-400 hover:text-neutral-200">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
