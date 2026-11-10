import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/** Envolve a rota de um cron pra registrar cada execução (smartads_cron_execucoes): começou,
 * terminou, deu certo ou qual foi o erro. É o que deixa os Alertas avisarem quando uma rotina
 * automática falha ou para de rodar. O registro é best-effort: se ele próprio falhar, o cron roda
 * igual — nunca atrapalha o trabalho de verdade. Chamada sem o segredo (401) não é registrada. */
export function comRegistroDeCron(
  nome: string,
  handler: (request: NextRequest) => Promise<Response>
): (request: NextRequest) => Promise<Response> {
  return async (request) => {
    const segredo = process.env.CRON_SECRET;
    const autorizado = !!segredo && request.headers.get("authorization") === `Bearer ${segredo}`;
    if (!autorizado) return handler(request);

    let id: string | null = null;
    try {
      const db = criarClienteAdmin();
      const { data } = await db.from("smartads_cron_execucoes").insert({ nome }).select("id").single();
      id = (data?.id as string | undefined) ?? null;
      // Guarda só 30 dias de histórico.
      await db
        .from("smartads_cron_execucoes")
        .delete()
        .eq("nome", nome)
        .lt("iniciado_em", new Date(Date.now() - 30 * 86_400_000).toISOString());
    } catch {
      /* segue sem registro */
    }

    const fechar = async (ok: boolean, erro: string | null) => {
      if (!id) return;
      try {
        await criarClienteAdmin()
          .from("smartads_cron_execucoes")
          .update({ terminado_em: new Date().toISOString(), ok, erro: erro?.slice(0, 500) ?? null })
          .eq("id", id);
      } catch {
        /* idem */
      }
    };

    try {
      const resposta = await handler(request);
      await fechar(resposta.status < 500, resposta.status < 500 ? null : `A rotina respondeu com erro ${resposta.status}.`);
      return resposta;
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      await fechar(false, mensagem);
      return NextResponse.json({ erro: mensagem }, { status: 500 });
    }
  };
}

/** Nome amigável e de quanto em quanto tempo cada rotina deveria rodar (horas; null = não é diária). */
export const ROTINAS: Record<string, { rotulo: string; intervaloHoras: number | null }> = {
  financeiro: { rotulo: "Atualização do Financeiro", intervaloHoras: 24 },
  "boost-automatico": { rotulo: "Boost automático", intervaloHoras: 24 },
  stories: { rotulo: "Contagem de stories", intervaloHoras: 24 },
  "campanhas-rede": { rotulo: "Campanhas da rede", intervaloHoras: 24 },
  seguidores: { rotulo: "Histórico de seguidores", intervaloHoras: 24 },
  semaforo: { rotulo: "Semáforo das unidades", intervaloHoras: 24 },
  automacao: { rotulo: "Automações", intervaloHoras: 24 },
  alertas: { rotulo: "E-mail de alertas", intervaloHoras: 24 },
  "relatorio-mensal": { rotulo: "Relatório mensal por unidade", intervaloHoras: null },
  "relatorio-semanal-unidades": { rotulo: "Relatório semanal por unidade", intervaloHoras: null },
  "relatorio-semanal": { rotulo: "Relatório semanal", intervaloHoras: null },
  "relatorio-postagens": { rotulo: "Relatório de postagens", intervaloHoras: null },
  "relatorio-rede": { rotulo: "Relatório mensal da rede", intervaloHoras: null },
  limpeza: { rotulo: "Limpeza de dados antigos", intervaloHoras: null },
};
