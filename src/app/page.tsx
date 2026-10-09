import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";
import { ArrowRight, Buildings, Storefront, WarningCircle, Lightning } from "@phosphor-icons/react/dist/ssr";
import { obterEmpresasParaInicio, type EmpresaInicio } from "@/lib/inicio";

export const dynamic = "force-dynamic";

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Início leve: uma porta de entrada por empresa (franquia ou individual) com o mínimo pra saber se
 * há algo errado antes de entrar. Nada de card por unidade nem requisição depois de abrir — os
 * números vêm prontos do banco (ver obterEmpresasParaInicio). O trabalho de verdade — campanhas,
 * boost, financeiro — fica dentro da central de cada empresa. */
export default async function Home() {
  const empresas = await obterEmpresasParaInicio();
  const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <>
      <Cabecalho ativo="/" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Início</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Escolha a empresa pra entrar na central dela. Pra cadastrar cliente novo ou conectar a Meta, é em
              Contas.
            </p>
          </div>
          <Link
            href="/contas"
            className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:bg-accent-strong"
          >
            + Empresa ou cliente
          </Link>
        </div>

        {empresas.length === 0 ? (
          <div className="cartao-vidro mt-6 flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-sm text-neutral-400">Nenhuma empresa cadastrada ainda.</p>
            <Link
              href="/contas"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
            >
              Cadastrar a primeira
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {empresas.map((empresa) => (
              <CardEmpresa key={empresa.id} empresa={empresa} nomeMes={nomeMes} />
            ))}
          </div>
        )}

        <Link
          href="/campanhas"
          className="mt-6 flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm text-neutral-300 hover:bg-white/[0.04]"
        >
          Ver as campanhas de todas as contas
          <ArrowRight size={16} />
        </Link>
      </main>
    </>
  );
}

function CardEmpresa({ empresa, nomeMes }: { empresa: EmpresaInicio; nomeMes: string }) {
  const Icone = empresa.tipo === "franquia" ? Buildings : Storefront;
  const semContas = empresa.contas === 0;
  const alertas: Array<{ texto: string; cor: string; Icone: typeof WarningCircle }> = [];
  if (empresa.boostsComErro > 0) {
    alertas.push({
      texto: `${empresa.boostsComErro} boost${empresa.boostsComErro > 1 ? "s" : ""} com erro`,
      cor: "bg-danger/15 text-danger",
      Icone: WarningCircle,
    });
  }
  if (empresa.campanhasSemSaldo > 0) {
    alertas.push({
      texto: `${empresa.campanhasSemSaldo} campanha${empresa.campanhasSemSaldo > 1 ? "s" : ""} parada${empresa.campanhasSemSaldo > 1 ? "s" : ""} sem saldo`,
      cor: "bg-danger/15 text-danger",
      Icone: WarningCircle,
    });
  }
  if (empresa.saldoAcabando > 0) {
    alertas.push({
      texto: `${empresa.saldoAcabando} ${empresa.saldoAcabando > 1 ? "contas" : "conta"} com saldo acabando`,
      cor: "bg-amber-500/15 text-amber-400",
      Icone: WarningCircle,
    });
  }

  return (
    <Link
      href={semContas ? "/contas" : empresa.href}
      className="cartao-vidro group flex flex-col gap-4 p-5 transition hover:border-accent/40"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-neutral-300">
          <Icone size={20} weight="fill" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-neutral-100">{empresa.nome}</h2>
          <p className="text-xs text-neutral-500">
            {empresa.tipo === "franquia" ? "Franquia" : "Empresa individual"} · {empresa.contas}{" "}
            {empresa.tipo === "franquia" ? (empresa.contas === 1 ? "unidade" : "unidades") : empresa.contas === 1 ? "conta" : "contas"}
          </p>
        </div>
        <ArrowRight size={18} className="ml-auto shrink-0 text-neutral-600 transition group-hover:text-accent-strong" />
      </div>

      {semContas ? (
        <p className="text-sm text-neutral-500">Nenhuma conta de anúncio associada ainda — associar agora.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Numero rotulo="Campanhas no ar" valor={String(empresa.campanhasNoAr)} />
            <Numero
              rotulo={`Gasto em ${nomeMes}`}
              valor={empresa.gastoMesCentavos !== null ? formatoReal.format(empresa.gastoMesCentavos / 100) : "—"}
            />
            <Numero
              rotulo="Boosts no ar"
              valor={String(empresa.boostsNoAr)}
              icone={<Lightning size={12} weight="fill" className="text-ok" />}
            />
          </div>

          {(alertas.length > 0 || empresa.contasSemDados > 0) && (
            <div className="flex flex-wrap gap-2">
              {alertas.map((a) => (
                <span key={a.texto} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${a.cor}`}>
                  <a.Icone size={12} weight="fill" />
                  {a.texto}
                </span>
              ))}
              {empresa.contasSemDados > 0 && (
                <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-neutral-500">
                  {empresa.contasSemDados} {empresa.contasSemDados > 1 ? "contas" : "conta"} aguardando dados
                </span>
              )}
            </div>
          )}
        </>
      )}
    </Link>
  );
}

function Numero({ rotulo, valor, icone }: { rotulo: string; valor: string; icone?: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wide text-neutral-500">
        {icone}
        {rotulo}
      </p>
      <p className="mt-0.5 text-lg font-bold leading-tight text-neutral-100">{valor}</p>
    </div>
  );
}
