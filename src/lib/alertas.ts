import { criarClienteAdmin } from "@/lib/supabase/admin";
import { coletarFinanceiro, unicasPorContaDeAnuncio, type ContaFinanceiro } from "@/lib/financeiro/coletarFinanceiro";
import { descreverSituacaoConta } from "@/lib/financeiro/situacaoConta";
import { calcularPrevisaoSaldo } from "@/lib/financeiro/previsaoSaldo";
import { diaEmSaoPaulo } from "@/lib/tempoSaoPaulo";

export type SeveridadeAlerta = "critico" | "atencao" | "info";
export type CategoriaAlerta = "saldo" | "conta" | "boost" | "dados" | "investimento" | "posts" | "campanhas" | "desempenho" | "conexao";

export interface Alerta {
  id: string;
  severidade: SeveridadeAlerta;
  categoria: CategoriaAlerta;
  unidade: string;
  titulo: string;
  detalhe: string;
  /** Tela do app onde resolver. */
  href: string;
}

export const ROTULO_CATEGORIA: Record<CategoriaAlerta, string> = {
  saldo: "Saldo",
  conta: "Conta na Meta",
  boost: "Boost",
  dados: "Dados",
  investimento: "Investimento do mês",
  posts: "Postagens",
  campanhas: "Campanhas",
  desempenho: "Desempenho",
  conexao: "Conexão com a Meta",
};

const reais = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const ORDEM: Record<SeveridadeAlerta, number> = { critico: 0, atencao: 1, info: 2 };

/** Tudo que pede atenção numa rede, a partir do que o app já guarda (cache do Financeiro, log do
 * boost, cache do Radar) — nunca chama a Meta. Cada alerta diz quem, o quê e onde resolver. */
