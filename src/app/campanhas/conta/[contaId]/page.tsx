import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import PainelCampanhasDaConta from "./PainelCampanhasDaConta";
import { mesAtualEmSaoPaulo } from "@/lib/tempoSaoPaulo";
import { lerAmbiente } from "@/lib/ambiente";
import { contaSemSaldo } from "@/lib/financeiro/situacaoConta";

export const dynamic = "force-dynamic";

export default async function CampanhasDaContaPage({ params }: { params: Promise<{ contaId: string }> }) {
  const { contaId } = await params;
  const supabase = criarClienteAdmin();

  const { data: conta } = await supabase
    .from("smartads_contas_meta")
    .select("id, nome_exibicao, meta_ad_account_nome, meta_ad_account_id, smartads_clientes(nome, empresa_id)")
    .eq("id", contaId)
    .single();

  if (!conta) notFound();
  // A conta tem que ser do ambiente aberto — não dá pra entrar na conta de outra empresa pelo link.
  const ambiente = await lerAmbiente();
  const rel = (conta as any).smartads_clientes;
  if (ambiente && (Array.isArray(rel) ? rel[0] : rel)?.empresa_id !== ambiente.id) notFound();

  // Gasto do mês corrente da conta (atualizado pelo cron das campanhas da rede); só vale se for do
  // mês atual — um valor de mês anterior significaria que o cron ainda não rodou neste mês.
  const { data: gastoMes } = await supabase
    .from("smartads_gasto_mes_cache")
    .select("mes, gasto_mes_centavos")
    .eq("conta_id", contaId)
    .maybeSingle();
  const mesAtual = mesAtualEmSaoPaulo();
  const { data: financeiro } = await supabase
    .from("smartads_financeiro_cache")
    .select("saldo_disponivel_centavos, conta_pre_paga")
    .eq("conta_id", contaId)
    .maybeSingle();
  const semSaldo = contaSemSaldo(financeiro?.saldo_disponivel_centavos, financeiro?.conta_pre_paga);

  const nomeConta = conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id;
  const nomeCliente = (conta as any).smartads_clientes?.nome ?? "";

  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <Link href="/campanhas" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Campanhas
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold">{nomeCliente}</h1>
        <p className="mt-1 text-sm text-neutral-400">{nomeConta}</p>

        <div className="mt-6">
          <PainelCampanhasDaConta
            contaId={contaId}
            semSaldo={semSaldo}
            gastoMesCentavos={gastoMes && gastoMes.mes === mesAtual ? gastoMes.gasto_mes_centavos : null}
          />
        </div>
      </main>
    </>
  );
}
