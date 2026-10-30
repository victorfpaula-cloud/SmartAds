"use client";

import { useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { baixarPdfDetalheRadar, type DadosDetalheRadar } from "@/lib/radarDetalhePdf";

/** Baixa em PDF exatamente o que está na tela: resumo de saúde e os 30 dias de posts e stories. */
export default function BotaoBaixarDetalhe({ dados }: { dados: DadosDetalheRadar }) {
  const [gerando, setGerando] = useState(false);
  return (
    <button
      onClick={async () => {
        setGerando(true);
        try {
          await baixarPdfDetalheRadar(dados);
        } finally {
          setGerando(false);
        }
      }}
      disabled={gerando}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/14 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/[0.04] disabled:opacity-50"
    >
      <DownloadSimple size={14} />
      {gerando ? "Gerando…" : "Baixar PDF"}
    </button>
  );
}
