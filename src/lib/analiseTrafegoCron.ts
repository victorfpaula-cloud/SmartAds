import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { calcularAnaliseTrafego, type AnaliseTrafego } from "@/lib/analiseTrafego";
import { adicionarDias, diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";

/** Recalcula a análise do tráfego de cada franquia nos períodos pedidos, dentro do tempo da função.
 * Uma franquia/período que falha não impede os outros; a análise anterior dela fica guardada.
 * Período que já termina ontem e leu todas as unidades é pulado — assim uma segunda chamada no mesmo
 * dia termina o que não coube na primeira (os períodos longos levam mais tempo na Meta).
 * `maxPorRodada` limita quantos períodos uma chamada calcula (os longos: um por vez, pra caber no tempo). */
export async function rodarAnaliseTrafegoCron(request: NextRequest, periodos: number[], maxPorRodada = Infinity): Promise<Response> {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado || request.headers.get("authorization") !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const inicio = Date.now();
  const { data: franquias } = await criarClienteAdmin().from("smartads_empresas").select("id").eq("tipo", "franquia");
  let feitas = 0;
  const falhas: string[] = [];
  for (const f of franquias ?? []) {
    const ontem = adicionarDias(diaEmSaoPaulo(new Date().toISOString()), -1);
    const { data: guardadas } = await criarClienteAdmin().from("smartads_analise_trafego").select("dias, dados").eq("empresa_id", f.id).in("dias", periodos);
    const prontos = new Set(
      (guardadas ?? [])
        .filter((l) => {
          const a = l.dados as AnaliseTrafego | null;
          return a?.periodo?.ate === ontem && !a.unidades.some((u) => u.erro);
        })
        .map((l) => Number(l.dias))
    );
    for (const dias of periodos) {
      if (prontos.has(dias)) continue;
      if (feitas >= maxPorRodada) break;
      const resta = 50_000 - (Date.now() - inicio);
      if (resta < 15_000) break;
      try {
        await calcularAnaliseTrafego(f.id, dias, resta - 10_000);
        feitas++;
      } catch (e) {
        falhas.push(e instanceof Error ? e.message : String(e));
      }
    }
  }
  if (falhas.length > 0) {
    return NextResponse.json({ erro: falhas.join(" | ").slice(0, 400), feitas, executadoEm: new Date().toISOString() }, { status: 500 });
  }
  return NextResponse.json({ franquias: (franquias ?? []).length, feitas, executadoEm: new Date().toISOString() });
}
