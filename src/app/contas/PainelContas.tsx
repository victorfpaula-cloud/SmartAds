"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkle, Buildings, Storefront } from "@phosphor-icons/react";

interface ContaMeta {
  id: string;
  meta_ad_account_id: string;
  meta_ad_account_nome: string | null;
  page_nome: string | null;
  instagram_username: string | null;
  nome_exibicao: string | null;
  sigla_campanha: string | null;
}

interface Empresa {
  id: string;
  nome: string;
  tipo: "individual" | "franquia";
}

interface Cliente {
  id: string;
  nome: string;
  ativo: boolean;
  empresa_id: string;
  smartads_empresas: Empresa | null;
  smartads_contas_meta: ContaMeta[];
}

interface StatusMeta {
  conectado: boolean;
  meta_user_nome?: string | null;
  token_expira_em?: string | null;
  ultimo_erro?: string | null;
}

interface Anomalia {
  metrica: "frequencia" | "ctr" | "cpm" | "cpc" | "spend";
  rotulo: string;
  valorAtual: number;
  valorAnterior: number;
  deltaPercentual: number;
  mensagem: string;
}

interface SaudeConta {
  status: "boa" | "atencao" | "sem_dados";
  motivo: string;
  anomalia: Anomalia | null;
}

const COR_SAUDE: Record<SaudeConta["status"], string> = {
  boa: "bg-ok",
  atencao: "bg-warn",
  sem_dados: "bg-neutral-600",
};

interface ContaDisponivel {
  id: string;
  name: string;
}

interface PaginaDisponivel {
  id: string;
  name: string;
  instagram_business_account?: { id: string; username?: string };
}

const NOVA_EMPRESA = "__nova__";

