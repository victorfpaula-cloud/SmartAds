"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { NotePencil, TestTube, X } from "@phosphor-icons/react";

interface Campanha {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  /** Gasto total acumulado da campanha (date_preset "maximum" na Meta) — o que a coluna "Gasto"
   * mostra, e também o que decide o que é "relevante" por padrão (ver campanhasRelevantes abaixo). */
  spendTotal: string;
  start_time?: string;
  stop_time?: string;
  local: {
    id: string;
    meta_adset_id: string | null;
    tipo_modelo: string;
    meta_ad_ids: string[] | null;
  } | null;
}

const NOME_MODELO: Record<string, string> = {
  engajamento: "Engajamento",
  alcance: "Alcance",
  formulario: "Formulário",
  visita_perfil: "Visita ao perfil",
  cliques_link: "Cliques no link",
};

/** Rótulo + cor de cada effective_status que a Meta devolve — bem mais que só ativa/pausada: uma
 * campanha pode estar esperando aprovação, ter sido reprovada, ou estar com problema de pagamento
 * (a Meta não distingue "sem saldo" das outras causas num status próprio, então cai aqui também).
 * "Ativa"/"Pausada" são as únicas clicáveis (viram o botão de pausar/ativar) — o resto só muda
 * direto no Gerenciador de Anúncios, então aparece como selo, não botão. */
const STATUS_INFO: Record<string, { rotulo: string; cor: string }> = {
  ACTIVE: { rotulo: "Ativa", cor: "bg-ok/15 text-ok" },
  PAUSED: { rotulo: "Pausada", cor: "bg-white/[0.06] text-neutral-400" },
  CAMPAIGN_PAUSED: { rotulo: "Pausada", cor: "bg-white/[0.06] text-neutral-400" },
  ARCHIVED: { rotulo: "Arquivada", cor: "bg-white/[0.06] text-neutral-500" },
  DELETED: { rotulo: "Excluída", cor: "bg-white/[0.06] text-neutral-500" },
  PENDING_REVIEW: { rotulo: "Em análise", cor: "bg-amber-500/15 text-amber-400" },
  IN_PROCESS: { rotulo: "Processando", cor: "bg-amber-500/15 text-amber-400" },
  PREAPPROVED: { rotulo: "Pré-aprovada", cor: "bg-amber-500/15 text-amber-400" },
  DISAPPROVED: { rotulo: "Reprovada", cor: "bg-danger/15 text-danger" },
  PENDING_BILLING_INFO: { rotulo: "Falta pagamento", cor: "bg-danger/15 text-danger" },
  WITH_ISSUES: { rotulo: "Com problema (pagamento)", cor: "bg-danger/15 text-danger" },
  ADSET_PAUSED: { rotulo: "Pausada", cor: "bg-white/[0.06] text-neutral-400" },
};

/** Rótulo real de exibição — cobre o caso que a Meta não distingue num status próprio: campanha
 * com data de término no passado continua aparecendo como "Pausada" ou até "Ativa" no
 * effective_status, então aqui checa o stop_time direto pra mostrar "Encerrada (prazo)" em vez de
 * confundir com uma pausa manual. */
function statusExibicao(campanha: Campanha): { rotulo: string; cor: string; clicavel: boolean } {
  const prazoEncerrado = campanha.stop_time ? new Date(campanha.stop_time).getTime() < Date.now() : false;
  // Prazo vencido manda mesmo quando a Meta ainda devolve effective_status "ACTIVE" — foi
  // exatamente esse o caso relatado (campanha com fim em 15/09 aparecendo como "Ativa" em 23/09):
  // a condição anterior excluía justo esse caso (`!== "ACTIVE"`), invertida por engano.
  if (prazoEncerrado) {
    return { rotulo: "Encerrada (prazo)", cor: "bg-white/[0.06] text-neutral-500", clicavel: false };
  }
  const info = STATUS_INFO[campanha.effective_status] ?? {
    rotulo: campanha.effective_status,
    cor: "bg-white/[0.06] text-neutral-400",
  };
  const clicavel = campanha.effective_status === "ACTIVE" || campanha.effective_status === "PAUSED";
  return { ...info, clicavel };
}

