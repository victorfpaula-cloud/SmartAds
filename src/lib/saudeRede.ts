import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { DadosRelatorioAds, ItemOrganico } from "@/lib/relatorioAds";

export const PERIODOS_SAUDE_REDE = [
  { dias: 7, rotulo: "Semana", detalhe: "7 dias" },
  { dias: 15, rotulo: "Quinzena", detalhe: "15 dias" },
  { dias: 30, rotulo: "Mês", detalhe: "30 dias" },
] as const;

export interface ContaDaRede {
  contaId: string;
  unidade: string;
  instagram: string | null;
  adAccountId: string | null;
  instagramId: string | null;
}

/** Contas ativas da franquia (uma linha por conta de anúncio). */
export async function listarContasDaRede(empresaId: string): Promise<ContaDaRede[]> {
  const { data } = await criarClienteAdmin()
    .from("smartads_clientes")
    .select("nome, smartads_contas_meta(id, ativo, instagram_username, meta_ad_account_id, instagram_business_id)")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .order("nome");
  return (data ?? []).flatMap((c: any) =>
    (c.smartads_contas_meta ?? [])
      .filter((conta: any) => conta.ativo !== false)
      .map((conta: any) => ({
        contaId: conta.id,
        unidade: c.nome,
        instagram: conta.instagram_username ?? null,
        adAccountId: conta.meta_ad_account_id ?? null,
        instagramId: conta.instagram_business_id ?? null,
      }))
  );
}

/** Contas cuja conta de anúncio e Instagram já aparecem em outra da lista (ex.: Principal e Expansão
 * usam a mesma) — contadas uma vez só, pra não dobrar os totais da rede. Devolve contaId → nome da
 * unidade que já representa os mesmos números. */
export function contasRepetidas(contas: ContaDaRede[]): Map<string, string> {
  const vistas = new Map<string, string>();
  const repetidas = new Map<string, string>();
  for (const c of contas) {
    const chave = `${c.adAccountId ?? "-"}|${c.instagramId ?? "-"}`;
    if (chave === "-|-") continue;
    const dona = vistas.get(chave);
    if (dona) repetidas.set(c.contaId, dona);
    else vistas.set(chave, c.unidade);
  }
  return repetidas;
}

/** Tira do relatório o que a Saúde da rede não usa (detalhe por campanha) pra o cache ficar pequeno. */
export function enxugar(d: DadosRelatorioAds): Omit<DadosRelatorioAds, "campanhas"> {
  const { campanhas: _campanhas, ...resto } = d;
  return resto;
}

export interface LinhaUnidade {
  contaId: string;
  unidade: string;
  instagram: string | null;
  status: "ok" | "sem_dados" | "erro" | "sem_instagram" | "repetida";
  mensagem: string | null;
  calculadoEm: string | null;
  posts: number | null;
  alcance: number | null;
  visualizacoes: number | null;
  interacoes: number | null;
  taxaEngajamento: number | null; // interações por 100 alcançados
  novosSeguidores: number | null;
  seguidores: number | null;
  gasto: number;
  alcanceAnuncios: number;
}

export interface ParteOrganicoTrafego {
  total: number;
  organico: number;
  trafego: number;
}

export interface ResumoRede {
  periodoDias: number;
  unidadesTotal: number;
  unidadesComDados: number;
  atualizadoEm: string | null;
  linhas: LinhaUnidade[];
  alcance: number;
  visualizacoes: number;
  interacoes: number;
  visitasPerfil: number;
  novosSeguidores: number;
  seguidores: number;
  posts: number;
  taxaEngajamento: number | null;
  curtidas: number;
  comentarios: number;
  compartilhamentos: number;
  salvamentos: number;
  divisao: {
    alcance: ParteOrganicoTrafego | null;
    visualizacoes: ParteOrganicoTrafego | null;
    interacoes: ParteOrganicoTrafego | null;
  };
  anuncios: {
    gasto: number;
    alcance: number;
    impressoes: number;
    cliquesNoLink: number;
    engajamentos: number;
    cpm: number | null;
    custoPorMilAlcancados: number | null;
    custoPorEngajamento: number | null;
    unidadesInvestindo: number;
  };
  serieDiaria: Array<{ dia: string; alcance: number; gasto: number }>;
}

const item = (d: Omit<DadosRelatorioAds, "campanhas">, chave: string): ItemOrganico | undefined =>
  d.organico?.find((i) => i.chave === chave);

