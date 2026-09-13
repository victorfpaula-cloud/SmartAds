import { criarClienteAdmin } from "@/lib/supabase/admin";

/** Registra toda ação autônoma tomada (regra, teste A/B, piloto automático) — é o que vira "o
 * aviso do que foi feito" na tela, e o histórico auditável que evita o problema mais reclamado
 * nas ferramentas do mercado (regra que dispara e ninguém percebe, ou que devia disparar e não
 * disparou sem ninguém saber). Nunca lança erro — se o log falhar, a ação em si já aconteceu (ou
 * já foi registrado o erro dela), não vale derrubar o resto da execução por causa do log. */
export async function registrarExecucao(params: {
  tipo: "regra" | "teste_ab" | "piloto_automatico";
  regraId?: string;
  campanhaId?: string;
  descricao: string;
  dados?: Record<string, unknown>;
  sucesso: boolean;
  erroMensagem?: string;
}) {
  const supabase = criarClienteAdmin();
  await supabase.from("smartads_execucoes_automacao").insert({
    tipo: params.tipo,
    regra_id: params.regraId ?? null,
    campanha_id: params.campanhaId ?? null,
    descricao: params.descricao,
    dados: params.dados ?? null,
    sucesso: params.sucesso,
    erro_mensagem: params.erroMensagem ?? null,
  }).then(
    () => {},
    () => {} // log é best-effort — não deixa um problema no banco esconder o resultado real da ação
  );
}
