import { NextResponse, type NextRequest } from "next/server";
import { lerAcesso } from "@/lib/acesso";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function alvoRestrito(id: string) {
  const acesso = await lerAcesso();
  if (acesso.restrito || !acesso.email) return { erro: NextResponse.json({ erro: "Sem permissão." }, { status: 403 }) };
  const { data } = await criarClienteAdmin().auth.admin.getUserById(id);
  // Só mexe em usuário restrito: o administrador não se edita nem se apaga por aqui.
  if (!data.user || data.user.app_metadata?.papel !== "restrito")
    return { erro: NextResponse.json({ erro: "Usuário restrito não encontrado." }, { status: 404 }) };
  return { user: data.user };
}

/** Altera empresas liberadas, permissão de edição, nome, senha ou bloqueio do usuário. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alvo = await alvoRestrito(id);
  if (alvo.erro) return alvo.erro;
  const corpo = await request.json().catch(() => ({}));
  const db = criarClienteAdmin();
  const meta = { ...(alvo.user.app_metadata as Record<string, unknown>) };
  const mudancas: Record<string, unknown> = {};

  if (corpo.empresas !== undefined) {
    const pedidas: string[] = Array.isArray(corpo.empresas) ? corpo.empresas.filter((e: unknown) => typeof e === "string") : [];
    const { data } = pedidas.length ? await db.from("smartads_empresas").select("id").in("id", pedidas) : { data: [] };
    const validas = (data ?? []).map((e) => e.id as string);
    if (validas.length === 0) return NextResponse.json({ erro: "Escolha pelo menos uma empresa." }, { status: 400 });
    meta.empresas = validas;
  }
  if (corpo.podeEditar !== undefined) meta.pode_editar = corpo.podeEditar === true;
  mudancas.app_metadata = meta;
  if (typeof corpo.nome === "string") mudancas.user_metadata = { ...alvo.user.user_metadata, nome: corpo.nome.trim() };
  if (typeof corpo.senha === "string" && corpo.senha) {
    if (corpo.senha.length < 8) return NextResponse.json({ erro: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
    mudancas.password = corpo.senha;
  }
  if (corpo.bloqueado !== undefined) mudancas.ban_duration = corpo.bloqueado === true ? "876000h" : "none";

  const { error } = await db.auth.admin.updateUserById(id, mudancas);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alvo = await alvoRestrito(id);
  if (alvo.erro) return alvo.erro;
  const { error } = await criarClienteAdmin().auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
