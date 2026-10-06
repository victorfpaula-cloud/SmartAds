"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { FilePdf } from "@phosphor-icons/react";
import type { DadosRelatorioAds, ItemOrganico } from "@/lib/relatorioAds";
import { baixarPdfRelatorioAds, montarKpis, inteiro, reais, type CartaoKpi } from "@/lib/relatorioAdsPdf";
import { formatarDiaExibicao } from "@/lib/tempoSaoPaulo";

export interface OpcaoConta {
  id: string;
  clienteNome: string;
  contaNome: string;
  instagram: string | null;
}

const PERIODOS = [15, 30, 45, 60, 90];

export default function PainelRelatorioAds({ contas }: { contas: OpcaoConta[] }) {
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [dias, setDias] = useState(30);
  const [organico, setOrganico] = useState(false);
  const [dados, setDados] = useState<DadosRelatorioAds | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  useEffect(() => {
    if (!contaId) return;
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    fetch(`/api/relatorio-ads?contaId=${encodeURIComponent(contaId)}&dias=${dias}${organico ? "&organico=1" : ""}`)
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro || "Falha ao gerar o relatório.");
        if (!cancelado) setDados(corpo.relatorio);
      })
      .catch((e) => {
        if (!cancelado) {
          setDados(null);
          setErro(e.message);
        }
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [contaId, dias, organico]);

  async function baixarPdf() {
    if (!dados) return;
    setGerandoPdf(true);
    try {
      await baixarPdfRelatorioAds(dados);
    } catch {
      setErro("Não consegui gerar o PDF. Tente de novo.");
    } finally {
      setGerandoPdf(false);
    }
  }

  if (contas.length === 0) {
    return <p className="cartao-vidro px-5 py-6 text-sm text-neutral-400">Nenhuma conta conectada ainda.</p>;
  }

  const clientes = Array.from(new Set(contas.map((c) => c.clienteNome)));

  return (
    <div className="flex flex-col gap-5">
      <div className="cartao-vidro flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <select
          value={contaId}
          onChange={(e) => setContaId(e.target.value)}
          aria-label="Conta"
          className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2.5 text-sm text-neutral-100 sm:max-w-sm"
        >
          {clientes.map((cliente) => (
            <optgroup key={cliente} label={cliente}>
              {contas
                .filter((c) => c.clienteNome === cliente)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contaNome}
                    {c.instagram ? ` · @${c.instagram}` : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-2">
          {PERIODOS.map((p) => (
            <button
              key={p}
              onClick={() => setDias(p)}
              className={
                dias === p
                  ? "pilula-ativa rounded-lg px-3.5 py-2 text-[13px] font-semibold text-neutral-100"
                  : "rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-400 hover:text-neutral-200"
              }
            >
              {p} dias
            </button>
          ))}
          <button
            onClick={baixarPdf}
            disabled={!dados || carregando || gerandoPdf}
            className="ml-1 flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FilePdf size={16} weight="fill" />
            {gerandoPdf ? "Gerando…" : "Baixar PDF"}
          </button>
        </div>
      </div>

      <label className="cartao-vidro flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5">
        <span>
          <span className="block text-sm font-semibold text-neutral-200">Mostrar dados orgânicos</span>
          <span className="block text-xs text-neutral-500">
            Separa o que veio sozinho (orgânico) do que veio pelo tráfego pago.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={organico}
          onChange={(e) => setOrganico(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
            organico ? "border-accent bg-accent" : "border-white/15 bg-white/10"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              organico ? "left-[22px]" : "left-0.5"
            }`}
          />
        </span>
      </label>

      {erro && <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</div>}

      {carregando && !dados && <p className="text-sm text-neutral-500">Buscando os números na Meta…</p>}

      {dados && (
        <div className={carregando ? "flex flex-col gap-5 opacity-50 transition" : "flex flex-col gap-5 transition"}>
          <Relatorio dados={dados} />
        </div>
      )}
    </div>
  );
}

function Relatorio({ dados }: { dados: DadosRelatorioAds }) {
  const kpis = montarKpis(dados);
  const serie = dados.serieDiaria.map((d) => ({ ...d, rotulo: formatarDiaExibicao(d.dia) }));

  return (
    <>
      <div className="cartao-vidro p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-strong">
          Últimos {dados.periodo.dias} dias · {formatarDiaExibicao(dados.periodo.desde)} a {formatarDiaExibicao(dados.periodo.ate)}
        </p>
        <h2 className="mt-1 font-display text-lg font-bold">
          {dados.conta.clienteNome ? `${dados.conta.clienteNome} — ` : ""}
          {dados.conta.contaNome}
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          {[dados.conta.instagramUsername ? `@${dados.conta.instagramUsername}` : null, dados.conta.paginaNome]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {dados.avisos.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-[12px] text-warn">
          {dados.avisos.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      )}

      {dados.organico && dados.organico.length > 0 && <BlocoOrganico itens={dados.organico} />}

      <Bloco titulo="Resultado do tráfego" kpis={kpis.destaque} />
      <Bloco titulo="Engajamento" kpis={kpis.engajamento} />
      <Bloco titulo="Investimento e cliques" kpis={kpis.custos} />

      {dados.instagram && (
        <Bloco
          titulo="Instagram"
          kpis={[
            { rotulo: "Novos seguidores", valor: dados.instagram.novosSeguidores === null ? "—" : `${dados.instagram.novosSeguidores > 0 ? "+" : ""}${inteiro(dados.instagram.novosSeguidores)}` },
            { rotulo: "Alcance da conta", valor: dados.instagram.alcance === null ? "—" : inteiro(dados.instagram.alcance) },
            { rotulo: "Visitas ao perfil", valor: dados.instagram.visitasPerfil === null ? "—" : inteiro(dados.instagram.visitasPerfil) },
          ]}
        />
      )}

      {serie.length > 1 && (
        <div className="cartao-vidro p-5">
          <h3 className="text-sm font-semibold text-neutral-200">Alcance por dia</h3>
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "#15171d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [inteiro(v), "Alcance"]}
                />
                <Bar dataKey="alcance" fill="#818cf8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {dados.campanhas.length > 0 && (
        <div className="cartao-vidro overflow-x-auto p-5">
          <h3 className="text-sm font-semibold text-neutral-200">Campanhas</h3>
          <table className="mt-3 w-full min-w-[480px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="py-2 font-medium">Campanha</th>
                <th className="py-2 text-right font-medium">Alcance</th>
                <th className="py-2 text-right font-medium">Engaj.</th>
                <th className="py-2 text-right font-medium">Cliques</th>
                <th className="py-2 text-right font-medium">Investido</th>
              </tr>
            </thead>
            <tbody>
              {dados.campanhas.map((c, i) => (
                <tr key={i} className="border-t border-white/5 text-neutral-300">
                  <td className="max-w-[260px] truncate py-2.5 pr-3">{c.nome}</td>
                  <td className="py-2.5 text-right tabular-nums">{inteiro(c.alcance)}</td>
                  <td className="py-2.5 text-right tabular-nums">{inteiro(c.engajamentos)}</td>
                  <td className="py-2.5 text-right tabular-nums">{inteiro(c.cliquesNoLink)}</td>
                  <td className="py-2.5 text-right tabular-nums">{reais(c.gasto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dados.campanhas.length === 0 && dados.totais.gasto === 0 && (
        <p className="cartao-vidro px-5 py-5 text-sm text-neutral-400">
          Essa conta não teve anúncios rodando nos últimos {dados.periodo.dias} dias.
        </p>
      )}

    </>
  );
}

function BlocoOrganico({ itens }: { itens: ItemOrganico[] }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Orgânico x tráfego
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {itens.map((i) => {
          const dividido = i.organico !== null && i.trafego !== null && i.total > 0;
          const pctOrganico = dividido ? ((i.organico as number) / i.total) * 100 : 0;
          return (
            <div key={i.chave} className="selo-vidro px-4 py-3.5">
              <p className="text-[11.5px] text-neutral-400">{i.rotulo}</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-neutral-100">{inteiro(i.total)}</p>
              {dividido ? (
                <>
                  <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-accent/60">
                    <div className="bg-ok" style={{ width: `${pctOrganico}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11.5px]">
                    <span className="text-ok">
                      <span className="font-semibold tabular-nums">{inteiro(i.organico as number)}</span> orgânico
                    </span>
                    <span className="text-accent-strong">
                      <span className="font-semibold tabular-nums">{inteiro(i.trafego as number)}</span> tráfego
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[11.5px] text-neutral-500">Total da conta (sem divisão)</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Bloco({ titulo, kpis }: { titulo: string; kpis: CartaoKpi[] }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{titulo}</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.rotulo} className="selo-vidro px-4 py-3.5">
            <p className="text-[11.5px] text-neutral-400">{k.rotulo}</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums text-neutral-100">{k.valor}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

