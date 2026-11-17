"use client";

import { useEffect, useState } from "react";
import { CaretDown, ArrowsClockwise } from "@phosphor-icons/react";
import type { Totais24h } from "@/app/api/resultado-24h/route";

interface Campanha {
  id: string;
  nome: string;
  horasNoAr: number | null;
  thumbnailUrl: string | null;
  legenda: string | null;
  desdeInicio: Totais24h;
  hoje: Totais24h;
}
interface Resultado {
  hoje: Totais24h;
  ontem: Totais24h;
  campanhas: Campanha[];
}
type Estado = { tipo: "carregando" } | { tipo: "ok"; r: Resultado } | { tipo: "erro"; msg: string };

const R = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const I = (n: number) => Math.round(n).toLocaleString("pt-BR");
const horas = (h: number | null) => (h === null ? "—" : h < 1 ? "menos de 1h" : h < 48 ? `${Math.floor(h)}h` : `${Math.floor(h / 24)} dias`);

function Numeros({ t, destaque }: { t: Totais24h; destaque?: boolean }) {
  return (
    <div className={`grid grid-cols-4 gap-1.5 text-center ${destaque ? "" : "opacity-80"}`}>
      {[
        ["Gasto", R(t.gasto)],
        ["Alcance", I(t.alcance)],
        ["Curtidas", I(t.curtidas)],
        ["Engaj.", I(t.engajamentos)],
      ].map(([r, v]) => (
        <div key={r} className="rounded-md bg-white/[0.03] px-1 py-1.5">
          <p className="text-[9.5px] uppercase tracking-wide text-neutral-500">{r}</p>
          <p className="text-[13px] font-bold text-neutral-100 tabular-nums">{v}</p>
        </div>
      ))}
    </div>
  );
}

/** Uma linha por unidade, buscada aos poucos (3 de cada vez) pra não esperar a rede inteira. */
export default function PainelUltimas24h({ unidades }: { unidades: Array<{ contaId: string; nome: string }> }) {
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [aberta, setAberta] = useState<string | null>(null);
  const [rodada, setRodada] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setEstados(Object.fromEntries(unidades.map((u) => [u.contaId, { tipo: "carregando" } as Estado])));
    const fila = [...unidades];
    const trabalhar = async () => {
      for (;;) {
        const u = fila.shift();
        if (!u || cancelado) return;
        try {
          const r = await fetch(`/api/resultado-24h?contaId=${u.contaId}`);
          const c = await r.json();
          if (!cancelado) setEstados((e) => ({ ...e, [u.contaId]: r.ok ? { tipo: "ok", r: c } : { tipo: "erro", msg: c.erro || "Falha na Meta." } }));
        } catch {
          if (!cancelado) setEstados((e) => ({ ...e, [u.contaId]: { tipo: "erro", msg: "Sem conexão." } }));
        }
      }
    };
    Promise.all([trabalhar(), trabalhar(), trabalhar()]);
    return () => {
      cancelado = true;
    };
  }, [unidades, rodada]);

  const prontas = Object.values(estados).filter((e): e is { tipo: "ok"; r: Resultado } => e.tipo === "ok");
  const soma = (k: "hoje" | "ontem") =>
    prontas.reduce<Totais24h>(
      (t, e) => ({
        gasto: t.gasto + e.r[k].gasto,
        alcance: t.alcance + e.r[k].alcance,
        impressoes: t.impressoes + e.r[k].impressoes,
        curtidas: t.curtidas + e.r[k].curtidas,
        engajamentos: t.engajamentos + e.r[k].engajamentos,
        visitas: t.visitas + e.r[k].visitas,
        cliques: t.cliques + e.r[k].cliques,
      }),
      { gasto: 0, alcance: 0, impressoes: 0, curtidas: 0, engajamentos: 0, visitas: 0, cliques: 0 }
    );

  return (
    <div className="flex flex-col gap-3">
      {unidades.length > 1 && (
        <div className="cartao-vidro grid gap-3 p-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-300">Rede · hoje até agora</p>
            <Numeros t={soma("hoje")} destaque />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-300">Rede · ontem (dia inteiro)</p>
            <Numeros t={soma("ontem")} />
          </div>
          <p className="text-[10.5px] text-neutral-600 sm:col-span-2">
            {prontas.length} de {unidades.length} unidades carregadas. Alcance é a soma das campanhas (a mesma pessoa em duas campanhas conta duas vezes).
          </p>
        </div>
      )}
      <button onClick={() => setRodada((n) => n + 1)} className="flex w-fit items-center gap-1.5 rounded-lg border border-white/14 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/[0.04]">
        <ArrowsClockwise size={13} /> Atualizar
      </button>
      {unidades.map((u) => {
        const e = estados[u.contaId];
        const r = e?.tipo === "ok" ? e.r : null;
        const aberto = aberta === u.contaId;
        return (
          <div key={u.contaId} className="cartao-vidro overflow-hidden">
            <button onClick={() => setAberta(aberto ? null : u.contaId)} className="flex w-full flex-col gap-2.5 px-4 py-3.5 text-left">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[15px] font-bold text-neutral-100">{u.nome}</p>
                <span className="flex items-center gap-2 text-[11px] text-neutral-500">
                  {e?.tipo === "carregando" ? "carregando…" : e?.tipo === "erro" ? <span className="text-amber-300">{e.msg}</span> : `${r?.campanhas.length ?? 0} campanha(s) no ar`}
                  <CaretDown size={13} className={`transition ${aberto ? "rotate-180" : ""}`} />
                </span>
              </div>
              {r && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[10.5px] font-semibold text-neutral-400">Hoje até agora</p>
                    <Numeros t={r.hoje} destaque />
                  </div>
                  <div>
                    <p className="mb-1 text-[10.5px] font-semibold text-neutral-400">Ontem (dia inteiro)</p>
                    <Numeros t={r.ontem} />
                  </div>
                </div>
              )}
            </button>
            {aberto && r && (
              <div className="border-t border-white/10 px-4 py-3">
                {r.campanhas.length === 0 ? (
                  <p className="text-xs text-neutral-500">Nenhuma campanha no ar agora.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-white/5">
                    {r.campanhas.map((c) => (
                      <li key={c.id} className="flex gap-3 py-2.5">
                        {c.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-lg border border-white/10 object-cover" />
                        ) : (
                          <span className="h-12 w-12 shrink-0 rounded-lg bg-white/[0.04]" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-neutral-100">{c.nome}</p>
                          <p className="text-[11px] text-neutral-500">
                            No ar há <strong className="text-neutral-300">{horas(c.horasNoAr)}</strong>
                            {c.legenda ? ` · “${c.legenda}”` : ""}
                          </p>
                          <p className="mt-1 text-[12px] text-neutral-300">
                            Desde que entrou no ar: <strong>{R(c.desdeInicio.gasto)}</strong> · {I(c.desdeInicio.alcance)} alcançados ·{" "}
                            <strong>{I(c.desdeInicio.curtidas)} curtidas</strong> · {I(c.desdeInicio.engajamentos)} engajamentos
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
