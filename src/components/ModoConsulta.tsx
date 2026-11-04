"use client";

import { useEffect, useState } from "react";

/** Aviso fixo + mensagem amigável pra quem tem acesso só de consulta: qualquer ação de alteração
 * que o servidor recusar (resposta 403 marcada com `consulta`) vira um aviso na tela, mesmo nos
 * botões que não mostram erro sozinhos. */
export default function ModoConsulta() {
  const [aviso, setAviso] = useState(false);

  useEffect(() => {
    const original = window.fetch;
    let timer: ReturnType<typeof setTimeout> | undefined;
    window.fetch = async (...args) => {
      const resposta = await original(...args);
      if (resposta.status === 403 && resposta.headers.get("x-somente-consulta")) {
        setAviso(true);
        clearTimeout(timer);
        timer = setTimeout(() => setAviso(false), 5000);
      }
      return resposta;
    };
    return () => {
      window.fetch = original;
      clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <div className="fixed bottom-20 left-3 z-30 rounded-full border border-white/14 bg-ink-950/80 px-3 py-1 text-[11px] font-medium text-neutral-400 backdrop-blur sm:bottom-3">
        Acesso somente de consulta
      </div>
      {aviso && (
        <div role="alert" className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-sm rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-center text-sm text-amber-200 backdrop-blur sm:bottom-6">
          Seu acesso é somente de consulta — você não pode alterar nada aqui. Peça ao administrador se precisar.
        </div>
      )}
    </>
  );
}
