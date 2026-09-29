import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BASE_URL, obterTokenValido } from "@/lib/meta/token";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Rota TEMPORÁRIA: mostra o que a Meta realmente devolve pro token do SmartAds sobre as Páginas e
// os Instagram — pra descobrir por que o Instagram do Bar do Rode não aparece no seletor, mesmo
// funcionando no agendador. Dispara pelo botão "Run" do Vercel (Cron Jobs), não fica agendada.
// Nunca grava token: só IDs, nomes e o que cada consulta devolveu. Remover depois de usar.

async function consultar(caminho: string, token: string, query: Record<string, string> = {}) {
  const url = new URL(`${BASE_URL}/${caminho}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  try {
    const resposta = await fetch(url.toString(), { cache: "no-store" });
    const json = await resposta.json().catch(() => ({}));
    return json;
  } catch (e) {
    return { erro_rede: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(request: NextRequest) {
  const segredoEsperado = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");
  if (!segredoEsperado || autorizacao !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const supabase = criarClienteAdmin();
  const resultado: Record<string, unknown> = {};

  try {
    const token = await obterTokenValido(null);
    const tokenApp = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;

    // O que o token realmente carrega: permissões e alvos concedidos no login (granular_scopes).
    const debug = await consultar("debug_token", tokenApp, { input_token: token });
    resultado.debug_token = debug?.data
      ? { scopes: debug.data.scopes, granular_scopes: debug.data.granular_scopes, type: debug.data.type }
      : debug;
    resultado.permissoes = await consultar("me/permissions", token);

    // Todas as Páginas que o token enxerga, e o que cada uma diz sobre Instagram.
    const paginas = await consultar("me/accounts", token, {
      fields: "id,name,tasks,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}",
      limit: "500",
    });
    resultado.total_paginas = paginas?.data?.length ?? null;
    resultado.erro_paginas = paginas?.error ?? null;

    const lista: unknown[] = [];
    for (const p of paginas?.data ?? []) {
      const item: Record<string, unknown> = {
        id: p.id,
        name: p.name,
        tasks: p.tasks,
        temTokenDaPagina: Boolean(p.access_token),
        ig_usuario_business: p.instagram_business_account ?? null,
        ig_usuario_connected: p.connected_instagram_account ?? null,
      };
      // Reconsulta com o token da própria Página — o que o agendador faz — só pras que vieram sem IG.
      if (p.access_token && !p.instagram_business_account && !p.connected_instagram_account) {
        item.ig_token_pagina = await consultar(p.id, p.access_token, {
          fields: "instagram_business_account{id,username},connected_instagram_account{id,username}",
        });
        item.instagram_accounts_edge = await consultar(`${p.id}/instagram_accounts`, p.access_token, {
          fields: "id,username",
        });
      }
      lista.push(item);
    }
    resultado.paginas = lista;

    // Ativos do portfólio (business) que o token enxerga.
    const negocios = await consultar("me/businesses", token, { fields: "id,name", limit: "50" });
    resultado.negocios = negocios?.data ?? negocios;
    const porNegocio: unknown[] = [];
    for (const n of negocios?.data ?? []) {
      porNegocio.push({
        id: n.id,
        name: n.name,
        instagram_proprios: (await consultar(`${n.id}/owned_instagram_accounts`, token, { fields: "id,username", limit: "100" })).data ?? null,
        instagram_de_clientes: (await consultar(`${n.id}/instagram_business_accounts`, token, { fields: "id,username", limit: "100" })).data ?? null,
        paginas_proprias: ((await consultar(`${n.id}/owned_pages`, token, { fields: "id,name", limit: "100" })).data ?? []).map((x: { id: string; name: string }) => `${x.name} (${x.id})`),
        paginas_de_clientes: ((await consultar(`${n.id}/client_pages`, token, { fields: "id,name", limit: "100" })).data ?? []).map((x: { id: string; name: string }) => `${x.name} (${x.id})`),
      });
    }
    resultado.por_negocio = porNegocio;
  } catch (e) {
    resultado.erro_geral = e instanceof Error ? e.message : String(e);
  }

  await supabase.from("smartads_meta_diagnostico").insert({ resultado });
  return NextResponse.json({ ok: true });
}
