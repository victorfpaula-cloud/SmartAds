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

// Diferença em DIAS DE CALENDÁRIO (SP) entre dois instantes — não "quantas horas corridas se
// passaram, dividido por 24". Um post de ontem às 23h59 já é "há 1 dia" a partir da meia-noite,
// mesmo sem ter completado 24h corridas; e um post de hoje às 00h05 continua "hoje" o dia inteiro.
// Usar (agora.getTime() - post.getTime()) / 86_400_000 confunde essas duas noções — foi o bug do
// "Postou hoje" continuando a aparecer depois da virada do dia (ver Radar de posts).
export function diasEntreEmSaoPaulo(isoRecente: string, isoAntigo: string): number {
  const [anoR, mesR, diaR] = diaEmSaoPaulo(isoRecente).split("-").map(Number);
  const [anoA, mesA, diaA] = diaEmSaoPaulo(isoAntigo).split("-").map(Number);
  return Math.round((Date.UTC(anoR, mesR - 1, diaR) - Date.UTC(anoA, mesA - 1, diaA)) / 86_400_000);
}

/** "AAAA-MM" do mês corrente no fuso de São Paulo — chave do cache de gasto do mês. */
export function mesAtualEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(agora)
    .slice(0, 7);
}
