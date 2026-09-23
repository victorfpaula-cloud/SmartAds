import Cabecalho from "@/components/Cabecalho";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import PainelContas from "./PainelContas";

export const dynamic = "force-dynamic";

export default async function ContasPage({
  searchParams,
}: {
  searchParams: { meta_conectado?: string; meta_erro?: string };
}) {
  const supabase = criarClienteAdmin();

  const [{ data: clientes }, { data: statusMeta }, { data: campanhas }, { data: empresas }] = await Promise.all([
    supabase
      .from("smartads_clientes")
      .select("*, smartads_empresas(id, nome, tipo), smartads_contas_meta(*)")
      .order("nome"),
    supabase
      .from("smartads_meta_status")
      .select("conectado, meta_user_nome, token_expira_em, ultimo_erro")
      .eq("id", "default")
      .single(),
    supabase.from("smartads_campanhas_criadas").select("conta_id, meta_ad_ids"),
    supabase.from("smartads_empresas").select("id, nome, tipo").order("nome"),
  ]);

  // Quantos anúncios o SmartAds já criou por conta — proxy honesto de diversidade de criativo
  // (não é a contagem real da Meta, que incluiria anúncios feitos fora do app; é só o que a gente
  // sabe). Soma o tamanho de cada array meta_ad_ids (1 por variação de imagem, ver PR de
  // múltiplas imagens) agrupado por conta.
  const anunciosPorConta: Record<string, number> = {};
  for (const linha of campanhas ?? []) {
    const quantidade = Array.isArray(linha.meta_ad_ids) ? linha.meta_ad_ids.length : 0;
    anunciosPorConta[linha.conta_id] = (anunciosPorConta[linha.conta_id] ?? 0) + quantidade;
  }

  return (
    <>
      <Cabecalho ativo="/contas" />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
        <PainelContas
          clientesIniciais={clientes ?? []}
          empresasIniciais={empresas ?? []}
          statusMetaInicial={statusMeta ?? { conectado: false }}
          anunciosPorConta={anunciosPorConta}
          avisoConexao={
            searchParams.meta_conectado ? "conectado" : searchParams.meta_erro ? "erro" : null
          }
          mensagemErro={searchParams.meta_erro}
        />
      </main>
    </>
  );
}
