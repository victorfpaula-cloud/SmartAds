import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const CARDS: Array<{
  tipo: string;
  titulo: string;
  descricao: string;
  icone: JSX.Element;
}> = [
  {
    tipo: "engajamento",
    titulo: "Engajamento",
    descricao: "Curtidas, comentários e compartilhamentos numa publicação.",
    icone: (
      <path d="M12 21s-6.7-4.35-9.3-8.1C.8 10.1 1.4 6.6 4.4 5.2c2.2-1 4.6-.2 5.9 1.4C11.5 5 13.9 4.2 16.1 5.2c3 1.4 3.6 4.9 1.7 7.7C18.7 16.65 12 21 12 21z" />
    ),
  },
  {
    tipo: "alcance",
    titulo: "Alcance",
    descricao: "Mostrar o anúncio pro maior número de pessoas possível.",
    icone: <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 3a7 7 0 011 13.9V16h-2v2.9A7 7 0 0112 5z" />,
  },
  {
    tipo: "formulario",
    titulo: "Formulário",
    descricao: "Captar leads com um formulário já criado no Meta (ex: expansão/franquia).",
    icone: <path d="M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z" />,
  },
  {
    tipo: "visita_perfil",
    titulo: "Visita ao perfil",
    descricao: "Levar pessoas pro perfil do Instagram.",
    icone: <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5z" />,
  },
  {
    tipo: "cliques_link",
    titulo: "Cliques no link",
    descricao: "Levar pessoas pra um site externo.",
    icone: <path d="M10.6 13.4a1 1 0 001.4 1.4l4-4a3 3 0 10-4.2-4.2l-1 1a1 1 0 101.4 1.4l1-1a1 1 0 111.4 1.4l-4 4zm2.8-2.8a1 1 0 00-1.4-1.4l-4 4a3 3 0 104.2 4.2l1-1a1 1 0 10-1.4-1.4l-1 1a1 1 0 11-1.4-1.4l4-4z" />,
  },
];

export default async function EscolherModeloPage({ params }: { params: { contaId: string } }) {
  const supabase = criarClienteAdmin();
  const { data: conta } = await supabase
    .from("smartads_contas_meta")
    .select("*, smartads_clientes(nome)")
    .eq("id", params.contaId)
    .single();

  if (!conta) notFound();

  return (
    <>
      <Cabecalho ativo="/campanhas" />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-xs font-medium text-neutral-500">
          {(conta as any).smartads_clientes?.nome} · {conta.nome_exibicao || conta.meta_ad_account_nome}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold">Escolha o objetivo</h1>
        <p className="mt-1 text-sm text-neutral-400">
          A campanha nasce pausada — você revisa tudo antes de ativar.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CARDS.map((card) => (
            <Link
              key={card.tipo}
              href={`/campanhas/nova/${params.contaId}/${card.tipo}`}
              className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl transition hover:border-accent/40 hover:bg-white/[0.05]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/25 to-indigo-500/5 text-indigo-200">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                  {card.icone}
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-100 group-hover:text-white">
                  {card.titulo}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">{card.descricao}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
