"use client";

import { useEffect, useState } from "react";

interface ContaMeta {
  id: string;
  meta_ad_account_id: string;
  meta_ad_account_nome: string | null;
  page_nome: string | null;
  instagram_username: string | null;
  nome_exibicao: string | null;
}

interface Cliente {
  id: string;
  nome: string;
  ativo: boolean;
  smartads_contas_meta: ContaMeta[];
}

interface StatusMeta {
  conectado: boolean;
  meta_user_nome?: string | null;
  token_expira_em?: string | null;
  ultimo_erro?: string | null;
}

interface ContaDisponivel {
  id: string;
  name: string;
}

interface PaginaDisponivel {
  id: string;
  name: string;
  instagram_business_account?: { id: string; username?: string };
}

export default function PainelContas({
  clientesIniciais,
  statusMetaInicial,
  avisoConexao,
  mensagemErro,
}: {
  clientesIniciais: Cliente[];
  statusMetaInicial: StatusMeta;
  avisoConexao: "conectado" | "erro" | null;
  mensagemErro?: string;
}) {
  const [clientes, setClientes] = useState(clientesIniciais);
  const [statusMeta] = useState(statusMetaInicial);
  const [nomeNovoCliente, setNomeNovoCliente] = useState("");
  const [criandoCliente, setCriandoCliente] = useState(false);
  const [clienteExpandidoId, setClienteExpandidoId] = useState<string | null>(null);

  async function criarCliente(evento: React.FormEvent) {
    evento.preventDefault();
    if (!nomeNovoCliente.trim()) return;
    setCriandoCliente(true);

    const resposta = await fetch("/api/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nomeNovoCliente.trim() }),
    });
    const corpo = await resposta.json();
    setCriandoCliente(false);

    if (resposta.ok) {
      setClientes((atual) => [...atual, { ...corpo.cliente, smartads_contas_meta: [] }]);
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

      <section className="cartao-vidro overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-200">Clientes</h2>
        </div>

        <form onSubmit={criarCliente} className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 sm:flex-row">
          <input
            value={nomeNovoCliente}
            onChange={(e) => setNomeNovoCliente(e.target.value)}
            placeholder="Nome do novo cliente"
            className="h-10 flex-1 rounded-lg border border-white/14 bg-ink-850 px-3.5 text-sm text-neutral-100 outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
          />
          <button
            type="submit"
            disabled={criandoCliente}
            className="h-10 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-accent-strong disabled:opacity-60"
          >
            {criandoCliente ? "Criando…" : "Adicionar cliente"}
          </button>
        </form>

        {clientes.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">
            Nenhum cliente cadastrado ainda. Adicione o primeiro acima.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 p-3">
            {clientes.map((cliente) => (
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
                      <div
                        key={conta.id}
                        className="selo-vidro flex items-center gap-2 px-3 py-2 text-xs text-neutral-400"
                      >
                        <span className="font-medium text-neutral-200">
                          {conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id}
                        </span>
                        {conta.page_nome && <span>· {conta.page_nome}</span>}
                        {conta.instagram_username && <span>· @{conta.instagram_username}</span>}
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
