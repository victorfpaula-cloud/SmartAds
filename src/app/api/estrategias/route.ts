import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Estrategia, EtapaEstrategia } from "@/lib/estrategias/tipos";

export const dynamic = "force-dynamic";

interface LinhaEtapaBanco {
  id: string;
  ordem: number;
  nome_etapa: string;
  tipo_modelo: string;
  percentual_orcamento: number;
  offset_dias_inicio: number;
  duracao_dias: number | null;
}

function etapaDoBanco(linha: LinhaEtapaBanco): EtapaEstrategia {
  return {
    id: linha.id,
    ordem: linha.ordem,
    nomeEtapa: linha.nome_etapa,
    tipoModelo: linha.tipo_modelo as EtapaEstrategia["tipoModelo"],
    percentualOrcamento: linha.percentual_orcamento,
    offsetDiasInicio: linha.offset_dias_inicio,
    duracaoDias: linha.duracao_dias,
  };
}

/** Todas as estratégias (moldes), com as etapas já embutidas — a tela de listagem mostra a
 * sequência inteira sem precisar de uma segunda busca por estratégia. */
export async function GET() {
  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("smartads_estrategias")
    .select("id, nome, descricao, ativa, created_at, smartads_estrategia_etapas(*)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const estrategias: Estrategia[] = (data ?? []).map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    descricao: linha.descricao,
    ativa: linha.ativa,
    criadoEm: linha.created_at,
    etapas: (linha.smartads_estrategia_etapas as LinhaEtapaBanco[])
      .map(etapaDoBanco)
      .sort((a, b) => a.ordem - b.ordem),
  }));

  return NextResponse.json({ estrategias });
}

interface CorpoEtapa {
  nomeEtapa: string;
  tipoModelo: string;
  percentualOrcamento: number;
  offsetDiasInicio?: number;
  duracaoDias?: number | null;
}

interface CorpoCriacao {
  nome: string;
  descricao?: string;
  etapas: CorpoEtapa[];
}

/** Cria o molde inteiro numa tacada — a estratégia e todas as etapas da sequência. A soma dos
 * percentuais de orçamento das etapas precisa fechar 100 (validado aqui, não no banco, porque o
 * banco só garante 0 < percentual <= 100 por etapa individual). */
export async function POST(request: NextRequest) {
  const corpo = (await request.json().catch(() => null)) as CorpoCriacao | null;
  if (!corpo?.nome?.trim() || !corpo.etapas?.length) {
    return NextResponse.json({ erro: "Informe o nome e pelo menos uma etapa." }, { status: 400 });
  }

  const somaPercentual = corpo.etapas.reduce((soma, etapa) => soma + etapa.percentualOrcamento, 0);
  if (Math.round(somaPercentual) !== 100) {
    return NextResponse.json(
      { erro: `A soma do orçamento das etapas precisa fechar 100% (está em ${somaPercentual}%).` },
      { status: 400 }
    );
  }

  const supabase = criarClienteAdmin();
  const { data: estrategia, error: erroEstrategia } = await supabase
    .from("smartads_estrategias")
    .insert({ nome: corpo.nome.trim(), descricao: corpo.descricao?.trim() || null })
    .select()
    .single();

  if (erroEstrategia || !estrategia) {
    return NextResponse.json({ erro: erroEstrategia?.message ?? "Falha ao criar a estratégia." }, { status: 500 });
  }

  const { data: etapas, error: erroEtapas } = await supabase
    .from("smartads_estrategia_etapas")
    .insert(
      corpo.etapas.map((etapa, indice) => ({
        estrategia_id: estrategia.id,
        ordem: indice + 1,
        nome_etapa: etapa.nomeEtapa,
        tipo_modelo: etapa.tipoModelo,
        percentual_orcamento: etapa.percentualOrcamento,
        offset_dias_inicio: etapa.offsetDiasInicio ?? 0,
        duracao_dias: etapa.duracaoDias ?? null,
      }))
    )
    .select();

  if (erroEtapas) {
    // Rollback manual — sem etapas, o molde fica inútil e só confunde na listagem.
    await supabase.from("smartads_estrategias").delete().eq("id", estrategia.id);
    return NextResponse.json({ erro: erroEtapas.message }, { status: 500 });
  }

  const resultado: Estrategia = {
    id: estrategia.id,
    nome: estrategia.nome,
    descricao: estrategia.descricao,
    ativa: estrategia.ativa,
    criadoEm: estrategia.created_at,
    etapas: (etapas as LinhaEtapaBanco[]).map(etapaDoBanco).sort((a, b) => a.ordem - b.ordem),
  };

  return NextResponse.json({ estrategia: resultado }, { status: 201 });
}
