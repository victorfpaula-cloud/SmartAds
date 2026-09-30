export type NivelPrevisao = "critico" | "atencao" | "ok" | "neutro";

export interface PrevisaoSaldo {
  /** Texto principal da métrica: "5 dias", "hoje", "Sem saldo"... */
  texto: string;
  /** Linha pequena embaixo: a data prevista ou o motivo de não haver previsão. */
  detalhe: string | null;
  /** Dias inteiros até acabar; null quando não há previsão. */
  dias: number | null;
  nivel: NivelPrevisao;
}

const LIMITE_EXIBIDO_DIAS = 90;
const formatoDataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** Em quantos dias o saldo disponível acaba, no ritmo da média diária dos últimos 7 dias. É uma
 * estimativa simples (saldo ÷ média): não considera campanha nova, orçamento que mudou nem
 * recarga que ainda vai entrar. Sem saldo conhecido ou sem gasto recente, não inventa número. */
export function calcularPrevisaoSaldo(
  saldoCentavos: number | null,
  mediaDiariaCentavos: number,
  hoje: Date = new Date()
): PrevisaoSaldo {
  if (saldoCentavos === null) {
    return { texto: "—", detalhe: "saldo desconhecido", dias: null, nivel: "neutro" };
  }
  if (saldoCentavos <= 0) {
    // Zerada e ainda gastando é urgente; zerada e parada (sem campanha rodando) é só informação.
    return mediaDiariaCentavos > 0
      ? { texto: "Sem saldo", detalhe: "adicione crédito", dias: 0, nivel: "critico" }
      : { texto: "Sem saldo", detalhe: "sem gasto recente", dias: null, nivel: "neutro" };
  }
  if (mediaDiariaCentavos <= 0) {
    return { texto: "Sem gasto", detalhe: "nenhum gasto nos últimos 7 dias", dias: null, nivel: "neutro" };
  }

  const dias = Math.floor(saldoCentavos / mediaDiariaCentavos);
  if (dias > LIMITE_EXIBIDO_DIAS) {
    return { texto: `+${LIMITE_EXIBIDO_DIAS} dias`, detalhe: null, dias, nivel: "ok" };
  }

  const fim = new Date(hoje.getTime() + dias * 86_400_000);
  const nivel: NivelPrevisao = dias <= 3 ? "critico" : dias <= 7 ? "atencao" : "ok";
  return {
    texto: dias < 1 ? "hoje" : `${dias} dia${dias !== 1 ? "s" : ""}`,
    detalhe: dias < 1 ? "menos de 1 dia de saldo" : `até ${formatoDataCurta.format(fim)}`,
    dias,
    nivel,
  };
}
