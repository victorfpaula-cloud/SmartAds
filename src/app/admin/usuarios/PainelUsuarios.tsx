"use client";

import { useCallback, useEffect, useState } from "react";

interface Empresa { id: string; nome: string; tipo: string }
interface Usuario {
  id: string; email: string; nome: string; restrito: boolean; empresas: string[];
  podeEditar: boolean; bloqueado: boolean; ultimoAcesso: string | null;
}

const campo = "w-full rounded-lg border border-white/14 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-accent";
const botao = "rounded-lg border border-white/14 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/[0.04] disabled:opacity-50";

function SeletorEmpresas({ empresas, valor, onChange }: { empresas: Empresa[]; valor: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {empresas.map((e) => {
        const marcado = valor.includes(e.id);
        return (
          <label key={e.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs ${marcado ? "border-accent/50 bg-accent/10 text-accent-strong" : "border-white/14 text-neutral-400"}`}>
            <input type="checkbox" className="sr-only" checked={marcado} onChange={() => onChange(marcado ? valor.filter((i) => i !== e.id) : [...valor, e.id])} />
            {e.nome}
          </label>
        );
      })}
    </div>
  );
}

export default function PainelUsuarios({ empresas }: { empresas: Empresa[] }) {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [novo, setNovo] = useState({ nome: "", email: "", senha: "", empresas: [] as string[], podeEditar: false });
  const nomeEmpresa = (id: string) => empresas.find((e) => e.id === id)?.nome ?? "(empresa removida)";

  const carregar = useCallback(async () => {
    const r = await fetch("/api/admin/usuarios");
    const c = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg({ tipo: "erro", texto: c.erro || "Não consegui listar os usuários." });
    setUsuarios(c.usuarios);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function chamar(url: string, metodo: string, corpo?: unknown, ok = "Salvo.") {
    setOcupado(true);
    setMsg(null);
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
    const c = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setMsg({ tipo: "erro", texto: c.erro || "Não consegui concluir." }); return false; }
    setMsg({ tipo: "ok", texto: ok });
    await carregar();
    return true;
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (await chamar("/api/admin/usuarios", "POST", novo, "Usuário criado. Passe o e-mail e a senha pra pessoa.")) {
      setNovo({ nome: "", email: "", senha: "", empresas: [], podeEditar: false });
    }
  }

  const restritos = (usuarios ?? []).filter((u) => u.restrito);

  return (
    <div className="mt-6 space-y-6">
      {msg && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm ${msg.tipo === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-danger/30 bg-danger/10 text-danger"}`}>{msg.texto}</div>
      )}

      <form onSubmit={criar} className="cartao-vidro space-y-4 p-5">
        <h2 className="font-display text-base font-bold">Novo acesso limitado</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input className={campo} placeholder="Nome (ex.: Roberta)" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <input className={campo} type="email" required placeholder="E-mail de login" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
          <input className={campo} type="text" required minLength={8} placeholder="Senha provisória (8+)" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-400">Pode ver:</p>
          <SeletorEmpresas empresas={empresas} valor={novo.empresas} onChange={(v) => setNovo({ ...novo, empresas: v })} />
        </div>
        <label className="flex items-center gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={novo.podeEditar} onChange={(e) => setNovo({ ...novo, podeEditar: e.target.checked })} />
          Pode também criar/pausar campanhas e alterar configurações (desmarcado = só consulta)
        </label>
        <button disabled={ocupado || novo.empresas.length === 0} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
          Criar acesso
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="font-display text-base font-bold">Acessos criados</h2>
        {usuarios === null ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : restritos.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum acesso limitado ainda.</p>
        ) : (
          restritos.map((u) => (
            <LinhaUsuario key={u.id} u={u} empresas={empresas} nomeEmpresa={nomeEmpresa} ocupado={ocupado} chamar={chamar} />
          ))
        )}
      </section>
    </div>
  );
}

function LinhaUsuario({ u, empresas, nomeEmpresa, ocupado, chamar }: {
  u: Usuario; empresas: Empresa[]; nomeEmpresa: (id: string) => string; ocupado: boolean;
  chamar: (url: string, metodo: string, corpo?: unknown, ok?: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [sel, setSel] = useState(u.empresas);
  const url = `/api/admin/usuarios/${u.id}`;

  return (
    <div className="cartao-vidro space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{u.nome || u.email} {u.bloqueado && <span className="ml-1 rounded-full bg-danger/15 px-2 py-0.5 text-[11px] text-danger">bloqueado</span>}</div>
          <div className="text-xs text-neutral-500">{u.email} · {u.ultimoAcesso ? `último acesso ${new Date(u.ultimoAcesso).toLocaleString("pt-BR")}` : "nunca acessou"}</div>
          <div className="mt-1 text-xs text-neutral-400">Vê: {u.empresas.map(nomeEmpresa).join(", ") || "—"} · {u.podeEditar ? "pode editar" : "só consulta"}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={botao} disabled={ocupado} onClick={() => setEditando(!editando)}>Empresas</button>
          <button className={botao} disabled={ocupado} onClick={() => chamar(url, "PATCH", { podeEditar: !u.podeEditar }, u.podeEditar ? "Agora só consulta." : "Agora pode editar.")}>{u.podeEditar ? "Tirar edição" : "Liberar edição"}</button>
          <button className={botao} disabled={ocupado} onClick={() => { const s = window.prompt("Nova senha (mínimo 8 caracteres):"); if (s) chamar(url, "PATCH", { senha: s }, "Senha alterada."); }}>Nova senha</button>
          <button className={botao} disabled={ocupado} onClick={() => chamar(url, "PATCH", { bloqueado: !u.bloqueado }, u.bloqueado ? "Desbloqueado." : "Bloqueado — não consegue mais entrar.")}>{u.bloqueado ? "Desbloquear" : "Bloquear"}</button>
          <button className={`${botao} text-danger`} disabled={ocupado} onClick={() => { if (window.confirm(`Apagar o acesso de ${u.nome || u.email}?`)) chamar(url, "DELETE", undefined, "Acesso apagado."); }}>Apagar</button>
        </div>
      </div>
      {editando && (
        <div className="space-y-3 border-t border-white/10 pt-3">
          <SeletorEmpresas empresas={empresas} valor={sel} onChange={setSel} />
          <button className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={ocupado || sel.length === 0}
            onClick={async () => { if (await chamar(url, "PATCH", { empresas: sel }, "Empresas atualizadas.")) setEditando(false); }}>Salvar empresas</button>
        </div>
      )}
    </div>
  );
}
