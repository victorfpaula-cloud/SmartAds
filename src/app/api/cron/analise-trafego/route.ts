import { comRegistroDeCron } from "@/lib/cronRegistro";
import { rodarAnaliseTrafegoCron } from "@/lib/analiseTrafegoCron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Toda segunda: recalcula a análise do tráfego de cada franquia (a semana que acabou de fechar). */
export const GET = comRegistroDeCron("analise-trafego", (request) => rodarAnaliseTrafegoCron(request, [7, 15]));
