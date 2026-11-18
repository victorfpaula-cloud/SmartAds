import { comRegistroDeCron } from "@/lib/cronRegistro";
import { rodarAnaliseTrafegoCron } from "@/lib/analiseTrafegoCron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Toda segunda, depois da semanal: os períodos longos (30, 60 e 90 dias) usados no Ranking das
 * unidades — um período por chamada (são três chamadas), pra cada um ter o tempo inteiro da função. */
export const GET = comRegistroDeCron("analise-trafego-longa", (request) => rodarAnaliseTrafegoCron(request, [30, 60, 90], 1));
