"use client";

import { useEffect, useState } from "react";
import { Robot, Sparkle, Trash, CheckCircle, XCircle } from "@phosphor-icons/react";

interface CampanhaLocal {
  id: string;
  meta_campaign_id: string;
  tipo_modelo: string;
  config_criacao?: { nomeCampanha?: string };
}

interface ContaMeta {
  id: string;
  meta_ad_account_nome: string | null;
  nome_exibicao: string | null;
  smartads_campanhas_criadas: CampanhaLocal[];
}

interface Cliente {
  id: string;
  nome: string;
  smartads_contas_meta: ContaMeta[];
}

interface Regra {
  id: string;
  campanha_id: string | null;
  nome: string;
  metrica: "ctr" | "cpc" | "cpm" | "frequencia" | "gasto";
  operador: "maior_que" | "menor_que";
  valor_limite: number;
  janela_dias: number;
  acao: "pausar" | "aumentar_orcamento" | "diminuir_orcamento";
  acao_percentual: number | null;
  gasto_minimo_centavos: number;
  cooldown_horas: number;
  ativa: boolean;
  ultimo_disparo_em: string | null;
}

interface Piloto {
  cliente_id: string;
  ativo: boolean;
  teto_realocacao_percentual: number;
  gasto_minimo_centavos: number;
  ultimo_ajuste_em?: string | null;
}

interface Execucao {
  id: string;
  tipo: "regra" | "teste_ab" | "piloto_automatico";
  descricao: string;
  sucesso: boolean;
  executado_em: string;
}

const ROTULO_METRICA: Record<Regra["metrica"], string> = {
  ctr: "CTR",
  cpc: "custo por clique",
  cpm: "CPM",
  frequencia: "frequência",
  gasto: "gasto",
};

const ROTULO_TIPO_EXECUCAO: Record<Execucao["tipo"], string> = {
  regra: "Regra",
  teste_ab: "Teste A/B",
  piloto_automatico: "Piloto automático",
};

function formatarValorMetrica(metrica: Regra["metrica"], valor: number): string {
  if (metrica === "gasto" || metrica === "cpc" || metrica === "cpm") return `R$ ${valor.toFixed(2).replace(".", ",")}`;
  if (metrica === "frequencia") return `${valor}x`;
  return `${valor}%`;
}

function descreverRegra(regra: Regra): string {
  const comparacao = regra.operador === "maior_que" ? "acima de" : "abaixo de";
  const condicao = `${ROTULO_METRICA[regra.metrica]} ${comparacao} ${formatarValorMetrica(regra.metrica, regra.valor_limite)} (últimos ${regra.janela_dias} dias)`;
  const acao =
    regra.acao === "pausar"
      ? "pausar a campanha"
      : regra.acao === "aumentar_orcamento"
        ? `aumentar orçamento em ${regra.acao_percentual}%`
        : `reduzir orçamento em ${regra.acao_percentual}%`;
  return `Se ${condicao} → ${acao}`;
}

function formatarTempoRelativo(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.round(horas / 24);
  return `há ${dias} dia${dias > 1 ? "s" : ""}`;
}

