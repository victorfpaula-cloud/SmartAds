"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Buildings,
  Storefront,
  Sparkle,
  Lightning,
  Crown,
  PlusCircle,
  ListBullets,
  Stethoscope,
  ArrowRight,
} from "@phosphor-icons/react";
import ModalBoostAutomatico, { type AlteracoesBoost } from "@/components/ModalBoostAutomatico";

interface ContaResumo {
  id: string;
  nome_exibicao: string | null;
  meta_ad_account_nome: string | null;
  meta_ad_account_id: string;
  instagram_business_id: string | null;
  boost_automatico_ativo: boolean;
  boost_automatico_publico_id: string | null;
  boost_automatico_orcamento_centavos: number | null;
  boost_automatico_duracao_dias: number;
}

interface ClienteResumo {
  id: string;
  nome: string;
  ativo: boolean;
  smartads_contas_meta: ContaResumo[];
}

interface EmpresaResumo {
  id: string;
  nome: string;
  tipo: "individual" | "franquia";
  smartads_clientes: ClienteResumo[];
}

interface Anomalia {
  metrica: "frequencia" | "ctr" | "cpm" | "cpc" | "spend";
  rotulo: string;
  valorAtual: number;
  valorAnterior: number;
  deltaPercentual: number;
  mensagem: string;
}

interface SaudeConta {
  status: "boa" | "atencao" | "sem_dados";
  motivo: string;
  anomalia: Anomalia | null;
  campanhasAtivas: number | null;
  gasto30dCentavos: number | null;
  orcamentoDiarioAtivoCentavos: number | null;
  boostCampanhasAtivas: number;
  boostPrevisaoGastoCentavos: number;
  boostOrcamentoDiarioCentavos: number;
  campanhaMaeAtivaNome: string | null;
}

const COR_SAUDE: Record<SaudeConta["status"], string> = {
  boa: "bg-ok",
  atencao: "bg-warn",
  sem_dados: "bg-neutral-600",
};

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** A dashboard de verdade do app — cards compactos em grade (não uma lista vertical que engole a
 * tela toda) mostrando, por conta: saúde, campanhas ativas e gasto dos últimos 30 dias — dados
 * que antes só apareciam em Contas, mas que fazem mais sentido aqui, na tela de "o que fazer
 * agora" (Contas virou só cadastro/conexão). Os números chegam depois do primeiro paint (mesma
 * lógica que já existia em Contas) pra não travar a tela esperando a Meta responder pra 8+ contas
 * de uma vez. */
