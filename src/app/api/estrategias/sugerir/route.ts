import { NextResponse, type NextRequest } from "next/server";
import { sugerirEtapasEstrategia } from "@/lib/estrategias/sugerirEtapas";

export const dynamic = "force-dynamic";

/** Sugestão de etapas via Gemini, dado um objetivo em texto livre e a duração total desejada —
 * alimenta o botão "Sugerir com IA" no construtor de Estratégia. O usuário sempre revisa e pode
 * editar antes de salvar; isso nunca cria nada sozinho. */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const objetivo = corpo?.objetivo?.trim();
  const duracaoTotalDias = Number(corpo?.duracaoTotalDias);

  if (!objetivo || !duracaoTotalDias || duracaoTotalDias <= 0) {
    return NextResponse.json({ erro: "Informe o objetivo e a duração total em dias." }, { status: 400 });
  }

  const etapas = await sugerirEtapasEstrategia(objetivo, duracaoTotalDias);
  if (!etapas) {
    return NextResponse.json(
      { erro: "Não deu pra gerar uma sugestão agora. Tente de novo ou monte manualmente." },
      { status: 502 }
    );
  }

  return NextResponse.json({ etapas });
}
