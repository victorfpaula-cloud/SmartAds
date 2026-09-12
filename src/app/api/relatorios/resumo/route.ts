import { NextResponse } from "next/server";
import { buscarLinhasResumo } from "@/lib/relatorios";

export const dynamic = "force-dynamic";

/** Resumo agregado (números crus) de TODAS as contas de TODOS os clientes, últimos 30 dias —
 * alimenta o painel de Relatórios. A busca em si mora em src/lib/relatorios.ts, compartilhada com
 * o resumo em texto gerado por IA (/api/ia/resumo). */
export async function GET() {
  try {
    const linhas = await buscarLinhasResumo();
    return NextResponse.json({ linhas });
  } catch (erro) {
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Falha ao buscar o resumo." },
      { status: 500 }
    );
  }
}
