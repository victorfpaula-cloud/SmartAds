import { NextResponse, type NextRequest } from "next/server";
import { criarCampanhaCompleta, type ParametrosCriarCampanha } from "@/lib/meta/criarCampanhaCompleta";

export const dynamic = "force-dynamic";

/** Cria a campanha inteira (campanha → conjunto de anúncios → criativo → anúncio), com rollback em
 * caso de falha — a lógica de verdade mora em criarCampanhaCompleta (compartilhada com o boost
 * automático, ver src/lib/automacao/boostAutomatico.ts), essa rota só traduz pra HTTP. */
export async function POST(request: NextRequest) {
  const corpo = (await request.json().catch(() => null)) as ParametrosCriarCampanha | null;
  if (!corpo?.contaId || !corpo.tipoModelo || !corpo.publico || !corpo.orcamento || !corpo.criativo) {
    return NextResponse.json({ erro: "Faltam campos obrigatórios." }, { status: 400 });
  }

  const resultado = await criarCampanhaCompleta(corpo);

  if (resultado.ok) {
    return NextResponse.json({ campanha: resultado.campanhaSalva }, { status: 201 });
  }
  return NextResponse.json(
    { erro: resultado.erro, etapaAlcancada: resultado.etapaAlcancada },
    { status: resultado.status }
  );
}
