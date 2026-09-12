import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsConta } from "@/lib/meta/api";
import { calcularSaudeConta } from "@/lib/saude";

export const dynamic = "force-dynamic";

// Cache do selo por 1h — não precisa ser em tempo real (é só um sinal de "olha aqui", não um
// número que alguém vai conferir centavo a centavo), e evita bater na Meta toda vez que a tela de
// Contas é aberta.
const VALIDADE_MS = 60 * 60 * 1000;

/** Selo de saúde por conta (Contas) — devolve o cache pra cada conta, recalculando primeiro as
 * que estão velhas ou nunca foram calculadas. Uma conta com erro individual (token revogado,
 * conta pausada etc.) não derruba as outras — some da resposta, o front mantém o selo anterior ou
 * mostra "sem dados". */
export async function GET() {
  const supabase = criarClienteAdmin();

  const [{ data: contas, error: erroContas }, { data: cache }] = await Promise.all([
    supabase.from("smartads_contas_meta").select("id, meta_ad_account_id").eq("ativo", true),
    supabase.from("smartads_saude_contas").select("*"),
  ]);

  if (erroContas) {
    return NextResponse.json({ erro: erroContas.message }, { status: 500 });
  }

  const cachePorConta = new Map((cache ?? []).map((linha) => [linha.conta_id, linha]));
  const agora = Date.now();

  const resultados = await Promise.all(
    (contas ?? []).map(async (conta) => {
      const cacheDaConta = cachePorConta.get(conta.id);
      const cacheValido =
        cacheDaConta && agora - new Date(cacheDaConta.calculado_em).getTime() < VALIDADE_MS;

      if (cacheValido) {
        return { contaId: conta.id, status: cacheDaConta.status, motivo: cacheDaConta.motivo };
      }

      try {
        const insights = await obterInsightsConta(conta.meta_ad_account_id, {
          nivel: "account",
          datePreset: "last_7d",
          porDia: false,
        });
        const saude = calcularSaudeConta(insights);

        await supabase.from("smartads_saude_contas").upsert({
          conta_id: conta.id,
          status: saude.status,
          motivo: saude.motivo,
          calculado_em: new Date().toISOString(),
        });

        return { contaId: conta.id, ...saude };
      } catch {
        // Meta desconectada, conta com erro, etc. — mantém o cache antigo se tiver, senão some da
        // resposta (o front trata "sem entrada" como "sem dados ainda").
        return cacheDaConta
          ? { contaId: conta.id, status: cacheDaConta.status, motivo: cacheDaConta.motivo }
          : null;
      }
    })
  );

  const saude: Record<string, { status: string; motivo: string }> = {};
  for (const resultado of resultados) {
    if (resultado) saude[resultado.contaId] = { status: resultado.status, motivo: resultado.motivo };
  }

  return NextResponse.json({ saude });
}
