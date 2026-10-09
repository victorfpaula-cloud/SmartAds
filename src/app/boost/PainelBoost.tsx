"use client";

import { useState } from "react";
import ModalBoostAutomatico, { type ContaBoost, type AlteracoesBoost } from "@/components/ModalBoostAutomatico";
import { ROTULO_ENTREGA, custoPorBoostCentavos, type TipoEntregaBoost } from "@/lib/boostRede";

export interface UnidadeBoost {
  clienteId: string;
  clienteNome: string;
  conta: ContaBoost & { ativo?: boolean };
}

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (centavos: number) => formatoReal.format(centavos / 100);
const rotuloPosts = (n: number) => (n >= 10 ? "Todos do dia" : n === 1 ? "1 por dia" : `Até ${n} por dia`);

/** Uma linha por conta — tudo do boost (liga/desliga, o que entrega, público, orçamento, duração, posts
 * por dia e datas especiais) é configurado dentro do "Configurar" dela. */
export default function PainelBoost({ unidades: unidadesIniciais }: { unidades: UnidadeBoost[] }) {
  const [unidades, setUnidades] = useState(unidadesIniciais);
  const [editando, setEditando] = useState<UnidadeBoost | null>(null);

  if (unidades.length === 0) {
    return <p className="cartao-vidro mt-6 px-5 py-6 text-sm text-neutral-500">Nenhuma conta ativa neste ambiente.</p>;
  }

  return (
    <>
      <section className="cartao-vidro mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-3 font-medium">Conta</th>
                <th className="px-4 py-3 font-medium">Boost</th>
                <th className="px-4 py-3 font-medium">Entrega</th>
                <th className="px-4 py-3 font-medium">Orçamento/dia</th>
                <th className="px-4 py-3 font-medium">Posts</th>
                <th className="px-4 py-3 font-medium">Custo por boost</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {unidades.map((u) => {
                const c = u.conta;
                const tipo = (c.boost_tipo_entrega ?? "engajamento") as TipoEntregaBoost;
                const orc = c.boost_automatico_orcamento_centavos;
                const dur = c.boost_automatico_duracao_dias ?? 3;
                const custo = orc ? custoPorBoostCentavos(orc, dur, tipo) : null;
                const semPublico = c.boost_automatico_ativo && !c.boost_automatico_publico_id;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-100">{u.clienteNome}</p>
                      <p className="text-[10.5px] text-neutral-600">{c.nome_exibicao || c.meta_ad_account_nome || c.meta_ad_account_id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={c.boost_automatico_ativo ? "font-semibold text-ok" : "text-neutral-500"}>
                        {c.boost_automatico_ativo ? "Ligado" : "Desligado"}
                      </span>
                      {semPublico && <p className="text-[10.5px] text-amber-400">falta escolher o público</p>}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">{ROTULO_ENTREGA[tipo]}</td>
                    <td className="px-4 py-3 text-neutral-300">{orc ? reais(orc) : "—"}</td>
                    <td className="px-4 py-3 text-neutral-300">{rotuloPosts(c.boost_posts_por_dia ?? 1)}</td>
                    <td className="px-4 py-3 text-neutral-300">{custo ? `${reais(custo)} (${dur} dias)` : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditando(u)}
                        className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-white/10"
                      >
                        Configurar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editando && (
        <ModalBoostAutomatico
          clienteId={editando.clienteId}
          conta={editando.conta}
          onFechar={() => setEditando(null)}
          onSalvo={(alt: AlteracoesBoost) => {
            setUnidades((atual) => atual.map((u) => (u.conta.id === editando.conta.id ? { ...u, conta: { ...u.conta, ...alt } } : u)));
            setEditando(null);
          }}
        />
      )}
    </>
  );
}
