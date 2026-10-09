import { NextResponse, type NextRequest } from "next/server";
import { boostEfetivoDaConta } from "@/lib/boostRedeServidor";

export const dynamic = "force-dynamic";

/** Boost que vale HOJE pra uma conta (padrão da rede + regra por data em vigor) — o modal da conta
 * usa pra mostrar o que a rede já definiu. */
export async function GET(request: NextRequest) {
  const contaId = request.nextUrl.searchParams.get("contaId");
  if (!contaId) return NextResponse.json({ erro: "Informe a conta." }, { status: 400 });
  const { config, regra } = await boostEfetivoDaConta(contaId);
  return NextResponse.json({ config, regra });
}
