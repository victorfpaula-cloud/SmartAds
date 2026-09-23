"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import { MODELOS_CAMPANHA } from "@/lib/meta/modelos";
import type { TipoModeloCampanha } from "@/lib/meta/tipos";
import type { Estrategia, CampanhaMae, ModoCriativoCampanhaMae } from "@/lib/estrategias/tipos";

interface CampanhaMaeLista extends CampanhaMae {
  estrategiaNome: string;
  numeroDeUnidades: number;
  criativosPendentes: number;
}

interface CriativoEtapaForm {
  modo: ModoCriativoCampanhaMae;
  titulo: string;
  mensagem: string;
  imagemBase64: string | null;
  cta: string;
}

function criativoEtapaVazio(): CriativoEtapaForm {
  return { modo: "livre_por_unidade", titulo: "", mensagem: "", imagemBase64: null, cta: "LEARN_MORE" };
}

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function PainelCampanhasMae() {
  const [campanhas, setCampanhas] = useState<CampanhaMaeLista[]>([]);
  const [estrategias, setEstrategias] = useState<Estrategia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);

  const [nome, setNome] = useState("");
  const [estrategiaId, setEstrategiaId] = useState("");
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [investimentoMinimo, setInvestimentoMinimo] = useState("");
  const [investimentoMaximo, setInvestimentoMaximo] = useState("");
  const [criativosPorEtapa, setCriativosPorEtapa] = useState<Record<string, CriativoEtapaForm>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const estrategiaSelecionada = estrategias.find((e) => e.id === estrategiaId) ?? null;
  const etapasOrdenadas = useMemo(
    () => (estrategiaSelecionada ? [...estrategiaSelecionada.etapas].sort((a, b) => a.ordem - b.ordem) : []),
    [estrategiaSelecionada]
  );

  function carregar() {
    setCarregando(true);
    Promise.all([
      fetch("/api/campanhas-mae").then((r) => r.json()),
      fetch("/api/estrategias").then((r) => r.json()),
    ])
      .then(([campanhasCorpo, estrategiasCorpo]) => {
        setCampanhas(campanhasCorpo.campanhas ?? []);
        setEstrategias(estrategiasCorpo.estrategias ?? []);
      })
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  // Ao trocar de estratégia, reseta o criativo por etapa pra combinar com as etapas dela — cada
  // uma nasce "livre por unidade" (some fica assim, algumas viram "oficial" e ganham mídia).
  function selecionarEstrategia(id: string) {
    setEstrategiaId(id);
    const estrategia = estrategias.find((e) => e.id === id);
    if (!estrategia) return;
    setCriativosPorEtapa(Object.fromEntries(estrategia.etapas.map((etapa) => [etapa.id, criativoEtapaVazio()])));
  }

  function atualizarCriativoEtapa(etapaId: string, patch: Partial<CriativoEtapaForm>) {
    setCriativosPorEtapa((atual) => ({ ...atual, [etapaId]: { ...atual[etapaId], ...patch } }));
  }

  function selecionarImagemEtapa(etapaId: string, arquivo: File) {
    const leitor = new FileReader();
    leitor.onload = () => {
      const resultado = leitor.result as string;
      atualizarCriativoEtapa(etapaId, { imagemBase64: resultado.split(",")[1] });
    };
    leitor.readAsDataURL(arquivo);
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    const minimoCentavos = Math.round(Number(investimentoMinimo.replace(",", ".")) * 100) || 0;
    const maximoCentavos = Math.round(Number(investimentoMaximo.replace(",", ".")) * 100) || 0;

    if (!nome.trim() || !estrategiaId || !dataInicio) {
      setErro("Preencha o nome, a estratégia e a data de início.");
      return;
    }
    if (minimoCentavos <= 0 || maximoCentavos < minimoCentavos) {
      setErro("Informe uma faixa de investimento válida (mínimo maior que zero, máximo ≥ mínimo).");
      return;
    }
    for (const etapa of etapasOrdenadas) {
      const criativo = criativosPorEtapa[etapa.id];
      if (criativo?.modo === "oficial_upload" && criativo.imagemBase64 && !criativo.mensagem.trim()) {
        setErro(`Adicione o texto do anúncio da etapa "${etapa.nomeEtapa}" (ou deixe sem imagem pra definir depois).`);
        return;
      }
    }

    setSalvando(true);
    const resposta = await fetch("/api/campanhas-mae", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: nome.trim(),
        estrategiaId,
        dataInicio,
        investimentoMinimoCentavos: minimoCentavos,
        investimentoMaximoCentavos: maximoCentavos,
        etapasCriativo: etapasOrdenadas.map((etapa) => {
          const criativo = criativosPorEtapa[etapa.id] ?? criativoEtapaVazio();
          return {
            estrategiaEtapaId: etapa.id,
            modo: criativo.modo,
            criativoTitulo: criativo.titulo || undefined,
            criativoMensagem: criativo.mensagem || undefined,
            criativoImagemBase64: criativo.imagemBase64 || undefined,
            criativoCta: criativo.cta || undefined,
          };
        }),
      }),
    });
    const corpo = await resposta.json();
    setSalvando(false);

    if (!resposta.ok) {
      setErro(corpo.erro || "Falha ao criar a Campanha-Mãe.");
      return;
    }

    const pendentes = etapasOrdenadas.filter(
      (etapa) => criativosPorEtapa[etapa.id]?.modo === "oficial_upload" && !criativosPorEtapa[etapa.id]?.imagemBase64
    ).length;

    setCampanhas((atual) => [
      { ...corpo.campanha, estrategiaNome: estrategiaSelecionada?.nome ?? "—", numeroDeUnidades: 0, criativosPendentes: pendentes },
      ...atual,
    ]);
    setNome("");
    setEstrategiaId("");
    setInvestimentoMinimo("");
    setInvestimentoMaximo("");
    setCriativosPorEtapa({});
    setCriando(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">Campanhas-Mãe</h2>
        <button
          onClick={() => setCriando(!criando)}
          disabled={estrategias.length === 0 && !criando}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
        >
          {criando ? "Cancelar" : "+ Nova Campanha-Mãe"}
        </button>
      </div>

      {!carregando && estrategias.length === 0 && (
        <p className="cartao-vidro-interno px-4 py-3 text-xs text-neutral-400">
          Crie um molde de Estratégia primeiro — toda Campanha-Mãe é uma Estratégia com período e
          faixa de investimento em cima.
        </p>
      )}

      {criando && (
        <form onSubmit={salvar} className="cartao-vidro flex flex-col gap-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Nome</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Páscoa Dona Baunilha 2027"
              className="h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3.5 text-sm text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Estratégia (molde)</label>
            <select
              value={estrategiaId}
              onChange={(e) => selecionarEstrategia(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
            >
              <option value="">Selecione…</option>
              {estrategias.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Data de início (igual pra todas)</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Investimento mínimo/unidade</label>
              <div className="flex h-10 items-center rounded-lg border border-white/14 bg-ink-850 px-3">
                <span className="mr-1.5 text-sm text-neutral-500">R$</span>
                <input
                  value={investimentoMinimo}
                  onChange={(e) => setInvestimentoMinimo(e.target.value)}
                  placeholder="300,00"
                  inputMode="decimal"
                  className="h-full w-full bg-transparent text-sm text-neutral-100 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Investimento máximo/unidade</label>
              <div className="flex h-10 items-center rounded-lg border border-white/14 bg-ink-850 px-3">
                <span className="mr-1.5 text-sm text-neutral-500">R$</span>
                <input
                  value={investimentoMaximo}
                  onChange={(e) => setInvestimentoMaximo(e.target.value)}
                  placeholder="800,00"
                  inputMode="decimal"
                  className="h-full w-full bg-transparent text-sm text-neutral-100 outline-none"
                />
              </div>
            </div>
          </div>

          {etapasOrdenadas.length > 0 && (
            <div className="border-t border-white/10 pt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Criativo de cada etapa
              </p>
              <p className="mb-3 text-xs leading-relaxed text-neutral-500">
                "Oficial" trava o mesmo criativo pra toda unidade nessa etapa — pode deixar sem
                imagem agora e definir depois (fica marcado como pendente). "Livre por unidade"
                deixa cada uma escolher o próprio criativo (inclusive usar uma publicação já
                existente) na hora de publicar, como já funciona fora de uma Campanha-Mãe.
              </p>
              <div className="flex flex-col gap-3">
                {etapasOrdenadas.map((etapa) => {
                  const criativo = criativosPorEtapa[etapa.id] ?? criativoEtapaVazio();
                  const modelo = MODELOS_CAMPANHA[etapa.tipoModelo as TipoModeloCampanha];
                  return (
                    <div key={etapa.id} className="cartao-vidro-interno flex flex-col gap-2.5 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-neutral-300">
                          {etapa.ordem}. {etapa.nomeEtapa}{" "}
                          <span className="font-normal text-neutral-500">({modelo?.nomeExibicao})</span>
                        </p>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => atualizarCriativoEtapa(etapa.id, { modo: "livre_por_unidade" })}
                            className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${criativo.modo === "livre_por_unidade" ? "border-accent bg-accent/10 text-accent-strong" : "border-white/10 text-neutral-400"}`}
                          >
                            Livre por unidade
                          </button>
                          <button
                            type="button"
                            onClick={() => atualizarCriativoEtapa(etapa.id, { modo: "oficial_upload" })}
                            className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${criativo.modo === "oficial_upload" ? "border-accent bg-accent/10 text-accent-strong" : "border-white/10 text-neutral-400"}`}
                          >
                            Oficial da rede
                          </button>
                        </div>
                      </div>

                      {criativo.modo === "oficial_upload" && (
                        <div className="flex flex-col gap-2.5 border-t border-white/10 pt-2.5">
                          <div className="flex items-center gap-3">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => e.target.files?.[0] && selecionarImagemEtapa(etapa.id, e.target.files[0])}
                              className="block flex-1 text-xs text-neutral-400"
                            />
                            {criativo.imagemBase64 && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`data:image/jpeg;base64,${criativo.imagemBase64}`}
                                alt=""
                                className="h-12 w-12 shrink-0 rounded-lg border border-white/10 object-cover"
                              />
                            )}
                          </div>
                          <textarea
                            value={criativo.mensagem}
                            onChange={(e) => atualizarCriativoEtapa(etapa.id, { mensagem: e.target.value })}
                            placeholder="Texto do anúncio (pode deixar em branco e definir depois)"
                            rows={2}
                            className="w-full resize-none rounded-lg border border-white/14 bg-ink-900 px-3 py-2 text-xs text-neutral-100"
                          />
                          <div className="grid grid-cols-2 gap-2.5">
                            <input
                              value={criativo.titulo}
                              onChange={(e) => atualizarCriativoEtapa(etapa.id, { titulo: e.target.value })}
                              placeholder="Título (opcional)"
                              className="h-9 rounded-lg border border-white/14 bg-ink-900 px-2.5 text-xs text-neutral-100"
                            />
                            <select
                              value={criativo.cta}
                              onChange={(e) => atualizarCriativoEtapa(etapa.id, { cta: e.target.value })}
                              className="h-9 rounded-lg border border-white/14 bg-ink-900 px-2.5 text-xs text-neutral-100"
                            >
                              <option value="LEARN_MORE">Saiba mais</option>
                              <option value="SHOP_NOW">Comprar agora</option>
                              <option value="SIGN_UP">Cadastre-se</option>
                              <option value="CONTACT_US">Fale conosco</option>
                            </select>
                          </div>
                          {!criativo.imagemBase64 && (
                            <p className="flex items-center gap-1.5 text-[11px] text-amber-400">
                              <WarningCircle size={12} weight="fill" />
                              Sem imagem ainda — fica marcado como pendente até você definir.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {erro && <p className="text-xs text-red-400">{erro}</p>}

          <button
            type="submit"
            disabled={salvando}
            className="h-10 w-fit rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
          >
            {salvando ? "Salvando…" : "Salvar Campanha-Mãe"}
          </button>
        </form>
      )}

      {carregando ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : campanhas.length === 0 ? (
        <p className="cartao-vidro px-5 py-6 text-sm text-neutral-500">Nenhuma Campanha-Mãe criada ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {campanhas.map((campanha) => (
            <li key={campanha.id}>
              <Link
                href={`/estrategias/campanhas-mae/${campanha.id}`}
                className="cartao-vidro-interno flex items-center justify-between gap-3 px-4 py-3.5 hover:border-accent/40"
              >
                <div>
                  <p className="text-sm font-semibold text-neutral-100">{campanha.nome}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {campanha.estrategiaNome} · desde {new Date(`${campanha.dataInicio}T00:00:00`).toLocaleDateString("pt-BR")}
                    {" · "}
                    {formatoReal.format(campanha.investimentoMinimoCentavos / 100)}–{formatoReal.format(campanha.investimentoMaximoCentavos / 100)}/unidade
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {campanha.criativosPendentes > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-400">
                      <WarningCircle size={12} weight="fill" />
                      {campanha.criativosPendentes} pendente{campanha.criativosPendentes !== 1 ? "s" : ""}
                    </span>
                  )}
                  <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-neutral-300">
                    {campanha.numeroDeUnidades} unidade{campanha.numeroDeUnidades !== 1 ? "s" : ""}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
