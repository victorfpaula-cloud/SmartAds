import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterResumoPorUnidade } from "@/lib/campanhasRede";
import { calcularPrevisaoSaldo } from "@/lib/financeiro/previsaoSaldo";

export interface EmpresaInicio {
  id: string;
  nome: string;
  tipo: "individual" | "franquia";
  contas: number;
  campanhasNoAr: number;
  /** Campanhas "ativas" na Meta em contas pré-pagas sem saldo — não estão entregando. */
  campanhasSemSaldo: number;
  gastoMesCentavos: number | null;
  boostsNoAr: number;
  boostsComErro: number;
  saldoAcabando: number;
  contasSemDados: number;
  /** Onde o card leva: a Central da rede (franquia) ou a Central da empresa (individual). */
  href: string;
}

/** Tudo que o Início mostra, só do banco (caches do cron + log do boost) — nenhuma chamada à Meta e
 * nenhuma requisição por conta depois que a página abre. É isso que deixa o Início rápido. */
export async function obterEmpresasParaInicio(): Promise<EmpresaInicio[]> {
  const supabase = criarClienteAdmin();
  const [{ data: empresas }, { unidades }, { data: financeiro }] = await Promise.all([
    supabase.from("smartads_empresas").select("id, nome, tipo").order("nome"),
    obterResumoPorUnidade({ apenasFranquia: false }),
    supabase.from("smartads_financeiro_cache").select("conta_id, saldo_disponivel_centavos, media_diaria_centavos"),
  ]);

  const financeiroPorConta = new Map((financeiro ?? []).map((f) => [f.conta_id, f]));

  return ((empresas ?? []) as Array<{ id: string; nome: string; tipo: "individual" | "franquia" }>).map((empresa) => {
    const daEmpresa = unidades.filter((u) => u.empresaId === empresa.id);
    const soma = (f: (u: (typeof daEmpresa)[number]) => number) => daEmpresa.reduce((t, u) => t + f(u), 0);
    const algumGasto = daEmpresa.some((u) => u.gastoMesCentavos !== null);

    return {
      id: empresa.id,
      nome: empresa.nome,
      tipo: empresa.tipo,
      contas: daEmpresa.length,
      campanhasNoAr: soma((u) => (u.semSaldo ? 0 : u.campanhasAtivas ?? 0)),
      campanhasSemSaldo: soma((u) => (u.semSaldo ? u.campanhasAtivas ?? 0 : 0)),
      gastoMesCentavos: algumGasto ? soma((u) => u.gastoMesCentavos ?? 0) : null,
      boostsNoAr: soma((u) => (u.boost.ativo && !u.semSaldo ? u.boost.noAr : 0)),
      boostsComErro: daEmpresa.filter((u) => u.boost.ativo && u.boost.falha).length,
      saldoAcabando: daEmpresa.filter((u) => {
        const f = financeiroPorConta.get(u.contaId);
        if (!f) return false;
        const dias = calcularPrevisaoSaldo(f.saldo_disponivel_centavos, f.media_diaria_centavos ?? 0).dias;
        return dias !== null && dias <= 7;
      }).length,
      contasSemDados: daEmpresa.filter((u) => u.campanhasAtivas === null).length,
      href: `/api/ambiente?empresa=${empresa.id}`,
    };
  });
}