function formatarPeriodo(campanha: Campanha): string {
  const formato = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const inicio = campanha.start_time ? formato(campanha.start_time) : null;
  const fim = campanha.stop_time ? formato(campanha.stop_time) : null;
  if (!inicio) return "";
  return fim ? `${inicio} – ${fim}` : `Desde ${inicio}, sem data de término`;
}

function formatarReais(centavosTexto?: string): string {
  if (!centavosTexto) return "-";
  return `R$ ${(Number(centavosTexto) / 100).toFixed(2).replace(".", ",")}`;
}

/** Campanhas de UMA conta só (a escolha de qual conta acontece antes, em /campanhas) — a coluna
 * "Gasto" mostra o total acumulado da campanha (vida inteira). Por padrão só aparece o que está
 * ativo, teve QUALQUER gasto (mesmo antigo) ou está num estado de problema/espera (ver
 * campanhasRelevantes) — usa o mesmo gasto lifetime da coluna "Gasto" pra decidir isso, uma única
 * chamada à Meta em vez de duas (uma só de 30 dias, outra de vida inteira). O resto (campanhas de
 * verdade zeradas, nunca tiveram gasto nenhum) fica escondido atrás de "Ver todas", pra não
 * competir por atenção com o que importa agora. */
export default function PainelCampanhasDaConta({ contaId }: { contaId: string }) {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [proximoCursor, setProximoCursor] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [executando, setExecutando] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  const [campanhaComNotas, setCampanhaComNotas] = useState<Campanha | null>(null);
  const [campanhaParaTeste, setCampanhaParaTeste] = useState<Campanha | null>(null);

  function carregar() {
    setCarregando(true);
    setErro(null);
    fetch(`/api/campanhas/status?contaId=${contaId}`)
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro || "Falha ao carregar campanhas.");
        setCampanhas(corpo.campanhas ?? []);
        setProximoCursor(corpo.proximoCursor ?? null);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }

  function carregarMais() {
    if (!proximoCursor) return;
    setCarregandoMais(true);
    fetch(`/api/campanhas/status?contaId=${contaId}&after=${proximoCursor}`)
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro || "Falha ao carregar mais campanhas.");
        setCampanhas((atual) => [...atual, ...(corpo.campanhas ?? [])]);
        setProximoCursor(corpo.proximoCursor ?? null);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregandoMais(false));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contaId]);

  const campanhasRelevantes = useMemo(
    () =>
      campanhas.filter(
        (c) =>
          c.effective_status === "ACTIVE" ||
          Number(c.spendTotal) > 0 ||
          // Estados de problema/espera aparecem mesmo sem gasto — é justamente por causa deles que
          // não tem gasto, e são os que mais precisam de atenção (ex: sem saldo pra veicular).
          ["WITH_ISSUES", "PENDING_REVIEW", "PENDING_BILLING_INFO", "DISAPPROVED", "IN_PROCESS"].includes(
            c.effective_status
          )
      ),
    [campanhas]
  );
  const campanhasExibidas = verTodas ? campanhas : campanhasRelevantes;
  const escondidas = campanhas.length - campanhasRelevantes.length;

  async function alternarStatus(campanha: Campanha) {
    const pausada = campanha.effective_status !== "ACTIVE";
    setExecutando(campanha.id);
    const resposta = await fetch("/api/campanhas/acao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao: pausada ? "ativar" : "pausar",
        campaignId: campanha.id,
        contaId,
      }),
    });
    setExecutando(null);
    if (resposta.ok) {
      carregar();
    } else {
      const corpo = await resposta.json();
      alert(corpo.erro || "Falha ao alterar status.");
    }
  }

  async function editarOrcamento(campanha: Campanha) {
    if (!campanha.local?.meta_adset_id) {
      alert("Essa campanha não tem conjunto de anúncios rastreado localmente pra editar por aqui.");
      return;
    }
    const tipo = campanha.daily_budget ? "diario" : "vitalicio";
    const atual = Number(campanha.daily_budget ?? campanha.lifetime_budget ?? 0) / 100;
    const novoValor = prompt(`Novo orçamento ${tipo === "diario" ? "diário" : "total"} (R$):`, String(atual));
    if (!novoValor) return;

    const valorCentavos = Math.round(parseFloat(novoValor.replace(",", ".")) * 100);
    setExecutando(campanha.id);
    const resposta = await fetch("/api/campanhas/acao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "orcamento", adsetId: campanha.local.meta_adset_id, tipo, valorCentavos, contaId }),
    });
    setExecutando(null);
    if (resposta.ok) {
      carregar();
    } else {
      const corpo = await resposta.json();
      alert(corpo.erro || "Falha ao alterar orçamento.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {erro && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{erro}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">
          Gasto total acumulado de cada campanha. Clique no status pra pausar/ativar — os outros
          estados (análise, problema, encerrada) só mudam direto no Gerenciador de Anúncios.
        </p>
        {escondidas > 0 && (
          <button
            onClick={() => setVerTodas(!verTodas)}
            className="text-xs font-medium text-accent-strong hover:underline"
          >
            {verTodas ? "Ver só ativas/recentes" : `Ver todas (+${escondidas} antiga${escondidas !== 1 ? "s" : ""})`}
          </button>
        )}
      </div>

      <div className="cartao-vidro overflow-hidden">
        {carregando ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Carregando campanhas…</p>
        ) : campanhasExibidas.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">
            {campanhas.length === 0 ? "Nenhuma campanha nessa conta ainda." : "Nenhuma campanha ativa ou recente."}
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-3 font-medium">Campanha</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Orçamento</th>
                <th className="px-4 py-3 font-medium">Gasto total</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {campanhasExibidas.map((campanha) => {
                const status = statusExibicao(campanha);
                const periodo = formatarPeriodo(campanha);
                return (
                <tr key={campanha.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-100">{campanha.name}</p>
                    {periodo && <p className="mt-0.5 text-[10.5px] text-neutral-600">{periodo}</p>}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">
                    {campanha.local ? NOME_MODELO[campanha.local.tipo_modelo] : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {status.clicavel ? (
                      <button
                        onClick={() => alternarStatus(campanha)}
                        disabled={executando === campanha.id}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.cor}`}
                      >
                        {status.rotulo}
                      </button>
                    ) : (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.cor}`}>
                        {status.rotulo}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-300">
                    {formatarReais(campanha.daily_budget ?? campanha.lifetime_budget)}
                    <span className="ml-1 text-neutral-600">{campanha.daily_budget ? "/dia" : ""}</span>
                  </td>
                  <td className="px-4 py-3 text-neutral-300">{formatarReais(campanha.spendTotal)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => editarOrcamento(campanha)}
                        disabled={executando === campanha.id}
                        className="text-xs font-medium text-accent-strong hover:underline"
                      >
                        Orçamento
                      </button>
                      <button
                        onClick={() => setCampanhaComNotas(campanha)}
                        className="text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:underline"
                      >
                        Notas
                      </button>
                      {campanha.local && (campanha.local.meta_ad_ids?.length ?? 0) >= 2 && (
                        <button
                          onClick={() => setCampanhaParaTeste(campanha)}
                          className="text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:underline"
                        >
                          Teste A/B
                        </button>
                      )}
                      {campanha.local && (
                        <Link
                          href={`/campanhas/duplicar/${campanha.local.id}`}
                          className="text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:underline"
                        >
                          Duplicar
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {proximoCursor && !carregando && (
        <button
          onClick={carregarMais}
          disabled={carregandoMais}
          className="w-fit rounded-lg border border-white/14 bg-ink-850 px-4 py-2 text-sm font-medium text-neutral-300 hover:text-neutral-100 disabled:opacity-40"
        >
          {carregandoMais ? "Carregando…" : "Carregar mais campanhas"}
        </button>
      )}

      <Link
        href={`/campanhas/nova/${contaId}`}
        className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
      >
        + Nova campanha
      </Link>

      {campanhaComNotas && (
        <ModalAnotacoes campanha={campanhaComNotas} onFechar={() => setCampanhaComNotas(null)} />
      )}
      {campanhaParaTeste && (
        <ModalTesteAB campanha={campanhaParaTeste} onFechar={() => setCampanhaParaTeste(null)} />
      )}
    </div>
  );
}

interface TesteAB {
  id: string;
  duracao_dias_minima: number;
  gasto_minimo_centavos: number;
  status: "rodando" | "concluido" | "dado_insuficiente";
  vencedor_meta_ad_id: string | null;
  avaliado_em: string | null;
  created_at: string;
}

const ROTULO_STATUS_TESTE: Record<TesteAB["status"], string> = {
  rodando: "Rodando",
  concluido: "Concluído",
  dado_insuficiente: "Dado insuficiente",
};

/** Início e acompanhamento de teste A/B — só aparece pra campanhas com 2+ variações de anúncio no
 * mesmo conjunto (múltiplas imagens). O teste só observa: o cron declara o vencedor sozinho quando
 * bater a duração e o gasto mínimos, e pausa as variações perdedoras — aqui o usuário só decide
 * começar a observar, nunca escolhe o vencedor manualmente. */
function ModalTesteAB({ campanha, onFechar }: { campanha: Campanha; onFechar: () => void }) {
  const [teste, setTeste] = useState<TesteAB | null | undefined>(undefined);
  const [duracaoDias, setDuracaoDias] = useState("7");
  const [gastoMinimo, setGastoMinimo] = useState("50");
  const [iniciando, setIniciando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/testes-ab?campanhaId=${campanha.local?.id}`)
      .then((r) => r.json())
      .then((corpo) => setTeste(corpo.teste ?? null))
      .catch(() => setTeste(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanha.local?.id]);

  async function iniciar(evento: React.FormEvent) {
    evento.preventDefault();
    setIniciando(true);
    setErro(null);
    const resposta = await fetch("/api/testes-ab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campanhaId: campanha.local?.id,
        duracaoDiasMinima: Number(duracaoDias) || 7,
        gastoMinimoCentavos: Math.round((Number(gastoMinimo.replace(",", ".")) || 50) * 100),
      }),
    });
    const corpo = await resposta.json();
    setIniciando(false);
    if (!resposta.ok) {
      setErro(corpo.erro || "Falha ao iniciar o teste.");
      return;
    }
    setTeste(corpo.teste);
  }

  const quantidadeVariacoes = campanha.local?.meta_ad_ids?.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-white/10 bg-ink-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-ink-900 px-5 py-3.5">
          <div className="flex items-center gap-2 overflow-hidden">
            <TestTube size={16} className="shrink-0 text-neutral-400" />
            <h3 className="truncate text-sm font-semibold text-neutral-100">Teste A/B — {campanha.name}</h3>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="botao-icone-vidro h-8 w-8 shrink-0">
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {teste === undefined ? (
            <p className="text-xs text-neutral-500">Carregando…</p>
          ) : teste ? (
            <div className="cartao-vidro-interno flex flex-col gap-2 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span
                  className={
                    teste.status === "concluido"
                      ? "selo-vidro text-ok"
                      : teste.status === "dado_insuficiente"
                        ? "selo-vidro text-neutral-400"
                        : "selo-vidro text-accent-strong"
                  }
                >
                  {ROTULO_STATUS_TESTE[teste.status]}
                </span>
              </div>
              {teste.status === "rodando" && (
                <p className="text-xs leading-relaxed text-neutral-400">
                  Observando as {quantidadeVariacoes} variações desse conjunto. Precisa de pelo menos{" "}
                  {teste.duracao_dias_minima} dias rodando e R${" "}
                  {(teste.gasto_minimo_centavos / 100).toFixed(2).replace(".", ",")} de gasto acumulado pra decidir
                  sozinho — a de maior CTR vence e as outras são pausadas automaticamente.
                </p>
              )}
              {teste.status === "concluido" && (
                <p className="text-xs leading-relaxed text-neutral-400">
                  Vencedor definido por CTR em{" "}
                  {teste.avaliado_em &&
                    new Date(teste.avaliado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  . As outras variações foram pausadas — veja o detalhe no histórico da Automação.
                </p>
              )}
              {teste.status === "dado_insuficiente" && (
                <p className="text-xs leading-relaxed text-neutral-400">
                  Passou da duração mínima mas não bateu o gasto mínimo — nenhuma variação foi pausada. Deixe
                  rodando mais um pouco.
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={iniciar} className="flex flex-col gap-3">
              <p className="text-xs leading-relaxed text-neutral-400">
                Essa campanha tem {quantidadeVariacoes} variações de anúncio no mesmo conjunto. O teste só observa
                — quando bater a duração e o gasto mínimos abaixo, a variação com maior CTR vence sozinha e as
                outras são pausadas.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-neutral-300">Duração mínima (dias)</span>
                  <input
                    type="number"
                    min={1}
                    value={duracaoDias}
                    onChange={(e) => setDuracaoDias(e.target.value)}
                    className="h-10 rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100 outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-neutral-300">Gasto mínimo (R$)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={gastoMinimo}
                    onChange={(e) => setGastoMinimo(e.target.value)}
                    className="h-10 rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100 outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
                  />
                </label>
              </div>
              {erro && (
                <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {erro}
                </div>
              )}
              <button
                type="submit"
                disabled={iniciando}
                className="h-10 w-full rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
              >
                {iniciando ? "Iniciando…" : "Iniciar teste A/B"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

interface Anotacao {
  id: string;
  texto: string;
  created_at: string;
}

/** Anotações livres por campanha — "cliente pediu pra pausar dia 20", esse tipo de coisa que não
 * cabe em nenhum campo estruturado do app. Ficam salvas pelo ID da campanha na Meta, então
 * funcionam pra qualquer campanha do painel, mesmo uma que já existia antes do SmartAds. */
function ModalAnotacoes({ campanha, onFechar }: { campanha: Campanha; onFechar: () => void }) {
  const [anotacoes, setAnotacoes] = useState<Anotacao[] | null>(null);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    fetch(`/api/anotacoes?campaignId=${campanha.id}`)
      .then((r) => r.json())
      .then((corpo) => setAnotacoes(corpo.anotacoes ?? []))
      .catch(() => setAnotacoes([]));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanha.id]);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!texto.trim()) return;
    setSalvando(true);

    const resposta = await fetch("/api/anotacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campanha.id, texto }),
    });
    setSalvando(false);

    if (resposta.ok) {
      setTexto("");
      carregar();
    } else {
      const corpo = await resposta.json();
      alert(corpo.erro || "Falha ao salvar a anotação.");
    }
  }

  async function excluir(id: string) {
    setAnotacoes((atual) => atual?.filter((a) => a.id !== id) ?? null);
    await fetch(`/api/anotacoes/${id}`, { method: "DELETE" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-white/10 bg-ink-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-ink-900 px-5 py-3.5">
          <div className="flex items-center gap-2 overflow-hidden">
            <NotePencil size={16} className="shrink-0 text-neutral-400" />
            <h3 className="truncate text-sm font-semibold text-neutral-100">{campanha.name}</h3>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="botao-icone-vidro h-8 w-8 shrink-0">
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <form onSubmit={salvar} className="flex flex-col gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex: cliente pediu pra pausar dia 20"
              rows={2}
              className="w-full resize-none rounded-lg border border-white/14 bg-ink-850 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
            />
            <button
              type="submit"
              disabled={salvando || !texto.trim()}
              className="h-9 w-fit rounded-lg bg-accent px-4 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
            >
              {salvando ? "Salvando…" : "Adicionar anotação"}
            </button>
          </form>

          <div className="flex flex-col gap-2">
            {anotacoes === null ? (
              <p className="text-xs text-neutral-500">Carregando…</p>
            ) : anotacoes.length === 0 ? (
              <p className="text-xs text-neutral-500">Nenhuma anotação ainda nessa campanha.</p>
            ) : (
              anotacoes.map((anotacao) => (
                <div key={anotacao.id} className="cartao-vidro-interno flex items-start justify-between gap-2 px-3 py-2.5">
                  <div>
                    <p className="text-xs leading-relaxed text-neutral-300">{anotacao.texto}</p>
                    <p className="mt-1 text-[10.5px] text-neutral-600">
                      {new Date(anotacao.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => excluir(anotacao.id)}
                    aria-label="Excluir anotação"
                    className="shrink-0 text-neutral-600 hover:text-danger"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
