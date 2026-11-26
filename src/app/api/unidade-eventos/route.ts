import { NextResponse, type NextRequest } from "next/server";
import { lerAmbiente } from "@/lib/ambiente";
import { lerAcesso } from "@/lib/acesso";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { listarEventosDasContas } from "@/lib/unidadeEventos";

export const dynamic = "force-dynamic";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** A conta precisa existir e ser de uma unidade da franquia aberta. */
async function contaDoAmbiente(contaId: string): Promise<boolean> {
  const ambiente = await lerAmbiente();
  if (!ambiente) return false;
  const { data } = await criarClienteAdmin()
    .from("smartads_contas_meta")
    .select("id, smartads_clientes!inner(empresa_id)")
    .eq("id", contaId)
    .maybeSingle();
  const cliente = (Array.isArray(data?.smartads_clientes) ? data?.smartads_clientes[0] : data?.smartads_clientes) as
    | { empresa_id: string | null }
    | undefined;
  return cliente?.empresa_id === ambiente.id;
}

/** Eventos de uma unidade (GET ?contaId=&desde=&ate=, ou só ?contaId= pra todos). */
export async function GET(request: NextRequest) {
  const contaId = request.nextUrl.searchParams.get("contaId");
  if (!contaId) return NextResponse.json({ erro: "Escolha a unidade." }, { status: 400 });
  if (!(await contaDoAmbiente(contaId))) return NextResponse.json({ erro: "Unidade não encontrada." }, { status: 404 });
  const desde = request.nextUrl.searchParams.get("desde") ?? "1900-01-01";
  const ate = request.nextUrl.searchParams.get("ate") ?? "2999-12-31";
  try {
    return NextResponse.json({ eventos: await listarEventosDasContas([contaId], desde, ate) });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao ler os eventos." }, { status: 500 });
  }
}

/** Registra um evento na unidade (POST { contaId, data, texto }). Só quem pode editar. */
export async function POST(request: NextRequest) {
  const acesso = await lerAcesso();
  if (acesso.restrito) return NextResponse.json({ erro: "Sem permissão pra registrar eventos." }, { status: 403 });
  const corpo = await request.json().catch(() => null);
  const contaId = corpo?.contaId as string | undefined;
  const data = corpo?.data as string | undefined;
  const texto = (corpo?.texto as string | undefined)?.trim();
  if (!contaId || !data || !DATA.test(data) || !texto) {
    return NextResponse.json({ erro: "Informe a data e o texto do evento." }, { status: 400 });
  }
  if (texto.length > 1000) return NextResponse.json({ erro: "O texto tem no máximo 1000 caracteres." }, { status: 400 });
  if (!(await contaDoAmbiente(contaId))) return NextResponse.json({ erro: "Unidade não encontrada." }, { status: 404 });
  const { data: linha, error } = await criarClienteAdmin()
    .from("smartads_unidade_eventos")
    .insert({ conta_id: contaId, data, texto })
    .select("id, conta_id, data, texto")
    .single();
  if (error || !linha) return NextResponse.json({ erro: "Não consegui salvar o evento." }, { status: 500 });
  return NextResponse.json({ evento: { id: linha.id, contaId: linha.conta_id, data: linha.data, texto: linha.texto } });
}

/** Apaga um evento (DELETE ?id=). Só quem pode editar, e só de unidade da franquia aberta. */
export async function DELETE(request: NextRequest) {
  const acesso = await lerAcesso();
  if (acesso.restrito) return NextResponse.json({ erro: "Sem permissão pra apagar eventos." }, { status: 403 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "Informe o evento." }, { status: 400 });
  const supabase = criarClienteAdmin();
  const { data: evento } = await supabase.from("smartads_unidade_eventos").select("conta_id").eq("id", id).maybeSingle();
  if (!evento || !(await contaDoAmbiente(evento.conta_id as string))) {
    return NextResponse.json({ erro: "Evento não encontrado." }, { status: 404 });
  }
  const { error } = await supabase.from("smartads_unidade_eventos").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: "Não consegui apagar o evento." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
