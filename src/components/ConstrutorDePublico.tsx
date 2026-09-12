"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, GlobeHemisphereWest, X } from "@phosphor-icons/react";
import type { Localizacao, Interesse, Publico, Genero } from "@/lib/meta/tipos";

const MapaClicavel = dynamic(() => import("./MapaClicavel"), { ssr: false });

interface ResultadoLocalizacao {
  key: string;
  name: string;
  type: "city" | "region" | "country";
  region?: string;
}
interface ResultadoInteresse {
  id: string;
  name: string;
}

export default function ConstrutorDePublico({
  valor,
  onChange,
}: {
  valor: Publico;
  onChange: (publico: Publico) => void;
}) {
  const [mapaAberto, setMapaAberto] = useState(false);

  function adicionarLocalizacao(localizacao: Localizacao) {
    onChange({ ...valor, localizacoes: [...valor.localizacoes, localizacao] });
  }
  function removerLocalizacao(indice: number) {
    onChange({ ...valor, localizacoes: valor.localizacoes.filter((_, i) => i !== indice) });
  }
  function adicionarInteresse(interesse: Interesse) {
    if (valor.interesses?.some((i) => i.id === interesse.id)) return;
    onChange({ ...valor, interesses: [...(valor.interesses ?? []), interesse] });
  }
  function removerInteresse(id: string) {
    onChange({ ...valor, interesses: (valor.interesses ?? []).filter((i) => i.id !== id) });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-neutral-400">Localização</label>
          <button
            type="button"
            onClick={() => setMapaAberto(true)}
            className="text-xs font-medium text-accent-strong hover:underline"
          >
            + Marcar ponto no mapa
          </button>
        </div>

        <BuscaLocalizacao onSelecionar={adicionarLocalizacao} />

        {valor.localizacoes.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {valor.localizacoes.map((loc, indice) => (
              <Chip key={indice} icone={iconeLocalizacao(loc)} texto={rotuloLocalizacao(loc)} onRemover={() => removerLocalizacao(indice)} />
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-neutral-400">Interesses (opcional)</label>
        <BuscaInteresse onSelecionar={adicionarInteresse} />
        {(valor.interesses?.length ?? 0) > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {valor.interesses!.map((interesse) => (
              <Chip key={interesse.id} texto={interesse.nome} onRemover={() => removerInteresse(interesse.id)} />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="text-xs font-semibold text-neutral-400">Idade mín.</label>
          <input
            type="number"
            min={13}
            max={65}
            value={valor.idadeMin ?? 18}
            onChange={(e) => onChange({ ...valor, idadeMin: Number(e.target.value) })}
            className="mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-neutral-400">Idade máx.</label>
          <input
            type="number"
            min={13}
            max={65}
            value={valor.idadeMax ?? 65}
            onChange={(e) => onChange({ ...valor, idadeMax: Number(e.target.value) })}
            className="mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-neutral-400">Gênero</label>
          <select
            value={valor.genero ?? "todos"}
            onChange={(e) => onChange({ ...valor, genero: e.target.value as Genero })}
            className="mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
          >
            <option value="todos">Todos</option>
            <option value="homens">Homens</option>
            <option value="mulheres">Mulheres</option>
          </select>
        </div>
      </div>

      {mapaAberto && (
        <MapaClicavel
          onFechar={() => setMapaAberto(false)}
          onConfirmar={(ponto) => {
            adicionarLocalizacao({
              tipo: "ponto",
              latitude: ponto.latitude,
              longitude: ponto.longitude,
              raioKm: ponto.raioKm,
              nome: ponto.nome || undefined,
            });
            setMapaAberto(false);
          }}
        />
      )}
    </div>
  );
}

function rotuloLocalizacao(loc: Localizacao): string {
  if (loc.tipo === "cidade") return `${loc.nome} (${loc.raioKm}km)`;
  if (loc.tipo === "ponto") return `${loc.nome || "Ponto no mapa"} (${loc.raioKm}km)`;
  if (loc.tipo === "regiao") return loc.nome;
  return loc.nome;
}

function iconeLocalizacao(loc: Localizacao) {
  return loc.tipo === "regiao" || loc.tipo === "pais" ? (
    <GlobeHemisphereWest size={13} weight="bold" />
  ) : (
    <MapPin size={13} weight="bold" />
  );
}

function Chip({
  texto,
  icone,
  onRemover,
}: {
  texto: string;
  icone?: React.ReactNode;
  onRemover: () => void;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] py-1 pl-3 pr-1.5 text-xs text-neutral-200">
      {icone && <span className="text-neutral-400">{icone}</span>}
      {texto}
      <button
        type="button"
        onClick={onRemover}
        aria-label={`Remover ${texto}`}
        className="flex h-5 w-5 items-center justify-center rounded-full text-neutral-500 hover:bg-white/10 hover:text-danger"
      >
        <X size={11} weight="bold" />
      </button>
    </span>
  );
}

function BuscaLocalizacao({ onSelecionar }: { onSelecionar: (loc: Localizacao) => void }) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ResultadoLocalizacao[]>([]);
  const [raioKm, setRaioKm] = useState(10);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (termo.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const temporizador = setTimeout(() => {
      fetch(`/api/meta/buscar-localizacao?q=${encodeURIComponent(termo)}`)
        .then((r) => r.json())
        .then((corpo) => setResultados(corpo.resultados ?? []))
        .finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(temporizador);
  }, [termo]);

  function selecionar(resultado: ResultadoLocalizacao) {
    if (resultado.type === "city") {
      onSelecionar({ tipo: "cidade", chave: resultado.key, nome: resultado.name, raioKm });
    } else if (resultado.type === "region") {
      onSelecionar({ tipo: "regiao", chave: resultado.key, nome: resultado.name });
    } else {
      onSelecionar({ tipo: "pais", codigo: resultado.key, nome: resultado.name });
    }
    setTermo("");
    setResultados([]);
  }

  return (
    <div className="relative mt-1.5 flex gap-2">
      <input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Buscar cidade, região ou país…"
        className="h-9 flex-1 rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
      />
      <input
        type="number"
        min={1}
        max={80}
        value={raioKm}
        onChange={(e) => setRaioKm(Number(e.target.value))}
        title="Raio em km (só usado pra cidade)"
        className="h-9 w-20 rounded-lg border border-white/14 bg-ink-850 px-2 text-sm text-neutral-100"
      />

      {(resultados.length > 0 || buscando) && (
        <div className="absolute left-0 top-10 z-10 max-h-56 w-full overflow-y-auto rounded-lg border border-white/10 bg-ink-900 shadow-xl">
          {buscando && <p className="px-3 py-2 text-xs text-neutral-500">Buscando…</p>}
          {resultados.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => selecionar(r)}
              className="block w-full px-3 py-2 text-left text-xs text-neutral-200 hover:bg-white/[0.06]"
            >
              {r.name} <span className="text-neutral-500">· {r.type === "city" ? "cidade" : r.type === "region" ? "região" : "país"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BuscaInteresse({ onSelecionar }: { onSelecionar: (i: Interesse) => void }) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ResultadoInteresse[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (termo.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const temporizador = setTimeout(() => {
      fetch(`/api/meta/buscar-interesse?q=${encodeURIComponent(termo)}`)
        .then((r) => r.json())
        .then((corpo) => setResultados(corpo.resultados ?? []))
        .finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(temporizador);
  }, [termo]);

  return (
    <div className="relative mt-1.5">
      <input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Buscar interesse (ex: moda, culinária)…"
        className="h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
      />
      {(resultados.length > 0 || buscando) && (
        <div className="absolute left-0 top-10 z-10 max-h-56 w-full overflow-y-auto rounded-lg border border-white/10 bg-ink-900 shadow-xl">
          {buscando && <p className="px-3 py-2 text-xs text-neutral-500">Buscando…</p>}
          {resultados.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onSelecionar({ id: r.id, nome: r.name });
                setTermo("");
                setResultados([]);
              }}
              className="block w-full px-3 py-2 text-left text-xs text-neutral-200 hover:bg-white/[0.06]"
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
