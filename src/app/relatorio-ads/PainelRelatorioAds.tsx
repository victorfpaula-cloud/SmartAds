"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { FilePdf } from "@phosphor-icons/react";
import type { DadosRelatorioAds, ItemOrganico } from "@/lib/relatorioAds";
import { baixarPdfRelatorioAds, montarKpis, inteiro, reais, type CartaoKpi } from "@/lib/relatorioAdsPdf";
import { formatarDiaExibicao } from "@/lib/tempoSaoPaulo";
import type { DadosGeraisRede } from "@/lib/dadosGeraisRede";

export interface OpcaoConta {
  id: string;
  clienteNome: string;
  contaNome: string;
  instagram: string | null;
}

const PERIODOS = [15, 30, 45, 60, 90];
type Visao = "completo" | "curtidas" | "gerais";

const ROTULO_VISAO: Record<Visao, string> = { completo: "Relatório completo", curtidas: "Relatório de curtidas", gerais: "Dados gerais" };

export default function PainelRelatorioAds({ contas, contaInicial, ehFranquia = false }: { contas: OpcaoConta[]; contaInicial?: string; ehFranquia?: boolean }) {
  const [contaId, setContaId] = useState(contaInicial ?? contas[0]?.id ?? "");
  const [dias, setDias] = useState(30);
  const [organico, setOrganico] = useState(false);
  const [visao, setVisao] = useState<Visao>("completo");
  const [dadosGerais, setDadosGerais] = useState<DadosGeraisRede | null>(null);
  const [dados, setDados] = useState<DadosRelatorioAds | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  // Dados gerais: a franquia inteira no período (não depende da conta escolhida).
  useEffect(() => {
    if (visao !== "gerais") return;
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    fetch(`/api/relatorio-ads/geral?dias=${dias}`)
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro || "Falha ao calcular os dados gerais.");
        if (!cancelado) setDadosGerais(corpo.dados);
      })
      .catch((e) => {
        if (!cancelado) {
          setDadosGerais(null);
          setErro(e.message);
        }
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [visao, dias]);

  useEffect(() => {
    if (!contaId || visao === "gerais") return;
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
  }, [contaId, dias, organico, visao]);

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
        {visao !== "gerais" ? <select
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
        </select> : <p className="text-sm text-neutral-400">Franquia inteira · todas as unidades somadas</p>}

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
          {visao !== "gerais" && <button
            onClick={baixarPdf}
            disabled={!dados || carregando || gerandoPdf}
            className="ml-1 flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FilePdf size={16} weight="fill" />
            {gerandoPdf ? "Gerando…" : "Baixar PDF"}
          </button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(ehFranquia ? (["completo", "curtidas", "gerais"] as const) : (["completo", "curtidas"] as const)).map((v) => (
          <button
            key={v}
            onClick={() => setVisao(v)}
            className={
              visao === v
                ? "pilula-ativa rounded-lg px-3.5 py-2 text-[13px] font-semibold text-neutral-100"
                : "rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-400 hover:text-neutral-200"
            }
          >
            {ROTULO_VISAO[v]}
          </button>
        ))}
      </div>

      {visao !== "gerais" && <label className="cartao-vidro flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5">
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
      </label>}

      {erro && <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</div>}

      {carregando && !dados && <p className="text-sm text-neutral-500">Buscando os números na Meta…</p>}

      {visao === "gerais" && dadosGerais && (
        <div className={carregando ? "flex flex-col gap-5 opacity-50 transition" : "flex flex-col gap-5 transition"}>
          <DadosGeraisCards dados={dadosGerais} />
        </div>
      )}

      {visao !== "gerais" && dados && (
        <div className={carregando ? "flex flex-col gap-5 opacity-50 transition" : "flex flex-col gap-5 transition"}>
          {visao === "curtidas" ? <RelatorioCurtidas dados={dados} /> : <Relatorio dados={dados} />}
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
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      {c.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-md border border-white/10 object-cover" />
                      )}
                      <div className="min-w-0 max-w-[240px]">
                        <p className="truncate">{c.nome}</p>
                        {c.legenda && <p className="truncate text-[11px] text-neutral-500">“{c.legenda}”</p>}
                      </div>
                    </div>
                  </td>
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
          const dividido = i.total !== null && i.organico !== null && i.trafego !== null && i.total > 0;
          const pctOrganico = dividido ? ((i.organico as number) / (i.total as number)) * 100 : 0;
          return (
            <div key={i.chave} className="selo-vidro px-4 py-3.5">
              <p className="text-[11.5px] text-neutral-400">{i.rotulo}</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-neutral-100">{i.total === null ? "—" : inteiro(i.total)}</p>
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
                  {i.origem === "posts" && (
                    <p className="mt-1 text-[10.5px] text-neutral-500">Soma dos posts do período</p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-[11.5px] text-neutral-500">
                  {i.total === null
                    ? i.trafego !== null
                      ? `${inteiro(i.trafego)} pelo tráfego · total da conta indisponível`
                      : "A Meta não liberou esse número"
                    : "Total da conta (sem divisão)"}
                </p>
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


/** Relatório de curtidas: cada campanha com a miniatura do post, um trecho da legenda e quantas
 * curtidas ela trouxe no período, da mais curtida para a menos. */
function RelatorioCurtidas({ dados }: { dados: DadosRelatorioAds }) {
  const campanhas = dados.campanhas.filter((c) => c.gasto > 0 || c.curtidas > 0).sort((a, b) => b.curtidas - a.curtidas);
  const total = campanhas.reduce((soma, c) => soma + c.curtidas, 0);
  const maior = Math.max(1, ...campanhas.map((c) => c.curtidas));
  const trecho = (texto: string | null | undefined) => {
    if (!texto) return null;
    const limpo = texto.replace(/\s+/g, " ").trim();
    return limpo.length > 110 ? `${limpo.slice(0, 110).trimEnd()}…` : limpo;
  };

  return (
    <>
      <div className="cartao-vidro p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-strong">
          Últimos {dados.periodo.dias} dias · {formatarDiaExibicao(dados.periodo.desde)} a {formatarDiaExibicao(dados.periodo.ate)}
        </p>
        <h2 className="mt-1 font-display text-lg font-bold">Curtidas por campanha</h2>
        <div className="mt-3 flex items-end gap-6">
          <div>
            <p className="font-display text-3xl font-bold tabular-nums">{inteiro(total)}</p>
            <p className="text-xs text-neutral-500">curtidas trazidas pelos anúncios</p>
          </div>
          <div>
            <p className="font-display text-xl font-bold tabular-nums">{campanhas.length}</p>
            <p className="text-xs text-neutral-500">campanhas no período</p>
          </div>
        </div>
      </div>

      {campanhas.length === 0 ? (
        <p className="cartao-vidro px-5 py-5 text-sm text-neutral-400">Nenhuma campanha com curtidas no período.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {campanhas.map((c, i) => (
            <li key={i} className="cartao-vidro flex gap-4 p-4">
              {c.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-20 w-20 shrink-0 rounded-lg border border-white/10 object-cover" />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[11px] text-neutral-600">sem imagem</div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="truncate text-sm font-semibold text-neutral-200">{c.nome}</p>
                {c.legenda ? (
                  <p className="text-[12.5px] leading-snug text-neutral-400">“{trecho(c.legenda)}”</p>
                ) : (
                  <p className="text-[12.5px] text-neutral-600">Sem legenda registrada.</p>
                )}
                <div className="mt-auto flex items-end justify-between gap-3">
                  <div>
                    <p className="font-display text-2xl font-bold leading-none tabular-nums">{inteiro(c.curtidas)}</p>
                    <p className="text-[11px] text-neutral-500">curtidas</p>
                  </div>
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((c.curtidas / maior) * 100)}%` }} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-neutral-600">
        Curtidas são as reações de curtida atribuídas a cada campanha pela Meta. Campanhas sem gasto e sem curtidas não aparecem.
      </p>
    </>
  );
}

/** Dados gerais da franquia: o volume de trabalho feito no período, somado entre as unidades. */
function DadosGeraisCards({ dados }: { dados: DadosGeraisRede }) {
  const periodo = `${formatarDiaExibicao(dados.periodo.desde)} a ${formatarDiaExibicao(dados.periodo.ate)}`;
  const cartoes = [
    { rotulo: "Seguidores ganhos", valor: dados.seguidoresGanhos.total === null ? "—" : `+${inteiro(dados.seguidoresGanhos.total)}`, sub: `das unidades com boost ligado${dados.seguidoresGanhos.semLeitura > 0 ? ` · ${inteiro(dados.seguidoresGanhos.semLeitura)} sem leitura` : ""}` },
    { rotulo: "Curtidas", valor: inteiro(dados.curtidas), sub: "trazidas pelas campanhas" },
    { rotulo: "Alcance", valor: inteiro(dados.alcance), sub: "soma das campanhas" },
    { rotulo: "Visualizações", valor: inteiro(dados.visualizacoes), sub: "vezes que os anúncios apareceram" },
    { rotulo: "Investido", valor: reais(dados.investido), sub: "em todas as unidades" },
  ];
  return (
    <>
      <div className="cartao-vidro p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-strong">Últimos {dados.periodo.dias} dias · {periodo}</p>
        <h2 className="mt-1 font-display text-lg font-bold">Dados gerais da franquia</h2>
        <p className="mt-1 text-xs text-neutral-500">
          {inteiro(dados.unidades)} unidades somadas{dados.unidadesSemLeitura > 0 ? ` · ${dados.unidadesSemLeitura} sem leitura agora` : ""}. Conta central (Principal e Expansão) fica de fora.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="cartao-vidro flex flex-col gap-1.5 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{c.rotulo}</p>
            <p className="font-display text-2xl font-bold tabular-nums">{c.valor}</p>
            <p className="text-[11.5px] text-neutral-500">{c.sub}</p>
          </div>
        ))}
      </div>
      <div className="cartao-vidro overflow-x-auto p-5">
        <h3 className="text-sm font-semibold text-neutral-200">Campanhas criadas por unidade</h3>
        <p className="mt-1 text-xs text-neutral-500">Criadas pelo SmartAds no período, incluindo as unidades sem nenhuma.</p>
        <table className="mt-3 w-full min-w-[260px] text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-2 font-medium">Unidade</th>
              <th className="py-2 text-right font-medium">Campanhas</th>
            </tr>
          </thead>
          <tbody>
            {dados.campanhasPorUnidade.map((u) => (
              <tr key={u.unidade} className="border-t border-white/5 text-neutral-300">
                <td className="py-2">{u.unidade}</td>
                <td className="py-2 text-right tabular-nums">{inteiro(u.campanhas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-neutral-600">
        Só entram as campanhas criadas pelo SmartAds. Seguidores são os das unidades com boost ligado. Alcance soma as campanhas, então a mesma pessoa vista em duas campanhas conta duas vezes. Visualizações são as vezes que os anúncios apareceram.
      </p>
    </>
  );
}
