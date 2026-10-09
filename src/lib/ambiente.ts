import { cookies } from "next/headers";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const COOKIE_AMBIENTE = "smartads_ambiente";

export interface Ambiente {
  id: string;
  nome: string;
  tipo: "franquia" | "individual";
}

/** Ambiente em que a pessoa entrou pelo card do Início (uma franquia ou uma conta única). Fica num
 * cookie; sem ele, o app está na visão geral de todas as contas. */
export async function lerAmbiente(): Promise<Ambiente | null> {
  const id = (await cookies()).get(COOKIE_AMBIENTE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await criarClienteAdmin().from("smartads_empresas").select("id, nome, tipo").eq("id", id).maybeSingle();
  return data ? { id: data.id, nome: data.nome, tipo: data.tipo === "franquia" ? "franquia" : "individual" } : null;
}

/** Empresa a usar numa página: o parâmetro explícito da URL ou, na falta dele, o ambiente aberto. */
export async function empresaDaPagina(paramEmpresa?: string): Promise<string | undefined> {
  return paramEmpresa || (await lerAmbiente())?.id;
}
