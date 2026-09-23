import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { CampanhaMae, ModoCriativoCampanhaMae } from "@/lib/estrategias/tipos";

export const dynamic = "force-dynamic";

interface LinhaCampanhaMaeBanco {
  id: string;
  estrategia_id: string;
  nome: string;
  data_inicio: string;
  investimento_minimo_centavos: number;
  investimento_maximo_centavos: number;
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
    status: linha.status,
    criadoEm: linha.created_at,
  };
}

/** Todas as Campanhas-Mãe, com o nome da Estratégia usada, quantas unidades já participam, e
 * quantas etapas com criativo oficial ainda estão "a definir" — alimenta a lista em
 * /estrategias/campanhas-mae, incluindo o aviso de pendência sem precisar abrir cada uma. */
export async function GET() {
  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_campanhas_mae")
    .select(
      "*, smartads_estrategias(nome), smartads_planos_execucao(id), smartads_campanha_mae_criativos(modo, criativo_imagem_base64)"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const campanhas = (data ?? []).map((linha: any) => {
    const criativos = (linha.smartads_campanha_mae_criativos ?? []) as {
      modo: ModoCriativoCampanhaMae;
      criativo_imagem_base64: string | null;
    }[];
    return {
      ...doBanco(linha),
      estrategiaNome: linha.smartads_estrategias?.nome ?? "—",
      numeroDeUnidades: (linha.smartads_planos_execucao as any[])?.length ?? 0,
      criativosPendentes: criativos.filter((c) => c.modo === "oficial_upload" && !c.criativo_imagem_base64).length,
    };
  });

  return NextResponse.json({ campanhas });
}

interface CorpoEtapaCriativo {
  estrategiaEtapaId: string;
  modo: ModoCriativoCampanhaMae;
  criativoTitulo?: string;
  criativoMensagem?: string;
  criativoImagemBase64?: string;
  criativoCta?: string;
}

interface CorpoCriacao {
  estrategiaId: string;
  nome: string;
  dataInicio: string;
  investimentoMinimoCentavos: number;
  investimentoMaximoCentavos: number;
  etapasCriativo?: CorpoEtapaCriativo[];
}

/** Cria a Campanha-Mãe (estratégia, período, faixa de investimento) e já cria uma linha de
 * criativo pra CADA etapa da estratégia usada — mesmo que ainda não tenha nada definido (modo
 * 'livre_por_unidade' por padrão, ou 'oficial_upload' com os campos em branco pra preencher
 * depois). Isso garante que toda etapa sempre tem uma linha pra consultar/editar, em vez de ter
 * que tratar "sem linha" como um terceiro estado espalhado pelo código. */
export async function POST(request: NextRequest) {
  const corpo = (await request.json().catch(() => null)) as CorpoCriacao | null;

  if (
    !corpo?.estrategiaId ||
    !corpo.nome?.trim() ||
    !corpo.dataInicio ||
    !corpo.investimentoMinimoCentavos ||
    !corpo.investimentoMaximoCentavos
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

  const { data: etapas, error: erroEtapas } = await supabase
    .from("smartads_estrategia_etapas")
    .select("id")
    .eq("estrategia_id", corpo.estrategiaId);

  if (erroEtapas || !etapas?.length) {
    return NextResponse.json({ erro: "Estratégia sem etapas — não dá pra criar a Campanha-Mãe." }, { status: 400 });
  }

  const { data: campanha, error: erroCampanha } = await supabase
    .from("smartads_campanhas_mae")
    .insert({
      estrategia_id: corpo.estrategiaId,
      nome: corpo.nome.trim(),
      data_inicio: corpo.dataInicio,
      investimento_minimo_centavos: corpo.investimentoMinimoCentavos,
      investimento_maximo_centavos: corpo.investimentoMaximoCentavos,
    })
    .select()
    .single();

  if (erroCampanha || !campanha) {
    return NextResponse.json({ erro: erroCampanha?.message ?? "Falha ao criar a Campanha-Mãe." }, { status: 500 });
  }

  const criativosPorEtapa = new Map((corpo.etapasCriativo ?? []).map((e) => [e.estrategiaEtapaId, e]));
  const linhasCriativos = etapas.map((etapa) => {
    const enviado = criativosPorEtapa.get(etapa.id);
    return {
      campanha_mae_id: campanha.id,
      estrategia_etapa_id: etapa.id,
      modo: enviado?.modo ?? "livre_por_unidade",
      criativo_titulo: enviado?.criativoTitulo?.trim() || null,
      criativo_mensagem: enviado?.criativoMensagem?.trim() || null,
      criativo_imagem_base64: enviado?.criativoImagemBase64 || null,
      criativo_cta: enviado?.criativoCta || null,
    };
  });

  const { error: erroCriativos } = await supabase.from("smartads_campanha_mae_criativos").insert(linhasCriativos);
  if (erroCriativos) {
    await supabase.from("smartads_campanhas_mae").delete().eq("id", campanha.id);
    return NextResponse.json({ erro: erroCriativos.message }, { status: 500 });
  }

  return NextResponse.json({ campanha: doBanco(campanha) }, { status: 201 });
}
