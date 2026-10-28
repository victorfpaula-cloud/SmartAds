"use client";

import { useState } from "react";
import { reaisDigitadosParaCentavos } from "@/lib/valorEmReais";
import { useRouter } from "next/navigation";
import { Trash, CaretDown, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import type { InvestimentoUnidade, ResumoInvestimentos } from "@/lib/investimentos";
import AtualizarAgora from "../AtualizarAgora";

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (c: number) => formatoReal.format(c / 100);
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const paraCentavos = (t: string) => {
  const n = reaisDigitadosParaCentavos(t);
  return n !== null && n >= 0 ? n : null;
};
const hojeISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export default function PainelInvestimentos({ resumo }: { resumo: ResumoInvestimentos }) {
  // Quem não colocou nada vem primeiro; depois do menor pro maior valor investido.
  const unidades = [...resumo.unidades].sort((a, b) => a.investidoCentavos - b.investidoCentavos);
  const totalPago = resumo.unidades.reduce((t, u) => t + u.pagoCentavos, 0);
  const totalInvestido = resumo.unidades.reduce((t, u) => t + u.investidoCentavos, 0);
  const comAporte = resumo.unidades.filter((u) => u.aportes.length > 0).length;

  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumo rotulo="Pago em recargas" valor={reais(totalPago)} />
        <Resumo rotulo="Creditado (depois de impostos)" valor={reais(totalInvestido)} />
        <Resumo rotulo="Unidades com aporte" valor={`${comAporte} de ${resumo.unidades.length}`} />
        <Resumo rotulo="Sem aporte no mês" valor={String(resumo.unidades.length - comAporte)} />
      </div>

      {resumo.mesAtual && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-neutral-500">
          <span>As recargas da Meta entram no Financeiro, ao atualizar (diário ou pelo botão).</span>
          <AtualizarAgora rotulo="Buscar recargas agora" />
        </div>
      )}

      {unidades.length === 0 ? (
        <p className="cartao-vidro px-5 py-6 text-sm text-neutral-500">Nenhuma unidade nessa rede.</p>
      ) : (
        unidades.map((u) => <CartaoUnidade key={u.contaId} u={u} mes={resumo.mes} />)
      )}
    </div>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="cartao-vidro px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{rotulo}</p>
      <p className="mt-1 text-lg font-bold text-neutral-100">{valor}</p>
    </div>
  );
}

