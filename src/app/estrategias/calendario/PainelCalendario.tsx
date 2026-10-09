"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarBlank, Crown, Lightning, Trash, WarningCircle, Plus } from "@phosphor-icons/react";
import type { CalendarioRede } from "@/lib/calendarioRede";

interface Sugestao {
  nome: string;
  data: string;
  antecedenciaDias: number;
}

type Item =
  | { tipo: "data"; id: string; inicio: string; fim: string; titulo: string; detalhe: string }
  | { tipo: "campanha"; id: string; inicio: string; fim: string; titulo: string; detalhe: string }
  | { tipo: "boost"; id: string; inicio: string; fim: string; titulo: string; detalhe: string };

const dataBR = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const nomeMes = (mes: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-01T00:00:00Z`));
const ROTULO_ENTREGA: Record<string, string> = { engajamento: "engajamento", alcance: "alcance", ambos: "engajamento + alcance" };

export default function PainelCalendario({
  calendario,
  sugestoes,
  hoje,
}: {
  calendario: CalendarioRede;
  sugestoes: Sugestao[];
  hoje: string;
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [data, setData] = useState("");
  const [antecedencia, setAntecedencia] = useState("14");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const itens = useMemo<Item[]>(() => {
    const lista: Item[] = [
      ...calendario.datas.map((d) => ({
        tipo: "data" as const,
        id: d.id,
        inicio: d.data,
        fim: d.data,
        titulo: d.nome,
        detalhe: `Campanha deve começar ${d.antecedenciaDias} dias antes (até ${dataBR(
          new Date(new Date(`${d.data}T00:00:00Z`).getTime() - d.antecedenciaDias * 86_400_000).toISOString().slice(0, 10)
        )})`,
      })),
      ...calendario.campanhas.map((c) => ({
        tipo: "campanha" as const,
        id: c.id,
        inicio: c.inicio,
        fim: c.fim,
        titulo: c.nome,
        detalhe: `${dataBR(c.inicio)} a ${dataBR(c.fim)} · ${c.unidadesAplicadas} de ${calendario.totalUnidades} unidades${c.status === "encerrada" ? " · encerrada" : ""}`,
      })),
      ...calendario.regrasBoost.map((r) => ({
        tipo: "boost" as const,
        id: r.id,
        inicio: r.inicio,
        fim: r.fim,
        titulo: `Boost: ${r.nome}`,
        detalhe: `${dataBR(r.inicio)} a ${dataBR(r.fim)} · entrega ${ROTULO_ENTREGA[r.tipoEntrega] ?? r.tipoEntrega}`,
      })),
    ];
    return lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [calendario]);

  const porMes = useMemo(() => {
    const mapa = new Map<string, Item[]>();
    for (const i of itens) mapa.set(i.inicio.slice(0, 7), [...(mapa.get(i.inicio.slice(0, 7)) ?? []), i]);
    return [...mapa.entries()];
  }, [itens]);

  const jaTem = (s: Sugestao) => calendario.datas.some((d) => d.data === s.data);
  const sugestoesFuturas = sugestoes.filter((s) => s.data >= hoje && !jaTem(s)).slice(0, 8);

  async function adicionar(n: string, d: string, ant: number) {
    setOcupado(true);
    setErro(null);
    const r = await fetch("/api/calendario-rede", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId: calendario.empresaId, nome: n, data: d, antecedenciaDias: ant }),
    });
    const corpo = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) return setErro(corpo.erro || "Falha ao adicionar.");
    setNome("");
    setData("");
    router.refresh();
  }

  const campo = "h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100";
  const estilo = {
    data: { Icone: CalendarBlank, cor: "text-amber-400 bg-amber-500/10", rotulo: "Data comercial" },
    campanha: { Icone: Crown, cor: "text-accent-strong bg-accent/10", rotulo: "Campanha oficial" },
    boost: { Icone: Lightning, cor: "text-ok bg-ok/10", rotulo: "Boost" },
  } as const;

  return (
    <div className="mt-6 flex flex-col gap-5">
      {calendario.alertas.length > 0 && (
        <div className="cartao-vidro border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-300">
            <WarningCircle size={16} weight="fill" /> Datas chegando sem campanha oficial
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {calendario.alertas.map((a) => (
              <li key={a.dataId} className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-300">
                <span>
                  <span className="font-semibold text-neutral-100">{a.nome}</span> ({dataBR(a.data)}) —{" "}
                  {a.diasParaComecar >= 0
                    ? `começar a campanha até ${dataBR(a.comecarAte)} (${a.diasParaComecar} dia${a.diasParaComecar !== 1 ? "s" : ""})`
                    : `o prazo ideal de início (${dataBR(a.comecarAte)}) já passou`}
                </span>
                <Link href="/estrategias/campanhas-mae" className="font-semibold text-accent-strong hover:underline">
                  Criar campanha oficial →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {porMes.length === 0 ? (
        <p className="cartao-vidro px-5 py-6 text-sm text-neutral-500">
          Nada no calendário ainda. Adicione as datas comerciais abaixo e crie as campanhas oficiais.
        </p>
      ) : (
        porMes.map(([mes, lista]) => (
          <section key={mes}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{nomeMes(mes)}</h2>
            <ul className="flex flex-col gap-2">
              {lista.map((i) => {
                const e = estilo[i.tipo];
                const passou = i.fim < hoje;
                return (
                  <li key={`${i.tipo}-${i.id}`} className={`cartao-vidro flex items-center gap-3 px-4 py-3 ${passou ? "opacity-50" : ""}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${e.cor}`}>
                      <e.Icone size={17} weight="fill" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-100">{i.titulo}</p>
                      <p className="truncate text-[11.5px] text-neutral-500">
                        {e.rotulo} · {i.detalhe}
                      </p>
                    </div>
                    {i.tipo === "data" && (
                      <button
                        aria-label="Remover data"
                        onClick={async () => {
                          if (!window.confirm(`Remover "${i.titulo}" do calendário?`)) return;
                          await fetch(`/api/calendario-rede?id=${i.id}`, { method: "DELETE" });
                          router.refresh();
                        }}
                        className="text-neutral-500 hover:text-danger"
                      >
                        <Trash size={15} />
                      </button>
                    )}
                    {i.tipo === "campanha" && (
                      <Link href={`/estrategias/campanhas-mae/${i.id}`} className="text-xs font-semibold text-accent-strong hover:underline">
                        Abrir
                      </Link>
                    )}
                    {i.tipo === "boost" && (
                      <Link href="/boost" className="text-xs font-semibold text-accent-strong hover:underline">
                        Abrir
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <section className="cartao-vidro p-5">
        <h2 className="text-sm font-semibold text-neutral-200">Adicionar data comercial</h2>
        {sugestoesFuturas.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {sugestoesFuturas.map((s) => (
              <button
                key={s.data + s.nome}
                disabled={ocupado}
                onClick={() => adicionar(s.nome, s.data, s.antecedenciaDias)}
                className="flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-accent/40 disabled:opacity-40"
              >
                <Plus size={12} weight="bold" />
                {s.nome} · {dataBR(s.data)}
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_9rem_auto] sm:items-end">
          <div>
            <label className="text-xs font-semibold text-neutral-400">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Inauguração da loja nova" className={campo} />
          </div>
          <div className="min-w-0">
            <label className="text-xs font-semibold text-neutral-400">Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={`${campo} min-w-0`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-400">Começar (dias antes)</label>
            <input value={antecedencia} onChange={(e) => setAntecedencia(e.target.value)} inputMode="numeric" className={campo} />
          </div>
          <button
            disabled={ocupado || !nome.trim() || !data}
            onClick={() => adicionar(nome, data, Number(antecedencia) || 0)}
            className="h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
          >
            Adicionar
          </button>
        </div>
        {erro && <p className="mt-2 text-xs text-danger">{erro}</p>}
      </section>
    </div>
  );
}
