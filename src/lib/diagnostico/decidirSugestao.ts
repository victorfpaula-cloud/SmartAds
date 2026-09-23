import { criarClienteAdmin } from "@/lib/supabase/admin";
import { pausarCampanha, definirOrcamentoConjunto } from "@/lib/meta/api";

export type DecisaoSugestao = "aprovar" | "rejeitar";

/** Acha uma sugestão pelo token único (ver smartads_sugestoes.token_aprovacao) — usado pelo link
 * de aprovação do e-mail semanal, que não tem sessão logada. */
export async function buscarSugestaoPorToken(token: string) {
  const supabase = criarClienteAdmin();
  const { data } = await supabase.from("smartads_sugestoes").select("id, titulo, tipo, status").eq("token_aprovacao", token).single();
  return data;
}

/** Aprova ou rejeita uma sugestão do Diagnóstico. Rejeitar só muda o status. Aprovar aplica a
 * ação de verdade quando o tipo é mecanicamente seguro (ajustar_orcamento, pausar_campanha —
 * mesmas funções que a automação por regra já usa, formato de `dados` validado antes de chamar a
 * Meta) — os outros tipos (nova_campanha, turbinar_post) ficam só "aprovados", porque exigem
 * escolher criativo/público, o dono da agência faz manualmente. Reaproveitada tanto pela rota
 * autenticada (/api/sugestoes/[id]/decidir) quanto pelo link de aprovação do e-mail semanal (que
 * autentica pelo token único, não por login). */
export async function decidirSugestao(
  sugestaoId: string,
  decisao: DecisaoSugestao
): Promise<{ ok: boolean; mensagem: string }> {
  const supabase = criarClienteAdmin();
  const { data: sugestao } = await supabase.from("smartads_sugestoes").select("*").eq("id", sugestaoId).single();

  if (!sugestao) return { ok: false, mensagem: "Sugestão não encontrada." };
  if (sugestao.status !== "pendente") {
    return { ok: false, mensagem: `Essa sugestão já foi ${sugestao.status === "aprovada" ? "aprovada" : sugestao.status === "aplicada" ? "aplicada" : "decidida"} antes.` };
  }

  if (decisao === "rejeitar") {
    await supabase
      .from("smartads_sugestoes")
      .update({ status: "rejeitada", decidido_em: new Date().toISOString() })
      .eq("id", sugestaoId);
    return { ok: true, mensagem: "Sugestão rejeitada." };
  }

  const dados = sugestao.dados as Record<string, unknown>;

  try {
    if (sugestao.tipo === "ajustar_orcamento") {
      const adsetId = dados.adsetId;
      const tipoOrcamento = dados.tipoOrcamento;
      const valorCentavos = dados.valorCentavos;
      if (
        typeof adsetId !== "string" ||
        (tipoOrcamento !== "diario" && tipoOrcamento !== "vitalicio") ||
        typeof valorCentavos !== "number"
      ) {
        throw new Error("Sugestão sem os parâmetros esperados pra ajustar orçamento automaticamente.");
      }
      await definirOrcamentoConjunto(adsetId, tipoOrcamento, valorCentavos);
    } else if (sugestao.tipo === "pausar_campanha") {
      const metaCampaignId = dados.metaCampaignId;
      if (typeof metaCampaignId !== "string") {
        throw new Error("Sugestão sem o ID da campanha pra pausar automaticamente.");
      }
      await pausarCampanha(metaCampaignId);
    }
    // nova_campanha / turbinar_post / outro: só marca aprovada, sem ação automática (ver comentário
    // da função).

    const aplicavelAutomaticamente = sugestao.tipo === "ajustar_orcamento" || sugestao.tipo === "pausar_campanha";
    await supabase
      .from("smartads_sugestoes")
      .update({
        status: aplicavelAutomaticamente ? "aplicada" : "aprovada",
        decidido_em: new Date().toISOString(),
      })
      .eq("id", sugestaoId);

    return {
      ok: true,
      mensagem: aplicavelAutomaticamente ? "Sugestão aprovada e aplicada na Meta." : "Sugestão aprovada — crie a campanha manualmente quando puder.",
    };
  } catch (erro) {
    await supabase
      .from("smartads_sugestoes")
      .update({ status: "erro", decidido_em: new Date().toISOString() })
      .eq("id", sugestaoId);
    return {
      ok: false,
      mensagem: erro instanceof Error ? erro.message : "Falha ao aplicar a sugestão.",
    };
  }
}
