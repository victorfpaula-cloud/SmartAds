import { NextResponse, type NextRequest } from "next/server";
import { comRegistroDeCron } from "@/lib/cronRegistro";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { calcularAnaliseTrafego } from "@/lib/analiseTrafego";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Toda segunda: recalcula a análise do tráfego de cada franquia (a semana que acabou de fechar). */
export const GET = comRegistroDeCron("analise-trafego", async function (request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado || request.headers.get("authorization") !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const inicio = Date.now();
  const { data: franquias } = await criarClienteAdmin().from("smartads_empresas").select("id").eq("tipo", "franquia");
  let feitas = 0;
  const falhas: string[] = [];
  for (const f of franquias ?? []) {
    for (const dias of [7, 15]) {
      const resta = 50_000 - (Date.now() - inicio);
      if (resta < 15_000) break;
      try {
        await calcularAnaliseTrafego(f.id, dias, resta - 10_000);
        feitas++;
      } catch (e) {
        // Uma franquia/período que falha não impede os outros; a análise anterior dela fica guardada.
        falhas.push(e instanceof Error ? e.message : String(e));
      }
    }
  }
  if (falhas.length > 0) {
    return NextResponse.json({ erro: falhas.join(" | ").slice(0, 400), feitas, executadoEm: new Date().toISOString() }, { status: 500 });
  }
  return NextResponse.json({ franquias: (franquias ?? []).length, feitas, executadoEm: new Date().toISOString() });
});
