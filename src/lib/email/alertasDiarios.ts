import { criarClienteAdmin } from "@/lib/supabase/admin";
import { alertasEmHtml, gerarAlertas, gerarAlertasConexao, type Alerta } from "@/lib/alertas";
import { enviarEmail } from "./resend";
import { atualizarCacheFinanceiroDaConta } from "@/lib/financeiro/atualizarCacheFinanceiro";

/** Antes de montar o e-mail, relê na Meta o financeiro só das contas que podem entrar nele (sem saldo
 * ou acabando em até 8 dias) — o cache diário pode ter horas e uma recarga feita depois dele fazia o
 * e-mail dizer "sem saldo" de conta que já tinha crédito. Limitado a ~35s; o que não der tempo segue
 * com o cache. */
async function atualizarContasEmRisco(): Promise<void> {
  const db = criarClienteAdmin();
  const { data } = await db
    .from("smartads_financeiro_cache")
    .select("conta_id, saldo_disponivel_centavos, media_diaria_centavos, conta_pre_paga");
  const emRisco = (data ?? []).filter((c) => {
    if (c.conta_pre_paga === false) return false;
    const saldo = c.saldo_disponivel_centavos as number | null;
    const media = (c.media_diaria_centavos as number | null) ?? 0;
    return saldo === null || saldo <= 0 || (media > 0 && saldo / media <= 8);
  });
  if (emRisco.length === 0) return;
  const { data: contas } = await db
    .from("smartads_contas_meta")
    .select("id, meta_ad_account_id")
    .eq("ativo", true)
    .in("id", emRisco.map((c) => c.conta_id));
  await Promise.race([
    Promise.allSettled((contas ?? []).map((c) => atualizarCacheFinanceiroDaConta(c.id, c.meta_ad_account_id))),
    new Promise((resolve) => setTimeout(resolve, 35_000)),
  ]);
}

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
  await atualizarContasEmRisco().catch(() => undefined);
  const todas = await alertasDeTodasAsEmpresas();
  const importantes = todas
    .map((t) => ({
      empresa: t.empresa,
      alertas: t.alertas.filter((a) => a.severidade !== "info" && (a.categoria !== "investimento" || /teto de gasto/i.test(a.titulo)) && a.categoria !== "posts"),
    }))
    .filter((t) => t.alertas.length > 0);
  const conexao = (await gerarAlertasConexao().catch(() => [])).filter((a) => a.severidade !== "info");
  if (conexao.length > 0) importantes.unshift({ empresa: "Conexão com a Meta", alertas: conexao });
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
