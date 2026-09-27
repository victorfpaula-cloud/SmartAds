import { NextResponse, type NextRequest } from "next/server";
import { enviarRelatorioPostagens } from "@/lib/email/relatorioPostagens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FUSO_HORARIO = "America/Sao_Paulo";

/** Dia 30 de cada mês, ou o último dia do mês quando ele não chega no 30 (fevereiro: dia 28, ou 29
 * em ano bissexto) — vercel.json dispara esse cron todo dia entre 28 e 31 pra cobrir os dois casos,
 * e essa função decide se é de fato o dia certo daquele mês. */
function ehDiaDeEnvio(agora: Date): boolean {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO_HORARIO,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(agora);
  const ano = Number(partes.find((p) => p.type === "year")?.value);
  const mes = Number(partes.find((p) => p.type === "month")?.value);
  const dia = Number(partes.find((p) => p.type === "day")?.value);
  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

  return dia === 30 || (ultimoDiaDoMes < 30 && dia === ultimoDiaDoMes);
}

/** Chamado pelo cron mensal da Vercel (ver vercel.json) — mesma autenticação por CRON_SECRET do
 * resto da automação. */
export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!segredoEsperado || autorizacao !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const agora = new Date();
  if (!ehDiaDeEnvio(agora)) {
    return NextResponse.json({ enviado: false, motivo: "Não é dia de envio.", executadoEm: agora.toISOString() });
  }

  const resultado = await enviarRelatorioPostagens();
  return NextResponse.json({ ...resultado, executadoEm: agora.toISOString() });
}
