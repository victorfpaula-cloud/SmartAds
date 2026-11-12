import { NextResponse } from "next/server";
import { lerAmbiente } from "@/lib/ambiente";
import { calcularAnaliseTrafego } from "@/lib/analiseTrafego";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Botão "Atualizar agora" da Análise do tráfego: busca as duas últimas semanas na Meta e guarda. */
export async function POST() {
  const ambiente = await lerAmbiente();
  if (!ambiente || ambiente.tipo !== "franquia") return NextResponse.json({ erro: "Abra uma franquia." }, { status: 403 });
  try {
    const a = await calcularAnaliseTrafego(ambiente.id);
    return NextResponse.json({ ok: true, unidades: a.unidades.length, comErro: a.unidades.filter((u) => u.erro).length });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao calcular." }, { status: 502 });
  }
}