export async function gerarAlertas(empresaId: string, agora = new Date()): Promise<Alerta[]> {
  const supabase = criarClienteAdmin();
  const hoje = diaEmSaoPaulo(agora.toISOString());
  const mes = hoje.slice(0, 7);
  const diaDoMes = Number(hoje.slice(8, 10));
  const alertas: Alerta[] = [];

  const contas = unicasPorContaDeAnuncio(await coletarFinanceiro(empresaId));
  const porId = new Map(contas.map((c) => [c.contaId, c]));
  const add = (a: Omit<Alerta, "id">, c: ContaFinanceiro) =>
    alertas.push({ ...a, id: `${a.categoria}:${c.contaId}:${a.titulo}`, unidade: a.unidade || c.clienteNome });

  for (const c of contas) {
    const u = c.clienteNome;

    // Leitura do Financeiro
    if (c.erro) {
      add({ severidade: "atencao", categoria: "dados", unidade: u, titulo: "Sem leitura financeira", detalhe: c.erro.slice(0, 160), href: "/financeiro" }, c);
      continue;
    }
    if (c.atualizadoEm && agora.getTime() - new Date(c.atualizadoEm).getTime() > 36 * 3_600_000) {
      add({ severidade: "atencao", categoria: "dados", unidade: u, titulo: "Dados financeiros desatualizados", detalhe: "A última atualização tem mais de 36 horas.", href: "/financeiro" }, c);
    }

    // Situação da conta na Meta
    const st = descreverSituacaoConta(c.statusConta, c.motivoDesativacao);
    if (st.tom === "critico" || st.tom === "atencao") {
      add({ severidade: st.tom === "critico" ? "critico" : "atencao", categoria: "conta", unidade: u, titulo: st.texto, detalhe: st.detalhe ?? "A conta de anúncios precisa de atenção na Meta.", href: "/financeiro" }, c);
    }

    // Saldo (só faz sentido em conta pré-paga ou com saldo informado)
    const prev = calcularPrevisaoSaldo(c.saldoDisponivelCentavos, c.mediaDiariaCentavos, agora, c.contaPrePaga);
    if (c.saldoDisponivelCentavos !== null && c.saldoDisponivelCentavos <= 0 && c.mediaDiariaCentavos > 0) {
      add({ severidade: "critico", categoria: "saldo", unidade: u, titulo: "Sem saldo — anúncios parados", detalhe: "A conta estava gastando e o saldo zerou. Adicione crédito pra voltar a veicular.", href: "/financeiro" }, c);
    } else if (prev.dias !== null && prev.dias <= 3) {
      add({ severidade: "critico", categoria: "saldo", unidade: u, titulo: `Saldo acaba em ${prev.dias < 1 ? "menos de 1 dia" : `${prev.dias} dia${prev.dias !== 1 ? "s" : ""}`}`, detalhe: `Saldo ${reais(c.saldoDisponivelCentavos ?? 0)} no ritmo de ${reais(c.mediaDiariaCentavos)}/dia.`, href: "/financeiro" }, c);
    } else if (prev.dias !== null && prev.dias <= 7) {
      add({ severidade: "atencao", categoria: "saldo", unidade: u, titulo: `Saldo acaba em ${prev.dias} dias`, detalhe: `Saldo ${reais(c.saldoDisponivelCentavos ?? 0)} no ritmo de ${reais(c.mediaDiariaCentavos)}/dia (até ${prev.detalhe?.replace("até ", "") ?? "—"}).`, href: "/financeiro" }, c);
    }
    if (c.contaPrePaga === true && c.saldoDisponivelCentavos === null) {
      add({ severidade: "info", categoria: "saldo", unidade: u, titulo: "Saldo não lido", detalhe: "A Meta não mostrou o saldo dessa conta pré-paga; digite o valor do Gerenciador no Financeiro.", href: "/financeiro" }, c);
    }

    // Boost ligado em conta sem saldo
    if (c.boostAutomaticoAtivo && c.saldoDisponivelCentavos !== null && c.saldoDisponivelCentavos <= 0 && c.contaPrePaga !== false) {
      add({ severidade: "atencao", categoria: "boost", unidade: u, titulo: "Boost ligado, mas a conta está sem saldo", detalhe: "Os boosts novos não vão veicular até entrar crédito.", href: "/boost" }, c);
    }

    // Não investiu no mês: sem recarga e sem gasto
    const semRecarga = (c.recargaMesCentavos ?? 0) === 0;
    const semGasto = (c.gastoMesCentavos ?? 0) === 0;
    if (semRecarga && semGasto && c.gastoMesCentavos !== null && diaDoMes >= 10) {
      add({
        severidade: diaDoMes >= 20 ? "atencao" : "info",
        categoria: "investimento",
        unidade: u,
        titulo: "Ainda não investiu neste mês",
        detalhe: "Nenhuma recarga nem gasto em anúncios neste mês até agora.",
        href: "/financeiro/investimentos",
      }, c);
    }
  }

  // Boost: falhas nos últimos 3 dias (só contas com o boost ligado)
  const ativas = contas.filter((c) => c.boostAutomaticoAtivo).map((c) => c.contaId);
  if (ativas.length > 0) {
    const desde = new Date(agora.getTime() - 3 * 86_400_000).toISOString();
    const { data: falhas } = await supabase
      .from("smartads_boost_automatico_log")
      .select("conta_id, erro_mensagem, created_at")
      .in("conta_id", ativas)
      .eq("sucesso", false)
      .gte("created_at", desde)
      .order("created_at", { ascending: false });
    const vistas = new Set<string>();
    for (const f of falhas ?? []) {
      if (vistas.has(f.conta_id)) continue;
      vistas.add(f.conta_id);
      const c = porId.get(f.conta_id);
      if (!c) continue;
      add({ severidade: "atencao", categoria: "boost", unidade: c.clienteNome, titulo: "Boost falhou nos últimos dias", detalhe: String(f.erro_mensagem ?? "Erro ao criar a campanha.").slice(0, 160), href: "/boost" }, c);
    }
  }

  // Postagens paradas (último post do Radar, só com cache recente)
  const idsComIg = contas.map((c) => c.contaId);
  const { data: radar } = await supabase
    .from("smartads_relatorio_postagens_cache")
    .select("conta_id, dia_calculado, ultimo_post_dia")
    .in("conta_id", idsComIg)
    .gte("dia_calculado", diaEmSaoPaulo(new Date(agora.getTime() - 3 * 86_400_000).toISOString()));
  for (const r of radar ?? []) {
    const c = porId.get(r.conta_id);
    if (!c || !r.ultimo_post_dia) continue;
    const dias = Math.round((new Date(`${hoje}T00:00:00Z`).getTime() - new Date(`${r.ultimo_post_dia}T00:00:00Z`).getTime()) / 86_400_000);
    if (dias >= 5) {
      add({ severidade: dias >= 10 ? "atencao" : "info", categoria: "posts", unidade: c.clienteNome, titulo: `Sem postar há ${dias} dias`, detalhe: "Último post no Instagram em " + r.ultimo_post_dia.split("-").reverse().join("/") + ".", href: "/estrategias/postagens" }, c);
    }
  }

  // Campanhas ativas: terminando em breve e ativas sem gastar (do cache das campanhas da rede, 2x/dia)
  const { data: ativasCache } = await supabase
    .from("smartads_campanhas_rede_cache")
    .select("conta_id, nome, fim_em")
    .in("conta_id", idsComIg);
  const agoraMs = agora.getTime();
  const porContaCamp = new Map<string, Array<{ nome: string; fim_em: string | null }>>();
  for (const l of ativasCache ?? []) porContaCamp.set(l.conta_id, [...(porContaCamp.get(l.conta_id) ?? []), l]);
  for (const [contaId, lista] of porContaCamp) {
    const c = porId.get(contaId);
    if (!c) continue;
    const terminando = lista
      .filter((x) => x.fim_em && new Date(x.fim_em).getTime() > agoraMs && new Date(x.fim_em).getTime() - agoraMs <= 2 * 86_400_000)
      .sort((a, b) => (a.fim_em ?? "").localeCompare(b.fim_em ?? ""));
    if (terminando.length > 0) {
      const quando = (iso: string) => {
        const h = (new Date(iso).getTime() - agoraMs) / 3_600_000;
        return h < 24 ? "em menos de 1 dia" : `em ${Math.round(h / 24)} dias`;
      };
      add({
        severidade: "atencao", categoria: "campanhas", unidade: c.clienteNome,
        titulo: `${terminando.length} campanha${terminando.length !== 1 ? "s" : ""} terminando`,
        detalhe: terminando.slice(0, 3).map((x) => `${x.nome.replace(/^🤖\s*/, "")} (${quando(x.fim_em as string)})`).join("; "),
        href: `/campanhas/conta/${c.contaId}`,
      }, c);
    }
    const semSaldo = c.saldoDisponivelCentavos !== null && c.saldoDisponivelCentavos <= 0 && c.contaPrePaga !== false;
    if (!c.erro && !semSaldo && c.mediaDiariaCentavos === 0 && c.gasto7diasCentavos === 0 && c.statusConta === 1) {
      add({ severidade: "atencao", categoria: "campanhas", unidade: c.clienteNome, titulo: "Campanhas ativas, mas sem gasto há 7 dias", detalhe: `${lista.length} campanha${lista.length !== 1 ? "s" : ""} ativa${lista.length !== 1 ? "s" : ""} sem entregar — pode ser anúncio reprovado, público pequeno ou orçamento zerado.`, href: `/campanhas/conta/${c.contaId}` }, c);
    }
  }

  // Queda forte de alcance do Instagram: última semana contra a semana anterior (Saúde da rede)
  const { data: semanas } = await supabase
    .from("smartads_saude_rede_cache")
    .select("conta_id, dias, dados, calculado_em")
    .in("conta_id", idsComIg)
    .in("dias", [7, 1007])
    .not("dados", "is", null);
  const alcancePorConta = new Map<string, { atual?: number; anterior?: number; recente: boolean }>();
  for (const l of semanas ?? []) {
    const alc = (l.dados as any)?.instagram?.alcance;
    if (typeof alc !== "number") continue;
    const x = alcancePorConta.get(l.conta_id) ?? { recente: true };
    if (l.dias === 7) x.atual = alc; else x.anterior = alc;
    if (agoraMs - new Date(l.calculado_em).getTime() > 4 * 86_400_000) x.recente = false;
    alcancePorConta.set(l.conta_id, x);
  }
  for (const [contaId, x] of alcancePorConta) {
    const c = porId.get(contaId);
    if (!c || !x.recente || x.atual === undefined || x.anterior === undefined || x.anterior < 1000) continue;
    const queda = ((x.anterior - x.atual) / x.anterior) * 100;
    if (queda >= 40) {
      add({ severidade: "atencao", categoria: "desempenho", unidade: c.clienteNome, titulo: `Alcance caiu ${Math.round(queda)}% na semana`, detalhe: `${x.atual.toLocaleString("pt-BR")} contra ${x.anterior.toLocaleString("pt-BR")} na semana anterior (Instagram, orgânico + tráfego).`, href: "/estrategias/saude-rede?dias=7" }, c);
    }
  }

  void mes;
  return alertas.sort((a, b) => ORDEM[a.severidade] - ORDEM[b.severidade] || a.unidade.localeCompare(b.unidade));
}

