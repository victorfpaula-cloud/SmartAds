// Traduz os erros mais comuns que a Graph API devolve pra mensagens em português, claras o
// bastante pra alguém sem vocabulário técnico entender o que fazer. A Meta manda um objeto
// `error: { message, code, error_subcode, error_user_msg, error_user_title }` — quando ela mesma
// já manda um `error_user_msg` (texto pensado pra usuário final), usamos ele traduzido/formatado;
// senão caímos no dicionário abaixo por `code`, e por último num fallback genérico.
//
// Lista construída com os erros mais frequentes de criação de campanha/conjunto/anúncio — não é
// exaustiva de propósito (a Meta tem centenas de códigos). Qualquer erro não mapeado aqui cai no
// fallback e fica registrado (com o `code` original) em smartads_acoes_log, pra dar pra mapear ele
// também depois de aparecer na prática.
const MENSAGENS_POR_CODIGO: Record<number, string> = {
  100: "Um dos campos enviados está com um valor que a Meta não aceita. Confira o orçamento, as datas e os campos obrigatórios do passo atual.",
  190: "A conexão com a Meta expirou. Reconecte em Contas > Conectar Meta.",
  200: "Falta permissão pra essa ação nessa conta/página. Pode ser preciso reconectar ou confirmar o acesso no Business Manager.",
  272: "Não foi possível processar a imagem/vídeo enviado. Confira o formato e o tamanho do arquivo.",
  2635: "Esse recurso não está mais disponível pra essa conta de anúncio.",
};

const SUBCODIGOS_ORCAMENTO_BAIXO = new Set([1487136, 1815656]);

export interface ErroGraphAPI {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_user_msg?: string;
  error_user_title?: string;
}

export function traduzirErroMeta(erro: ErroGraphAPI | undefined): string {
  if (!erro) return "Erro desconhecido ao falar com a Meta.";

  if (erro.error_subcode && SUBCODIGOS_ORCAMENTO_BAIXO.has(erro.error_subcode)) {
    return "O orçamento informado está abaixo do mínimo que a Meta aceita pra esse tipo de campanha. Aumente o valor e tente de novo.";
  }

  if (erro.error_user_msg) {
    return erro.error_user_title
      ? `${erro.error_user_title}: ${erro.error_user_msg}`
      : erro.error_user_msg;
  }

  // O código 100 ("parâmetro inválido") cobre dezenas de causas diferentes — a mensagem genérica
  // sozinha escondia o motivo real quando a Meta não manda error_user_msg, tornando impossível
  // diagnosticar qual campo era o problema (achado em 12/09/2026 publicando uma campanha de
  // verdade). Agora sempre anexa o texto original da Meta como detalhe técnico.
  if (erro.code && MENSAGENS_POR_CODIGO[erro.code]) {
    const base = MENSAGENS_POR_CODIGO[erro.code];
    return erro.message ? `${base} Detalhe técnico: ${erro.message}` : base;
  }

  return erro.message || "Erro desconhecido ao falar com a Meta.";
}

export class ErroGraphAPIException extends Error {
  original: ErroGraphAPI;
  constructor(erro: ErroGraphAPI) {
    super(traduzirErroMeta(erro));
    this.name = "ErroGraphAPIException";
    this.original = erro;
  }
}
