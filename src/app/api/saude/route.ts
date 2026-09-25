import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterResumoCampanhasAtivas } from "@/lib/meta/api";
import { mapearEmLotes } from "@/lib/lotes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cache do selo por 6h — é só um sinal de "tem campanha no ar ou não" (ver SeloCampanhasAtivas em
// PainelInicio.tsx), não um número que alguém confere centavo a centavo. Era 1h quando essa rota
// calculava bem mais coisa; agora que só serve pra essa contagem, dá pra deixar mais folgado sem
// perder utilidade real, e reduz e muito quanto bate na Meta ao longo do dia.
const VALIDADE_MS = 6 * 60 * 60 * 1000;

/** Quantas campanhas estão realmente ativas agora, por conta — é só o que o card de Início mostra
 * (selo verde/laranja). Essa rota já calculou bem mais (selo de saúde, detecção de anomalia, gasto
 * 30d, insights do boost automático, Campanha-Mãe ativa), mas nada disso aparece no Início há um
 * tempo (ver Fase HH, que simplificou os cards) — continuar calculando tudo a cada visita era 4
 * chamadas à Meta por conta pra usar só 1 campo da resposta. Enxugado pra bater só 1 chamada por
 * conta (obterResumoCampanhasAtivas), com cache de 6h em smartads_saude_contas (mesma tabela de
 * antes — as colunas que essa rota não grava mais só ficam paradas com o último valor que tinham,
 * sem problema, ninguém mais lê elas). Uma conta com erro individual não derruba as outras. */
export async function GET() {
  const supabase = criarClienteAdmin();

  const [{ data: contas, error: erroContas }, { data: cache }] = await Promise.all([
    supabase.from("smartads_contas_meta").select("id, meta_ad_account_id").eq("ativo", true),
    supabase.from("smartads_saude_contas").select("conta_id, campanhas_ativas, calculado_em"),
  ]);

  if (erroContas) {
    return NextResponse.json({ erro: erroContas.message }, { status: 500 });
  }

  const cachePorConta = new Map((cache ?? []).map((linha) => [linha.conta_id, linha]));
  const agora = Date.now();

  const resultados = await mapearEmLotes(contas ?? [], async (conta) => {
    const cacheDaConta = cachePorConta.get(conta.id);
    const cacheValido = cacheDaConta && agora - new Date(cacheDaConta.calculado_em).getTime() < VALIDADE_MS;

    if (cacheValido) {
      return { contaId: conta.id, campanhasAtivas: cacheDaConta.campanhas_ativas ?? null };
    }

    try {
      const resumo = await obterResumoCampanhasAtivas(conta.meta_ad_account_id);
      await supabase.from("smartads_saude_contas").upsert({
        conta_id: conta.id,
        campanhas_ativas: resumo.quantidade,
        calculado_em: new Date().toISOString(),
      });
      return { contaId: conta.id, campanhasAtivas: resumo.quantidade };
    } catch {
      // Meta desconectada, conta com erro, etc. — mantém o cache antigo se tiver, senão some da
      // resposta (o front trata "sem entrada" como "sem dados ainda").
      return cacheDaConta ? { contaId: conta.id, campanhasAtivas: cacheDaConta.campanhas_ativas ?? null } : null;
    }
  });

  const saude: Record<string, { campanhasAtivas: number | null }> = {};
  for (const resultado of resultados) {
    if (resultado) saude[resultado.contaId] = { campanhasAtivas: resultado.campanhasAtivas };
  }

  return NextResponse.json({ saude });
}