/** HTML simples (e-mail) com os alertas agrupados por gravidade. */
export function alertasEmHtml(alertas: Alerta[], titulo = "Alertas da rede"): string {
  if (alertas.length === 0) return "";
  const cor = { critico: "#b91c1c", atencao: "#b45309", info: "#475569" } as const;
  const rotulo = { critico: "Urgente", atencao: "Atenção", info: "Para ficar de olho" } as const;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const grupos = (["critico", "atencao", "info"] as const)
    .map((sev) => {
      const itens = alertas.filter((a) => a.severidade === sev);
      if (itens.length === 0) return "";
      return `<h3 style="font-size:13px;margin:14px 0 6px;color:${cor[sev]}">${rotulo[sev]} (${itens.length})</h3><ul style="margin:0;padding-left:18px;font-size:13px;color:#1f2937">${itens
        .map((a) => `<li style="margin-bottom:4px"><strong>${a.unidade}</strong> — ${a.titulo}. <span style="color:#6b7280">${a.detalhe}</span> <a href="${base}${a.href}" style="color:#2563eb">abrir</a></li>`)
        .join("")}</ul>`;
    })
    .join("");
  return `<div style="margin-bottom:28px;padding:16px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0"><h2 style="font-size:15px;margin:0 0 4px">${titulo}</h2>${grupos}</div>`;
}

