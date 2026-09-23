import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { CampanhaMae } from "@/lib/estrategias/tipos";

export const dynamic = "force-dynamic";

interface LinhaCampanhaMaeBanco {
  id: string;
  estrategia_id: string;
  nome: string;
  data_inicio: string;
  investimento_minimo_centavos: number;
  investimento_maximo_centavos: number;
  criativo_titulo: string | null;
  criativo_mensagem: string;
  criativo_imagem_base64: string;
  criativo_cta: string;
  status: CampanhaMae["status"];
  created_at: string;
}

function doBanco(linha: LinhaCampanhaMaeBanco): CampanhaMae {
  return {
    id: linha.id,
    estrategiaId: linha.estrategia_id,
    nome: linha.nome,
    dataInicio: linha.data_inicio,
    investimentoMinimoCentavos: linha.investimento_minimo_centavos,
    investimentoMaximoCentavos: linha.investimento_maximo_centavos,
    criativoTitulo: linha.criativo_titulo,
    criativoMensagem: linha.criativo_mensagem,
    criativoImagemBase64: linha.criativo_imagem_base64,
    criativoCta: linha.criativo_cta,
    status: linha.status,
    criadoEm: linha.created_at,
  };
}

/** Todas as Campanhas-Mãe, com o nome da Estratégia usada e quantas unidades já participam (via
 * contagem de Planos de Execução linkados) — alimenta a lista em /estrategias/campanhas-mae. */
export async function GET() {
  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_campanhas_mae")
    .select("*, smartads_estrategias(nome), smartads_planos_execucao(id)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const campanhas = (data ?? []).map((linha: any) => ({
    ...doBanco(linha),
    estrategiaNome: linha.smartads_estrategias?.nome ?? "—",
    numeroDeUnidades: (linha.smartads_planos_execucao as any[])?.length ?? 0,
  }));

  return NextResponse.json({ campanhas });
}

interface CorpoCriacao {
  estrategiaId: string;
  nome: string;
  dataInicio: string;
  investimentoMinimoCentavos: number;
  investimentoMaximoCentavos: number;
  criativoTitulo?: string;
  criativoMensagem: string;
  criativoImagemBase64: string;
  criativoCta?: string;
}

/** Cria a Campanha-Mãe — só o "padrão" (estratégia, período, faixa de investimento, criativo
 * oficial). Nenhuma campanha nem plano nasce aqui ainda: isso acontece quando ela é disparada pra
 * unidades específicas (ver /api/campanhas-mae/[id]/aplicar). */
export async function POST(request: NextRequest) {
  const corpo = (await request.json().catch(() => null)) as CorpoCriacao | null;

  if (
    !corpo?.estrategiaId ||
    !corpo.nome?.trim() ||
    !corpo.dataInicio ||
    !corpo.investimentoMinimoCentavos ||
    !corpo.investimentoMaximoCentavos ||
    !corpo.criativoMensagem?.trim() ||
    !corpo.criativoImagemBase64
  ) {
    return NextResponse.json({ erro: "Faltam campos obrigatórios." }, { status: 400 });
  }

  if (corpo.investimentoMaximoCentavos < corpo.investimentoMinimoCentavos) {
    return NextResponse.json(
      { erro: "O investimento máximo não pode ser menor que o mínimo." },
      { status: 400 }
    );
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_campanhas_mae")
    .insert({
      estrategia_id: corpo.estrategiaId,
      nome: corpo.nome.trim(),
      data_inicio: corpo.dataInicio,
      investimento_minimo_centavos: corpo.investimentoMinimoCentavos,
      investimento_maximo_centavos: corpo.investimentoMaximoCentavos,
      criativo_titulo: corpo.criativoTitulo?.trim() || null,
      criativo_mensagem: corpo.criativoMensagem.trim(),
      criativo_imagem_base64: corpo.criativoImagemBase64,
      criativo_cta: corpo.criativoCta || "LEARN_MORE",
    })
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ erro: error?.message ?? "Falha ao criar a Campanha-Mãe." }, { status: 500 });
  }

  return NextResponse.json({ campanha: doBanco(data) }, { status: 201 });
}
