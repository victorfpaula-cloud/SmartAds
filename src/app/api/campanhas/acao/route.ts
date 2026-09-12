import { NextResponse, type NextRequest } from "next/server";
import { pausarCampanha, ativarCampanha, definirOrcamentoConjunto } from "@/lib/meta/api";
import { registrarAcao } from "@/lib/meta/acoesLog";
import { ErroMetaNaoConectado } from "@/lib/meta/token";
import { ErroGraphAPIException } from "@/lib/meta/erros";

export const dynamic = "force-dynamic";

type Corpo =
  | { acao: "pausar" | "ativar"; campaignId: string; contaId: string }
  | { acao: "orcamento"; adsetId: string; tipo: "diario" | "vitalicio"; valorCentavos: number; contaId: string };

/** Ações rápidas do painel "Campanhas no ar" — pausar/ativar e editar orçamento inline. */
export async function POST(request: NextRequest) {
  const corpo = (await request.json().catch(() => null)) as Corpo | null;
  if (!corpo) {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }

  try {
    if (corpo.acao === "pausar") {
      await pausarCampanha(corpo.campaignId);
    } else if (corpo.acao === "ativar") {
      await ativarCampanha(corpo.campaignId);
    } else if (corpo.acao === "orcamento") {
      await definirOrcamentoConjunto(corpo.adsetId, corpo.tipo, corpo.valorCentavos);
    } else {
      return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
    }

    await registrarAcao({
      contaId: corpo.contaId,
      acao: corpo.acao,
      payload: corpo as unknown as Record<string, unknown>,
      sucesso: true,
    });

    return NextResponse.json({ ok: true });
  } catch (erro) {
    const mensagem =
      erro instanceof ErroMetaNaoConectado || erro instanceof ErroGraphAPIException
        ? erro.message
        : "Falha ao executar a ação.";

    await registrarAcao({
      contaId: corpo.contaId,
      acao: corpo.acao,
      payload: corpo as unknown as Record<string, unknown>,
      sucesso: false,
      erroMensagem: mensagem,
    });

    const status = erro instanceof ErroMetaNaoConectado ? 409 : 502;
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
