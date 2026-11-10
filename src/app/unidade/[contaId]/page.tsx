import Link from "next/link";
import { notFound } from "next/navigation";
import Cabecalho from "@/components/Cabecalho";
import { exigirAmbiente } from "@/lib/ambiente";
import { lerAcesso } from "@/lib/acesso";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { calcularPrevisaoSaldo } from "@/lib/financeiro/previsaoSaldo";
import EmailRelatorioMensal from "@/app/contas/EmailRelatorioMensal";
import PlanoTeto from "./PlanoTeto";
import MelhoresPosts from "./MelhoresPosts";

export const dynamic = "force-dynamic";

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Tudo de UMA unidade num lugar só: dinheiro (saldo, gasto, teto), boost, delivery, e-mail dos
 * relatórios e atalhos pras telas dela. Só lê o que o app já guarda — o plano do teto e os melhores
 * posts buscam na Meta depois que a página abre. */
export default async function UnidadePage({ params }: { params: Promise<{ contaId: string }> }) {
  const { contaId } = await params;
  const ambiente = await exigirAmbiente();
  const acesso = await lerAcesso();
  const db = criarClienteAdmin();
  const { data: conta } = await db
    .from("smartads_contas_meta")
    .select(
      "id, nome_exibicao, meta_ad_account_nome, meta_ad_account_id, instagram_username, instagram_business_id, teto_mensal_centavos, link_ifood, link_whatsapp, boost_automatico_ativo, boost_automatico_orcamento_diario_centavos, boost_automatico_duracao_dias, smartads_clientes!inner(id, nome, empresa_id, email_relatorio)"
    )
    .eq("id", contaId)
    .maybeSingle();
  const cliente = (Array.isArray(conta?.smartads_clientes) ? conta?.smartads_clientes[0] : conta?.smartads_clientes) as
    | { id: string; nome: string; empresa_id: string | null; email_relatorio: string | null }
    | undefined;
  // Unidade de outra empresa nunca abre dentro deste ambiente.
  if (!conta || !cliente || cliente.empresa_id !== ambiente.id) notFound();

  const mesAtual = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
  const [{ data: fin }, { data: boosts }] = await Promise.all([
    db
      .from("smartads_financeiro_cache")
      .select("saldo_disponivel_centavos, media_diaria_centavos, gasto_mes_centavos, gasto_mes_ref, conta_pre_paga, calculado_em, erro")
      .eq("conta_id", contaId)
      .maybeSingle(),
    db
      .from("smartads_boost_automatico_log")
      .select("sucesso, erro_mensagem, created_at")
      .eq("conta_id", contaId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const saldo = (fin?.saldo_disponivel_centavos as number | null) ?? null;
  const media = (fin?.media_diaria_centavos as number | null) ?? 0;
  const prev = calcularPrevisaoSaldo(saldo, media, new Date(), (fin?.conta_pre_paga as boolean | null) ?? null);
  const gastoMes = fin?.gasto_mes_ref === mesAtual ? ((fin?.gasto_mes_centavos as number | null) ?? null) : null;
  const ultimoBoost = boosts?.[0];

  const cartoes: Array<[string, string, string | null]> = [
    ["Saldo na conta", saldo === null ? (fin?.conta_pre_paga === false ? "Cartão" : "—") : reais(Math.max(saldo, 0)), prev.dias !== null ? `acaba em ${prev.texto}` : prev.detalhe],
    ["Gasto no mês", gastoMes === null ? "—" : reais(gastoMes), null],
    ["Ritmo (7 dias)", media > 0 ? `${reais(media)}/dia` : "sem gasto", null],
    [
      "Boost automático",
      conta.boost_automatico_ativo ? "Ligado" : "Desligado",
      conta.boost_automatico_ativo && conta.boost_automatico_orcamento_diario_centavos
        ? `${reais(conta.boost_automatico_orcamento_diario_centavos as number)}/dia por ${conta.boost_automatico_duracao_dias ?? 3} dias`
        : null,
    ],
  ];
  const atalhos: Array<[string, string]> = [
    ["Campanhas no ar", `/campanhas/conta/${contaId}`],
    ["Nova campanha", `/campanhas/nova/${contaId}`],
    ["Relatório (PDF)", `/relatorio-ads?conta=${contaId}`],
    ...(ambiente.tipo === "franquia" ? ([["Posts e stories", `/estrategias/postagens/${contaId}`]] as Array<[string, string]>) : []),
    ["Aportes do mês", "/financeiro/investimentos"],
    ["Configurar boost", "/boost"],
  ];
  const linkPronto = (v: string | null) => (v ? "salvo" : "não cadastrado");

  return (
    <>
      <Cabecalho ativo="/boost" />
      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <div>
          <Link href="/boost" className="text-xs text-neutral-500 hover:text-neutral-300">
            ← Unidades
          </Link>
          <h1 className="mt-1 font-display text-2xl font-bold">{cliente.nome}</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            {conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id}
            {conta.instagram_username ? ` · @${conta.instagram_username}` : " · sem Instagram vinculado"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cartoes.map(([rotulo, valor, detalhe]) => (
            <div key={rotulo} className="cartao-vidro px-4 py-3">
              <p className="text-[10.5px] uppercase tracking-wide text-neutral-500">{rotulo}</p>
              <p className="mt-0.5 text-base font-bold text-neutral-100">{valor}</p>
              {detalhe && <p className="text-[10.5px] text-neutral-500">{detalhe}</p>}
            </div>
          ))}
        </div>
        {fin?.erro && <p className="text-xs text-amber-400">Última leitura financeira falhou: {String(fin.erro).slice(0, 160)}</p>}
        {ultimoBoost && !ultimoBoost.sucesso && (
          <p className="text-xs text-amber-400">Último boost falhou: {String(ultimoBoost.erro_mensagem ?? "erro não informado").slice(0, 200)}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {atalhos.map(([rotulo, href]) => (
            <Link key={href + rotulo} href={href} className="rounded-lg border border-white/14 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-white/[0.04]">
              {rotulo}
            </Link>
          ))}
        </div>

        <PlanoTeto contaId={contaId} tetoInicial={(conta.teto_mensal_centavos as number | null) ?? null} />

        {conta.instagram_business_id && <MelhoresPosts contaId={contaId} instagramBusinessId={conta.instagram_business_id as string} />}

        <section className="cartao-vidro p-5">
          <h2 className="font-display text-base font-bold">Relatórios e delivery</h2>
          {!acesso.restrito && <EmailRelatorioMensal clienteId={cliente.id} inicial={cliente.email_relatorio} />}
          <p className="mt-3 text-xs text-neutral-400">
            Link do iFood: <strong className="text-neutral-200">{linkPronto(conta.link_ifood as string | null)}</strong> · Link do WhatsApp:{" "}
            <strong className="text-neutral-200">{linkPronto(conta.link_whatsapp as string | null)}</strong>
            {ambiente.tipo === "franquia" && (
              <>
                {" "}
                ·{" "}
                <Link href="/delivery" className="text-accent-strong hover:underline">
                  editar em Delivery
                </Link>
              </>
            )}
          </p>
        </section>
      </main>
    </>
  );
}
