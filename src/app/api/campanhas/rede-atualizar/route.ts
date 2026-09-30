import { NextResponse } from "next/server";
import { recalcularCampanhasRede } from "@/lib/campanhasRede";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Atualizar agora" do panorama da rede: roda na hora o mesmo cálculo do cron das campanhas da rede
 * (campanhas ativas + gasto do mês por unidade). Exige login como o resto do painel (middleware). */
export async function POST() {
  try {
    const resultado = await recalcularCampanhasRede();
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao atualizar." }, { status: 500 });
  }
}