export default function PainelContas({
  clientesIniciais,
  empresasIniciais,
  statusMetaInicial,
  anunciosPorConta,
  avisoConexao,
  mensagemErro,
}: {
  clientesIniciais: Cliente[];
  empresasIniciais: Empresa[];
  statusMetaInicial: StatusMeta;
  anunciosPorConta: Record<string, number>;
  avisoConexao: "conectado" | "erro" | null;
  mensagemErro?: string;
}) {
  const [clientes, setClientes] = useState(clientesIniciais);
  const [empresas, setEmpresas] = useState(empresasIniciais);
  const [statusMeta] = useState(statusMetaInicial);
  const [nomeNovoCliente, setNomeNovoCliente] = useState("");
  const [empresaSelecionada, setEmpresaSelecionada] = useState(empresasIniciais[0]?.id ?? NOVA_EMPRESA);
  const [nomeNovaEmpresa, setNomeNovaEmpresa] = useState("");
  const [tipoNovaEmpresa, setTipoNovaEmpresa] = useState<"individual" | "franquia">("individual");
  const [criandoCliente, setCriandoCliente] = useState(false);
  const [clienteExpandidoId, setClienteExpandidoId] = useState<string | null>(null);
  const [saude, setSaude] = useState<Record<string, SaudeConta>>({});

  // Selo de saúde por conta — busca depois da tela já ter mostrado alguma coisa (não trava o
  // carregamento inicial) e só se a Meta estiver conectada, senão a rota nem tem o que calcular.
  useEffect(() => {
    if (!statusMeta.conectado) return;
    fetch("/api/saude")
      .then((r) => r.json())
      .then((corpo) => setSaude(corpo.saude ?? {}))
      .catch(() => {});
  }, [statusMeta.conectado]);

  async function criarCliente(evento: React.FormEvent) {
    evento.preventDefault();
    if (!nomeNovoCliente.trim()) return;
    const criandoEmpresaNova = empresaSelecionada === NOVA_EMPRESA;
    if (criandoEmpresaNova && !nomeNovaEmpresa.trim()) {
      alert("Informe o nome da empresa.");
      return;
    }
    setCriandoCliente(true);

    let empresa: Empresa | null = null;
    if (criandoEmpresaNova) {
      const respostaEmpresa = await fetch("/api/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeNovaEmpresa.trim(), tipo: tipoNovaEmpresa }),
      });
      const corpoEmpresa = await respostaEmpresa.json();
      if (!respostaEmpresa.ok) {
        setCriandoCliente(false);
        alert(corpoEmpresa.erro || "Falha ao criar a empresa.");
        return;
      }
      empresa = corpoEmpresa.empresa;
    } else {
      empresa = empresas.find((e) => e.id === empresaSelecionada) ?? null;
    }
    if (!empresa) {
      setCriandoCliente(false);
      alert("Selecione ou cadastre uma empresa.");
      return;
    }

    const resposta = await fetch("/api/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nomeNovoCliente.trim(), empresaId: empresa.id }),
    });
    const corpo = await resposta.json();
    setCriandoCliente(false);

    if (resposta.ok) {
      if (criandoEmpresaNova) {
        setEmpresas((atual) => [...atual, empresa!]);
        setEmpresaSelecionada(empresa!.id);
        setNomeNovaEmpresa("");
      }
      setClientes((atual) => [
        ...atual,
        { ...corpo.cliente, smartads_empresas: empresa, smartads_contas_meta: [] },
      ]);
      setNomeNovoCliente("");
    } else {
      alert(corpo.erro || "Falha ao criar cliente.");
    }
  }

  function adicionarContaAoCliente(clienteId: string, conta: ContaMeta) {
    setClientes((atual) =>
      atual.map((c) =>
        c.id === clienteId ? { ...c, smartads_contas_meta: [...c.smartads_contas_meta, conta] } : c
      )
    );
    setClienteExpandidoId(null);
  }

  // Agrupado por empresa em vez de lista solta — era o pedido direto: "Dona Baunilha - Expansão"
  // e "Dona Baunilha - Principal" são unidades da MESMA franquia, deveriam ficar visualmente juntas
  // num container só (com o nome da marca), não espalhadas como se não tivessem relação nenhuma.
  // Empresa individual (Único Sushi) naturalmente vira um container com uma unidade só dentro.
  const gruposEmpresa = useMemo(() => {
    const porEmpresa = new Map<string, { empresa: Empresa; clientes: Cliente[] }>();
    for (const cliente of clientes) {
      const empresa = cliente.smartads_empresas;
      const chave = empresa?.id ?? "sem-empresa";
      if (!porEmpresa.has(chave)) {
        porEmpresa.set(chave, { empresa: empresa ?? { id: chave, nome: "Sem empresa", tipo: "individual" }, clientes: [] });
      }
      porEmpresa.get(chave)!.clientes.push(cliente);
    }
    return [...porEmpresa.values()].sort((a, b) => a.empresa.nome.localeCompare(b.empresa.nome));
  }, [clientes]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Contas</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Clientes da agência e as contas de anúncio Meta associadas a cada um.
        </p>
      </div>

      {avisoConexao === "conectado" && (
        <div className="rounded-xl border border-ok/30 bg-ok/10 px-4 py-2.5 text-sm text-ok">
          Conexão com a Meta feita com sucesso.
        </div>
      )}
      {avisoConexao === "erro" && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {mensagemErro || "Falha ao conectar com a Meta."}
        </div>
      )}

      <BannerConexaoMeta status={statusMeta} />

      <AvisoCAPI />

      <section className="cartao-vidro overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-200">Clientes</h2>
        </div>

        <form onSubmit={criarCliente} className="flex flex-col gap-2.5 border-b border-white/10 px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={nomeNovoCliente}
              onChange={(e) => setNomeNovoCliente(e.target.value)}
              placeholder="Nome do novo cliente (ex: Dona Baunilha - Expansão)"
              className="h-10 flex-1 rounded-lg border border-white/14 bg-ink-850 px-3.5 text-sm text-neutral-100 outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
            />
            <select
              value={empresaSelecionada}
              onChange={(e) => setEmpresaSelecionada(e.target.value)}
              className="h-10 rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
            >
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome} ({e.tipo === "franquia" ? "franquia" : "individual"})
                </option>
              ))}
              <option value={NOVA_EMPRESA}>+ Nova empresa…</option>
            </select>
            <button
              type="submit"
              disabled={criandoCliente}
              className="h-10 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-accent-strong disabled:opacity-60"
            >
              {criandoCliente ? "Criando…" : "Adicionar cliente"}
            </button>
          </div>

          {empresaSelecionada === NOVA_EMPRESA && (
            <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 sm:flex-row">
              <input
                value={nomeNovaEmpresa}
                onChange={(e) => setNomeNovaEmpresa(e.target.value)}
                placeholder="Nome da empresa (ex: Dona Baunilha)"
                className="h-9 flex-1 rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
              />
              <select
                value={tipoNovaEmpresa}
                onChange={(e) => setTipoNovaEmpresa(e.target.value as "individual" | "franquia")}
                className="h-9 rounded-lg border border-white/14 bg-ink-850 px-3 text-sm text-neutral-100"
              >
                <option value="individual">Empresa individual (unidade única)</option>
                <option value="franquia">Franquia (várias unidades)</option>
              </select>
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-neutral-500">
            Franquia libera comparação entre unidades (semáforo, mediana da rede no diagnóstico).
            Empresa individual fica com o essencial: campanhas, insights do Gemini e piloto
            automático, sem comparação com outros negócios.
          </p>
        </form>

        {clientes.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">
            Nenhum cliente cadastrado ainda. Adicione o primeiro acima.
          </p>
        ) : (
          <div className="flex flex-col">
            {gruposEmpresa.map((grupo) => {
              const IconeEmpresa = grupo.empresa.tipo === "franquia" ? Buildings : Storefront;
              return (
                <div key={grupo.empresa.id} className="border-b border-white/10 last:border-b-0">
                  <div className="flex items-center gap-2.5 bg-white/[0.02] px-5 py-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300">
                      <IconeEmpresa size={14} weight="fill" />
                    </div>
                    <span className="text-sm font-semibold text-neutral-100">{grupo.empresa.nome}</span>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-neutral-400">
                      {grupo.empresa.tipo === "franquia" ? "franquia" : "individual"}
                    </span>
                    <span className="ml-auto text-[11px] text-neutral-500">
                      {grupo.clientes.length} unidade{grupo.clientes.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <ul className="flex flex-col gap-2 p-3">
                    {grupo.clientes.map((cliente) => (
              <li key={cliente.id} className="cartao-vidro-interno px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-neutral-100">{cliente.nome}</span>
                  <button
                    onClick={() =>
                      setClienteExpandidoId(clienteExpandidoId === cliente.id ? null : cliente.id)
                    }
                    disabled={!statusMeta.conectado}
                    className="botao-icone-vidro rounded-lg px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
                    title={statusMeta.conectado ? undefined : "Conecte a Meta primeiro"}
                  >
                    + Conta de anúncio
                  </button>
                </div>

                {cliente.smartads_contas_meta.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {cliente.smartads_contas_meta.map((conta) => (
                      <div key={conta.id} className="selo-vidro px-3 py-2 text-xs text-neutral-400">
                        <div className="flex items-center gap-2">
                          {saude[conta.id] && (
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${COR_SAUDE[saude[conta.id].status]}`}
                            />
                          )}
                          <span className="font-medium text-neutral-200">
                            {conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id}
                          </span>
                          {conta.page_nome && <span>· {conta.page_nome}</span>}
                          {conta.instagram_username && <span>· @{conta.instagram_username}</span>}
                          {conta.sigla_campanha && (
                            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-neutral-300">
                              {conta.sigla_campanha}
                            </span>
                          )}
                          <Link
                            href={`/estrategias/diagnostico/${conta.id}`}
                            className="ml-auto shrink-0 text-[11px] font-semibold text-accent-strong hover:underline"
                          >
                            Diagnóstico
                          </Link>
                        </div>

                        {saude[conta.id]?.status === "atencao" && (
                          <div className="mt-1.5 pl-4">
                            <p className="text-[11px] leading-relaxed text-warn">{saude[conta.id].motivo}</p>
                            {saude[conta.id].anomalia && (
                              <BotaoExplicarAnomalia contaId={conta.id} />
                            )}
                          </div>
                        )}

                        {(() => {
                          const total = anunciosPorConta[conta.id] ?? 0;
                          // Só o suficiente pra avisar, não pra alarmar — o piso de 15 é o que a
                          // pesquisa de mercado apontou como faixa saudável de diversidade de
                          // criativo pro algoritmo de entrega de 2026 (ver conversa de definição).
                          if (total === 0 || total >= 15) return null;
                          return (
                            <p className="mt-1.5 pl-4 text-[11px] text-neutral-500">
                              {total} anúncio{total > 1 ? "s" : ""} criado{total > 1 ? "s" : ""} aqui pelo
                              SmartAds — o algoritmo de 2026 testa melhor com 15+ variações de criativo
                              ativas por conta.
                            </p>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}

                {clienteExpandidoId === cliente.id && (
                  <AdicionarConta clienteId={cliente.id} onAssociada={(conta) => adicionarContaAoCliente(cliente.id, conta)} />
                )}
              </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function BannerConexaoMeta({ status }: { status: StatusMeta }) {
  if (status.conectado) {
    return (
      <div className="cartao-vidro flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-neutral-300">
          Meta conectada{status.meta_user_nome ? ` como ${status.meta_user_nome}` : ""}.
        </span>
        <a
          href="/api/auth/meta/login"
          className="text-xs font-medium text-accent-strong hover:underline"
        >
          Reconectar
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-neutral-200">
        {status.ultimo_erro || "A Meta ainda não foi conectada. Conecte pra adicionar contas de anúncio."}
      </span>
      <a
        href="/api/auth/meta/login"
        className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-accent-strong"
      >
        Conectar Meta
      </a>
    </div>
  );
}

const CHAVE_CAPI_DISPENSADO = "smartads_aviso_capi_dispensado";

/** Aviso estático (sem IA, sem chamada nenhuma) sobre o Conversions API (CAPI) da Meta — achado
 * de maior impacto da pesquisa de mercado que fizemos: contas com CAPI configurado têm 17,8% de
 * custo por resultado menor (dado da própria Meta, abril de 2026), e desde 2026 a configuração é
 * um clique só no Gerenciador de Eventos, sem precisar de desenvolvedor. O SmartAds não consegue
 * configurar isso por API (é do lado da conta do cliente na Meta) — só orienta e linka direto.
 * Dispensável (guarda em localStorage) porque é educativo, não um alerta de algo errado agora. */
function AvisoCAPI() {
  const [dispensado, setDispensado] = useState(true); // true até confirmar no localStorage, evita "pulo" na tela

  useEffect(() => {
    try {
      setDispensado(localStorage.getItem(CHAVE_CAPI_DISPENSADO) === "1");
    } catch {
      setDispensado(false);
    }
  }, []);

  function dispensar() {
    setDispensado(true);
    try {
      localStorage.setItem(CHAVE_CAPI_DISPENSADO, "1");
    } catch {
      // localStorage bloqueado (aba anônima etc.) — sem problema, só reaparece na próxima visita
    }
  }

  if (dispensado) return null;

  return (
    <div className="cartao-vidro flex flex-col gap-2.5 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500/30 to-indigo-500/5 text-indigo-200">
          <Sparkle size={13} weight="fill" />
        </div>
        <p className="text-xs leading-relaxed text-neutral-300">
          <strong className="text-neutral-100">Confira o Conversions API (CAPI) de cada cliente.</strong>{" "}
          Contas com CAPI configurado têm em média 17,8% menos custo por resultado (dado da própria
          Meta). Desde 2026 a configuração é um clique só, direto no Gerenciador de Eventos — sem
          precisar de desenvolvedor.{" "}
          <a
            href="https://www.facebook.com/events_manager2"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent-strong hover:underline"
          >
            Abrir Gerenciador de Eventos
          </a>
        </p>
      </div>
      <button
        onClick={dispensar}
        className="botao-icone-vidro h-7 w-7 shrink-0 self-end rounded-lg text-neutral-400 sm:self-start"
        aria-label="Dispensar aviso"
      >
        ×
      </button>
    </div>
  );
}

/** Explicação em texto (Gemini) pra uma anomalia já detectada — some por trás de um clique
 * porque é a única chamada de IA que rodaria sem o dono pedir (as outras têm botão "gerar" bem
 * visível); aqui o gasto de token só acontece se alguém realmente quiser entender o "porquê". */
function BotaoExplicarAnomalia({ contaId }: { contaId: string }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function explicar() {
    setCarregando(true);
    setErro(null);
    const resposta = await fetch("/api/ia/explicar-anomalia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contaId }),
    });
    const corpo = await resposta.json();
    setCarregando(false);

    if (resposta.ok) {
      setTexto(corpo.texto);
    } else {
      setErro(corpo.erro || "Falha ao gerar a explicação.");
    }
  }

  if (texto) {
    return (
      <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-300">
        <Sparkle size={12} weight="fill" className="mt-0.5 shrink-0 text-indigo-300" />
        {texto}
      </p>
    );
  }

  return (
    <>
      <button
        onClick={explicar}
        disabled={carregando}
        className="mt-1 text-[11px] font-medium text-accent-strong hover:underline disabled:opacity-50"
      >
        {carregando ? "Explicando…" : "Por quê? (IA)"}
      </button>
      {erro && <p className="mt-1 text-[11px] text-danger">{erro}</p>}
    </>
  );
}

function AdicionarConta({
  clienteId,
  onAssociada,
}: {
  clienteId: string;
  onAssociada: (conta: ContaMeta) => void;
}) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [contas, setContas] = useState<ContaDisponivel[]>([]);
  const [paginas, setPaginas] = useState<PaginaDisponivel[]>([]);
  const [contaSelecionada, setContaSelecionada] = useState("");
  const [paginaSelecionada, setPaginaSelecionada] = useState("");
  const [nomeExibicao, setNomeExibicao] = useState("");
  const [siglaCampanha, setSiglaCampanha] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/meta/contas-disponiveis")
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro || "Falha ao buscar contas.");
        setContas(corpo.contas);
        setPaginas(corpo.paginas);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  async function associar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!contaSelecionada || !paginaSelecionada) return;
    setSalvando(true);

    const conta = contas.find((c) => c.id === contaSelecionada);
    const pagina = paginas.find((p) => p.id === paginaSelecionada);

    const resposta = await fetch("/api/contas-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId,
        metaAdAccountId: contaSelecionada,
        metaAdAccountNome: conta?.name,
        pageId: paginaSelecionada,
        pageNome: pagina?.name,
        instagramBusinessId: pagina?.instagram_business_account?.id,
        instagramUsername: pagina?.instagram_business_account?.username,
        nomeExibicao: nomeExibicao.trim() || undefined,
        siglaCampanha: siglaCampanha.trim() || undefined,
      }),
    });
    const corpo = await resposta.json();
    setSalvando(false);

    if (resposta.ok) {
      onAssociada(corpo.conta);
    } else {
      alert(corpo.erro || "Falha ao associar a conta.");
    }
  }

  if (carregando) {
    return <p className="mt-3 text-xs text-neutral-500">Carregando contas da Meta…</p>;
  }
  if (erro) {
    return <p className="mt-3 text-xs text-danger">{erro}</p>;
  }

  return (
    <form
      onSubmit={associar}
      className="cartao-vidro-interno mt-3 flex flex-col gap-2.5 p-4"
    >
      <div>
        <label className="text-xs font-semibold text-neutral-400">Conta de anúncio</label>
        <select
          value={contaSelecionada}
          onChange={(e) => setContaSelecionada(e.target.value)}
          required
          className="mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
        >
          <option value="">Selecione…</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.id})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-neutral-400">Página / Instagram</label>
        <select
          value={paginaSelecionada}
          onChange={(e) => setPaginaSelecionada(e.target.value)}
          required
          className="mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
        >
          <option value="">Selecione…</option>
          {paginas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.instagram_business_account?.username ? ` (@${p.instagram_business_account.username})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-neutral-400">Nome de exibição (opcional)</label>
        <input
          value={nomeExibicao}
          onChange={(e) => setNomeExibicao(e.target.value)}
          className="mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-neutral-400">Sigla nas campanhas (opcional)</label>
        <input
          value={siglaCampanha}
          onChange={(e) => setSiglaCampanha(e.target.value.toUpperCase())}
          placeholder="Ex: EXP"
          maxLength={10}
          className="mt-1 h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
        />
        <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
          Toda campanha criada pelo SmartAds pra esse cliente nasce com essa sigla entre
          parênteses no nome — útil quando a mesma conta de anúncio é usada em mais de um cliente
          aqui (ex: "Expansão" e "Principal" da mesma loja), pra identificar de onde veio direto no
          Gerenciador de Anúncios.
        </p>
      </div>

      <button
        type="submit"
        disabled={salvando}
        className="mt-1 h-9 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
      >
        {salvando ? "Associando…" : "Associar conta"}
      </button>
    </form>
  );
}
