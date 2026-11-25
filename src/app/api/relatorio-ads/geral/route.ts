import { NextResponse, type NextRequest } from "next/server";
import { lerAmbiente } from "@/lib/ambiente";
import { calcularDadosGeraisRede } from "@/lib/dadosGeraisRede";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PERIODOS = [15, 30, 45, 60, 90];

/** Dados gerais da franquia: volume de campanhas, curtidas, alcance e visualizações no período. */
export async function GET(request: NextRequest) {
  const ambiente = await lerAmbiente();
  if (!ambiente || ambiente.tipo !== "franquia") return NextResponse.json({ erro: "Abra uma franquia." }, { status: 403 });
  const dias = Number(request.nextUrl.searchParams.get("dias") ?? 30);
  if (!PERIODOS.includes(dias)) return NextResponse.json({ erro: "Período inválido." }, { status: 400 });
  try {
    return NextResponse.json({ dados: await calcularDadosGeraisRede(ambiente.id, dias) });
  } catch (erro) {
    return NextResponse.json({ erro: erro instanceof Error ? erro.message : "Falha ao calcular." }, { status: 502 });
  }
}
