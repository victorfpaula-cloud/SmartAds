"use client";

import { useState } from "react";
import { CheckCircle, WarningCircle, MinusCircle } from "@phosphor-icons/react";
import { MODELOS_CAMPANHA } from "@/lib/meta/modelos";
import type { TipoModeloCampanha } from "@/lib/meta/tipos";
import type { ModoCriativoCampanhaMae } from "@/lib/estrategias/tipos";

export interface EtapaCriativoLinha {
  estrategiaEtapaId: string;
  ordem: number;
  nomeEtapa: string;
  tipoModelo: string | null;
  modo: ModoCriativoCampanhaMae;
  criativoTitulo: string | null;
  criativoMensagem: string | null;
  criativoImagemBase64: string | null;
  criativoCta: string | null;
}

const CTAS = [
  { valor: "LEARN_MORE", rotulo: "Saiba mais" },
  { valor: "SHOP_NOW", rotulo: "Comprar agora" },
  { valor: "SIGN_UP", rotulo: "Cadastre-se" },
  { valor: "CONTACT_US", rotulo: "Fale conosco" },
];

/** Lista o criativo de cada etapa da Campanha-Mãe e deixa definir/editar a qualquer momento — não
 * só na criação. Uma etapa "oficial" sem imagem ainda fica marcada como pendente (o relatório
 * semanal também avisa disso, ver enviarRelatorioSemanal). */
export default function CriativosDaCampanha({
  campanhaId,
  etapasIniciais,
}: {
  campanhaId: string;
  etapasIniciais: EtapaCriativoLinha[];
}) {
  const [etapas, setEtapas] = useState(etapasIniciais);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2.5">
      {etapas.map((etapa) => (
        <LinhaCriativo
          key={etapa.estrategiaEtapaId}
          campanhaId={campanhaId}
          etapa={etapa}
          editando={editandoId === etapa.estrategiaEtapaId}
          onAbrirEdicao={() => setEditandoId(etapa.estrategiaEtapaId)}
          onFecharEdicao={() => setEditandoId(null)}
          onSalvo={(atualizada) =>
            setEtapas((atual) => atual.map((e) => (e.estrategiaEtapaId === atualizada.estrategiaEtapaId ? atualizada : e)))
          }
        />
      ))}
    </div>
  );
}

