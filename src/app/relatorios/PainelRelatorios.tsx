"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
    return <p className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-neutral-400">Nenhuma conta associada ainda.</p>;
  }

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
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
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

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
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
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 backdrop-blur-xl">
      <p className="text-xs text-neutral-500">{rotulo}</p>
      <p className="mt-1 font-display text-xl font-bold text-neutral-50">{valor}</p>
    </div>
  );
}
