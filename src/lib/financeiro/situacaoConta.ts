export type TomSituacao = "ok" | "atencao" | "critico" | "neutro";

export interface SituacaoLegivel {
  texto: string;
  detalhe: string | null;
  tom: TomSituacao;
}

const MOTIVOS_DESATIVACAO: Record<number, string> = {
  1: "política de anúncios",
  2: "revisão de propriedade intelectual",
  3: "pagamento em atraso",
  4: "conta de teste/cliente desativada",
  5: "revisão de integridade da conta",
  6: "fim do ciclo de cobrança",
  7: "atividade incomum",
  8: "conta desativada pela Meta",
};

/** account_status da Meta traduzido pra uma linha que a pessoa entende — e se pede ação. */
export function descreverSituacaoConta(status: number | null, motivo: number | null): SituacaoLegivel {
  switch (status) {
    case null:
      return { texto: "Situação desconhecida", detalhe: null, tom: "neutro" };
    case 1:
      return { texto: "Ativa", detalhe: null, tom: "ok" };
    case 2:
      return {
        texto: "Desativada",
        detalhe: motivo && MOTIVOS_DESATIVACAO[motivo] ? `Motivo: ${MOTIVOS_DESATIVACAO[motivo]}` : null,
        tom: "critico",
      };
    case 3:
      return { texto: "Pagamento pendente", detalhe: "A Meta bloqueou os anúncios até regularizar o pagamento.", tom: "critico" };
    case 7:
      return { texto: "Em análise de risco", detalhe: "A Meta está revisando a conta; anúncios podem ficar parados.", tom: "atencao" };
    case 8:
      return { texto: "Acerto pendente", detalhe: "Há uma cobrança aguardando confirmação.", tom: "atencao" };
    case 9:
      return { texto: "Período de carência", detalhe: "Pagamento atrasado, ainda dentro do prazo da Meta.", tom: "atencao" };
    case 100:
    case 101:
      return { texto: "Em encerramento", detalhe: null, tom: "critico" };
    case 201:
      return { texto: "Encerrada", detalhe: null, tom: "critico" };
    default:
      return { texto: `Status ${status}`, detalhe: null, tom: "atencao" };
  }
}
