import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsConta } from "@/lib/meta/api";
import { calcularSaudeConta } from "@/lib/saude";
import { detectarAnomalia, janelasDeComparacao, type Anomalia } from "@/lib/anomalia";

export const dynamic = "force-dynamic";

// Cache do selo por 1h — não precisa ser em tempo real (é só um sinal de "olha aqui", não um
// número que alguém vai conferir centavo a centavo), e evita bater na Meta toda vez que a tela de
// Contas é aberta.
const VALIDADE_MS = 60 * 60 * 1000;

interface SaudeContaResultado {
  contaId: string;
  status: string;
  motivo: string;
  anomalia: Anomalia | null;
}

/** Selo de saúde por conta (Contas) — devolve o cache pra cada conta, recalculando primeiro as
 * que estão velhas ou nunca foram calculadas. Uma conta com erro individual (token revogado,
 * conta pausada etc.) não derruba as outras — some da resposta, o front mantém o selo anterior ou
 * mostra "sem dados".
 *
 * Compara o período atual com o anterior (ver src/lib/anomalia.ts) — quando algo foge do normal,
 * essa comparação vence o limiar simples (src/lib/saude.ts) porque é mais específica e acionável
 * ("CTR caiu 45%" diz mais que "CTR baixo"). */
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
  const janelas = janelasDeComparacao();

  const resultados = await Promise.all(
    (contas ?? []).map(async (conta): Promise<SaudeContaResultado | null> => {
      const cacheDaConta = cachePorConta.get(conta.id);
      const cacheValido =
        cacheDaConta && agora - new Date(cacheDaConta.calculado_em).getTime() < VALIDADE_MS;

      if (cacheValido) {
        return {
          contaId: conta.id,
          status: cacheDaConta.status,
          motivo: cacheDaConta.motivo,
          anomalia: cacheDaConta.anomalia ?? null,
        };
      }

      try {
        const [atual, anterior] = await Promise.all([
          obterInsightsConta(conta.meta_ad_account_id, {
            nivel: "account",
            intervalo: janelas.atual,
            porDia: false,
          }),
          obterInsightsConta(conta.meta_ad_account_id, {
            nivel: "account",
            intervalo: janelas.anterior,
            porDia: false,
          }),
        ]);

        const anomalia = detectarAnomalia(atual, anterior);
        const saude = anomalia
          ? { status: "atencao" as const, motivo: anomalia.mensagem }
          : calcularSaudeConta(atual);

        await supabase.from("smartads_saude_contas").upsert({
          conta_id: conta.id,
          status: saude.status,
          motivo: saude.motivo,
          anomalia,
          calculado_em: new Date().toISOString(),
        });

        return { contaId: conta.id, ...saude, anomalia };
      } catch {
        // Meta desconectada, conta com erro, etc. — mantém o cache antigo se tiver, senão some da
        // resposta (o front trata "sem entrada" como "sem dados ainda").
        return cacheDaConta
          ? {
              contaId: conta.id,
              status: cacheDaConta.status,
              motivo: cacheDaConta.motivo,
              anomalia: cacheDaConta.anomalia ?? null,
            }
          : null;
      }
    })
  );

  const saude: Record<string, { status: string; motivo: string; anomalia: Anomalia | null }> = {};
  for (const resultado of resultados) {
    if (resultado) {
      saude[resultado.contaId] = {
        status: resultado.status,
        motivo: resultado.motivo,
        anomalia: resultado.anomalia,
      };
    }
  }

  return NextResponse.json({ saude });
}
