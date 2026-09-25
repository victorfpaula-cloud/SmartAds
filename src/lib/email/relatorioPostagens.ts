import { obterRelatorioPostagens, montarHtmlRelatorioPostagens } from "@/lib/relatorioPostagens";
import { enviarEmail } from "./resend";

/** Mesmo e-mail que o botão "Enviar por e-mail agora" da aba Radar de posts dispara na hora —
 * aqui é a versão chamada pelo cron semanal (ver /api/cron/relatorio-postagens e vercel.json), pro
 * dono não precisar entrar no app pra lembrar de conferir. Reaproveita RELATORIO_SEMANAL_EMAIL, o
 * mesmo destinatário do relatório semanal já existente — é o e-mail do próprio dono. */
export async function enviarRelatorioPostagens(): Promise<{ enviado: boolean; motivo?: string }> {
  const destinatario = process.env.RELATORIO_SEMANAL_EMAIL;
  if (!destinatario) return { enviado: false, motivo: "RELATORIO_SEMANAL_EMAIL não configurado." };

  const unidades = await obterRelatorioPostagens();
  if (unidades.length === 0) return { enviado: false, motivo: "Nenhuma unidade de franquia ativa." };

  const html = montarHtmlRelatorioPostagens(unidades);
  await enviarEmail({
    destinatario,
    assunto: `Relatório de postagens — ${new Date().toLocaleDateString("pt-BR")}`,
    html,
  });

  return { enviado: true };
}
