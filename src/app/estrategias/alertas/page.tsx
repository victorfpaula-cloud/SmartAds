import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { exigirAmbiente } from "@/lib/ambiente";
import { gerarAlertas, gerarAlertasConexao, ROTULO_CATEGORIA, type Alerta, type SeveridadeAlerta } from "@/lib/alertas";

export const dynamic = "force-dynamic";

const GRUPOS: Array<{ sev: SeveridadeAlerta; titulo: string; classe: string; ponto: string }> = [
  { sev: "critico", titulo: "Urgente", classe: "border-danger/30 bg-danger/5", ponto: "bg-danger" },
  { sev: "atencao", titulo: "Pede atenção", classe: "border-amber-500/30 bg-amber-500/5", ponto: "bg-amber-400" },
  { sev: "info", titulo: "Para ficar de olho", classe: "border-white/10 bg-white/[0.02]", ponto: "bg-neutral-500" },
];

export default async function AlertasPage() {
  const ambiente = await exigirAmbiente("franquia");
  const [doAmbiente, conexao] = await Promise.all([gerarAlertas(ambiente.id), gerarAlertasConexao()]);
  const ordem = { critico: 0, atencao: 1, info: 2 } as const;
  const alertas = [...conexao, ...doAmbiente].sort((a, b) => ordem[a.severidade] - ordem[b.severidade]);
  const porUnidade = (lista: Alerta[]) => [...new Set(lista.map((a) => a.unidade))].length;

  return (
    <>
      <Cabecalho ativo="/estrategias" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <h1 className="font-display text-2xl font-bold">Alertas · {ambiente.nome}</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          O que pede ação na rede, a partir dos números que o app já tem: saldo acabando, conta com problema na Meta, boost
          falhando, quem ainda não investiu no mês e postagens paradas. Quando algo for urgente, chega também um e-mail de manhã.
        </p>

        {alertas.length === 0 ? (
          <p className="cartao-vidro mt-6 px-5 py-8 text-center text-sm text-ok">Tudo em dia — nenhum alerta agora.</p>
        ) : (
          GRUPOS.map((g) => {
            const lista = alertas.filter((a) => a.severidade === g.sev);
            if (lista.length === 0) return null;
            return (
              <section key={g.sev} className="mt-6">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
                  <span className={`h-2 w-2 rounded-full ${g.ponto}`} /> {g.titulo}{" "}
                  <span className="text-xs font-normal text-neutral-500">
                    {lista.length} alerta{lista.length !== 1 ? "s" : ""} · {porUnidade(lista)} unidade{porUnidade(lista) !== 1 ? "s" : ""}
                  </span>
                </h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {lista.map((a) => (
                    <li key={a.id} className={`cartao-vidro flex flex-wrap items-start justify-between gap-3 border px-4 py-3 ${g.classe}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-100">
                          {a.unidade} <span className="font-normal text-neutral-400">— {a.titulo}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-400">{a.detalhe}</p>
                        <p className="mt-1 text-[10.5px] uppercase tracking-wide text-neutral-600">{ROTULO_CATEGORIA[a.categoria]}</p>
                      </div>
                      <Link href={a.href} className="shrink-0 rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-neutral-100 hover:bg-white/15">
                        Abrir
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </main>
    </>
  );
}
