"use client";

export default function ErroDaPagina({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="cartao-vidro mx-auto max-w-md p-6 text-center">
        <p className="text-sm font-semibold text-neutral-100">Algo deu errado ao abrir essa tela.</p>
        <p className="mt-1 text-xs text-neutral-500">{error.message?.slice(0, 160) || "Tente de novo em instantes."}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={reset} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong">
            Tentar de novo
          </button>
          <a href="/" className="rounded-lg bg-white/[0.06] px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-white/10">
            Ir pro Início
          </a>
        </div>
      </div>
    </main>
  );
}
