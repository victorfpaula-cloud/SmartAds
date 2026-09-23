"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ConstrutorDePublico from "@/components/ConstrutorDePublico";
import type { ModeloCampanha } from "@/lib/meta/modelos";
import type { Publico } from "@/lib/meta/tipos";

const PUBLICO_VAZIO: Publico = { localizacoes: [], interesses: [], idadeMin: 18, idadeMax: 65, genero: "todos" };

interface PublicoSalvo {
  id: string;
  nome: string;
  targeting: Publico;
}

interface PostInstagram {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
}

const ETAPAS = ["Público", "Orçamento", "Criativo", "Revisão"];

/** Preenchidos quando o formulário abre a partir de "Duplicar" (ver /campanhas/duplicar/[id]) —
 * reaproveita público, plataforma e orçamento da campanha original, e pula direto pro passo do
 * criativo (que nasce em branco, de propósito: é sempre um conteúdo novo). */
export interface ValoresIniciaisCampanha {
  publico: Publico;
  publicoId?: string;
  incluirFacebook: boolean;
  orcamento: { tipo: "diario" | "vitalicio"; valorCentavos: number; dataInicio?: string; dataFim?: string };
  nomeCampanha?: string;
  /** Preenchido quando essa campanha nasce de uma etapa de Plano ligada a uma Campanha-Mãe — o
   * criativo já vem pronto E TRAVADO (a unidade não escolhe imagem/texto/botão próprios, é o
   * "padrão" que a franqueadora definiu). Só `link` e o ID do formulário de Leads continuam
   * editáveis, porque são específicos de cada unidade. */
  criativoOficial?: { titulo: string | null; mensagem: string; imagemBase64: string; cta: string };
}

