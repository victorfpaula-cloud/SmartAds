"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      setErro("E-mail ou senha incorretos.");
      setEnviando(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6">
      <div
        className="pointer-events-none absolute -top-64 left-1/2 h-[640px] w-[900px] -translate-x-1/2 rounded-full opacity-60"
        style={{ background: "radial-gradient(closest-side, rgba(99,102,241,0.18), transparent 72%)" }}
      />

      <div className="animate-entrada relative flex w-full max-w-sm flex-col items-center motion-reduce:animate-none">
        <div className="relative w-full overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.04] px-9 py-10 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.75)] backdrop-blur-xl before:absolute before:inset-x-[10%] before:top-0 before:h-[1.5px] before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent before:content-['']">
          <div className="flex flex-col items-center gap-3.5">
            <div className="relative flex h-14 w-14 items-center justify-center">
              <div
                className="absolute -inset-2.5 rounded-full opacity-50"
                style={{ background: "radial-gradient(closest-side, rgba(99,102,241,0.45), transparent 70%)" }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="SmartAds" className="relative h-14 w-14 rounded-2xl object-cover" />
            </div>
            <div className="text-center">
              <div className="font-display text-[19px] font-bold tracking-tight">SmartAds</div>
              <p className="mt-1 text-[12.5px] text-neutral-400">Gerenciador de anúncios, acesso restrito</p>
            </div>
          </div>

          {erro && (
            <div className="mt-6 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
              {erro}
            </div>
          )}

          <form onSubmit={entrar} className="mt-7 flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-neutral-400">E-mail</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                className="mt-1.5 h-[42px] w-full rounded-[11px] border border-white/14 bg-ink-850 px-3.5 text-[13.5px] font-medium text-neutral-100 outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-400">Senha</label>
              <input
                type="password"
                required
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                className="mt-1.5 h-[42px] w-full rounded-[11px] border border-white/14 bg-ink-850 px-3.5 text-[13.5px] font-medium text-neutral-100 outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
              />
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="mt-1.5 h-11 rounded-[11px] bg-accent text-[13.5px] font-bold text-white shadow-[0_8px_24px_-6px_rgba(99,102,241,0.45)] transition hover:bg-accent-strong disabled:opacity-60"
            >
              {enviando ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-[11px] tracking-wide text-neutral-600">SmartAds &middot; gestão de tráfego multi-cliente</p>
      </div>
    </main>
  );
}
