import { criarClienteAdmin } from "@/lib/supabase/admin";
import { gerarRelatorioAds, type DadosRelatorioAds } from "@/lib/relatorioAds";
import { montarPdfRelatorioAds, nomeArquivoRelatorio, inteiro, reais } from "@/lib/relatorioAdsPdf";
import { enviarEmail } from "@/lib/email/resend";
import { adicionarDias, diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export interface MesRelatorio {
  /** AAAA-MM */
  mes: string;
  desde: string;
  ate: string;
  dias: number;
  /** "Setembro de 2026" */
  rotulo: string;
}

/** Mês fechado imediatamente anterior ao dia `hoje` (ou o mês pedido, AAAA-MM). */
export function mesDoRelatorio(hoje = new Date(), mesPedido?: string): MesRelatorio {
  let ano: number, m: number;
  if (mesPedido && /^\d{4}-\d{2}$/.test(mesPedido)) {
    [ano, m] = mesPedido.split("-").map(Number);
  } else {
    const [a, mm] = diaEmSaoPaulo(hoje.toISOString()).split("-").map(Number);
    ano = mm === 1 ? a - 1 : a;
    m = mm === 1 ? 12 : mm - 1;
  }
  const dias = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const mes = `${ano}-${String(m).padStart(2, "0")}`;
  return { mes, desde: `${mes}-01`, ate: `${mes}-${String(dias).padStart(2, "0")}`, dias, rotulo: `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} de ${ano}` };
}

function emailsValidos(texto: string | null | undefined): string[] {
  return (texto ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
    .slice(0, 3);
}

/** Relatório do mês de UMA unidade (cliente): um PDF por conta de anúncio distinta, com orgânico × tráfego. */
export async function gerarRelatoriosDoMes(clienteId: string, mes: MesRelatorio) {
  const { data: cliente } = await criarClienteAdmin()
    .from("smartads_clientes")
    .select("id, nome, email_relatorio, smartads_contas_meta(id, ativo, meta_ad_account_id)")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cliente) throw new Error("Unidade não encontrada.");
  const vistas = new Set<string>();
  const contas = ((cliente.smartads_contas_meta ?? []) as any[]).filter((c) => {
    if (c.ativo === false || vistas.has(c.meta_ad_account_id)) return false;
    vistas.add(c.meta_ad_account_id);
    return true;
  });
  const hoje = diaEmSaoPaulo(new Date().toISOString());
  const terminaDiasAtras = Math.round((new Date(`${hoje}T00:00:00Z`).getTime() - new Date(`${mes.ate}T00:00:00Z`).getTime()) / 86_400_000);
  const relatorios: DadosRelatorioAds[] = [];
  for (const c of contas) {
    relatorios.push(await gerarRelatorioAds(c.id, mes.dias, true, { terminaDiasAtras }));
  }
  const pdfs = [];
  for (const d of relatorios) {
    const doc = await montarPdfRelatorioAds(d, { rotuloPeriodo: mes.rotulo, titulo: "SmartAds · Relatório mensal" });
    pdfs.push({ nome: nomeArquivoRelatorio(d, mes.mes), conteudo: Buffer.from(doc.output("arraybuffer")) });
  }
  return { cliente, relatorios, pdfs };
}

/** Envia o relatório do mês pro e-mail cadastrado na unidade e registra o envio. */
export async function enviarRelatorioMensalDaUnidade(clienteId: string, mes: MesRelatorio): Promise<{ enviado: boolean; motivo?: string }> {
  const supabase = criarClienteAdmin();
  const { cliente, relatorios, pdfs } = await gerarRelatoriosDoMes(clienteId, mes);
  const destinatarios = emailsValidos(cliente.email_relatorio as string | null);
  if (destinatarios.length === 0) return { enviado: false, motivo: "Unidade sem e-mail de relatório cadastrado." };
  if (pdfs.length === 0) return { enviado: false, motivo: "Unidade sem conta de anúncio ativa." };

  const linhas = relatorios
    .map((d) => {
      const ig = d.instagram;
      return `<tr><td style="padding:6px 0;font-size:13px;color:#374151">${d.conta.contaNome}</td><td style="padding:6px 0;font-size:13px;text-align:right"><strong>${reais(d.totais.gasto)}</strong> investidos · ${inteiro(d.totais.alcance)} alcançados pelos anúncios${ig?.novosSeguidores != null ? ` · ${ig.novosSeguidores >= 0 ? "+" : ""}${inteiro(ig.novosSeguidores)} seguidores` : ""}</td></tr>`;
    })
    .join("");
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;margin:0 0 4px">Relatório mensal — ${cliente.nome}</h1>
  <p style="font-size:13px;color:#6b7280;margin:0 0 20px">${mes.rotulo} · o PDF completo (orgânico × tráfego, investimento, campanhas) está em anexo.</p>
  <table style="width:100%;border-collapse:collapse">${linhas}</table>
  <p style="font-size:11px;color:#9ca3af;margin-top:24px">Enviado pelo SmartAds.</p>
</body></html>`;

  let erro: string | null = null;
  try {
    await enviarEmail({ destinatario: destinatarios, assunto: `Relatório mensal ${mes.rotulo} — ${cliente.nome}`, html, anexos: pdfs });
  } catch (e) {
    erro = e instanceof Error ? e.message : "Falha ao enviar.";
  }
  await supabase.from("smartads_relatorio_mensal_envios").insert({ cliente_id: clienteId, mes: mes.mes, destinatario: destinatarios.join(", "), erro });
  if (erro) throw new Error(erro);
  return { enviado: true };
}

/** Roda pelo cron nos primeiros dias do mês: envia as unidades com e-mail cadastrado que ainda não receberam
 * o relatório do mês passado, dentro de um orçamento de tempo (o resto fica pra próxima rodada). */
export async function enviarRelatoriosMensais(limiteMs = 42_000): Promise<{ enviados: number; pendentes: number; erros: string[] }> {
  const inicio = Date.now();
  const supabase = criarClienteAdmin();
  const mes = mesDoRelatorio();
  const { data: clientes } = await supabase
    .from("smartads_clientes")
    .select("id, nome, email_relatorio")
    .eq("ativo", true)
    .not("email_relatorio", "is", null)
    .order("nome");
  const comEmail = (clientes ?? []).filter((c) => emailsValidos(c.email_relatorio).length > 0);
  const { data: jaEnviados } = await supabase
    .from("smartads_relatorio_mensal_envios")
    .select("cliente_id")
    .eq("mes", mes.mes)
    .is("erro", null);
  const feitos = new Set((jaEnviados ?? []).map((e) => e.cliente_id));
  const fila = comEmail.filter((c) => !feitos.has(c.id));
  let enviados = 0;
  const erros: string[] = [];
  for (const c of fila) {
    if (Date.now() - inicio > limiteMs) break;
    try {
      const r = await enviarRelatorioMensalDaUnidade(c.id, mes);
      if (r.enviado) enviados++;
    } catch (e) {
      erros.push(`${c.nome}: ${e instanceof Error ? e.message.slice(0, 120) : "erro"}`);
    }
  }
  return { enviados, pendentes: Math.max(fila.length - enviados - erros.length, 0), erros };
}
