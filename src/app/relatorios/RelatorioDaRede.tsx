"use client";

import { useState } from "react";
import { DownloadSimple, PaperPlaneTilt } from "@phosphor-icons/react";

/** Relatório mensal da rede (PDF comparando as unidades). O cálculo é por etapas: o botão chama o
 * servidor várias vezes, algumas unidades por vez, e mostra o andamento. */
export default function RelatorioDaRede({ mesPadrao, rotuloMes, podeEnviar }: { mesPadrao: string; rotuloMes: string; podeEnviar: boolean }) {
  const [estado, setEstado] = useState<{ texto: string; tom: "neutro" | "ok" | "erro" } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function preparar(enviar: boolean) {
    setOcupado(true);
    setEstado({ texto: "Calculando as unidades na Meta…", tom: "neutro" });
    try {
      for (let rodada = 0; rodada < 15; rodada++) {
        const r = await fetch("/api/relatorio-rede", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mes: mesPadrao, enviar }),
        });
        const c = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(c.erro || "Falha ao calcular.");
        if (c.pronto) {
          if (enviar) {
            setEstado(c.enviado ? { texto: "Enviado pro seu e-mail.", tom: "ok" } : { texto: c.motivo || "Não foi possível enviar.", tom: "erro" });
          } else {
            setEstado({ texto: "Pronto — baixando o PDF.", tom: "ok" });
            window.location.href = `/api/relatorio-rede?mes=${mesPadrao}`;
          }
          return;
        }
        setEstado({ texto: `Calculando as unidades na Meta… ${c.total - c.faltam} de ${c.total}`, tom: "neutro" });
      }
      throw new Error("Demorou mais que o esperado. Tente de novo em alguns minutos: o que já foi calculado fica guardado.");
    } catch (e) {
      setEstado({ texto: e instanceof Error ? e.message : "Falha ao calcular.", tom: "erro" });
    } finally {
      setOcupado(false);
    }
  }

  const botao = "flex items-center gap-1.5 rounded-lg border border-white/14 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-white/[0.04] disabled:opacity-40";
  return (
    <div className="cartao-vidro mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-100">Relatório mensal da rede · {rotuloMes}</p>
        <p className="mt-0.5 text-[11.5px] text-neutral-500">
          Um PDF só comparando todas as unidades: investimento, alcance, interações, posts e seguidores. Sai sozinho por
          e-mail no começo de cada mês.
        </p>
        {estado && (
          <p className={`mt-1.5 text-xs ${estado.tom === "ok" ? "text-ok" : estado.tom === "erro" ? "text-danger" : "text-neutral-400"}`}>{estado.texto}</p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <button className={botao} disabled={ocupado} onClick={() => preparar(false)}>
          <DownloadSimple size={14} /> Baixar PDF
        </button>
        {podeEnviar && (
          <button className={botao} disabled={ocupado} onClick={() => preparar(true)}>
            <PaperPlaneTilt size={14} /> Enviar por e-mail
          </button>
        )}
      </div>
    </div>
  );
}