export default function FormularioCampanha({
  contaId,
  clienteId,
  clienteNome,
  instagramBusinessId,
  modelo,
  valoresIniciais,
  etapaInicial = 1,
  planoEtapaId,
}: {
  contaId: string;
  clienteId?: string;
  clienteNome: string;
  instagramBusinessId?: string | null;
  modelo: ModeloCampanha;
  valoresIniciais?: ValoresIniciaisCampanha;
  etapaInicial?: number;
  /** Preenchido quando essa campanha nasce de uma etapa de um Plano de Execução aplicado (ver
   * /campanhas/nova-do-plano/[planoEtapaId]) — a rota /api/campanhas usa isso pra marcar a etapa
   * como concluída no checklist automaticamente, sem passo manual extra. */
  planoEtapaId?: string;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState(etapaInicial);

  // Passo 1 — público
  const [publicosSalvos, setPublicosSalvos] = useState<PublicoSalvo[]>([]);
  const [publicoSalvoId, setPublicoSalvoId] = useState<string>(valoresIniciais?.publicoId ?? "");
  const [modoPublico, setModoPublico] = useState<"salvo" | "novo">(
    valoresIniciais && !valoresIniciais.publicoId ? "novo" : "salvo"
  );
  const [publicoNovo, setPublicoNovo] = useState<Publico>(valoresIniciais?.publico ?? PUBLICO_VAZIO);
  const [incluirFacebook, setIncluirFacebook] = useState(valoresIniciais?.incluirFacebook ?? false);
  const [nomePublicoParaSalvar, setNomePublicoParaSalvar] = useState("");
  const [salvandoPublico, setSalvandoPublico] = useState(false);
  const [publicoSalvoFeedback, setPublicoSalvoFeedback] = useState<string | null>(null);

  // Passo 2 — orçamento
  const [tipoOrcamento, setTipoOrcamento] = useState<"diario" | "vitalicio">(
    valoresIniciais?.orcamento.tipo ?? "diario"
  );
  const [valorReais, setValorReais] = useState(
    valoresIniciais ? String(valoresIniciais.orcamento.valorCentavos / 100).replace(".", ",") : ""
  );
  const [dataInicio, setDataInicio] = useState(valoresIniciais?.orcamento.dataInicio ?? "");
  const [dataFim, setDataFim] = useState(valoresIniciais?.orcamento.dataFim ?? "");

  // Passo 3 — criativo
  const criativoOficial = valoresIniciais?.criativoOficial;
  const [usarPostExistente, setUsarPostExistente] = useState(!criativoOficial && modelo.permiteUsarPostExistente);
  const [posts, setPosts] = useState<PostInstagram[]>([]);
  const [carregandoPosts, setCarregandoPosts] = useState(false);
  const [postSelecionadoId, setPostSelecionadoId] = useState("");
  const [mensagem, setMensagem] = useState(criativoOficial?.mensagem ?? "");
  const [titulo, setTitulo] = useState(criativoOficial?.titulo ?? "");
  // Uma imagem = um Anúncio depois (ver hierarquia explicada na tela) — todas as variações
  // entram no MESMO Conjunto de Anúncios, nunca um conjunto por imagem.
  const [imagens, setImagens] = useState<string[]>(criativoOficial ? [criativoOficial.imagemBase64] : []);
  const [link, setLink] = useState("");
  const [callToAction, setCallToAction] = useState(criativoOficial?.cta ?? "LEARN_MORE");
  const [leadGenFormId, setLeadGenFormId] = useState("");

  // Passo 4 — revisão
  // Nasce preenchido com a sugestão (cliente + objetivo), editável — antes era só "placeholder"
  // (texto fantasma do campo vazio), e alguém que não reparasse a cor mais apagada achava que já
  // tinha um nome ali e ficava sem entender por que o botão de publicar continuava desabilitado
  // (achado em 12/09/2026 testando em produção).
  const [nomeCampanha, setNomeCampanha] = useState(
    valoresIniciais?.nomeCampanha
      ? `${valoresIniciais.nomeCampanha} (cópia)`
      : `${clienteNome} - ${modelo.nomeExibicao}`
  );
  const [publicando, setPublicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!clienteId) return;
    fetch(`/api/publicos?clienteId=${clienteId}`)
      .then((r) => r.json())
      .then((corpo) => setPublicosSalvos(corpo.publicos ?? []));
  }, [clienteId]);

  // Salva o público que está sendo montado nesse instante (sem precisar sair da tela nem terminar
  // de publicar a campanha) — pra próxima vez dar pra escolher ele pronto em "Usar público salvo"
  // em vez de remontar tudo de novo (achado em 13/09/2026: cada teste de campanha real exigia
  // redigitar localização/interesse/idade do zero).
  async function salvarPublicoAtual() {
    if (!clienteId || !nomePublicoParaSalvar.trim()) return;
    setSalvandoPublico(true);
    setPublicoSalvoFeedback(null);
    try {
      const resposta = await fetch("/api/publicos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, nome: nomePublicoParaSalvar.trim(), publico: publicoNovo }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? "Falha ao salvar público.");
      setPublicosSalvos((atual) => [...atual, corpo.publico].sort((a, b) => a.nome.localeCompare(b.nome)));
      setPublicoSalvoFeedback(`Público "${corpo.publico.nome}" salvo — já aparece em "Usar público salvo".`);
      setNomePublicoParaSalvar("");
    } catch (erroSalvar) {
      setPublicoSalvoFeedback(erroSalvar instanceof Error ? erroSalvar.message : "Falha ao salvar público.");
    } finally {
      setSalvandoPublico(false);
    }
  }

  useEffect(() => {
    if (etapa === 3 && usarPostExistente && instagramBusinessId && posts.length === 0) {
      setCarregandoPosts(true);
      fetch(`/api/meta/posts-instagram?instagramBusinessId=${instagramBusinessId}`)
        .then((r) => r.json())
        .then((corpo) => setPosts(corpo.posts ?? []))
        .finally(() => setCarregandoPosts(false));
    }
  }, [etapa, usarPostExistente, instagramBusinessId, posts.length]);

  const publicoEfetivo: Publico =
    modoPublico === "salvo"
      ? publicosSalvos.find((p) => p.id === publicoSalvoId)?.targeting ?? PUBLICO_VAZIO
      : publicoNovo;

  const valorCentavos = Math.round(parseFloat((valorReais || "0").replace(",", ".")) * 100) || 0;

  function orcamentoPrevisto(): string {
    if (!valorCentavos) return "-";
    const reais = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;
    if (tipoOrcamento === "vitalicio") return reais(valorCentavos);
    if (dataFim && dataInicio) {
      const dias = Math.max(
        1,
        Math.round((new Date(dataFim).getTime() - new Date(dataInicio).getTime()) / 86_400_000) + 1
      );
      return `${reais(valorCentavos * dias)} (${dias} dias)`;
    }
    return `Contínuo, ~${reais(valorCentavos * 30)}/mês (estimativa)`;
  }

  function podeAvancarDe(passo: number): boolean {
    if (passo === 1) return publicoEfetivo.localizacoes.length > 0;
    if (passo === 2) {
      if (!valorCentavos) return false;
      if (tipoOrcamento === "vitalicio") return !!dataInicio && !!dataFim;
      return true;
    }
    if (passo === 3) {
      if (usarPostExistente) return !!postSelecionadoId;
      if (imagens.length === 0) return false;
      if (!mensagem.trim()) return false;
      if (modelo.exigeLink && !link.trim()) return false;
      if (modelo.exigeFormulario && !leadGenFormId.trim()) return false;
      return true;
    }
    return true;
  }

  async function publicar() {
    if (!nomeCampanha.trim()) return;
    setPublicando(true);
    setErro(null);

    const resposta = await fetch("/api/campanhas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contaId,
        tipoModelo: modelo.tipo,
        nomeCampanha: nomeCampanha.trim(),
        publico: publicoEfetivo,
        publicoId: modoPublico === "salvo" ? publicoSalvoId : undefined,
        incluirFacebook,
        planoEtapaId,
        orcamento: {
          tipo: tipoOrcamento,
          valorCentavos,
          dataInicio: dataInicio || undefined,
          dataFim: dataFim || undefined,
        },
        criativo: {
          usarPostExistente,
          postSelecionadoId: usarPostExistente ? postSelecionadoId : undefined,
          mensagem,
          titulo: titulo || undefined,
          imagensBase64: usarPostExistente ? undefined : imagens,
          link: modelo.exigeLink ? link : undefined,
          callToAction: modelo.exigeLink ? callToAction : undefined,
          leadGenFormId: modelo.exigeFormulario ? leadGenFormId : undefined,
        },
      }),
    });
    const corpo = await resposta.json();
    setPublicando(false);

    if (resposta.ok) {
      router.push("/campanhas");
    } else {
      setErro(corpo.erro || "Falha ao publicar a campanha.");
    }
  }

  function adicionarImagens(arquivos: FileList) {
    Array.from(arquivos).forEach((arquivo) => {
      const leitor = new FileReader();
      leitor.onload = () => {
        const resultado = leitor.result as string;
        setImagens((atual) => [...atual, resultado.split(",")[1]]); // remove o prefixo "data:image/...;base64,"
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  function removerImagem(indice: number) {
    setImagens((atual) => atual.filter((_, i) => i !== indice));
  }

  return (
    <div className="mt-6">
      {valoresIniciais && (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 text-xs text-accent-strong">
          Duplicando campanha: público e orçamento reaproveitados. Falta só o criativo novo.
        </div>
      )}

      {/* Desktop: os 4 passos lado a lado. No celular isso não cabe (nomes longos + 4 pílulas) —
          vira uma barra de progresso compacta com só o passo atual escrito por extenso. */}
      <div className="mb-6 hidden items-center gap-2 sm:flex">
        {ETAPAS.map((nome, indice) => (
          <div key={nome} className="flex items-center gap-2">
            <span
              className={
                etapa === indice + 1
                  ? "rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white"
                  : etapa > indice + 1
                    ? "rounded-full bg-ok/20 px-3 py-1 text-xs font-semibold text-ok"
                    : "rounded-full bg-white/[0.05] px-3 py-1 text-xs font-medium text-neutral-500"
              }
            >
              {indice + 1}. {nome}
            </span>
            {indice < ETAPAS.length - 1 && <span className="text-neutral-700">-</span>}
          </div>
        ))}
      </div>

      <div className="mb-6 sm:hidden">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-neutral-200">
            Passo {etapa} de {ETAPAS.length}: {ETAPAS[etapa - 1]}
          </span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {ETAPAS.map((nome, indice) => (
            <div
              key={nome}
              className={
                indice + 1 <= etapa ? "h-1.5 flex-1 rounded-full bg-accent" : "h-1.5 flex-1 rounded-full bg-white/10"
              }
            />
          ))}
        </div>
      </div>

      <div className="cartao-vidro p-6">
        {etapa === 1 && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModoPublico("salvo")}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${modoPublico === "salvo" ? "border-accent bg-accent/10 text-accent-strong" : "border-white/10 text-neutral-400"}`}
              >
                Usar público salvo
              </button>
              <button
                type="button"
                onClick={() => setModoPublico("novo")}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${modoPublico === "novo" ? "border-accent bg-accent/10 text-accent-strong" : "border-white/10 text-neutral-400"}`}
              >
                Montar novo agora
              </button>
            </div>

            {modoPublico === "salvo" ? (
              publicosSalvos.length === 0 ? (
                <p className="text-xs text-neutral-500">
                  Nenhum público salvo pra {clienteNome} ainda. Monte um novo abaixo.
                </p>
              ) : (
                <select
                  value={publicoSalvoId}
                  onChange={(e) => setPublicoSalvoId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
                >
                  <option value="">Selecione…</option>
                  {publicosSalvos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              )
            ) : (
              <div className="flex flex-col gap-4">
                <ConstrutorDePublico valor={publicoNovo} onChange={setPublicoNovo} />
                {clienteId && (
                  <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-4">
                    <p className="text-sm font-medium text-neutral-200">Salvar esse público pra reaproveitar depois</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={nomePublicoParaSalvar}
                        onChange={(e) => setNomePublicoParaSalvar(e.target.value)}
                        placeholder="Nome do público (ex: Mulheres 25-40 Araçatuba)"
                        className="h-10 flex-1 rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
                      />
                      <button
                        type="button"
                        onClick={salvarPublicoAtual}
                        disabled={!nomePublicoParaSalvar.trim() || salvandoPublico}
                        className="h-10 rounded-lg border border-accent bg-accent/10 px-4 text-xs font-semibold text-accent-strong disabled:opacity-40"
                      >
                        {salvandoPublico ? "Salvando…" : "Salvar público"}
                      </button>
                    </div>
                    {publicoSalvoFeedback && <p className="text-xs text-neutral-400">{publicoSalvoFeedback}</p>}
                  </div>
                )}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-200">Incluir Facebook além do Instagram</p>
                <p className="text-xs text-neutral-500">Posicionamento fixo: Feed + Stories + Reels.</p>
              </div>
              <input
                type="checkbox"
                checked={incluirFacebook}
                onChange={(e) => setIncluirFacebook(e.target.checked)}
                className="h-5 w-5 accent-accent"
              />
            </div>
          </div>
        )}

        {etapa === 2 && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipoOrcamento("diario")}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${tipoOrcamento === "diario" ? "border-accent bg-accent/10 text-accent-strong" : "border-white/10 text-neutral-400"}`}
              >
                Diário
              </button>
              <button
                type="button"
                onClick={() => setTipoOrcamento("vitalicio")}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${tipoOrcamento === "vitalicio" ? "border-accent bg-accent/10 text-accent-strong" : "border-white/10 text-neutral-400"}`}
              >
                Vitalício
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-400">
                Valor {tipoOrcamento === "diario" ? "por dia" : "total"} (R$)
              </label>
              <input
                value={valorReais}
                onChange={(e) => setValorReais(e.target.value)}
                placeholder="50,00"
                className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
              />
            </div>

            {tipoOrcamento === "vitalicio" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-neutral-400">Início</label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-400">Fim</label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold text-neutral-400">Data de término (opcional)</label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  placeholder="Sem data = contínuo até eu pausar"
                  className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
                />
              </div>
            )}

            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm">
              <span className="text-neutral-400">Orçamento previsto: </span>
              <span className="font-semibold text-neutral-100">{orcamentoPrevisto()}</span>
            </div>
          </div>
        )}

        {etapa === 3 && (
          <div className="flex flex-col gap-4">
            {criativoOficial && (
              <div className="cartao-vidro-interno flex gap-3 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/jpeg;base64,${criativoOficial.imagemBase64}`}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg border border-white/10 object-cover"
                />
                <div className="text-xs">
                  <p className="font-semibold uppercase tracking-wide text-neutral-500">
                    Criativo oficial da Campanha-Mãe — travado
                  </p>
                  {criativoOficial.titulo && (
                    <p className="mt-1 font-semibold text-neutral-200">{criativoOficial.titulo}</p>
                  )}
                  <p className="mt-0.5 text-neutral-400">{criativoOficial.mensagem}</p>
                </div>
              </div>
            )}

            {!criativoOficial && modelo.permiteUsarPostExistente && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setUsarPostExistente(true)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${usarPostExistente ? "border-accent bg-accent/10 text-accent-strong" : "border-white/10 text-neutral-400"}`}
                >
                  Usar publicação existente
                </button>
                <button
                  type="button"
                  onClick={() => setUsarPostExistente(false)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${!usarPostExistente ? "border-accent bg-accent/10 text-accent-strong" : "border-white/10 text-neutral-400"}`}
                >
                  Criar novo
                </button>
              </div>
            )}

            {usarPostExistente ? (
              carregandoPosts ? (
                <p className="text-xs text-neutral-500">Carregando publicações…</p>
              ) : posts.length === 0 ? (
                <p className="text-xs text-neutral-500">Nenhuma publicação encontrada nessa conta.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {posts.map((post) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => setPostSelecionadoId(post.id)}
                      className={`aspect-square overflow-hidden rounded-lg border-2 ${postSelecionadoId === post.id ? "border-accent" : "border-transparent"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={post.thumbnail_url || post.media_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )
            ) : (
              <>
                {!criativoOficial && (
                  <>
                    <div className="cartao-vidro-interno px-4 py-3.5 text-xs leading-relaxed text-neutral-400">
                      <p className="font-semibold text-neutral-300">
                        Campanha → Conjunto de Anúncios → Anúncio
                      </p>
                      <p className="mt-1.5">
                        Cada imagem que você adicionar aqui vira um <strong className="text-neutral-300">Anúncio</strong> separado,
                        mas todos dentro do <strong className="text-neutral-300">mesmo Conjunto de Anúncios</strong> desta
                        campanha — nunca um conjunto novo por imagem. É assim que a Meta testa sozinha
                        qual variação funciona melhor e direciona mais verba pra ela. Separar em
                        conjuntos diferentes divide o público/orçamento à toa e atrapalha esse teste.
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-neutral-400">
                        Imagens {imagens.length > 0 && `(${imagens.length} ${imagens.length > 1 ? "variações" : "variação"} = ${imagens.length} anúncio${imagens.length > 1 ? "s" : ""})`}
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => e.target.files && adicionarImagens(e.target.files)}
                        className="mt-1 block w-full text-xs text-neutral-400"
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Pode selecionar várias de uma vez — inclusive as variações que o Meta AI sugere.
                      </p>

                      {imagens.length > 0 && (
                        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                          {imagens.map((imagem, indice) => (
                            <div key={indice} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`data:image/jpeg;base64,${imagem}`}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => removerImagem(indice)}
                                aria-label="Remover imagem"
                                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[11px] font-bold text-white"
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
                      <textarea
                        value={mensagem}
                        onChange={(e) => setMensagem(e.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-white/14 bg-ink-850 px-3 py-2 text-sm text-neutral-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-neutral-400">Título (opcional)</label>
                      <input
                        value={titulo}
                        onChange={(e) => setTitulo(e.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
                      />
                    </div>
                  </>
                )}

                {modelo.exigeLink && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-neutral-400">URL de destino</label>
                      <input
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder="https://…"
                        className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-neutral-400">Botão</label>
                      {criativoOficial ? (
                        <p className="mt-1 h-10 flex items-center rounded-lg border border-white/10 bg-white/[0.02] px-3 text-sm text-neutral-400">
                          {{ LEARN_MORE: "Saiba mais", SHOP_NOW: "Comprar agora", SIGN_UP: "Cadastre-se", CONTACT_US: "Fale conosco" }[callToAction] ?? callToAction}{" "}
                          <span className="ml-1.5 text-[11px]">(definido pela Campanha-Mãe)</span>
                        </p>
                      ) : (
                        <select
                          value={callToAction}
                          onChange={(e) => setCallToAction(e.target.value)}
                          className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
                        >
                          <option value="LEARN_MORE">Saiba mais</option>
                          <option value="SHOP_NOW">Comprar agora</option>
                          <option value="SIGN_UP">Cadastre-se</option>
                          <option value="CONTACT_US">Fale conosco</option>
                        </select>
                      )}
                    </div>
                  </>
                )}

                {modelo.exigeFormulario && (
                  <div>
                    <label className="text-xs font-semibold text-neutral-400">
                      ID do formulário de Leads (já criado no Meta Business Suite)
                    </label>
                    <input
                      value={leadGenFormId}
                      onChange={(e) => setLeadGenFormId(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Pega em Meta Business Suite → Biblioteca de Formulários.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {etapa === 4 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-neutral-400">Nome da campanha</label>
              <input
                value={nomeCampanha}
                onChange={(e) => setNomeCampanha(e.target.value)}
                placeholder={`${clienteNome} - ${modelo.nomeExibicao}`}
                className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
              />
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-xs">
              <dt className="text-neutral-500">Objetivo</dt>
              <dd className="text-neutral-200">{modelo.nomeExibicao}</dd>
              <dt className="text-neutral-500">Localizações</dt>
              <dd className="text-neutral-200">{publicoEfetivo.localizacoes.length}</dd>
              <dt className="text-neutral-500">Plataforma</dt>
              <dd className="text-neutral-200">{incluirFacebook ? "Instagram + Facebook" : "Instagram"}</dd>
              <dt className="text-neutral-500">Criativo</dt>
              <dd className="text-neutral-200">
                {usarPostExistente
                  ? "1 anúncio (publicação existente)"
                  : `${imagens.length} anúncio${imagens.length > 1 ? "s" : ""} (${imagens.length} ${imagens.length > 1 ? "variações" : "variação"} de imagem), mesmo conjunto`}
              </dd>
              <dt className="text-neutral-500">Orçamento</dt>
              <dd className="text-neutral-200">
                {tipoOrcamento === "diario" ? "Diário" : "Vitalício"}: {orcamentoPrevisto()}
              </dd>
            </dl>

            <p className="text-xs text-neutral-500">
              A campanha entra <strong className="text-neutral-300">ativa</strong> ao publicar.
              Acompanhe e pause a qualquer momento no painel de Campanhas.
            </p>

            {erro && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
                {erro}
              </div>
            )}

            <button
              onClick={publicar}
              disabled={publicando || !nomeCampanha.trim()}
              className="h-11 rounded-lg bg-accent text-sm font-bold text-white hover:bg-accent-strong disabled:opacity-50"
            >
              {publicando ? "Publicando…" : "Publicar campanha"}
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-between">
        <button
          onClick={() => setEtapa((e) => Math.max(1, e - 1))}
          disabled={etapa === 1}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-neutral-400 hover:text-neutral-200 disabled:opacity-30"
        >
          Voltar
        </button>
        {etapa < 4 && (
          <button
            onClick={() => setEtapa((e) => Math.min(4, e + 1))}
            disabled={!podeAvancarDe(etapa)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
          >
            Continuar
          </button>
        )}
      </div>
    </div>
  );
}