export default function PainelAutomacao({ clientes }: { clientes: Cliente[] }) {
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? "");
  const [contaId, setContaId] = useState(clientes[0]?.smartads_contas_meta[0]?.id ?? "");
  const [regras, setRegras] = useState<Regra[]>([]);
  const [piloto, setPiloto] = useState<Piloto | null>(null);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [criandoRegra, setCriandoRegra] = useState(false);

  const cliente = clientes.find((c) => c.id === clienteId);
  const contasDoCliente = cliente?.smartads_contas_meta ?? [];
  const conta = contasDoCliente.find((c) => c.id === contaId);

  useEffect(() => {
    if (!contasDoCliente.some((c) => c.id === contaId)) {
      setContaId(contasDoCliente[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  function carregarRegras() {
    if (!contaId) return setRegras([]);
    fetch(`/api/regras?contaId=${contaId}`)
      .then((r) => r.json())
      .then((corpo) => setRegras(corpo.regras ?? []));
  }
  useEffect(carregarRegras, [contaId]);

  useEffect(() => {
    if (!clienteId) return;
    fetch(`/api/piloto?clienteId=${clienteId}`)
      .then((r) => r.json())
      .then((corpo) => setPiloto(corpo.piloto));
  }, [clienteId]);

  useEffect(() => {
    if (!contaId) return;
    fetch(`/api/execucoes?contaId=${contaId}`)
      .then((r) => r.json())
      .then((corpo) => setExecucoes(corpo.execucoes ?? []));
  }, [contaId]);

  async function alternarRegra(regra: Regra) {
    setRegras((atual) => atual.map((r) => (r.id === regra.id ? { ...r, ativa: !r.ativa } : r)));
    await fetch(`/api/regras/${regra.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativa: !regra.ativa }),
    });
  }

  async function excluirRegra(id: string) {
    if (!confirm("Excluir essa regra? Não dá pra desfazer.")) return;
    setRegras((atual) => atual.filter((r) => r.id !== id));
    await fetch(`/api/regras/${id}`, { method: "DELETE" });
  }

  async function alternarPiloto(ativo: boolean) {
    const resposta = await fetch("/api/piloto", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId,
        ativo,
        tetoRealocacaoPercentual: piloto?.teto_realocacao_percentual ?? 20,
        gastoMinimoCentavos: piloto?.gasto_minimo_centavos ?? 10000,
      }),
    });
    const corpo = await resposta.json();
    setPiloto(corpo.piloto);
  }

  if (clientes.length === 0) {
    return (
      <p className="cartao-vidro px-5 py-6 text-sm text-neutral-400">
        Cadastre um cliente em Contas primeiro.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <select
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
          className="h-10 rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
        >
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        {contasDoCliente.length > 0 && (
          <select
            value={contaId}
            onChange={(e) => setContaId(e.target.value)}
            className="h-10 rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
          >
            {contasDoCliente.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome_exibicao || c.meta_ad_account_nome}
              </option>
            ))}
          </select>
        )}
      </div>

      {contasDoCliente.length === 0 ? (
        <p className="cartao-vidro px-5 py-6 text-sm text-neutral-400">
          {cliente?.nome} ainda não tem conta de anúncio associada — associe em Contas primeiro.
        </p>
      ) : (
        <>
          <SecaoPiloto piloto={piloto} onAlternar={alternarPiloto} />

          <div className="cartao-vidro overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="text-sm font-semibold text-neutral-200">Regras de automação</h2>
              <button
                onClick={() => setCriandoRegra(true)}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong"
              >
                + Nova regra
              </button>
            </div>

            {regras.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-neutral-500">
                Nenhuma regra criada pra essa conta ainda.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 p-3">
                {regras.map((regra) => (
                  <li key={regra.id} className="cartao-vidro-interno flex items-start justify-between gap-3 px-4 py-3.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-neutral-100">{regra.nome}</span>
                        <span className={`selo-vidro px-2 py-0.5 text-[10px] font-semibold ${regra.ativa ? "text-ok" : "text-neutral-500"}`}>
                          {regra.ativa ? "ativa" : "desligada"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-neutral-400">{descreverRegra(regra)}</p>
                      <p className="mt-0.5 text-[11px] text-neutral-600">
                        {regra.campanha_id ? "1 campanha específica" : "todas as campanhas da conta"} · gasto mín. R${" "}
                        {(regra.gasto_minimo_centavos / 100).toFixed(2)} · cooldown {regra.cooldown_horas}h
                        {regra.ultimo_disparo_em && ` · último disparo ${formatarTempoRelativo(regra.ultimo_disparo_em)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => alternarRegra(regra)}
                        className="botao-icone-vidro rounded-lg px-2.5 py-1.5 text-[11px] font-medium"
                      >
                        {regra.ativa ? "Desligar" : "Ligar"}
                      </button>
                      <button
                        onClick={() => excluirRegra(regra.id)}
                        aria-label="Excluir regra"
                        className="botao-icone-vidro h-8 w-8 text-neutral-500 hover:text-danger"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <SecaoHistorico execucoes={execucoes} />

          {criandoRegra && (
            <ModalNovaRegra
              contaId={contaId}
              campanhas={conta?.smartads_campanhas_criadas ?? []}
              onFechar={() => setCriandoRegra(false)}
              onCriada={() => {
                setCriandoRegra(false);
                carregarRegras();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function SecaoPiloto({ piloto, onAlternar }: { piloto: Piloto | null; onAlternar: (ativo: boolean) => void }) {
  if (!piloto) return null;

  return (
    <div className="cartao-vidro p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/30 to-indigo-500/5 text-indigo-200">
            <Robot size={15} weight="fill" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-200">Piloto automático</h2>
            <p className="mt-1 text-xs leading-relaxed text-neutral-400">
              Realoca orçamento sozinho entre as campanhas desse cliente, movendo verba da menos
              eficiente (maior custo por clique) pra mais eficiente — até {piloto.teto_realocacao_percentual}%
              por vez, no máximo 1x por dia. Age sem pedir aprovação; cada ajuste vira um aviso no
              histórico abaixo.
            </p>
          </div>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={piloto.ativo}
            onChange={(e) => onAlternar(e.target.checked)}
            className="h-5 w-5 accent-accent"
          />
        </label>
      </div>
    </div>
  );
}

function SecaoHistorico({ execucoes }: { execucoes: Execucao[] }) {
  return (
    <div className="cartao-vidro overflow-hidden">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-neutral-200">Histórico de execuções</h2>
      </div>
      {execucoes.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-neutral-500">
          Nada foi executado sozinho ainda — assim que uma regra, teste A/B ou o piloto agir, aparece aqui.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 p-3">
          {execucoes.map((execucao) => (
            <li key={execucao.id} className="cartao-vidro-interno flex items-start gap-2.5 px-4 py-3">
              {execucao.sucesso ? (
                <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-ok" />
              ) : (
                <XCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-danger" />
              )}
              <div>
                <p className="text-xs leading-relaxed text-neutral-300">{execucao.descricao}</p>
                <p className="mt-1 text-[10.5px] text-neutral-600">
                  {ROTULO_TIPO_EXECUCAO[execucao.tipo]} · {formatarTempoRelativo(execucao.executado_em)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModalNovaRegra({
  contaId,
  campanhas,
  onFechar,
  onCriada,
}: {
  contaId: string;
  campanhas: CampanhaLocal[];
  onFechar: () => void;
  onCriada: () => void;
}) {
  const [nome, setNome] = useState("");
  const [campanhaId, setCampanhaId] = useState("");
  const [metrica, setMetrica] = useState<Regra["metrica"]>("ctr");
  const [operador, setOperador] = useState<Regra["operador"]>("menor_que");
  const [valorLimite, setValorLimite] = useState("");
  const [janelaDias, setJanelaDias] = useState("3");
  const [acao, setAcao] = useState<Regra["acao"]>("pausar");
  const [acaoPercentual, setAcaoPercentual] = useState("20");
  const [gastoMinimo, setGastoMinimo] = useState("20");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!nome.trim() || !valorLimite) return;
    setSalvando(true);
    setErro(null);

    const resposta = await fetch("/api/regras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contaId,
        campanhaId: campanhaId || undefined,
        nome: nome.trim(),
        metrica,
        operador,
        valorLimite: parseFloat(valorLimite.replace(",", ".")),
        janelaDias: parseInt(janelaDias, 10),
        acao,
        acaoPercentual: acao !== "pausar" ? parseFloat(acaoPercentual.replace(",", ".")) : undefined,
        gastoMinimoCentavos: Math.round(parseFloat((gastoMinimo || "0").replace(",", ".")) * 100),
      }),
    });
    const corpo = await resposta.json();
    setSalvando(false);

    if (resposta.ok) {
      onCriada();
    } else {
      setErro(corpo.erro || "Falha ao criar a regra.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <form
        onSubmit={salvar}
        className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-white/10 bg-ink-900 shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-ink-900 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-neutral-100">Nova regra</h3>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="botao-icone-vidro h-8 w-8">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-3.5 p-5">
          <div>
            <label className="text-xs font-semibold text-neutral-400">Nome da regra</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Pausar se CTR cair"
              className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-400">Aplicar em</label>
            <select
              value={campanhaId}
              onChange={(e) => setCampanhaId(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
            >
              <option value="">Todas as campanhas dessa conta</option>
              {campanhas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.config_criacao?.nomeCampanha ?? c.meta_campaign_id}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-semibold text-neutral-400">Métrica</label>
              <select
                value={metrica}
                onChange={(e) => setMetrica(e.target.value as Regra["metrica"])}
                className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
              >
                <option value="ctr">CTR</option>
                <option value="cpc">Custo por clique</option>
                <option value="cpm">CPM</option>
                <option value="frequencia">Frequência</option>
                <option value="gasto">Gasto</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-400">Condição</label>
              <select
                value={operador}
                onChange={(e) => setOperador(e.target.value as Regra["operador"])}
                className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
              >
                <option value="menor_que">Abaixo de</option>
                <option value="maior_que">Acima de</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-semibold text-neutral-400">Valor limite</label>
              <input
                value={valorLimite}
                onChange={(e) => setValorLimite(e.target.value)}
                placeholder="1,5"
                className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-400">Janela (dias)</label>
              <input
                value={janelaDias}
                onChange={(e) => setJanelaDias(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-400">Ação</label>
            <select
              value={acao}
              onChange={(e) => setAcao(e.target.value as Regra["acao"])}
              className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
            >
              <option value="pausar">Pausar</option>
              <option value="aumentar_orcamento">Aumentar orçamento</option>
              <option value="diminuir_orcamento">Diminuir orçamento</option>
            </select>
          </div>

          {acao !== "pausar" && (
            <div>
              <label className="text-xs font-semibold text-neutral-400">Percentual de ajuste</label>
              <input
                value={acaoPercentual}
                onChange={(e) => setAcaoPercentual(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-neutral-400">
              Gasto mínimo no período pra considerar (R$)
            </label>
            <input
              value={gastoMinimo}
              onChange={(e) => setGastoMinimo(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Evita a regra disparar em cima de poucas horas de dado.
            </p>
          </div>

          <div className="cartao-vidro-interno flex items-start gap-2 px-3.5 py-3">
            <Sparkle size={13} weight="fill" className="mt-0.5 shrink-0 text-indigo-300" />
            <p className="text-[11px] leading-relaxed text-neutral-400">
              A regra nasce <strong className="text-neutral-300">desligada</strong>. Depois de criar,
              revise e ligue ela na lista — a partir daí ela age sozinha, sem pedir aprovação a cada vez.
            </p>
          </div>

          {erro && <p className="text-xs text-danger">{erro}</p>}

          <button
            type="submit"
            disabled={salvando || !nome.trim() || !valorLimite}
            className="mt-1 h-10 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
          >
            {salvando ? "Criando…" : "Criar regra"}
          </button>
        </div>
      </form>
    </div>
  );
}
