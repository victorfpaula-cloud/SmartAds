import { criarClienteAdmin } from "@/lib/supabase/admin";

// v21.0 (o padrão original) já tinha passado do fim de vida — a Meta aposenta versões antigas
// com o tempo, e ficar pra trás causa exatamente o tipo de erro obscuro que apareceu publicando
// uma campanha de verdade (campos que a documentação da versão antiga não exigia, mas que a Meta
// passou a exigir de qualquer forma; instagram_actor_id, que virou instagram_user_id a partir da
// v22.0). Atualizado pra v26.0 (a mais recente em 12/09/2026) — reveja esse valor de tempos em
// tempos, a Meta costuma aposentar versões a cada ~2 anos.
export const VERSAO_API = process.env.META_API_VERSION || "v26.0";
export const BASE_URL = `https://graph.facebook.com/${VERSAO_API}`;

// Renova o token assim que faltar menos que isso pro vencimento — dá margem de sobra pro caso da
// renovação falhar numa tentativa e precisar tentar de novo na chamada seguinte, sem nunca chegar
// perto do prazo real de 60 dias.
const DIAS_ANTES_DE_RENOVAR = 10;

export class ErroMetaNaoConectado extends Error {
  constructor(motivo?: string) {
    super(motivo || "A conexão com a Meta não está ativa. Reconecte em Contas > Conectar Meta.");
    this.name = "ErroMetaNaoConectado";
  }
}

// A conexão principal vive em smartads_meta_status (id 'default') — é a que todas as contas antigas
// usam. Conexões adicionais (uma por login/portfólio da Meta) ficam em smartads_meta_conexoes, e
// smartads_contas_meta.conexao_id diz qual usar (null = a principal).
function alvoDaConexao(conexaoId?: string | null) {
  return conexaoId
    ? { tabela: "smartads_meta_conexoes" as const, coluna: "id" as const, valor: conexaoId }
    : { tabela: "smartads_meta_status" as const, coluna: "id" as const, valor: "default" };
}

/**
 * Token de usuário válido pra chamar a Graph API — busca no Supabase, renova sozinho quando está
 * perto de vencer (sem precisar de login de novo). Toda função de src/lib/meta/api.ts começa
 * chamando essa aqui. Sem `conexaoId`, usa a conexão principal.
 */
export async function obterTokenValido(conexaoId?: string | null): Promise<string> {
  const supabase = criarClienteAdmin();
  const alvo = alvoDaConexao(conexaoId);
  const { data, error } = await supabase
    .from(alvo.tabela)
    .select("access_token, token_expira_em, conectado")
    .eq(alvo.coluna, alvo.valor)
    .single();

  if (error || !data || !data.conectado || !data.access_token) {
    throw new ErroMetaNaoConectado(
      conexaoId ? "A conexão da Meta dessa conta não está ativa. Reconecte a conta em Contas." : undefined
    );
  }

  const expiraEm = data.token_expira_em ? new Date(data.token_expira_em) : null;
  const faltamDias = expiraEm ? (expiraEm.getTime() - Date.now()) / 86_400_000 : 0;

  if (expiraEm && faltamDias < 0) {
    await marcarDesconectado("O token expirou sem uma renovação automática bem-sucedida.", conexaoId);
    throw new ErroMetaNaoConectado();
  }

  if (expiraEm && faltamDias < DIAS_ANTES_DE_RENOVAR) {
    try {
      return await renovarToken(data.access_token, conexaoId);
    } catch (erro) {
      // A renovação falhou, mas o token atual ainda vale por enquanto — segue usando ele agora e
      // tenta renovar de novo na próxima chamada, em vez de quebrar a ação do usuário à toa.
      console.error("Falha ao renovar token da Meta, tentando de novo na próxima chamada:", erro);
      return data.access_token;
    }
  }

  return data.access_token;
}

