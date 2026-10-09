import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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

/** Empresa a usar numa página: o ambiente aberto manda (nunca dá pra escapar dele por parâmetro); o
 * parâmetro da URL só vale na visão geral, sem ambiente. */
export async function empresaDaPagina(paramEmpresa?: string): Promise<string | undefined> {
  return (await lerAmbiente())?.id ?? (paramEmpresa || undefined);
}

/** Tela que só existe dentro de um ambiente (e, se `tipo` vier, de um tipo específico). Sem ambiente
 * volta pro Início; com o tipo errado leva pro começo do ambiente certo — assim nunca aparece tela de
 * franquia dentro de conta única (nem lista de outras empresas dentro de um ambiente). */
export async function exigirAmbiente(tipo?: Ambiente["tipo"]): Promise<Ambiente> {
  const ambiente = await lerAmbiente();
  if (!ambiente) redirect("/");
  if (tipo && ambiente.tipo !== tipo) {
    redirect(ambiente.tipo === "franquia" ? "/estrategias" : `/central/${ambiente.id}`);
  }
  return ambiente;
}
