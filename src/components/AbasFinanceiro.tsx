import Link from "next/link";

/** Duas visões do mesmo assunto (dinheiro), numa tela só: saldos/situação das contas e o que cada
 * unidade investiu no mês. */
export default function AbasFinanceiro({ ativa }: { ativa: "saldos" | "investimento" }) {
  const aba = (href: string, rotulo: string, ligada: boolean) => (
    <Link
      href={href}
      className={
        ligada
          ? "pilula-ativa rounded-lg px-3.5 py-2 text-[13px] font-semibold text-neutral-100"
          : "rounded-lg bg-white/[0.04] px-3.5 py-2 text-[13px] font-medium text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-200"
      }
    >
      {rotulo}
    </Link>
  );
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {aba("/financeiro", "Saldos e situação", ativa === "saldos")}
      {aba("/financeiro/investimentos", "Investimento do mês", ativa === "investimento")}
    </div>
  );
}