/** Conexões com a Meta (login que dá acesso às contas): caída ou perto de vencer. Separado porque a
 * conexão é da agência inteira, não de uma empresa — vale mostrar/enviar uma vez só. */
export async function gerarAlertasConexao(agora = new Date()): Promise<Alerta[]> {
  const { data } = await criarClienteAdmin()
    .from("smartads_meta_conexoes")
    .select("id, meta_user_nome, conectado, token_expira_em, ultimo_erro");
  const alertas: Alerta[] = [];
  for (const c of data ?? []) {
    const nome = c.meta_user_nome ?? "Login da Meta";
    if (!c.conectado) {
      alertas.push({ id: `conexao:${c.id}:caiu`, severidade: "critico", categoria: "conexao", unidade: nome, titulo: "Conexão com a Meta desconectada", detalhe: (c.ultimo_erro ?? "Reconecte em Contas e conexões pra voltar a ler e criar campanhas.").toString().slice(0, 160), href: "/contas" });
      continue;
    }
    if (c.token_expira_em) {
      const dias = (new Date(c.token_expira_em).getTime() - agora.getTime()) / 86_400_000;
      if (dias < 7) {
        alertas.push({ id: `conexao:${c.id}:vence`, severidade: dias < 3 ? "critico" : "atencao", categoria: "conexao", unidade: nome, titulo: dias <= 0 ? "Acesso à Meta venceu" : `Acesso à Meta vence em ${Math.ceil(dias)} dia${Math.ceil(dias) !== 1 ? "s" : ""}`, detalhe: "O app renova sozinho quando consegue; se não renovar, reconecte em Contas e conexões.", href: "/contas" });
      }
    }
  }
  return alertas;
}
