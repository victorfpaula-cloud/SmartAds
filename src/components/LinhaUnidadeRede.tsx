"use client";

import { useState } from "react";
import Link from "next/link";
import { Lightning, WarningCircle } from "@phosphor-icons/react";
import ModalBoostAutomatico, { type AlteracoesBoost } from "@/components/ModalBoostAutomatico";
import type { UnidadeRedeResumo } from "@/lib/campanhasRede";

// Colunas de largura FIXA (só a da unidade estica): com `auto` cada linha calculava a própria
// largura e o boost/gasto saíam desalinhados de uma linha pra outra e do cabeçalho.
function classeColunas(comBoost: boolean): string {
  return comBoost
    ? "sm:grid-cols-[minmax(0,1fr)_8.5rem_7rem_11rem]"
    : "sm:grid-cols-[minmax(0,1fr)_8.5rem_7rem]";
}

/** Legenda das colunas da tabela de unidades — mesma grade das linhas, só aparece a partir de sm. */
export function CabecalhoColunasUnidades({ comBoost, nomeMes }: { comBoost: boolean; nomeMes: string }) {
  return (
    <div
      className={`hidden gap-x-4 border-b border-white/10 px-5 py-2 text-[10.5px] font-medium uppercase tracking-wide text-neutral-500 sm:grid ${classeColunas(comBoost)}`}
    >
      <span>Unidade</span>
      <span>Campanhas no ar</span>
      <span
        className="text-right"
        title={`Soma do que todas as campanhas da conta gastaram de 1º de ${nomeMes} até agora, direto da Meta`}
      >
        Gasto em {nomeMes}
      </span>
      {comBoost && <span>Boost automático</span>}
    </div>
  );
}

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (centavos: number) => formatoReal.format(centavos / 100);

