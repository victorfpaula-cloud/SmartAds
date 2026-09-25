import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarPlanoExecucao } from "@/lib/estrategias/criarPlanoExecucao";
import type { Publico } from "@/lib/meta/tipos";

export const dynamic = "force-dynamic";

interface UnidadeParaAplicar {
  clienteId: string;
  contaId: string;
  investimentoCentavos: number;
  publicoId?: string;
  publico?: Publico;
  metaNegocio?: string;
}

interface CorpoAplicar {
  unidades: UnidadeParaAplicar[];
}

/** Dispara uma Campanha-Mãe pra N unidades de uma vez: cria um Plano de Execução por unidade
 * (mesmo mecanismo de "aplicar estratégia" numa unidade só), todos com data de início IGUAL (a
 * da Campanha-Mãe) e investimento validado contra a faixa mín/máx definida nela — os "padrões"
 * que a franqueadora estabeleceu. Uma unidade que falhar não derruba as outras: cada uma tem seu
 * próprio resultado na resposta. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpo = (await request.json().catch(() => null)) as CorpoAplicar | null;

  if (!corpo?.unidades?.length) {
    return NextResponse.json({ erro: "Selecione pelo menos uma unidade." }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data: campanha, error: erroCampanha } = await supabase
    .from("smartads_campanhas_mae")
    .select("*")
    .eq("id", id)
    .single();

  if (erroCampanha || !campanha) {
    return NextResponse.json({ erro: "Campanha-Mãe não encontrada." }, { status: 404 });
  }

  const foraDaFaixa = corpo.unidades.filter(
    (u) =>
      u.investimentoCentavos < campanha.investimento_minimo_centavos ||
      u.investimentoCentavos > campanha.investimento_maximo_centavos
  );
  if (foraDaFaixa.length > 0) {
    return NextResponse.json(
      {
        erro: `Investimento fora da faixa permitida (R$ ${(campanha.investimento_minimo_centavos / 100).toFixed(2)} a R$ ${(campanha.investimento_maximo_centavos / 100).toFixed(2)}) pra ${foraDaFaixa.length} unidade(s).`,
      },
      { status: 400 }
    );
  }

  const { data: contas } = await supabase
    .from("smartads_contas_meta")
    .select("id, nome_exibicao, meta_ad_account_nome")
    .in(
      "id",
      corpo.unidades.map((u) => u.contaId)
    );
  const nomeContaPorId = new Map((contas ?? []).map((c) => [c.id, c.nome_exibicao || c.meta_ad_account_nome || "Unidade"]));

  const resultados = await Promise.allSettled(
    corpo.unidades.map((unidade) =>
      criarPlanoExecucao({
        estrategiaId: campanha.estrategia_id,
        clienteId: unidade.clienteId,
        contaId: unidade.contaId,
        nome: `${campanha.nome} — ${nomeContaPorId.get(unidade.contaId) ?? "Unidade"}`,
        publicoId: unidade.publicoId,
        publico: unidade.publico,
        investimentoTotalCentavos: unidade.investimentoCentavos,
        dataInicio: campanha.data_inicio,
        metaNegocio: unidade.metaNegocio,
        campanhaMaeId: campanha.id,
      })
    )
  );

  const sucesso = resultados.filter((r) => r.status === "fulfilled").length;
  const falhas = resultados
    .map((r, indice) => (r.status === "rejected" ? { contaId: corpo.unidades[indice].contaId, erro: (r as PromiseRejectedResult).reason?.message ?? "Falha desconhecida." } : null))
    .filter((f): f is { contaId: string; erro: string } => f !== null);

  return NextResponse.json({ criados: sucesso, falhas }, { status: falhas.length > 0 && sucesso === 0 ? 500 : 201 });
}
