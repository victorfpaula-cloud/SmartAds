import { criarClienteAdmin } from "@/lib/supabase/admin";

/** Registra toda ação de escrita (criar campanha, pausar, mudar orçamento…) em
 * smartads_acoes_log — sucesso ou falha, com o erro já traduzido quando falhar. Usado pelas rotas
 * de API que chamam src/lib/meta/api.ts, não pelo wrapper em si (ele não sabe qual conta_id local
 * disparou a chamada). */
export async function registrarAcao(params: {
  contaId: string | null;
  acao: string;
  payload: Record<string, unknown>;
  sucesso: boolean;
  resultado?: unknown;
  erroMensagem?: string;
}) {
  const supabase = criarClienteAdmin();
  await supabase.from("smartads_acoes_log").insert({
    conta_id: params.contaId,
    acao: params.acao,
    payload: params.payload,
    sucesso: params.sucesso,
    resultado: params.resultado ?? null,
    erro_mensagem: params.erroMensagem ?? null,
  });
}
