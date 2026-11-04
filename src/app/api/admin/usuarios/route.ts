import { NextResponse, type NextRequest } from "next/server";
import { lerAcesso } from "@/lib/acesso";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Só o administrador (login sem papel restrito) gerencia usuários. */
async function exigirAdmin(): Promise<NextResponse | null> {
  const acesso = await lerAcesso();
  return acesso.restrito || !acesso.email ? NextResponse.json({ erro: "Sem permissão." }, { status: 403 }) : null;
}

async function empresasValidas(ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids)) return [];
  const pedidas = ids.filter((i): i is string => typeof i === "string");
  if (pedidas.length === 0) return [];
  const { data } = await criarClienteAdmin().from("smartads_empresas").select("id").in("id", pedidas);
  return (data ?? []).map((e) => e.id as string);
}

export async function GET() {
  const negado = await exigirAdmin();
  if (negado) return negado;
  const { data, error } = await criarClienteAdmin().auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const usuarios = data.users.map((u) => {
    const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
    return {
      id: u.id,
      email: u.email ?? "",
      nome: typeof u.user_metadata?.nome === "string" ? (u.user_metadata.nome as string) : "",
      restrito: meta.papel === "restrito",
      empresas: Array.isArray(meta.empresas) ? (meta.empresas as string[]) : [],
      podeEditar: meta.pode_editar === true,
      bloqueado: !!u.banned_until && new Date(u.banned_until).getTime() > Date.now(),
      ultimoAcesso: u.last_sign_in_at ?? null,
    };
  });
  return NextResponse.json({ usuarios });
}

/** Cria um usuário restrito: e-mail + senha provisória + empresas liberadas. */
export async function POST(request: NextRequest) {
  const negado = await exigirAdmin();
  if (negado) return negado;
  const corpo = await request.json().catch(() => ({}));
  const email = String(corpo.email ?? "").trim().toLowerCase();
  const senha = String(corpo.senha ?? "");
  const nome = String(corpo.nome ?? "").trim();
  const empresas = await empresasValidas(corpo.empresas);
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ erro: "E-mail inválido." }, { status: 400 });
  if (senha.length < 8) return NextResponse.json({ erro: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
  if (empresas.length === 0) return NextResponse.json({ erro: "Escolha pelo menos uma empresa." }, { status: 400 });

  const { data, error } = await criarClienteAdmin().auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
    app_metadata: { papel: "restrito", empresas, pode_editar: corpo.podeEditar === true },
  });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ id: data.user.id });
}