async function renovarToken(tokenAtual: string, conexaoId?: string | null): Promise<string> {
  const url = new URL(`${BASE_URL}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", process.env.META_APP_ID!);
  url.searchParams.set("client_secret", process.env.META_APP_SECRET!);
  url.searchParams.set("fb_exchange_token", tokenAtual);

  const resposta = await fetch(url.toString(), { cache: "no-store" });
  const corpo = await resposta.json();

  if (!resposta.ok || !corpo.access_token) {
    throw new Error(corpo?.error?.message || "Falha ao renovar o token da Meta.");
  }

  const expiraEm = new Date(Date.now() + (corpo.expires_in ?? 60 * 86_400) * 1000);
  const supabase = criarClienteAdmin();
  const alvo = alvoDaConexao(conexaoId);
  await supabase
    .from(alvo.tabela)
    .update({
      access_token: corpo.access_token,
      token_expira_em: expiraEm.toISOString(),
      conectado: true,
      ultimo_erro: null,
      verificado_em: new Date().toISOString(),
    })
    .eq(alvo.coluna, alvo.valor);

  return corpo.access_token as string;
}

async function marcarDesconectado(motivo: string, conexaoId?: string | null) {
  const supabase = criarClienteAdmin();
  const alvo = alvoDaConexao(conexaoId);
  await supabase
    .from(alvo.tabela)
    .update({ conectado: false, ultimo_erro: motivo, verificado_em: new Date().toISOString() })
    .eq(alvo.coluna, alvo.valor);
}

/** Chamada pela rota /api/auth/meta/callback depois do login — troca o código OAuth por um token
 * de curta duração, esse por um de longa duração (60 dias), e salva tudo no Supabase.
 *
 * Com `novaConexao`, NÃO sobrescreve a conexão principal: cria uma conexão nova em
 * smartads_meta_conexoes e devolve o id dela — usado quando uma conta nova precisa do seu próprio
 * login (outro portfólio da Meta). Sem isso é o "Conectar/Reconectar Meta" de sempre. */
export async function concluirLogin(
  codigoOAuth: string,
  redirectUri: string,
  opcoes: { novaConexao?: boolean } = {}
): Promise<{ conexaoId: string | null }> {
  const urlToken = new URL(`${BASE_URL}/oauth/access_token`);
  urlToken.searchParams.set("client_id", process.env.META_APP_ID!);
  urlToken.searchParams.set("client_secret", process.env.META_APP_SECRET!);
  urlToken.searchParams.set("redirect_uri", redirectUri);
  urlToken.searchParams.set("code", codigoOAuth);

  const respostaToken = await fetch(urlToken.toString(), { cache: "no-store" });
  const corpoToken = await respostaToken.json();
  if (!respostaToken.ok || !corpoToken.access_token) {
    throw new Error(corpoToken?.error?.message || "Falha ao trocar o código de login pelo token.");
  }

  const urlLongo = new URL(`${BASE_URL}/oauth/access_token`);
  urlLongo.searchParams.set("grant_type", "fb_exchange_token");
  urlLongo.searchParams.set("client_id", process.env.META_APP_ID!);
  urlLongo.searchParams.set("client_secret", process.env.META_APP_SECRET!);
  urlLongo.searchParams.set("fb_exchange_token", corpoToken.access_token);

  const respostaLongo = await fetch(urlLongo.toString(), { cache: "no-store" });
  const corpoLongo = await respostaLongo.json();
  if (!respostaLongo.ok || !corpoLongo.access_token) {
    throw new Error(corpoLongo?.error?.message || "Falha ao gerar o token de longa duração.");
  }

  const tokenLongo = corpoLongo.access_token as string;
  const expiraEm = new Date(Date.now() + (corpoLongo.expires_in ?? 60 * 86_400) * 1000);

  const respostaEu = await fetch(`${BASE_URL}/me?fields=id,name&access_token=${tokenLongo}`, {
    cache: "no-store",
  });
  const corpoEu = await respostaEu.json();

  const supabase = criarClienteAdmin();
  const campos = {
    access_token: tokenLongo,
    token_expira_em: expiraEm.toISOString(),
    meta_user_id: corpoEu?.id ?? null,
    meta_user_nome: corpoEu?.name ?? null,
    conectado: true,
    ultimo_erro: null,
    verificado_em: new Date().toISOString(),
  };

  if (opcoes.novaConexao) {
    const { data, error } = await supabase.from("smartads_meta_conexoes").insert(campos).select("id").single();
    if (error || !data) throw new Error(error?.message || "Falha ao salvar a nova conexão.");
    return { conexaoId: data.id as string };
  }

  await supabase.from("smartads_meta_status").update(campos).eq("id", "default");
  return { conexaoId: null };
}

/** Desconecta manualmente (botão "Desconectar" nas configurações) — não revoga o token na Meta,
 * só para de usar ele; revogar de verdade é feito pelo próprio usuário nas configurações da Meta. */
export async function desconectar(): Promise<void> {
  const supabase = criarClienteAdmin();
  await supabase
    .from("smartads_meta_status")
    .update({ conectado: false, access_token: null, token_expira_em: null })
    .eq("id", "default");
}
