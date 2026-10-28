import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Cadastra (ou limpa) o e-mail que recebe o relatório mensal em PDF da unidade — até 3, separados por vírgula. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpo = await request.json().catch(() => null);
  const bruto = typeof corpo?.emailRelatorio === "string" ? corpo.emailRelatorio.trim() : "";
  const emails: string[] = bruto ? bruto.split(/[,;\s]+/).filter(Boolean) : [];
  if (emails.length > 3 || emails.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) {
    return NextResponse.json({ erro: "E-mail inválido (até 3, separados por vírgula)." }, { status: 400 });
  }
  const { error } = await criarClienteAdmin()
    .from("smartads_clientes")
    .update({ email_relatorio: emails.length ? emails.join(", ") : null })
    .eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, emailRelatorio: emails.length ? emails.join(", ") : null });
}
