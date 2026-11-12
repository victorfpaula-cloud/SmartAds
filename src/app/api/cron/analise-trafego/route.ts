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
  for (const f of franquias ?? []) {
    const resta = 50_000 - (Date.now() - inicio);
    if (resta < 15_000) break;
    await calcularAnaliseTrafego(f.id, resta - 10_000);
    feitas++;
  }
  return NextResponse.json({ franquias: (franquias ?? []).length, feitas, executadoEm: new Date().toISOString() });
});