export default function PainelInicio({ empresas }: { empresas: EmpresaResumo[] }) {
  const [saude, setSaude] = useState<Record<string, SaudeConta>>({});
  // Alterações de boost feitas direto pelo card (toggle rápido ou modal) — sobrepõem o valor vindo
  // do servidor sem precisar re-buscar a árvore inteira de empresas/clientes/contas.
  const [boostOverrides, setBoostOverrides] = useState<Record<string, AlteracoesBoost>>({});

  useEffect(() => {
    fetch("/api/saude")
      .then((r) => r.json())
      .then((corpo) => setSaude(corpo.saude ?? {}))
      .catch(() => {});
  }, []);

  function contaComOverride(conta: ContaResumo): ContaResumo {
    const alteracoes = boostOverrides[conta.id];
    return alteracoes ? { ...conta, ...alteracoes } : conta;
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {empresas.map((empresa) => {
        const clientesAtivos = empresa.smartads_clientes.filter((c) => c.ativo);
        const totalContas = clientesAtivos.reduce((soma, c) => soma + c.smartads_contas_meta.length, 0);
        const Icone = empresa.tipo === "franquia" ? Buildings : Storefront;

        return (
          <section key={empresa.id} className="cartao-vidro overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300">
                  <Icone size={16} weight="fill" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-neutral-100">{empresa.nome}</h2>
                  <p className="text-[11px] text-neutral-500">
                    {empresa.tipo === "franquia"
                      ? `Franquia · ${clientesAtivos.length} unidade${clientesAtivos.length !== 1 ? "s" : ""}`
                      : "Empresa individual"}
                    {" · "}
                    {totalContas} conta{totalContas !== 1 ? "s" : ""} de anúncio
                  </p>
                </div>
              </div>
              {empresa.tipo === "franquia" && (
                <Link
                  href="/estrategias"
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-accent/20 transition hover:scale-[1.02] hover:bg-accent-strong"
                >
                  Central da rede
                  <ArrowRight size={16} weight="bold" />
                </Link>
              )}
            </div>

            {totalContas === 0 ? (
              <p className="px-5 py-5 text-sm text-neutral-500">
                Nenhuma conta de anúncio associada ainda —{" "}
                <Link href="/contas" className="text-accent-strong hover:underline">
                  associar agora
                </Link>
                .
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {clientesAtivos.flatMap((cliente) =>
                  cliente.smartads_contas_meta.map((conta) => (
                    <CardConta
                      key={conta.id}
                      cliente={cliente}
                      conta={contaComOverride(conta)}
                      saude={saude[conta.id]}
                      onBoostAtualizado={(alteracoes) =>
                        setBoostOverrides((atual) => ({ ...atual, [conta.id]: alteracoes }))
                      }
                    />
                  ))
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CardConta({
  cliente,
  conta,
  saude,
  onBoostAtualizado,
}: {
  cliente: ClienteResumo;
  conta: ContaResumo;
  saude?: SaudeConta;
  onBoostAtualizado: (alteracoes: AlteracoesBoost) => void;
}) {
  const [modalBoostAberto, setModalBoostAberto] = useState(false);
  const [alternandoBoost, setAlternandoBoost] = useState(false);

  // Liga/desliga direto do card quando já tem público e orçamento salvos (não precisa abrir o
  // modal de novo só pra isso); sem essa config ainda, abre o modal — a API exige os dois pra
  // ligar (ver /api/contas-meta/[id]/boost-automatico).
  async function alternarBoost() {
    const configCompleta = Boolean(conta.boost_automatico_publico_id && conta.boost_automatico_orcamento_centavos);
    if (!conta.boost_automatico_ativo && !configCompleta) {
      setModalBoostAberto(true);
      return;
    }
    const novoAtivo = !conta.boost_automatico_ativo;
    setAlternandoBoost(true);
    const resposta = await fetch(`/api/contas-meta/${conta.id}/boost-automatico`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ativo: novoAtivo,
        publicoId: conta.boost_automatico_publico_id,
        orcamentoCentavos: conta.boost_automatico_orcamento_centavos,
        duracaoDias: conta.boost_automatico_duracao_dias,
      }),
    });
    setAlternandoBoost(false);
    if (resposta.ok) {
      onBoostAtualizado({
        boost_automatico_ativo: novoAtivo,
        boost_automatico_publico_id: conta.boost_automatico_publico_id,
        boost_automatico_orcamento_centavos: conta.boost_automatico_orcamento_centavos,
        boost_automatico_duracao_dias: conta.boost_automatico_duracao_dias,
      });
    }
  }

  return (
    <div className="cartao-vidro-interno flex flex-col gap-3 p-4">
      <div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${saude ? COR_SAUDE[saude.status] : "bg-neutral-700"}`}
          />
          <p className="truncate text-sm font-semibold text-neutral-100">{cliente.nome}</p>
        </div>
        <p className="mt-0.5 truncate pl-4 text-xs text-neutral-500">
          {conta.nome_exibicao || conta.meta_ad_account_nome || conta.meta_ad_account_id}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5 text-xs">
        <div>
          <p className="text-neutral-500">Campanhas ativas</p>
          <p className="mt-0.5 font-semibold text-neutral-200">
            {saude?.campanhasAtivas ?? <span className="text-neutral-600">…</span>}
          </p>
        </div>
        <div>
          <p className="text-neutral-500">Gasto (30d)</p>
          <p className="mt-0.5 font-semibold text-neutral-200">
            {saude?.gasto30dCentavos != null ? (
              formatoReal.format(saude.gasto30dCentavos / 100)
            ) : (
              <span className="text-neutral-600">…</span>
            )}
          </p>
        </div>
      </div>

      {saude?.status === "atencao" && (
        <div className="rounded-lg border border-warn/20 bg-warn/5 px-2.5 py-2">
          <p className="text-[11px] leading-relaxed text-warn">{saude.motivo}</p>
          {saude.anomalia && <BotaoExplicarAnomalia contaId={conta.id} />}
        </div>
      )}

      {saude?.campanhaMaeAtivaNome && (
        <div className="flex items-center gap-1.5 rounded-lg border border-indigo-400/20 bg-indigo-400/5 px-2.5 py-1.5 text-[11px] text-indigo-200">
          <Crown size={12} weight="fill" className="shrink-0" />
          <span className="truncate">
            Campanha-Mãe ativa: <span className="font-semibold">{saude.campanhaMaeAtivaNome}</span>
          </span>
        </div>
      )}

      {conta.instagram_business_id && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setModalBoostAberto(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300 hover:text-neutral-100"
            >
              <Lightning
                size={12}
                weight={conta.boost_automatico_ativo ? "fill" : "regular"}
                className={`shrink-0 ${conta.boost_automatico_ativo ? "text-ok" : "text-neutral-500"}`}
              />
              Boost automático
            </button>
            <button
              type="button"
              onClick={alternarBoost}
              disabled={alternandoBoost}
              aria-label={conta.boost_automatico_ativo ? "Desligar boost automático" : "Ligar boost automático"}
              className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50 ${
                conta.boost_automatico_ativo ? "bg-ok/70" : "bg-white/10"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  conta.boost_automatico_ativo ? "translate-x-[18px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          {conta.boost_automatico_ativo &&
            (!saude ? (
              <p className="mt-1 text-[11px] text-neutral-600">…</p>
            ) : saude.boostCampanhasAtivas === 0 ? (
              <p className="mt-1 text-[11px] text-neutral-500">Nenhuma campanha do boost ativa agora.</p>
            ) : (
              <div className="mt-1 flex flex-col gap-0.5 text-[11px] leading-relaxed text-neutral-400">
                <span>
                  {saude.boostCampanhasAtivas} campanha{saude.boostCampanhasAtivas !== 1 ? "s" : ""} do boost no
                  ar · previsão até encerrar: {formatoReal.format(saude.boostPrevisaoGastoCentavos / 100)}
                </span>
                {saude.orcamentoDiarioAtivoCentavos != null && saude.orcamentoDiarioAtivoCentavos > 0 && (
                  <span>
                    É{" "}
                    {Math.round((saude.boostOrcamentoDiarioCentavos / saude.orcamentoDiarioAtivoCentavos) * 100)}%
                    do orçamento diário ativo da conta ({formatoReal.format(saude.orcamentoDiarioAtivoCentavos / 100)}
                    /dia)
                  </span>
                )}
              </div>
            ))}
        </div>
      )}

      <div className="mt-auto grid grid-cols-3 gap-1 border-t border-white/10 pt-2.5 text-[11px] font-medium">
        <Link
          href={`/campanhas/nova/${conta.id}`}
          className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-accent-strong hover:bg-white/[0.04]"
        >
          <PlusCircle size={16} weight="bold" />
          Nova
        </Link>
        <Link
          href={`/campanhas/conta/${conta.id}`}
          className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-accent-strong hover:bg-white/[0.04]"
        >
          <ListBullets size={16} weight="bold" />
          Campanhas
        </Link>
        <Link
          href={`/estrategias/diagnostico/${conta.id}`}
          className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-accent-strong hover:bg-white/[0.04]"
        >
          <Stethoscope size={16} weight="bold" />
          Diagnóstico
        </Link>
      </div>

      {modalBoostAberto && (
        <ModalBoostAutomatico
          clienteId={cliente.id}
          conta={conta}
          onFechar={() => setModalBoostAberto(false)}
          onSalvo={(alteracoes) => {
            onBoostAtualizado(alteracoes);
            setModalBoostAberto(false);
          }}
        />
      )}
    </div>
  );
}

/** Explicação em texto (Gemini) pra uma anomalia já detectada — some por trás de um clique porque
 * é a única chamada de IA que rodaria sem o dono pedir (as outras têm botão "gerar" bem visível);
 * aqui o gasto de token só acontece se alguém realmente quiser entender o "porquê". */
function BotaoExplicarAnomalia({ contaId }: { contaId: string }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function explicar() {
    setCarregando(true);
    setErro(null);
    const resposta = await fetch("/api/ia/explicar-anomalia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contaId }),
    });
    const corpo = await resposta.json();
    setCarregando(false);

    if (resposta.ok) {
      setTexto(corpo.texto);
    } else {
      setErro(corpo.erro || "Falha ao gerar a explicação.");
    }
  }

  if (texto) {
    return (
      <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-300">
        <Sparkle size={12} weight="fill" className="mt-0.5 shrink-0 text-indigo-300" />
        {texto}
      </p>
    );
  }

  return (
    <>
      <button
        onClick={explicar}
        disabled={carregando}
        className="mt-1 text-[11px] font-medium text-accent-strong hover:underline disabled:opacity-50"
      >
        {carregando ? "Explicando…" : "Por quê? (IA)"}
      </button>
      {erro && <p className="mt-1 text-[11px] text-danger">{erro}</p>}
    </>
  );
}
