"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lightning, Trash, CalendarPlus, Gear } from "@phosphor-icons/react";
import ModalBoostAutomatico, { type ContaBoost, type AlteracoesBoost } from "@/components/ModalBoostAutomatico";
import {
  ROTULO_ENTREGA,
  DESCRICAO_ENTREGA,
  configEfetiva,
  custoPorBoostCentavos,
  custoMensalEstimadoCentavos,
  type ConfigBoostRede,
  type RegraBoostRede,
  type TipoEntregaBoost,
} from "@/lib/boostRede";

export interface UnidadeBoost {
  clienteId: string;
  clienteNome: string;
  conta: ContaBoost & { ativo?: boolean };
}

const TIPOS: TipoEntregaBoost[] = ["engajamento", "alcance", "ambos"];
const POSTS_POR_DIA = [
  { valor: 1, rotulo: "1 por dia (o primeiro)" },
  { valor: 2, rotulo: "Até 2 por dia" },
  { valor: 3, rotulo: "Até 3 por dia" },
  { valor: 10, rotulo: "Todos os posts do dia" },
];

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (centavos: number) => formatoReal.format(centavos / 100);
const paraCentavos = (texto: string) => {
  const n = Math.round(parseFloat(texto.replace(",", ".")) * 100);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const hojeISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export default function PainelBoost({
  empresaId,
  empresaNome,
  configInicial,
  regrasIniciais,
  unidades: unidadesIniciais,
}: {
  empresaId: string;
  empresaNome: string;
  configInicial: ConfigBoostRede;
  regrasIniciais: RegraBoostRede[];
  unidades: UnidadeBoost[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoEntregaBoost>(configInicial.tipoEntrega);
  const [orcamento, setOrcamento] = useState(
    configInicial.orcamentoDiarioCentavos ? (configInicial.orcamentoDiarioCentavos / 100).toFixed(2).replace(".", ",") : ""
  );
  const [duracao, setDuracao] = useState<string>(configInicial.duracaoDias ? String(configInicial.duracaoDias) : "");
  const [postsPorDia, setPostsPorDia] = useState(configInicial.boostsPorDia);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [regras, setRegras] = useState(regrasIniciais);
  const [unidades, setUnidades] = useState(unidadesIniciais);
  const [editando, setEditando] = useState<UnidadeBoost | null>(null);

  const orcamentoCentavos = paraCentavos(orcamento);
  const duracaoNum = duracao ? Number(duracao) : null;

  async function salvarConfig() {
    setSalvando(true);
    setMsg(null);
    const r = await fetch("/api/boost-rede", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empresaId,
        tipoEntrega: tipo,
        orcamentoDiarioCentavos: orcamentoCentavos,
        duracaoDias: duracaoNum,
        boostsPorDia: postsPorDia,
      }),
    });
    const corpo = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) return setMsg({ tipo: "erro", texto: corpo.erro || "Falha ao salvar." });
    setMsg({ tipo: "ok", texto: "Padrão da rede salvo." });
    router.refresh();
  }

  // Custo de referência: usa o orçamento/duração do padrão; sem eles, não inventa número.
  const custoBoost = orcamentoCentavos && duracaoNum ? custoPorBoostCentavos(orcamentoCentavos, duracaoNum, tipo) : null;
  const custoMes =
    orcamentoCentavos && duracaoNum ? custoMensalEstimadoCentavos(orcamentoCentavos, duracaoNum, tipo, 1) : null;

  const configAtual: ConfigBoostRede = {
    tipoEntrega: tipo,
    orcamentoDiarioCentavos: orcamentoCentavos,
    duracaoDias: duracaoNum,
    boostsPorDia: postsPorDia,
  };
  const hoje = hojeISO();
  const emVigor = configEfetiva(configAtual, regras, hoje);

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* PADRÃO */}
      <section className="cartao-vidro p-5">
        <div className="flex items-center gap-2">
          <Lightning size={16} weight="fill" className="text-accent-strong" />
          <h2 className="text-sm font-semibold text-neutral-200">Padrão do boost · {empresaNome}</h2>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Vale para todas as unidades da rede que estiverem com o boost ligado. Cada unidade só define o público.
        </p>

        <p className="mt-4 text-xs font-semibold text-neutral-400">O que o boost entrega</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {TIPOS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-xl border p-3.5 text-left transition ${
                tipo === t ? "border-accent bg-accent/10" : "border-white/10 bg-white/[0.02] hover:border-white/25"
              }`}
            >
              <p className="text-sm font-semibold text-neutral-100">{ROTULO_ENTREGA[t]}</p>
              <p className="mt-1 text-[11.5px] leading-snug text-neutral-400">{DESCRICAO_ENTREGA[t]}</p>
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs font-semibold text-neutral-400">Orçamento diário padrão (R$)</label>
            <input
              value={orcamento}
              onChange={(e) => setOrcamento(e.target.value)}
              inputMode="decimal"
              placeholder="Cada unidade define"
              className="mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-400">Duração de cada boost</label>
            <select
              value={duracao}
              onChange={(e) => setDuracao(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
            >
              <option value="">Cada unidade define</option>
              <option value="3">3 dias</option>
              <option value="7">7 dias</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-400">Posts turbinados por dia</label>
            <select
              value={postsPorDia}
              onChange={(e) => setPostsPorDia(Number(e.target.value))}
              className="mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
            >
              {POSTS_POR_DIA.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <PrevisaoCusto custoBoost={custoBoost} custoMes={custoMes} tipo={tipo} postsPorDia={postsPorDia} />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={salvarConfig}
            disabled={salvando}
            className="h-10 rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
          >
            {salvando ? "Salvando…" : "Salvar padrão"}
          </button>
          {msg && <span className={`text-xs ${msg.tipo === "ok" ? "text-ok" : "text-danger"}`}>{msg.texto}</span>}
        </div>
      </section>

      {/* DATAS ESPECIAIS */}
      <section className="cartao-vidro p-5">
        <div className="flex items-center gap-2">
          <CalendarPlus size={16} className="text-neutral-400" />
          <h2 className="text-sm font-semibold text-neutral-200">Datas especiais</h2>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Num período, o boost troca o que entrega (ex.: Natal com engajamento + alcance em todos os posts). Fora do
          período volta ao padrão.
          {emVigor.regra && (
            <span className="ml-1 font-semibold text-accent-strong">
              Em vigor hoje: {emVigor.regra.nome} ({ROTULO_ENTREGA[emVigor.regra.tipoEntrega]}).
            </span>
          )}
        </p>

        {regras.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {regras.map((r) => {
              const ativa = r.dataInicio <= hoje && hoje <= r.dataFim;
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2.5"
                >
                  <div>
                    <p className="text-sm font-semibold text-neutral-100">
                      {r.nome}
                      {ativa && (
                        <span className="ml-2 rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-semibold text-ok">
                          em vigor
                        </span>
                      )}
                    </p>
                    <p className="text-[11.5px] text-neutral-400">
                      {dataBR(r.dataInicio)} a {dataBR(r.dataFim)} · {ROTULO_ENTREGA[r.tipoEntrega]}
                      {r.boostsPorDia ? ` · até ${r.boostsPorDia === 10 ? "todos os" : r.boostsPorDia} post${r.boostsPorDia === 1 ? "" : "s"}/dia` : ""}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Apagar a regra "${r.nome}"?`)) return;
                      const resp = await fetch(`/api/boost-rede/regras?id=${r.id}`, { method: "DELETE" });
                      if (resp.ok) setRegras((atual) => atual.filter((x) => x.id !== r.id));
                    }}
                    aria-label="Apagar regra"
                    className="botao-icone-vidro h-8 w-8"
                  >
                    <Trash size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <NovaRegra empresaId={empresaId} onCriada={(r) => setRegras((a) => [...a, r].sort((x, y) => x.dataInicio.localeCompare(y.dataInicio)))} />
      </section>

      {/* UNIDADES */}
      <section className="cartao-vidro overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3.5">
          <Gear size={16} className="text-neutral-400" />
          <h2 className="text-sm font-semibold text-neutral-200">Unidades</h2>
        </div>
        {unidades.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-500">Nenhuma conta ativa nessa rede.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3 font-medium">Unidade</th>
                  <th className="px-4 py-3 font-medium">Boost</th>
                  <th className="px-4 py-3 font-medium">Orçamento/dia</th>
                  <th className="px-4 py-3 font-medium">Custo por boost</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {unidades.map((u) => {
                  const orc = orcamentoCentavos ?? u.conta.boost_automatico_orcamento_centavos;
                  const dur = duracaoNum ?? u.conta.boost_automatico_duracao_dias;
                  const custo = orc ? custoPorBoostCentavos(orc, dur, emVigor.config.tipoEntrega) : null;
                  const semPublico = u.conta.boost_automatico_ativo && !u.conta.boost_automatico_publico_id;
                  return (
                    <tr key={u.conta.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-neutral-100">{u.clienteNome}</p>
                        <p className="text-[10.5px] text-neutral-600">
                          {u.conta.nome_exibicao || u.conta.meta_ad_account_nome || u.conta.meta_ad_account_id}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={u.conta.boost_automatico_ativo ? "font-semibold text-ok" : "text-neutral-500"}>
                          {u.conta.boost_automatico_ativo ? "Ligado" : "Desligado"}
                        </span>
                        {semPublico && <p className="text-[10.5px] text-amber-400">falta escolher o público</p>}
                      </td>
                      <td className="px-4 py-3 text-neutral-300">{orc ? reais(orc) : "—"}</td>
                      <td className="px-4 py-3 text-neutral-300">
                        {custo ? `${reais(custo)} (${dur} dias)` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setEditando(u)}
                          className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-white/10"
                        >
                          Configurar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editando && (
        <ModalBoostAutomatico
          clienteId={editando.clienteId}
          conta={editando.conta}
          onFechar={() => setEditando(null)}
          onSalvo={(alt: AlteracoesBoost) => {
            setUnidades((atual) =>
              atual.map((u) => (u.conta.id === editando.conta.id ? { ...u, conta: { ...u.conta, ...alt } } : u))
            );
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function PrevisaoCusto({
  custoBoost,
  custoMes,
  tipo,
  postsPorDia,
}: {
  custoBoost: number | null;
  custoMes: number | null;
  tipo: TipoEntregaBoost;
  postsPorDia: number;
}) {
  if (custoBoost === null || custoMes === null) {
    return (
      <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-xs text-neutral-500">
        Defina orçamento e duração padrão para ver a previsão de gasto por boost e por mês.
      </p>
    );
  }
  const maxPorDia = postsPorDia;
  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-xs text-neutral-300">
      <p>
        <span className="text-neutral-500">Cada boost custa até </span>
        <span className="font-semibold text-neutral-100">{reais(custoBoost)}</span>
        <span className="text-neutral-500">
          {" "}
          (orçamento × dias{tipo === "ambos" ? " × 2 campanhas" : ""}).
        </span>
      </p>
      <p className="mt-1">
        <span className="text-neutral-500">Postando todo dia, são cerca de </span>
        <span className="font-semibold text-neutral-100">{reais(custoMes * maxPorDia)}</span>
        <span className="text-neutral-500">
          {" "}
          por mês por unidade{maxPorDia > 1 ? ` (se turbinar ${maxPorDia === 10 ? "todos os posts — conta com 10/dia no pior caso" : `${maxPorDia} posts por dia`})` : ""}. Campanhas de dias
          diferentes rodam ao mesmo tempo, então o gasto diário real é maior que o orçamento de um boost só.
        </span>
      </p>
    </div>
  );
}

function NovaRegra({ empresaId, onCriada }: { empresaId: string; onCriada: (r: RegraBoostRede) => void }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [tipo, setTipo] = useState<TipoEntregaBoost>("ambos");
  const [posts, setPosts] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const valido = useMemo(() => nome.trim() && inicio && fim && fim >= inicio, [nome, inicio, fim]);

  async function criar() {
    setSalvando(true);
    setErro(null);
    const r = await fetch("/api/boost-rede/regras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empresaId,
        nome,
        dataInicio: inicio,
        dataFim: fim,
        tipoEntrega: tipo,
        boostsPorDia: posts ? Number(posts) : null,
      }),
    });
    const corpo = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) return setErro(corpo.erro || "Falha ao criar.");
    onCriada({
      id: corpo.id,
      nome: nome.trim(),
      dataInicio: inicio,
      dataFim: fim,
      tipoEntrega: tipo,
      boostsPorDia: posts ? Number(posts) : null,
    });
    setNome("");
    setInicio("");
    setFim("");
    setPosts("");
    setAberto(false);
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="mt-3 rounded-lg bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/10"
      >
        + Nova data especial
      </button>
    );
  }

  const campo = "mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100";
  return (
    <div className="mt-3 grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="text-xs font-semibold text-neutral-400">Nome</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Natal 2026" className={campo} />
      </div>
      <div>
        <label className="text-xs font-semibold text-neutral-400">De</label>
        <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} />
      </div>
      <div>
        <label className="text-xs font-semibold text-neutral-400">Até</label>
        <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={campo} />
      </div>
      <div>
        <label className="text-xs font-semibold text-neutral-400">O boost entrega</label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEntregaBoost)} className={campo}>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {ROTULO_ENTREGA[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-semibold text-neutral-400">Posts por dia</label>
        <select value={posts} onChange={(e) => setPosts(e.target.value)} className={campo}>
          <option value="">Igual ao padrão</option>
          {POSTS_POR_DIA.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.rotulo}
            </option>
          ))}
        </select>
      </div>
      {erro && <p className="text-xs text-danger sm:col-span-2">{erro}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button
          onClick={criar}
          disabled={!valido || salvando}
          className="h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
        >
          {salvando ? "Salvando…" : "Criar regra"}
        </button>
        <button onClick={() => setAberto(false)} className="h-9 rounded-lg px-4 text-sm text-neutral-400 hover:text-neutral-200">
          Cancelar
        </button>
      </div>
    </div>
  );
}