function tempoRelativo(iso: string): string {
  const horas = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (horas < 1) return "há menos de 1h";
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias !== 1 ? "s" : ""}`;
}

/** Uma unidade na tabela de campanhas: nome, campanhas no ar e gasto do mês (clicar abre a conta) e,
 * na Central, o controle do boost automático — liga/desliga, quantos boosts estão no ar e o aviso de
 * erro do último. Sem chamar a Meta: o número vem do cache e o toggle só fala com a Meta ao clicar. */
export default function LinhaUnidadeRede({
  unidade,
  nomeMes,
  comBoost,
}: {
  unidade: UnidadeRedeResumo;
  nomeMes: string;
  comBoost: boolean;
}) {
  const [boostConfig, setBoostConfig] = useState<AlteracoesBoost>({
    boost_automatico_ativo: unidade.boost.ativo,
    boost_automatico_publico_id: unidade.boost.publicoId,
    boost_automatico_orcamento_centavos: unidade.boost.orcamentoCentavos,
    boost_automatico_duracao_dias: unidade.boost.duracaoDias,
  });
  const [alternando, setAlternando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [mostrarErro, setMostrarErro] = useState(false);

  const semDados = unidade.campanhasAtivas === null;
  const ativa = (unidade.campanhasAtivas ?? 0) > 0;
  const href = `/campanhas/conta/${unidade.contaId}`;
  const boostLigado = boostConfig.boost_automatico_ativo;

  async function alternar() {
    const configCompleta = Boolean(
      boostConfig.boost_automatico_publico_id && boostConfig.boost_automatico_orcamento_centavos
    );
    if (!boostLigado && !configCompleta) {
      setModalAberto(true); // a API exige público e orçamento pra ligar
      return;
    }
    const novoAtivo = !boostLigado;
    setAlternando(true);
    const resposta = await fetch(`/api/contas-meta/${unidade.contaId}/boost-automatico`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ativo: novoAtivo,
        publicoId: boostConfig.boost_automatico_publico_id,
        orcamentoCentavos: boostConfig.boost_automatico_orcamento_centavos,
        duracaoDias: boostConfig.boost_automatico_duracao_dias,
      }),
    });
    setAlternando(false);
    if (resposta.ok) setBoostConfig({ ...boostConfig, boost_automatico_ativo: novoAtivo });
  }

  const colunas = classeColunas(comBoost);

  return (
    <li className="transition hover:bg-white/[0.03]">
      <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3 ${colunas}`}>
        <Link href={href} className="flex min-w-0 items-center gap-2.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${ativa ? "bg-ok" : "bg-neutral-700"}`}
            title={semDados ? "Ainda não calculada" : ativa ? "Com campanha no ar" : "Sem campanha no ar"}
          />
          <div className="min-w-0">
            <p className={`truncate text-sm font-semibold ${ativa ? "text-neutral-100" : "text-neutral-500"}`}>
              {unidade.clienteNome}
            </p>
            <p className="truncate text-[10.5px] text-neutral-600">{unidade.contaNome}</p>
          </div>
        </Link>

        <Link
          href={href}
          className={`justify-self-end whitespace-nowrap rounded-full px-2.5 py-1 text-center text-xs font-semibold sm:justify-self-start ${
            ativa ? "bg-ok/15 text-ok" : "bg-white/[0.05] text-neutral-500"
          }`}
        >
          {semDados
            ? "Aguardando dados"
            : ativa
              ? `${unidade.campanhasAtivas} campanha${unidade.campanhasAtivas !== 1 ? "s" : ""}`
              : "Nenhuma no ar"}
        </Link>

        <Link
          href={href}
          className="col-span-2 flex items-baseline justify-between gap-2 sm:col-span-1 sm:block sm:text-right"
        >
          <span className="text-[10.5px] text-neutral-500 sm:hidden">Gasto em {nomeMes}</span>
          <span className="block text-sm font-semibold text-neutral-100">
            {unidade.gastoMesCentavos !== null ? reais(unidade.gastoMesCentavos) : "—"}
          </span>
        </Link>

        {comBoost && (
          <div className="col-span-2 border-t border-white/5 pt-2 sm:col-span-1 sm:border-0 sm:pt-0">
            {unidade.boost.temInstagram ? (
              <div className="grid grid-cols-[1fr_1rem_auto] items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalAberto(true)}
                  className="flex items-center gap-1.5 justify-self-start text-[11px] font-semibold text-neutral-300 hover:text-neutral-100"
                >
                  <Lightning
                    size={12}
                    weight={boostLigado ? "fill" : "regular"}
                    className={boostLigado ? "text-ok" : "text-neutral-500"}
                  />
                  Boost
                  {boostLigado && unidade.boost.noAr > 0 && (
                    <span
                      title={`${unidade.boost.noAr} campanha${unidade.boost.noAr > 1 ? "s" : ""} de boost automático no ar`}
                      className="rounded-full bg-ok/20 px-1.5 py-px text-[10px] font-bold leading-none text-ok"
                    >
                      {unidade.boost.noAr}
                    </span>
                  )}
                </button>
                {/* Espaço reservado pro aviso de erro: com ou sem ele, o interruptor fica no mesmo lugar. */}
                <span className="flex justify-center">
                  {boostLigado && unidade.boost.falha && (
                    <button
                      type="button"
                      onClick={() => setMostrarErro((atual) => !atual)}
                      aria-label="Boost automático precisa de atenção — ver erro"
                      className="text-danger transition hover:text-danger/80"
                    >
                      <WarningCircle size={14} weight="fill" />
                    </button>
                  )}
                </span>
                <button
                  type="button"
                  onClick={alternar}
                  disabled={alternando}
                  aria-label={boostLigado ? "Desligar boost automático" : "Ligar boost automático"}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50 ${
                    boostLigado ? "bg-ok/70" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      boostLigado ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ) : (
              <span className="text-[10.5px] text-neutral-600" title="Sem Instagram vinculado a essa conta">
                sem Instagram
              </span>
            )}
          </div>
        )}
      </div>

      {comBoost && boostLigado && unidade.boost.falha && mostrarErro && (
        <div className="mx-5 mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
          {unidade.boost.falha.erroMensagem ?? "Falha desconhecida ao tentar turbinar o post de hoje."}
          <span className="mt-1 block text-neutral-500">{tempoRelativo(unidade.boost.falha.criadoEm)}</span>
        </div>
      )}

      {modalAberto && (
        <ModalBoostAutomatico
          clienteId={unidade.boost.clienteId}
          conta={{
            id: unidade.contaId,
            nome_exibicao: unidade.boost.nomeExibicao,
            meta_ad_account_nome: unidade.boost.metaAdAccountNome,
            meta_ad_account_id: unidade.boost.metaAdAccountId,
            ...boostConfig,
          }}
          onFechar={() => setModalAberto(false)}
          onSalvo={(alteracoes) => {
            setBoostConfig(alteracoes);
            setModalAberto(false);
          }}
        />
      )}
    </li>
  );
}
