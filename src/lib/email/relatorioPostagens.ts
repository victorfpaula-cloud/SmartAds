import { obterRelatorioPostagens, montarHtmlRelatorioPostagens } from "@/lib/relatorioPostagens";
import { enviarEmail } from "./resend";

// E-mail do próprio dono — usado quando RELATORIO_SEMANAL_EMAIL não está configurado na Vercel
// (era o caso até aqui: a variável nunca chegou a ser criada, então nem esse botão nem o cron
// mensal enviavam nada). Configurar a env var continua valendo pra trocar o destinatário depois.
const DESTINATARIO_PADRAO = "victorfpaula@gmail.com";

/** Mesmo e-mail que o botão "Enviar por e-mail agora" da aba Radar de posts dispara na hora —
 * aqui é a versão chamada pelo cron mensal, todo dia 30 (ver /api/cron/relatorio-postagens e
 * vercel.json), pro dono não precisar entrar no app pra lembrar de conferir. Reaproveita
 * RELATORIO_SEMANAL_EMAIL, o mesmo destinatário do relatório semanal já existente — é o e-mail do
 * próprio dono. */
export async function enviarRelatorioPostagens(): Promise<{ enviado: boolean; motivo?: string }> {
  const destinatario = process.env.RELATORIO_SEMANAL_EMAIL || DESTINATARIO_PADRAO;

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
