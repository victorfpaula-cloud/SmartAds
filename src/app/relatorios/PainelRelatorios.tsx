"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Sparkle, ArrowsClockwise } from "@phosphor-icons/react";

interface LinhaResumo {
  clienteId: string;
  clienteNome: string;
  contaId: string;
  contaNome: string;
  spend?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  erro?: string;
}

function formatarReais(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

export default function PainelRelatorios() {
  const [linhas, setLinhas] = useState<LinhaResumo[] | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/relatorios/resumo")
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro || "Falha ao carregar relatório.");
        setLinhas(corpo.linhas ?? []);
      })
      .catch((e) => setErroGeral(e.message));
  }, []);

  if (erroGeral) {
    return <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{erroGeral}</div>;
  }
  if (!linhas) {
    return <p className="text-sm text-neutral-500">Carregando…</p>;
  }
  if (linhas.length === 0) {
    return <p className="cartao-vidro px-5 py-6 text-sm text-neutral-400">Nenhuma conta associada ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <ResumoIA />
      <PainelNumeros linhas={linhas} />
    </div>
  );
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

/** Resumo em texto (Gemini) do panorama de todos os clientes — gerado sob demanda (nunca
 * automático, pra não gastar token à toa) e cacheado (ver /api/ia/resumo). Falha "quieta": se o
 * Gemini não estiver configurado ou a chamada falhar, mostra o convite pra gerar de novo em vez
 * de quebrar o resto da tela de Relatórios, que segue funcionando com os números crus abaixo. */
function ResumoIA() {
  const [resumo, setResumo] = useState<{ texto: string; gerado_em: string } | null | undefined>(undefined);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ia/resumo")
      .then((r) => r.json())
      .then((corpo) => setResumo(corpo.resumo))
      .catch(() => setResumo(null));
  }, []);

  async function gerar() {
    setGerando(true);
    setErro(null);
    const resposta = await fetch("/api/ia/resumo", { method: "POST" });
    const corpo = await resposta.json();
    setGerando(false);

    if (resposta.ok) {
      setResumo(corpo.resumo);
    } else {
      setErro(corpo.erro || "Falha ao gerar o resumo.");
    }
  }

  if (resumo === undefined) return null; // ainda carregando o cache — evita um "pulo" na tela

  return (
    <div className="cartao-vidro p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/30 to-indigo-500/5 text-indigo-200">
            <Sparkle size={15} weight="fill" />
          </div>
          <h2 className="text-sm font-semibold text-neutral-200">Resumo (IA)</h2>
        </div>
        <button
          onClick={gerar}
          disabled={gerando}
          className="botao-icone-vidro shrink-0 gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowsClockwise size={13} className={gerando ? "animate-spin" : ""} />
          {gerando ? "Gerando…" : resumo ? "Atualizar" : "Gerar resumo"}
        </button>
      </div>

      {resumo ? (
        <>
          <p className="mt-3.5 text-[13.5px] leading-relaxed text-neutral-300">{resumo.texto}</p>
          <p className="mt-3 text-[11px] text-neutral-600">
            Gerado por IA · atualizado {formatarTempoRelativo(resumo.gerado_em)}
          </p>
        </>
      ) : (
        <p className="mt-3.5 text-[13px] text-neutral-500">
          Peça um resumo em português do panorama dos últimos 30 dias de todos os clientes.
        </p>
      )}

      {erro && <p className="mt-2.5 text-xs text-danger">{erro}</p>}
    </div>
  );
}

function PainelNumeros({ linhas }: { linhas: LinhaResumo[] }) {

  const validas = linhas.filter((l) => l.erro === undefined);
  const totalGasto = validas.reduce((s, l) => s + (l.spend ?? 0), 0);
  const totalImpressoes = validas.reduce((s, l) => s + (l.impressions ?? 0), 0);
  const totalCliques = validas.reduce((s, l) => s + (l.clicks ?? 0), 0);

  const gastoPorCliente = Object.values(
    validas.reduce<Record<string, { cliente: string; gasto: number }>>((acc, l) => {
      acc[l.clienteId] ??= { cliente: l.clienteNome, gasto: 0 };
      acc[l.clienteId].gasto += l.spend ?? 0;
      return acc;
    }, {})
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Estatistica rotulo="Gasto (30 dias)" valor={formatarReais(totalGasto)} />
        <Estatistica rotulo="Impressões" valor={totalImpressoes.toLocaleString("pt-BR")} />
        <Estatistica rotulo="Cliques" valor={totalCliques.toLocaleString("pt-BR")} />
      </div>

      {gastoPorCliente.length > 1 && (
        <div className="cartao-vidro p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-200">Gasto por cliente</h2>
          <ResponsiveContainer width="100%" height={Math.max(160, gastoPorCliente.length * 44)}>
            <BarChart data={gastoPorCliente} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" tick={{ fill: "#8b8fa3", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="cliente"
                width={110}
                tick={{ fill: "#c8cad4", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(valor: number) => formatarReais(valor)}
                contentStyle={{ background: "#15171d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#e5e5e5" }}
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
              />
              <Bar dataKey="gasto" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="cartao-vidro overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Conta</th>
              <th className="px-4 py-3 font-medium">Gasto</th>
              <th className="px-4 py-3 font-medium">Impressões</th>
              <th className="px-4 py-3 font-medium">Cliques</th>
              <th className="px-4 py-3 font-medium">CTR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {linhas.map((linha) => (
              <tr key={linha.contaId}>
                <td className="px-4 py-3 font-medium text-neutral-100">{linha.clienteNome}</td>
                <td className="px-4 py-3 text-neutral-400">{linha.contaNome}</td>
                {linha.erro ? (
                  <td colSpan={4} className="px-4 py-3 text-xs text-danger">{linha.erro}</td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-neutral-300">{formatarReais(linha.spend ?? 0)}</td>
                    <td className="px-4 py-3 text-neutral-300">{(linha.impressions ?? 0).toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3 text-neutral-300">{(linha.clicks ?? 0).toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3 text-neutral-300">{(linha.ctr ?? 0).toFixed(2)}%</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function Estatistica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="selo-vidro px-4 py-3.5">
      <p className="text-xs text-neutral-500">{rotulo}</p>
      <p className="mt-1 font-display text-xl font-bold text-neutral-50">{valor}</p>
    </div>
  );
}
