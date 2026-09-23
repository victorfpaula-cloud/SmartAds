import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterDiagnosticoSaldoConta } from "@/lib/meta/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** TEMPORÁRIO — investigando se dá pra buscar o "Fundos disponíveis" real de contas com Pix (ver
 * conversa: o cálculo por spend_cap deu errado). Bate direto na Meta com vários campos/edges
 * candidatos e devolve o JSON cru pra inspecionar. Protegida pelo login do painel (mesmo middleware
 * de todo o resto) — não expõe nada que a própria pessoa logada já não veja no Gerenciador de
 * Anúncios. Remover essa rota depois de decidir o caminho certo. */
export async function GET(request: NextRequest) {
  const contaId = request.nextUrl.searchParams.get("contaId");
  if (!contaId) {
    return NextResponse.json({ erro: "Informe ?contaId= (o id da conta no SmartAds, não o act_...)." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data: conta, error } = await supabase
    .from("smartads_contas_meta")
    .select("id, nome_exibicao, meta_ad_account_id")
    .eq("id", contaId)
    .single();

  if (error || !conta) {
    return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  }

  const diagnostico = await obterDiagnosticoSaldoConta(conta.meta_ad_account_id);

  return NextResponse.json(
    { contaNome: conta.nome_exibicao, metaAdAccountId: conta.meta_ad_account_id, ...diagnostico },
    { headers: { "Content-Type": "application/json; charset=utf-8" } }
  );
}
