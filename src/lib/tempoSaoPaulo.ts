// Helpers de data/hora no fuso de São Paulo — extraído de relatorioPostagens.ts pra ser
// compartilhado com o monitoramento de stories (src/lib/stories.ts), que também precisa bucketizar
// eventos por dia calendário de SP. Fonte única: os dois módulos concordam sempre no mesmo "dia".

export const FUSO_HORARIO_SP = "America/Sao_Paulo";

export function diaEmSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_HORARIO_SP }).format(new Date(iso));
}

export function horaEmSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_HORARIO_SP, hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

export function formatarDiaExibicao(diaISO: string): string {
  const [, mes, dia] = diaISO.split("-");
  return `${dia}/${mes}`;
}

// Aritmética de calendário pura (sem passar por Date com fuso horário) — diaISO já é a data no
// fuso de São Paulo, então somar/subtrair dias aqui não pode reintroduzir erro de fuso.
export function adicionarDias(diaISO: string, quantidade: number): string {
  const [ano, mes, dia] = diaISO.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + quantidade)).toISOString().slice(0, 10);
}