function LinhaCriativo({
  campanhaId,
  etapa,
  editando,
  onAbrirEdicao,
  onFecharEdicao,
  onSalvo,
}: {
  campanhaId: string;
  etapa: EtapaCriativoLinha;
  editando: boolean;
  onAbrirEdicao: () => void;
  onFecharEdicao: () => void;
  onSalvo: (etapa: EtapaCriativoLinha) => void;
}) {
  const [modo, setModo] = useState<ModoCriativoCampanhaMae>(etapa.modo);
  const [titulo, setTitulo] = useState(etapa.criativoTitulo ?? "");
  const [mensagem, setMensagem] = useState(etapa.criativoMensagem ?? "");
  const [cta, setCta] = useState(etapa.criativoCta ?? "LEARN_MORE");
  const [imagemBase64, setImagemBase64] = useState(etapa.criativoImagemBase64);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const modelo = etapa.tipoModelo ? MODELOS_CAMPANHA[etapa.tipoModelo as TipoModeloCampanha] : null;
  const pendente = etapa.modo === "oficial_upload" && !etapa.criativoImagemBase64;

  function selecionarImagem(arquivo: File) {
    const leitor = new FileReader();
    leitor.onload = () => setImagemBase64((leitor.result as string).split(",")[1]);
    leitor.readAsDataURL(arquivo);
  }

  async function salvar() {
    setErro(null);
    if (modo === "oficial_upload" && (!mensagem.trim() || !imagemBase64)) {
      setErro("Informe a imagem e o texto do anúncio, ou troque pra \"livre por unidade\".");
      return;
    }
    setSalvando(true);
    const resposta = await fetch(`/api/campanhas-mae/${campanhaId}/criativos/${etapa.estrategiaEtapaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modo,
        criativoTitulo: titulo || undefined,
        criativoMensagem: mensagem || undefined,
        criativoImagemBase64: imagemBase64 || undefined,
        criativoCta: cta,
      }),
    });
    const corpo = await resposta.json();
    setSalvando(false);

    if (!resposta.ok) {
      setErro(corpo.erro || "Falha ao salvar o criativo.");
      return;
    }
    onSalvo({
      ...etapa,
      modo,
      criativoTitulo: modo === "oficial_upload" ? titulo || null : null,
      criativoMensagem: modo === "oficial_upload" ? mensagem || null : null,
      criativoImagemBase64: modo === "oficial_upload" ? imagemBase64 : null,
      criativoCta: modo === "oficial_upload" ? cta : null,
    });
    onFecharEdicao();
  }

  return (
    <div className="cartao-vidro-interno flex flex-col gap-2.5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-100">
          {etapa.ordem}. {etapa.nomeEtapa}{" "}
          <span className="font-normal text-neutral-500">({modelo?.nomeExibicao ?? etapa.tipoModelo})</span>
        </p>
        <div className="flex items-center gap-2">
          <StatusCriativo modo={etapa.modo} pendente={pendente} />
          {!editando && (
            <button
              onClick={onAbrirEdicao}
              className="rounded-lg border border-white/14 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-white/[0.04]"
            >
              {etapa.modo === "livre_por_unidade" && !etapa.criativoImagemBase64 ? "Definir" : "Editar"}
            </button>
          )}
        </div>
      </div>

      {!editando && etapa.modo === "oficial_upload" && etapa.criativoImagemBase64 && (
        <div className="flex gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/jpeg;base64,${etapa.criativoImagemBase64}`}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg border border-white/10 object-cover"
          />
          <div className="text-xs">
            {etapa.criativoTitulo && <p className="font-semibold text-neutral-200">{etapa.criativoTitulo}</p>}
            <p className="mt-0.5 text-neutral-400">{etapa.criativoMensagem}</p>
          </div>
        </div>
      )}

      {editando && (
        <div className="flex flex-col gap-2.5 border-t border-white/10 pt-2.5">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setModo("livre_por_unidade")}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${modo === "livre_por_unidade" ? "border-accent bg-accent/10 text-accent-strong" : "border-white/10 text-neutral-400"}`}
            >
              Livre por unidade
            </button>
            <button
              type="button"
              onClick={() => setModo("oficial_upload")}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${modo === "oficial_upload" ? "border-accent bg-accent/10 text-accent-strong" : "border-white/10 text-neutral-400"}`}
            >
              Oficial da rede
            </button>
          </div>

          {modo === "oficial_upload" && (
            <>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && selecionarImagem(e.target.files[0])}
                  className="block flex-1 text-xs text-neutral-400"
                />
                {imagemBase64 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/jpeg;base64,${imagemBase64}`}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg border border-white/10 object-cover"
                  />
                )}
              </div>
              <textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Texto do anúncio"
                rows={2}
                className="w-full resize-none rounded-lg border border-white/14 bg-ink-900 px-3 py-2 text-xs text-neutral-100"
              />
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Título (opcional)"
                  className="h-9 rounded-lg border border-white/14 bg-ink-900 px-2.5 text-xs text-neutral-100"
                />
                <select
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  className="h-9 rounded-lg border border-white/14 bg-ink-900 px-2.5 text-xs text-neutral-100"
                >
                  {CTAS.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {erro && <p className="text-xs text-red-400">{erro}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={onFecharEdicao}
              className="rounded-lg border border-white/14 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-white/[0.04]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusCriativo({ modo, pendente }: { modo: ModoCriativoCampanhaMae; pendente: boolean }) {
  if (pendente) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
        <WarningCircle size={12} weight="fill" />
        Pendente
      </span>
    );
  }
  if (modo === "oficial_upload") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
        <CheckCircle size={12} weight="fill" />
        Oficial definido
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-neutral-400">
      <MinusCircle size={12} />
      Livre por unidade
    </span>
  );
}
