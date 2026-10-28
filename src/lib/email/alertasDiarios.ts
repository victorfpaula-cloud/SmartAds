import { criarClienteAdmin } from "@/lib/supabase/admin";
import { alertasEmHtml, gerarAlertas, type Alerta } from "@/lib/alertas";
import { enviarEmail } from "./resend";

const DESTINATARIO_PADRAO = "victorfpaula@gmail.com";

/** Alertas de todas as empresas (franquias e contas únicas), cada uma com o nome. */
export async function alertasDeTodasAsEmpresas(): Promise<Array<{ empresa: string; alertas: Alerta[] }>> {
  const { data: empresas } = await criarClienteAdmin().from("smartads_empresas").select("id, nome").order("nome");
  const saida: Array<{ empresa: string; alertas: Alerta[] }> = [];
  for (const e of empresas ?? []) {
    try {
      saida.push({ empresa: e.nome, alertas: await gerarAlertas(e.id) });
    } catch {
      /* uma empresa com problema não derruba as outras */
    }
  }
  return saida;
}

/** E-mail diário: só sai quando há algo urgente ou pedindo atenção em saldo, conta na Meta, boost ou
 * dados. "Não investiu no mês" e "sem postar" não entram aqui (vão no relatório semanal e na tela). */
export async function enviarAlertasDiarios(): Promise<{ enviado: boolean; motivo?: string; total?: number }> {
  const todas = await alertasDeTodasAsEmpresas();
  const importantes = todas
    .map((t) => ({
      empresa: t.empresa,
      alertas: t.alertas.filter((a) => a.severidade !== "info" && a.categoria !== "investimento" && a.categoria !== "posts"),
    }))
    .filter((t) => t.alertas.length > 0);
  const total = importantes.reduce((s, t) => s + t.alertas.length, 0);
  if (total === 0) return { enviado: false, motivo: "Nada urgente hoje.", total: 0 };

  const critico = importantes.some((t) => t.alertas.some((a) => a.severidade === "critico"));
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;margin:0 0 16px">Alertas — SmartAds</h1>
  ${importantes.map((t) => alertasEmHtml(t.alertas, t.empresa)).join("")}
  <p style="font-size:11px;color:#888">Enviado quando há algo urgente ou pedindo atenção. Tudo fica também na tela Alertas de cada rede.</p>
</body></html>`;

  await enviarEmail({
    destinatario: process.env.RELATORIO_SEMANAL_EMAIL || DESTINATARIO_PADRAO,
    assunto: `${critico ? "Urgente: " : ""}${total} alerta${total !== 1 ? "s" : ""} no SmartAds`,
    html,
  });
  return { enviado: true, total };
}
