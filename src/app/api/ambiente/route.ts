import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_AMBIENTE } from "@/lib/ambiente";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function destinoSeguro(ir: string | null, padrao: string): string {
  return ir && ir.startsWith("/") && !ir.startsWith("//") ? ir : padrao;
}

/** Entra num ambiente (?empresa=ID) ou volta à visão geral (?limpar=1) e segue pra `ir`. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const base = request.nextUrl.origin;

  if (p.get("limpar")) {
    const resposta = NextResponse.redirect(new URL(destinoSeguro(p.get("ir"), "/"), base));
    resposta.cookies.delete(COOKIE_AMBIENTE);
    return resposta;
  }

  const empresaId = p.get("empresa");
  const { data: empresa } = empresaId
    ? await criarClienteAdmin().from("smartads_empresas").select("id, tipo").eq("id", empresaId).maybeSingle()
    : { data: null };
  if (!empresa) return NextResponse.redirect(new URL("/", base));

  const padrao = empresa.tipo === "franquia" ? "/estrategias" : `/central/${empresa.id}`;
  const resposta = NextResponse.redirect(new URL(destinoSeguro(p.get("ir"), padrao), base));
  resposta.cookies.set(COOKIE_AMBIENTE, empresa.id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return resposta;
}
