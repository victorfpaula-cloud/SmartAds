import Cabecalho from "@/components/Cabecalho";
import Link from "next/link";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import {
  Heart,
  Broadcast,
  ClipboardText,
  UserCircle,
  LinkSimple,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

export const dynamic = "force-dynamic";

const CARDS: Array<{ tipo: string; titulo: string; descricao: string; Icone: Icon }> = [
  {
    tipo: "engajamento",
    titulo: "Engajamento",
    descricao: "Curtidas, comentários e compartilhamentos numa publicação.",
    Icone: Heart,
  },
  {
    tipo: "alcance",
    titulo: "Alcance",
    descricao: "Mostrar o anúncio pro maior número de pessoas possível.",
    Icone: Broadcast,
  },
  {
    tipo: "formulario",
    titulo: "Formulário",
    descricao: "Captar leads com um formulário já criado no Meta (ex: expansão/franquia).",
    Icone: ClipboardText,
  },
  {
    tipo: "visita_perfil",
    titulo: "Visita ao perfil",
    descricao: "Levar pessoas pro perfil do Instagram.",
    Icone: UserCircle,
  },
  {
    tipo: "cliques_link",
    titulo: "Cliques no link",
    descricao: "Levar pessoas pra um site externo.",
    Icone: LinkSimple,
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
      <main className="mx-auto max-w-4xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <p className="text-xs font-medium text-neutral-500">
          {(conta as any).smartads_clientes?.nome} · {conta.nome_exibicao || conta.meta_ad_account_nome}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold">Escolha o objetivo</h1>
        <p className="mt-1 text-sm text-neutral-400">
          A campanha nasce pausada — você revisa tudo antes de ativar.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {CARDS.map(({ tipo, titulo, descricao, Icone }) => (
            <Link
              key={tipo}
              href={`/campanhas/nova/${params.contaId}/${tipo}`}
              className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl transition active:scale-[0.98] hover:border-accent/40 hover:bg-white/[0.05]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/25 to-indigo-500/5 text-indigo-200">
                <Icone size={22} weight="duotone" />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-100 group-hover:text-white">{titulo}</p>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">{descricao}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
