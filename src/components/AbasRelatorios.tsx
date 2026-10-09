import Link from "next/link";

/** Abas da área de Relatórios: o resumo de todas as contas e o relatório de tráfego de uma conta
 * (com PDF). Antes eram dois itens soltos com nomes parecidos. */
export default function AbasRelatorios({ ativa }: { ativa: "resumo" | "conta" }) {
  const aba = (href: string, rotulo: string, ligada: boolean) => (
    <Link
      href={href}
      className={
        ligada
          ? "pilula-ativa rounded-lg px-3.5 py-2 text-[13px] font-semibold text-neutral-100"
          : "rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-400 hover:text-neutral-200"
      }
    >
      {rotulo}
    </Link>
  );
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {aba("/relatorios", "Resumo", ativa === "resumo")}
      {aba("/relatorio-ads", "Por conta (PDF)", ativa === "conta")}
    </div>
  );
}