/** Lê o cache da Saúde da rede e soma tudo. Nada aqui chama a Meta — os números vêm do botão Atualizar. */
export async function carregarSaudeRede(empresaId: string, dias: number): Promise<ResumoRede> {
  const contas = await listarContasDaRede(empresaId);
  const repetidas = contasRepetidas(contas);
  const { data: cache } =
    contas.length > 0
      ? await criarClienteAdmin()
          .from("smartads_saude_rede_cache")
          .select("conta_id, dados, erro, calculado_em")
          .eq("dias", dias)
          .in("conta_id", contas.map((c) => c.contaId))
      : { data: [] as any[] };
  const porConta = new Map((cache ?? []).map((l: any) => [l.conta_id as string, l]));

  const r: ResumoRede = {
    periodoDias: dias,
    unidadesTotal: contas.length,
    unidadesComDados: 0,
    atualizadoEm: null,
    linhas: [],
    alcance: 0, visualizacoes: 0, interacoes: 0, visitasPerfil: 0, novosSeguidores: 0, seguidores: 0, posts: 0,
    taxaEngajamento: null,
    curtidas: 0, comentarios: 0, compartilhamentos: 0, salvamentos: 0,
    divisao: { alcance: null, visualizacoes: null, interacoes: null },
    anuncios: { gasto: 0, alcance: 0, impressoes: 0, cliquesNoLink: 0, engajamentos: 0, cpm: null, custoPorMilAlcancados: null, custoPorEngajamento: null, unidadesInvestindo: 0 },
    serieDiaria: [],
  };
  const serie = new Map<string, { alcance: number; gasto: number }>();
  const dv = { alcance: { total: 0, organico: 0, trafego: 0, n: 0 }, visualizacoes: { total: 0, organico: 0, trafego: 0, n: 0 }, interacoes: { total: 0, organico: 0, trafego: 0, n: 0 } };

  const adsJaSomados = new Set<string>();
  const igJaSomados = new Set<string>();
  for (const c of contas) {
    const linhaCache = porConta.get(c.contaId);
    const base = { contaId: c.contaId, unidade: c.unidade, instagram: c.instagram };
    const vazia: LinhaUnidade = { ...base, status: "sem_dados", mensagem: null, calculadoEm: null, posts: null, alcance: null, visualizacoes: null, interacoes: null, taxaEngajamento: null, novosSeguidores: null, seguidores: null, gasto: 0, alcanceAnuncios: 0 };
    const dona = repetidas.get(c.contaId);
    if (dona) {
      r.linhas.push({ ...vazia, status: "repetida", mensagem: `Mesma conta de anúncio e Instagram de ${dona} — já contados lá, uma vez só.` });
      continue;
    }
    if (!linhaCache) {
      r.linhas.push(vazia);
      continue;
    }
    if (!linhaCache.dados) {
      r.linhas.push({ ...vazia, status: "erro", mensagem: linhaCache.erro ?? "Falha ao buscar na Meta.", calculadoEm: linhaCache.calculado_em });
      continue;
    }
    const d = linhaCache.dados as Omit<DadosRelatorioAds, "campanhas">;
    if (!r.atualizadoEm || linhaCache.calculado_em < r.atualizadoEm) r.atualizadoEm = linhaCache.calculado_em;
    r.unidadesComDados++;

    const t = d.totais;
    // Duas contas diferentes podem usar a mesma conta de anúncio (ex.: Stop Bike duplicada): soma uma vez.
    const novaContaAnuncio = !c.adAccountId || !adsJaSomados.has(c.adAccountId);
    if (c.adAccountId) adsJaSomados.add(c.adAccountId);
    if (novaContaAnuncio) {
      r.anuncios.gasto += t.gasto;
      r.anuncios.alcance += t.alcance;
      r.anuncios.impressoes += t.impressoes;
      r.anuncios.cliquesNoLink += t.cliquesNoLink;
      r.anuncios.engajamentos += t.engajamentos;
      if (t.gasto > 0) r.anuncios.unidadesInvestindo++;
    }
    for (const s of novaContaAnuncio ? d.serieDiaria ?? [] : []) {
      const x = serie.get(s.dia) ?? { alcance: 0, gasto: 0 };
      x.alcance += s.alcance;
      x.gasto += s.gasto;
      serie.set(s.dia, x);
    }

    const ig = d.instagram;
    const novoInstagram = !c.instagramId || !igJaSomados.has(c.instagramId);
    if (c.instagramId) igJaSomados.add(c.instagramId);
    if (ig && !novoInstagram) {
      r.linhas.push({ ...base, status: "repetida", mensagem: "Mesmo Instagram de outra unidade — contado uma vez só.", calculadoEm: linhaCache.calculado_em, posts: null, alcance: null, visualizacoes: null, interacoes: null, taxaEngajamento: null, novosSeguidores: null, seguidores: null, gasto: 0, alcanceAnuncios: 0 });
      continue;
    }
    if (!ig) {
      r.linhas.push({ ...base, status: "sem_instagram", mensagem: "Sem Instagram conectado", calculadoEm: linhaCache.calculado_em, posts: null, alcance: null, visualizacoes: null, interacoes: null, taxaEngajamento: null, novosSeguidores: null, seguidores: null, gasto: t.gasto, alcanceAnuncios: t.alcance });
      continue;
    }

    const vis = item(d, "visualizacoes");
    const cur = item(d, "curtidas");
    const com = item(d, "comentarios");
    const sha = item(d, "compartilhamentos");
    const sal = item(d, "salvamentos");
    const partes = [cur, com, sha, sal];
    const interacoes = partes.some((p) => p?.total != null) ? partes.reduce((s, p) => s + (p?.total ?? 0), 0) : null;
    const alcance = ig.alcance;
    const taxa = interacoes !== null && alcance && alcance > 0 ? (interacoes / alcance) * 100 : null;

    r.posts += ig.postsPublicados ?? 0;
    r.alcance += alcance ?? 0;
    r.visualizacoes += vis?.total ?? 0;
    r.interacoes += interacoes ?? 0;
    r.visitasPerfil += ig.visitasPerfil ?? 0;
    r.novosSeguidores += ig.novosSeguidores ?? 0;
    r.seguidores += ig.seguidores ?? 0;
    r.curtidas += cur?.total ?? 0;
    r.comentarios += com?.total ?? 0;
    r.compartilhamentos += sha?.total ?? 0;
    r.salvamentos += sal?.total ?? 0;

    // Orgânico × tráfego: só soma onde a Meta deu os dois lados.
    const alc = item(d, "alcance");
    if (alc && alc.total != null && alc.organico != null && alc.trafego != null) {
      dv.alcance.total += alc.total; dv.alcance.organico += alc.organico; dv.alcance.trafego += alc.trafego; dv.alcance.n++;
    }
    if (vis && vis.total != null && vis.organico != null && vis.trafego != null) {
      dv.visualizacoes.total += vis.total; dv.visualizacoes.organico += vis.organico; dv.visualizacoes.trafego += vis.trafego; dv.visualizacoes.n++;
    }
    if (partes.every((p) => p && p.total != null && p.organico != null && p.trafego != null)) {
      dv.interacoes.total += partes.reduce((s, p) => s + (p!.total ?? 0), 0);
      dv.interacoes.organico += partes.reduce((s, p) => s + (p!.organico ?? 0), 0);
      dv.interacoes.trafego += partes.reduce((s, p) => s + (p!.trafego ?? 0), 0);
      dv.interacoes.n++;
    }

    r.linhas.push({
      ...base,
      status: "ok",
      mensagem: null,
      calculadoEm: linhaCache.calculado_em,
      posts: ig.postsPublicados,
      alcance,
      visualizacoes: vis?.total ?? null,
      interacoes,
      taxaEngajamento: taxa,
      novosSeguidores: ig.novosSeguidores,
      seguidores: ig.seguidores,
      gasto: t.gasto,
      alcanceAnuncios: t.alcance,
    });
  }

  r.taxaEngajamento = r.alcance > 0 && r.interacoes > 0 ? (r.interacoes / r.alcance) * 100 : null;
  for (const k of ["alcance", "visualizacoes", "interacoes"] as const) {
    r.divisao[k] = dv[k].n > 0 ? { total: dv[k].total, organico: dv[k].organico, trafego: dv[k].trafego } : null;
  }
  const a = r.anuncios;
  a.cpm = a.impressoes > 0 ? (a.gasto / a.impressoes) * 1000 : null;
  a.custoPorMilAlcancados = a.alcance > 0 ? (a.gasto / a.alcance) * 1000 : null;
  a.custoPorEngajamento = a.engajamentos > 0 ? a.gasto / a.engajamentos : null;
  r.serieDiaria = [...serie.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([dia, v]) => ({ dia, ...v }));
  return r;
}
