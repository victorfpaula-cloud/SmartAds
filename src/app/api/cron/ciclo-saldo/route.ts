import { NextResponse, type NextRequest } from "next/server";
import { comRegistroDeCron } from "@/lib/cronRegistro";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { calcularCiclosDasContas } from "@/lib/cicloSaldo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Todo dia (depois do Financeiro, antes do e-mail de alertas): recalcula o ritmo do saldo das contas
 * com ciclo de recarga definido — é o que alimenta os avisos de "vai faltar" e "vai sobrar". */
export const GET = comRegistroDeCron("ciclo-saldo", async function (request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado || request.headers.get("authorization") !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const { data } = await criarClienteAdmin().from("smartads_contas_meta").select("id").eq("ativo", true).not("ciclo_recarga", "is", null);
  const r = await calcularCiclosDasContas((data ?? []).map((c) => c.id as string));
  return NextResponse.json({ contas: r.length, executadoEm: new Date().toISOString() });
});
