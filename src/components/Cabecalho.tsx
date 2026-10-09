import Link from "next/link";
import { SignOut, ArrowLeft, Buildings, Storefront } from "@phosphor-icons/react/dist/ssr";
import { lerAmbiente, type Ambiente } from "@/lib/ambiente";
import MenuNavegacao, { type ItemMenu } from "@/components/MenuNavegacao";

// Páginas da visão geral (fora de qualquer ambiente): o menu é só o de gerenciar as contas.
const PAGINAS_GERAIS = ["/", "/contas", "/login"];

const limpar = (destino: string) => `/api/ambiente?limpar=1&ir=${encodeURIComponent(destino)}`;

// Visão geral: o que serve pra gerenciar TODAS as contas de uma vez. Entrar numa franquia ou numa
// conta única (card do Início) abre o menu daquele ambiente.
const MENU_GERAL: ItemMenu[] = [
  { href: "/", label: "Início", icone: "inicio" },
  { href: limpar("/boost"), label: "Boost", icone: "boost", tambem: ["/boost"] },
  { href: limpar("/financeiro"), label: "Financeiro", icone: "financeiro", tambem: ["/financeiro"] },
  { href: limpar("/relatorios"), label: "Relatórios", icone: "relatorios", tambem: ["/relatorios", "/relatorio-ads"] },
  { href: "/contas", label: "Contas e conexões", icone: "contas" },
];

function menuDoAmbiente(a: Ambiente): ItemMenu[] {
  if (a.tipo === "franquia") {
    return [
      { href: "/estrategias", label: "Visão geral", icone: "inicio" },
      {
        href: "/campanhas",
        label: "Campanhas",
        icone: "campanhas",
        tambem: ["/campanhas/conta", "/campanhas/nova", "/estrategias/campanhas-mae", "/estrategias/moldes", "/estrategias/planos", "/estrategias/calendario"],
      },
      { href: "/estrategias/postagens", label: "Radar de posts", icone: "radar" },
      { href: "/boost", label: "Unidades", icone: "unidades", tambem: ["/delivery", "/publicos", "/estrategias/semaforo", "/estrategias/diagnostico"] },
      { href: "/financeiro", label: "Financeiro", icone: "financeiro", tambem: ["/financeiro/investimentos"] },
      { href: "/relatorios", label: "Relatórios", icone: "relatorios", tambem: ["/relatorio-ads"] },
      { href: "/automacao", label: "Automação", icone: "automacao" },
    ];
  }
  return [
    { href: `/central/${a.id}`, label: "Visão geral", icone: "inicio" },
    { href: "/campanhas", label: "Campanhas", icone: "campanhas", tambem: ["/campanhas/conta", "/campanhas/nova"] },
    { href: "/delivery", label: "Delivery", icone: "delivery" },
    { href: "/boost", label: "Boost", icone: "boost" },
    { href: "/financeiro", label: "Financeiro", icone: "financeiro", tambem: ["/financeiro/investimentos"] },
    { href: "/relatorios", label: "Relatórios", icone: "relatorios", tambem: ["/relatorio-ads"] },
    { href: "/publicos", label: "Públicos", icone: "publicos" },
    { href: "/automacao", label: "Automação", icone: "automacao" },
  ];
}

/** Menu do topo. Dois modos, sem misturar: a visão geral (gerenciar as contas) e o ambiente de uma
 * franquia ou de uma conta única, com só os botões que fazem sentido pra ela. Os parâmetros
 * `ativo`, `rede`, `geralHref` e `empresa` ficam só por compatibilidade com as telas antigas — quem
 * decide o modo agora é o ambiente aberto (cookie) e a página em que a pessoa está. */
export default async function Cabecalho({
  ativo,
}: {
  ativo: string;
  rede?: boolean;
  geralHref?: string;
  empresa?: { id: string; nome: string };
}) {
  const ambiente = PAGINAS_GERAIS.includes(ativo) ? null : await lerAmbiente();
  const itens = ambiente ? menuDoAmbiente(ambiente) : MENU_GERAL;
  const Icone = ambiente?.tipo === "franquia" ? Buildings : Storefront;

  return (
    <header
      className="barra-vidro sticky top-0 z-20 border-b"
      // O iPad/iPhone em tela cheia tem uma barra de status em cima: o respiro extra evita o menu
      // ficar colado nela.
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pb-3.5 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-display text-[15px] font-bold tracking-tight">SmartAds</span>
            {ambiente && (
              <>
                <Link
                  prefetch={false}
                  href={limpar("/")}
                  className="flex shrink-0 items-center gap-1 text-xs font-medium text-neutral-400 hover:text-neutral-200"
                >
                  <ArrowLeft size={13} /> Início
                </Link>
                <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-strong">
                  <Icone size={13} weight="fill" className="shrink-0" />
                  <span className="truncate">{ambiente.nome}</span>
                  <span className="hidden font-normal text-neutral-400 sm:inline">
                    · {ambiente.tipo === "franquia" ? "Franquia" : "Conta única"}
                  </span>
                </span>
              </>
            )}
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              aria-label="Sair"
              className="botao-icone-vidro h-9 shrink-0 gap-1.5 rounded-lg px-3 text-xs font-medium text-neutral-400"
            >
              <SignOut size={16} />
              Sair
            </button>
          </form>
        </div>
        <MenuNavegacao itens={itens} />
      </div>
    </header>
  );
}
