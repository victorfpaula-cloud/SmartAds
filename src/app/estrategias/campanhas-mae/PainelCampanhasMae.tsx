"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Estrategia, CampanhaMae } from "@/lib/estrategias/tipos";

interface CampanhaMaeLista extends CampanhaMae {
  estrategiaNome: string;
  numeroDeUnidades: number;
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
  const [criativoTitulo, setCriativoTitulo] = useState("");
  const [criativoMensagem, setCriativoMensagem] = useState("");
  const [criativoCta, setCriativoCta] = useState("LEARN_MORE");
  const [imagemBase64, setImagemBase64] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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

  function selecionarImagem(arquivo: File) {
    const leitor = new FileReader();
    leitor.onload = () => {
      const resultado = leitor.result as string;
      setImagemBase64(resultado.split(",")[1]);
    };
    leitor.readAsDataURL(arquivo);
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    const minimoCentavos = Math.round(Number(investimentoMinimo.replace(",", ".")) * 100) || 0;
    const maximoCentavos = Math.round(Number(investimentoMaximo.replace(",", ".")) * 100) || 0;

    if (!nome.trim() || !estrategiaId || !dataInicio || !criativoMensagem.trim() || !imagemBase64) {
      setErro("Preencha o nome, a estratégia, a data de início, o texto do anúncio e a imagem oficial.");
      return;
    }
    if (minimoCentavos <= 0 || maximoCentavos < minimoCentavos) {
      setErro("Informe uma faixa de investimento válida (mínimo maior que zero, máximo ≥ mínimo).");
      return;
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
        criativoTitulo: criativoTitulo.trim() || undefined,
        criativoMensagem: criativoMensagem.trim(),
        criativoImagemBase64: imagemBase64,
        criativoCta,
      }),
    });
    const corpo = await resposta.json();
    setSalvando(false);

    if (!resposta.ok) {
      setErro(corpo.erro || "Falha ao criar a Campanha-Mãe.");
      return;
    }
    setCampanhas((atual) => [{ ...corpo.campanha, estrategiaNome: estrategias.find((e) => e.id === estrategiaId)?.nome ?? "—", numeroDeUnidades: 0 }, ...atual]);
    setNome("");
    setInvestimentoMinimo("");
    setInvestimentoMaximo("");
    setCriativoTitulo("");
    setCriativoMensagem("");
    setImagemBase64(null);
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
          Crie um molde de Estratégia primeiro — toda Campanha-Mãe é uma Estratégia com período,
          faixa de investimento e criativo oficial em cima.
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
              onChange={(e) => setEstrategiaId(e.target.value)}
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

          <div className="border-t border-white/10 pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Criativo oficial (mesmo pra toda unidade participante)
            </p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Imagem</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && selecionarImagem(e.target.files[0])}
                  className="block w-full text-xs text-neutral-400"
                />
                {imagemBase64 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/jpeg;base64,${imagemBase64}`}
                    alt=""
                    className="mt-2 h-24 w-24 rounded-lg border border-white/10 object-cover"
                  />
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Texto do anúncio</label>
                <textarea
                  value={criativoMensagem}
                  onChange={(e) => setCriativoMensagem(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-white/14 bg-ink-850 px-3 py-2 text-sm text-neutral-100"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Título (opcional)</label>
                  <input
                    value={criativoTitulo}
                    onChange={(e) => setCriativoTitulo(e.target.value)}
                    className="h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Botão</label>
                  <select
                    value={criativoCta}
                    onChange={(e) => setCriativoCta(e.target.value)}
                    className="h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
                  >
                    <option value="LEARN_MORE">Saiba mais</option>
                    <option value="SHOP_NOW">Comprar agora</option>
                    <option value="SIGN_UP">Cadastre-se</option>
                    <option value="CONTACT_US">Fale conosco</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

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
                <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-neutral-300">
                  {campanha.numeroDeUnidades} unidade{campanha.numeroDeUnidades !== 1 ? "s" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
