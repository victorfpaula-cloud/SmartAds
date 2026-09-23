import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterInsightsConta } from "@/lib/meta/api";
import { enviarEmail } from "./resend";

function linkAprovacao(token: string, acao: "aprovar" | "rejeitar") {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}/api/sugestoes/aprovar?token=${encodeURIComponent(token)}&acao=${acao}`;
}

function formatarReais(centavosOuReais: number, jaEmReais = true) {
  const valor = jaEmReais ? centavosOuReais : centavosOuReais / 100;
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Monta e envia o relatório semanal — UM e-mail consolidado cobrindo todas as unidades ativas
 * (o dono opera sozinho hoje; separar por franqueado é extensão futura, não perde nada mudar
 * depois já que cada seção já é isolada por conta). Cada seção: panorama da semana, campanhas
 * ativas, o diagnóstico mais recente (se houver, "quais estratégias e por quê") e sugestões
 * pendentes com link de aprovar/rejeitar direto do e-mail — sem precisar abrir o app. */
export async function enviarRelatorioSemanal(): Promise<{ enviado: boolean; motivo?: string }> {
  const destinatario = process.env.RELATORIO_SEMANAL_EMAIL;
  if (!destinatario) return { enviado: false, motivo: "RELATORIO_SEMANAL_EMAIL não configurado." };

  const supabase = criarClienteAdmin();
  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select("id, nome, smartads_contas_meta(*)")
    .eq("ativo", true)
    .order("nome");

  if (!clientes?.length) return { enviado: false, motivo: "Nenhum cliente ativo." };

  const secoes: string[] = [];

  for (const cliente of clientes) {
    for (const conta of (cliente as any).smartads_contas_meta as any[]) {
      if (!conta.ativo) continue;

      const [insightsConta, insightsCampanhas] = await Promise.all([
        obterInsightsConta(conta.meta_ad_account_id, { nivel: "account", datePreset: "last_7d", porDia: false }).catch(
          () => []
        ),
        obterInsightsConta(conta.meta_ad_account_id, { nivel: "campaign", datePreset: "last_7d", porDia: false }).catch(
          () => []
        ),
      ]);
      const total = insightsConta[0];
      const campanhasAtivas = insightsCampanhas.filter((c) => Number(c.spend ?? 0) > 0);

      const { data: diagnostico } = await supabase
        .from("smartads_diagnosticos")
        .select("texto, gerado_em")
        .eq("conta_id", conta.id)
        .order("gerado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: sugestoesPendentes } = await supabase
        .from("smartads_sugestoes")
        .select("titulo, descricao, token_aprovacao")
        .eq("conta_id", conta.id)
        .eq("status", "pendente");

      const nomeConta = conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id;

      secoes.push(`
        <div style="margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #e5e5e5">
          <h2 style="font-size:16px;margin:0 0 4px">${cliente.nome} — ${nomeConta}</h2>
          ${
            conta.meta_negocio
              ? `<p style="font-size:12px;color:#888;margin:0 0 12px">Meta: ${conta.meta_negocio}</p>`
              : ""
          }
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px">
            <tr>
              <td style="padding:4px 8px 4px 0;color:#666">Gasto (7 dias)</td>
              <td style="padding:4px 0;font-weight:600">${formatarReais(Number(total?.spend ?? 0))}</td>
            </tr>
            <tr>
              <td style="padding:4px 8px 4px 0;color:#666">Cliques</td>
              <td style="padding:4px 0;font-weight:600">${Number(total?.clicks ?? 0)}</td>
            </tr>
            <tr>
              <td style="padding:4px 8px 4px 0;color:#666">CTR</td>
              <td style="padding:4px 0;font-weight:600">${Number(total?.ctr ?? 0).toFixed(2)}%</td>
            </tr>
          </table>
          ${
            campanhasAtivas.length > 0
              ? `<p style="font-size:12px;color:#666;margin:0 0 4px"><strong>Campanhas ativas essa semana:</strong></p>
                 <ul style="font-size:13px;margin:0 0 12px;padding-left:18px">
                   ${campanhasAtivas
                     .map(
                       (c) =>
                         `<li>${c.campaign_name ?? c.campaign_id} — ${formatarReais(Number(c.spend ?? 0))}</li>`
                     )
                     .join("")}
                 </ul>`
              : `<p style="font-size:13px;color:#999;margin:0 0 12px">Nenhuma campanha com gasto essa semana.</p>`
          }
          ${
            diagnostico
              ? `<p style="font-size:13px;color:#333;background:#f7f7f7;border-radius:8px;padding:12px;margin:0 0 12px">${diagnostico.texto}</p>`
              : ""
          }
          ${
            sugestoesPendentes?.length
              ? sugestoesPendentes
                  .map(
                    (s) => `
              <div style="border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:8px">
                <p style="font-size:13px;font-weight:600;margin:0 0 4px">${s.titulo}</p>
                <p style="font-size:12px;color:#666;margin:0 0 8px">${s.descricao}</p>
                <a href="${linkAprovacao(s.token_aprovacao, "aprovar")}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;margin-right:6px">Aprovar</a>
                <a href="${linkAprovacao(s.token_aprovacao, "rejeitar")}" style="display:inline-block;border:1px solid #ccc;color:#666;text-decoration:none;padding:6px 14px;border-radius:6px;font-size:12px">Rejeitar</a>
              </div>`
                  )
                  .join("")
              : ""
          }
        </div>
      `);
    }
  }

  const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;margin:0 0 4px">Relatório semanal — SmartAds</h1>
  <p style="font-size:13px;color:#888;margin:0 0 24px">Semana de ${new Date().toLocaleDateString("pt-BR")}</p>
  ${secoes.join("")}
</body></html>`;

  await enviarEmail({
    destinatario,
    assunto: `Relatório semanal — ${new Date().toLocaleDateString("pt-BR")}`,
    html,
  });

  return { enviado: true };
}