function CartaoUnidade({ u, mes }: { u: InvestimentoUnidade; mes: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  return (
    <div className="cartao-vidro overflow-hidden">
      <button onClick={() => setAberto(!aberto)} className="flex w-full flex-col gap-2 px-5 py-4 text-left">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-100">{u.clienteNome}</p>
            <p className="truncate text-[10.5px] text-neutral-600">{u.contaNome}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-right">
            <div>
              <p className="text-sm font-bold text-neutral-100">
                {reais(u.investidoCentavos)}{" "}
                <span className="text-xs font-normal text-neutral-500">
                  {u.aportes.length} aporte{u.aportes.length !== 1 ? "s" : ""}
                  {u.pagoCentavos !== u.investidoCentavos ? ` · pagou ${reais(u.pagoCentavos)}` : ""}
                </span>
              </p>
            </div>
            <CaretDown size={14} className={`text-neutral-500 transition ${aberto ? "rotate-180" : ""}`} />
          </div>
        </div>
        {u.sugestoes.length > 0 && (
          <ul className="flex flex-col gap-1">
            {u.sugestoes.map((s, i) => (
              <li
                key={i}
                className={`flex items-start gap-1.5 text-[11.5px] ${
                  s.tom === "ok" ? "text-ok" : s.tom === "neutro" ? "text-neutral-400" : s.tom === "atencao" ? "text-amber-400" : "text-danger"
                }`}
              >
                {s.tom === "ok" || s.tom === "neutro" ? <CheckCircle size={13} weight="fill" className="mt-px shrink-0" /> : <WarningCircle size={13} weight="fill" className="mt-px shrink-0" />}
                {s.texto}
              </li>
            ))}
          </ul>
        )}
      </button>

      {aberto && <Detalhe u={u} mes={mes} onMudou={() => router.refresh()} />}
    </div>
  );
}

function Detalhe({ u, mes, onMudou }: { u: InvestimentoUnidade; mes: string; onMudou: () => void }) {
  const campo = "h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100";
  const [data, setData] = useState(hojeISO().startsWith(mes) ? hojeISO() : `${mes}-01`);
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function lancar() {
    const c = paraCentavos(valor);
    if (!c) return setMsg("Informe um valor maior que zero.");
    setOcupado(true);
    setMsg(null);
    const r = await fetch("/api/investimentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contaId: u.contaId, data, valorCentavos: c, observacao: obs }),
    });
    const corpo = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) return setMsg(corpo.erro || "Falha ao lançar.");
    setValor("");
    setObs("");
    onMudou();
  }

  return (
    <div className="flex flex-col gap-5 border-t border-white/10 px-5 py-4">
      <div className="grid gap-4">
        <div>
          <p className="text-xs font-semibold text-neutral-400">Lançar um aporte</p>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={`${campo} min-w-0`} />
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="Valor (R$)" className={campo} />
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional)" className={`${campo} col-span-2`} />
            <button
              onClick={lancar}
              disabled={ocupado}
              className="col-span-2 h-9 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
            >
              Lançar aporte
            </button>
          </div>
        </div>
      </div>
      {msg && <p className="text-xs text-danger">{msg}</p>}

      <div>
        <p className="text-xs font-semibold text-neutral-400">Aportes do mês</p>
        {u.aportes.length === 0 ? (
          <p className="mt-1.5 text-xs text-neutral-500">Nenhum aporte registrado neste mês ainda.</p>
        ) : (
          <ul className="mt-1.5 divide-y divide-white/5 rounded-lg border border-white/10">
            {u.aportes.map((a) => (
              <Aporte key={a.id} a={a} onMudou={onMudou} />
            ))}
          </ul>
        )}
        {u.gastoMesCentavos !== null && (
          <p className="mt-2 text-[11px] text-neutral-500">
            Gasto no mês: <span className="font-semibold text-neutral-300">{reais(u.gastoMesCentavos)}</span>
            {u.saldoCentavos !== null && (
              <>
                {" "}
                · Saldo na conta: <span className="font-semibold text-neutral-300">{reais(Math.max(u.saldoCentavos, 0))}</span>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** Uma linha de aporte: o que foi pago e, se informado, o que realmente caiu de crédito (depois de impostos). */
function Aporte({ a, onMudou }: { a: InvestimentoUnidade["aportes"][number]; onMudou: () => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(a.valorCreditadoCentavos !== null ? (a.valorCreditadoCentavos / 100).toFixed(2).replace(".", ",") : "");
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(limpar = false) {
    const c = limpar ? null : paraCentavos(valor);
    if (!limpar && (c === null || c <= 0)) return setErro("Valor inválido.");
    const r = await fetch("/api/investimentos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, valorCreditadoCentavos: c }),
    });
    if (!r.ok) return setErro("Falha ao salvar.");
    setEditando(false);
    setErro(null);
    onMudou();
  }

  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-neutral-400">{dataBR(a.data)}</span>
        <span className="font-semibold text-neutral-100">
          {reais(a.valorCentavos)}
          <span className="font-normal text-neutral-500"> pago</span>
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-500">
          {a.valorCreditadoCentavos !== null ? (
            <span className="text-neutral-300">
              → {reais(a.valorCreditadoCentavos)} creditado (impostos e taxas: {reais(Math.max(a.valorCentavos - a.valorCreditadoCentavos, 0))})
            </span>
          ) : a.origem === "meta" ? (
            "Recarga registrada pela Meta"
          ) : (
            a.observacao || "Lançado à mão"
          )}
        </span>
        <button onClick={() => setEditando(!editando)} className="shrink-0 text-[11px] font-semibold text-accent-strong hover:underline">
          {a.valorCreditadoCentavos !== null ? "Editar crédito" : "Informar crédito"}
        </button>
        {a.origem === "manual" && (
          <button
            onClick={async () => {
              if (!window.confirm("Apagar esse aporte?")) return;
              const r = await fetch(`/api/investimentos?id=${a.id}`, { method: "DELETE" });
              if (r.ok) onMudou();
            }}
            aria-label="Apagar aporte"
            className="text-neutral-500 hover:text-danger"
          >
            <Trash size={14} />
          </button>
        )}
      </div>
      {editando && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            placeholder="Quanto caiu de crédito (R$)"
            className="h-8 w-52 rounded-lg border border-white/14 bg-ink-850 px-2.5 text-xs text-neutral-100"
          />
          <button onClick={() => salvar()} className="h-8 rounded-lg bg-white/[0.08] px-3 text-xs font-semibold text-neutral-100 hover:bg-white/15">
            Salvar
          </button>
          {a.valorCreditadoCentavos !== null && (
            <button onClick={() => salvar(true)} className="text-xs text-neutral-400 hover:text-neutral-200">
              Usar o valor pago
            </button>
          )}
          {erro && <span className="text-xs text-danger">{erro}</span>}
        </div>
      )}
    </li>
  );
}
