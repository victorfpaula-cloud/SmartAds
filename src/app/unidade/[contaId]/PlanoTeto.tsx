"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanoTeto as Plano } from "@/lib/tetoMensal";
import { reaisDigitadosParaCentavos } from "@/lib/valorEmReais";

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

/** Planejamento do teto de gasto do mês: mostra o que vai acontecer no ritmo atual e o que fazer pra
 * fechar dentro do teto. Nada é pausado sozinho — cada pausa é um clique da pessoa aqui. */
export default function PlanoTeto({ contaId, tetoInicial }: { contaId: string; tetoInicial: number | null }) {
  const router = useRouter();
  const [plano, setPlano] = useState<Plano | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [teto, setTeto] = useState(tetoInicial !== null ? (tetoInicial / 100).toFixed(2).replace(".", ",") : "");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/teto-mensal?contaId=${contaId}&plano=1`);
      const c = await r.json();
      if (!r.ok) throw new Error(c.erro || "Falha ao calcular.");
      setPlano(c.plano);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao calcular.");
    } finally {
      setCarregando(false);
    }
  }, [contaId]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvarTeto() {
    const c = teto.trim() ? reaisDigitadosParaCentavos(teto) : null;
    if (teto.trim() && (!c || c <= 0)) return setMsg("Valor inválido.");
    setOcupado("teto");
    setMsg(null);
    const r = await fetch("/api/teto-mensal", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contaId, tetoCentavos: c }) });
    const corpo = await r.json().catch(() => ({}));
    setOcupado(null);
    if (!r.ok) return setMsg(corpo.erro || "Falha ao salvar.");
    setMsg(c ? "Teto salvo." : "Teto removido.");
    router.refresh();
    carregar();
  }

  async function pausar(campaignId: string, nome: string) {
    if (!window.confirm(`Pausar a campanha "${nome}" agora?`)) return;
    setOcupado(campaignId);
    setMsg(null);
    const r = await fetch("/api/campanhas/acao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "pausar", campaignId, contaId }) });
    const corpo = await r.json().catch(() => ({}));
    setOcupado(null);
    if (!r.ok) return setMsg(corpo.erro || "Não consegui pausar.");
    setMsg(`"${nome}" pausada.`);
    carregar();
  }

  const cor = plano?.status === "atingido" ? "border-danger/40 bg-danger/10" : plano?.status === "vai_passar" ? "border-amber-400/40 bg-amber-400/10" : "border-white/10 bg-white/[0.02]";
  const pct = plano?.tetoCentavos ? Math.min(100, ((plano.gastoMesCentavos ?? 0) / plano.tetoCentavos) * 100) : 0;
  const pctProj = plano?.tetoCentavos ? Math.min(100, (plano.projetadoCentavos / plano.tetoCentavos) * 100) : 0;

  return (
    <section className="cartao-vidro p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold">Teto de gasto do mês</h2>
          <p className="mt-0.5 max-w-xl text-[11.5px] leading-snug text-neutral-500">
            O máximo que a unidade quer gastar em anúncios no mês. O app projeta o gasto, avisa e orienta — não pausa
            nada sozinho. Só bloqueia criar campanha ou boost novo que passaria do teto.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input value={teto} onChange={(e) => setTeto(e.target.value)} inputMode="decimal" placeholder="Ex.: 1000" className="h-9 w-28 rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100" />
          <button onClick={salvarTeto} disabled={ocupado !== null} className="h-9 rounded-lg bg-accent px-3.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40">
            Salvar
          </button>
        </div>
      </div>
      {msg && <p className="mt-2 text-xs text-neutral-300">{msg}</p>}

      {carregando && !plano ? (
        <p className="mt-4 text-xs text-neutral-500">Calculando com a Meta…</p>
      ) : erro ? (
        <p className="mt-4 text-xs text-danger">{erro}</p>
      ) : plano && plano.status === "sem_teto" ? (
        <p className="mt-4 text-xs text-neutral-400">
          Sem teto definido. Gasto do mês até agora: <strong className="text-neutral-200">{reais(plano.gastoMesCentavos ?? 0)}</strong>; no ritmo das
          campanhas no ar o mês fecha em ~<strong className="text-neutral-200">{reais(plano.projetadoCentavos)}</strong>.
        </p>
      ) : plano && plano.tetoCentavos ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Gasto no mês", reais(plano.gastoMesCentavos ?? 0)],
              ["Ainda vai gastar", `~${reais(plano.comprometidoCentavos)}`],
              ["Projeção do mês", `~${reais(plano.projetadoCentavos)}`],
              ["Teto", reais(plano.tetoCentavos)],
            ].map(([r, v]) => (
              <div key={r} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <p className="text-[10.5px] uppercase tracking-wide text-neutral-500">{r}</p>
                <p className="mt-0.5 text-sm font-bold text-neutral-100">{v}</p>
              </div>
            ))}
          </div>
          <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${pctProj}%` }} />
            <div className={`absolute inset-y-0 left-0 rounded-full ${plano.status === "atingido" ? "bg-danger" : plano.status === "vai_passar" ? "bg-amber-400" : "bg-ok"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-[10.5px] text-neutral-600">Barra cheia = gasto até agora; barra clara = projeção até o fim do mês.</p>

          <div className={`mt-4 rounded-lg border px-4 py-3 ${cor}`}>
            <p className="text-xs font-semibold text-neutral-100">
              {plano.status === "atingido" ? "Teto atingido" : plano.status === "vai_passar" ? `Vai passar do teto${plano.dataDoTeto ? ` por volta de ${dataBR(plano.dataDoTeto)}` : ""}` : "Planejamento em dia"}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1 text-xs leading-relaxed text-neutral-300">
              {plano.passos.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {plano && plano.campanhas.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-neutral-400">Campanhas no ar e quanto cada uma ainda deve gastar neste mês</p>
          <ul className="mt-1.5 divide-y divide-white/5 rounded-lg border border-white/10">
            {plano.campanhas.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-neutral-200">{c.nome}</p>
                  <p className="text-[10.5px] text-neutral-500">
                    {c.diarioCentavos > 0 ? `${reais(c.diarioCentavos)}/dia` : "orçamento vitalício"}
                    {c.fim ? ` · termina ${new Date(c.fim).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })}` : " · sem data de término"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs font-semibold text-neutral-200">~{reais(c.restanteCentavos)}</span>
                  <button onClick={() => pausar(c.id, c.nome)} disabled={ocupado !== null} className="rounded-lg border border-white/14 px-2.5 py-1 text-[11px] font-medium text-neutral-300 hover:bg-white/[0.04] disabled:opacity-40">
                    {ocupado === c.id ? "Pausando…" : "Pausar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
