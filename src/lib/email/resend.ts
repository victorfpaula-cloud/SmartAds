import { Resend } from "resend";

/** Envio de e-mail transacional — Resend, já usado em outros projetos do dono. `RESEND_FROM_EMAIL`
 * precisa ser um remetente verificado na conta Resend (domínio próprio ou onboarding@resend.dev
 * em teste). Lança se não estiver configurado — quem chama decide se trata como erro fatal
 * (cron) ou silencioso (nunca é o caso aqui: sem e-mail configurado, o relatório simplesmente não
 * pode ser enviado, e isso deve aparecer no log do cron, não ser engolido). */
export async function enviarEmail(params: { destinatario: string; assunto: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const remetente = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !remetente) {
    throw new Error("RESEND_API_KEY ou RESEND_FROM_EMAIL não configurados.");
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: remetente,
    to: params.destinatario,
    subject: params.assunto,
    html: params.html,
  });

  if (error) throw new Error(error.message);
}
