-- SmartAds — schema inicial (clientes, contas de anúncio Meta, públicos salvos, campanhas criadas,
-- log de ações)
-- Roda uma vez no SQL Editor do MESMO projeto Supabase que já hospeda o directgov_*, o chatbot_*,
-- o shoppinghub_* e as tabelas do agendador — prefixo próprio smartads_, sem tocar em nenhuma
-- tabela dos outros produtos. RLS ativado sem policies públicas: leitura/escrita só via rotas
-- server-side com a service role key (mesmo padrão de segurança dos projetos irmãos).
--
-- Integração com a Meta Marketing API é DIRETA (não via Windsor.ai) — um único login com Facebook
-- (feito uma vez pelo dono, em /login/meta) gera um token de usuário de longa duração que cobre
-- todas as contas de anúncio e Business Managers que ele já administra pessoalmente (guardado em
-- smartads_meta_status, ver abaixo — não em variável de ambiente, porque precisa ser renovado
-- automaticamente antes de vencer). Por isso não existe aqui nenhuma tabela de "credenciais por
-- cliente": a conexão é sempre a mesma, o que muda por cliente é só qual conta de anúncio/página já
-- foi associada a ele (ver smartads_contas_meta).

-- ============================================================================
-- Clientes da agência (tenants) — cada um agrupa suas contas de anúncio, públicos salvos e
-- campanhas.
-- ============================================================================
create table if not exists smartads_clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table smartads_clientes enable row level security;

-- ============================================================================
-- Contas de anúncio Meta associadas a um cliente. Não é uma "conexão" própria (não guarda token
-- nenhum) — é só o mapeamento "essa conta de anúncio + essa página/Instagram pertencem a esse
-- cliente", escolhido uma vez na tela de contas conectadas a partir da lista que o login com a
-- Meta já enxerga (ver smartads_meta_status). Um cliente pode ter várias (alguns têm só 1, outros
-- até 20).
-- ============================================================================
create table if not exists smartads_contas_meta (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references smartads_clientes(id) on delete cascade,

  meta_business_id text,
  meta_ad_account_id text not null, -- formato "act_123456789", como a Graph API espera
  meta_ad_account_nome text,

  page_id text not null,
  page_nome text,
  instagram_business_id text, -- conta profissional do Instagram vinculada à página acima
  instagram_username text,

  nome_exibicao text, -- como aparece no seletor do app; cai pro nome da conta/página se em branco
  -- sigla curta (ex: "EXP") prefixada no nome de toda campanha criada pelo SmartAds nessa
  -- associação — identifica de qual "grupo" a campanha veio no Gerenciador de Anúncios, já que a
  -- MESMA conta de anúncio pode estar associada a mais de um cliente aqui dentro (ver comentário
  -- abaixo sobre não ter mais índice único por meta_ad_account_id).
  sigla_campanha text,
  ativo boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists smartads_contas_meta_cliente_idx on smartads_contas_meta(cliente_id);

-- Sem índice único em meta_ad_account_id de propósito: uma agência pode usar a MESMA conta de
-- anúncio + mesma Página/Instagram pra propósitos diferentes (ex: "Expansão" e "Principal" do
-- mesmo cliente), associando ela a mais de um registro de smartads_clientes. A separação entre
-- eles fica pela sigla_campanha no nome de cada campanha, não por uma trava no banco.

alter table smartads_contas_meta enable row level security;

-- ============================================================================
-- Públicos salvos — presets de segmentação reutilizáveis por cliente. Apesar do nome da coluna,
-- `targeting` guarda o formato NATIVO do SmartAds (localizações — cidade/ponto/região/país — mais
-- interesses, idade e gênero), não o spec já convertido da Meta: é isso que o construtor de
-- público (mapa + interesses) sabe reabrir pra editar depois. A conversão pro formato real da Meta
-- (`geo_locations`/`flexible_spec`) acontece só na hora de criar a campanha (montarTargeting em
-- src/lib/meta/api.ts).
--
-- Além dos públicos montados aqui dentro (`origem = 'smartads'`), também dá pra reaproveitar um
-- público que o cliente já tinha salvo direto no Gerenciador de Anúncios da Meta
-- (`origem = 'meta'`, com o `meta_saved_audience_id` original) — evita recriar do zero o que o
-- dono já vinha usando antes do SmartAds existir.
-- ============================================================================
create table if not exists smartads_publicos_salvos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references smartads_clientes(id) on delete cascade,
  nome text not null,

  origem text not null default 'smartads' check (origem in ('smartads', 'meta')),
  meta_saved_audience_id text, -- preenchido só quando origem = 'meta'

  targeting jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists smartads_publicos_salvos_cliente_idx on smartads_publicos_salvos(cliente_id);

alter table smartads_publicos_salvos enable row level security;

-- ============================================================================
-- Campanhas criadas pelo SmartAds — cache local (pro painel "campanhas no ar" não bater na Meta a
-- todo carregamento) + a config completa usada na criação, pra poder "Duplicar" sem redigitar tudo
-- de novo (carrega essa config como ponto de partida e só troca o criativo).
--
-- `meta_ad_ids` é um array (jsonb) porque um mesmo conjunto de anúncios pode ter mais de um
-- anúncio/criativo (variações de imagem/vídeo testadas juntas) — não é sempre 1 campanha = 1 anúncio.
-- ============================================================================
create table if not exists smartads_campanhas_criadas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references smartads_contas_meta(id) on delete cascade,
  publico_id uuid references smartads_publicos_salvos(id) on delete set null,

  meta_campaign_id text not null,
  meta_adset_id text,
  meta_ad_ids jsonb not null default '[]',

  tipo_modelo text not null check (
    tipo_modelo in ('engajamento', 'alcance', 'formulario', 'visita_perfil', 'cliques_link')
  ),
  config_criacao jsonb not null, -- payload completo usado nas chamadas à Meta (pra duplicar depois)

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists smartads_campanhas_criadas_conta_idx on smartads_campanhas_criadas(conta_id);

alter table smartads_campanhas_criadas enable row level security;

-- ============================================================================
-- Log de auditoria de toda ação de escrita (criar campanha, pausar, mudar orçamento etc.) —
-- `sucesso = false` guarda o erro (já traduzido, ver src/lib/meta.ts) pra investigar depois sem
-- precisar reproduzir o problema.
-- ============================================================================
create table if not exists smartads_acoes_log (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid references smartads_contas_meta(id) on delete set null,
  acao text not null,
  payload jsonb not null,
  sucesso boolean not null,
  resultado jsonb,
  erro_mensagem text,
  created_at timestamptz not null default now()
);

create index if not exists smartads_acoes_log_conta_idx on smartads_acoes_log(conta_id);
create index if not exists smartads_acoes_log_created_idx on smartads_acoes_log(created_at desc);

alter table smartads_acoes_log enable row level security;

-- ============================================================================
-- Conexão com a Meta (linha única — só existe UM login, o do dono, cobrindo todos os clientes).
-- Guarda o token de usuário de longa duração (60 dias) gerado no login via Facebook, pra não
-- precisar refazer o login a cada chamada. `renovar_automaticamente_ate` é sempre reescrito pro
-- código de renovação silenciosa (troca o token perto de vencer, sem precisar de login de novo)
-- saber até quando ainda dá tempo de tentar. Quando a renovação falhar de vez (token realmente
-- vencido ou revogado), `conectado` vira false e o painel mostra o aviso "reconectar".
--
-- Texto plano, mesma convenção de segurança já usada nas outras tabelas de credencial dos apps
-- irmãos (ex: shoppinghub_contas.access_token) — protegido por RLS sem policy pública, só
-- acessível via service role em rota server-side.
-- ============================================================================
create table if not exists smartads_meta_status (
  id text primary key default 'default',
  conectado boolean not null default false,
  access_token text,
  token_expira_em timestamptz,
  meta_user_id text,
  meta_user_nome text,
  ultimo_erro text,
  verificado_em timestamptz not null default now()
);

insert into smartads_meta_status (id) values ('default')
on conflict (id) do nothing;

alter table smartads_meta_status enable row level security;

-- ============================================================================
-- Selo de saúde por conta (tela de Contas) — cache do cálculo feito em src/lib/saude.ts (pura
-- matemática sobre os últimos 7 dias, sem IA), recalculado sob demanda quando o registro está
-- velho (ver src/app/api/saude/route.ts), não por um cron. Evita bater na Meta a cada
-- carregamento de página.
-- ============================================================================
create table if not exists smartads_saude_contas (
  conta_id uuid primary key references smartads_contas_meta(id) on delete cascade,
  status text not null check (status in ('boa', 'atencao', 'sem_dados')),
  motivo text not null,
  -- Detalhe da anomalia (comparação período a período, ver src/lib/anomalia.ts) que motivou o
  -- status "atencao", quando é esse o caso — null quando o status veio só do limiar simples
  -- (src/lib/saude.ts) ou quando está "boa"/"sem_dados". Alimenta o botão "Por quê? (IA)" sem
  -- precisar buscar os números nos dois períodos de novo.
  anomalia jsonb,
  calculado_em timestamptz not null default now()
);

alter table smartads_saude_contas enable row level security;

-- Reaproveita o MESMO cache de 1h do selo de saúde pra também guardar os números que viraram a
-- dashboard inicial (quantas campanhas tiveram atividade nos últimos 30 dias, quanto foi gasto) —
-- sem isso teria que bater na Meta de novo só pra esses dois números, com uma janela de cache
-- diferente da do selo, dessincronizando os dois à toa.
alter table smartads_saude_contas add column if not exists campanhas_ativas integer;
alter table smartads_saude_contas add column if not exists gasto_30d_centavos integer;

-- Soma do orçamento diário de todas as campanhas ativas da conta na Meta — só calculado (e
-- cacheado, mesmo cache de 1h do selo de saúde) pra contas com boost automático ligado, onde serve
-- de comparação: quanto do orçamento diário total ativo da conta é o boost automático.
alter table smartads_saude_contas add column if not exists orcamento_diario_ativo_centavos integer;

-- ============================================================================
-- Resumo em texto (Gemini) do painel de Relatórios — linha única, reescrita a cada geração (não
-- guarda histórico de resumos antigos, só o mais recente). Gerado sob demanda (botão na tela),
-- não por cron — evita gastar token à toa quando ninguém está olhando.
-- ============================================================================
create table if not exists smartads_resumos_ia (
  id text primary key default 'relatorios',
  texto text not null,
  gerado_em timestamptz not null default now()
);

alter table smartads_resumos_ia enable row level security;

-- ============================================================================
-- Anotações livres por campanha (tela de Campanhas) — chaveada pelo ID de campanha DA PRÓPRIA
-- Meta (não pelo id local de smartads_campanhas_criadas), porque funciona pra qualquer campanha
-- que aparece no painel "Campanhas no ar", inclusive as que já existiam antes do SmartAds.
-- ============================================================================
create table if not exists smartads_anotacoes (
  id uuid primary key default gen_random_uuid(),
  meta_campaign_id text not null,
  texto text not null,
  created_at timestamptz not null default now()
);

create index if not exists smartads_anotacoes_campanha_idx on smartads_anotacoes(meta_campaign_id);

alter table smartads_anotacoes enable row level security;

-- ============================================================================
-- Regras de automação (pausar/ajustar orçamento sozinho) — SEMPRE desligadas por padrão
-- (ativa = false), o dono liga explicitamente depois de configurar. Limitadas a campanhas
-- criadas pelo próprio SmartAds (campanha_id → smartads_campanhas_criadas), porque é lá que
-- guardamos o meta_adset_id necessário pra mexer em orçamento — mesma limitação que o botão
-- "Orçamento" do painel de Campanhas já tem.
-- ============================================================================
create table if not exists smartads_regras_automacao (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references smartads_contas_meta(id) on delete cascade,
  -- null = aplica a TODAS as campanhas ativas dessa conta criadas pelo SmartAds
  campanha_id uuid references smartads_campanhas_criadas(id) on delete cascade,
  nome text not null,
  metrica text not null check (metrica in ('ctr', 'cpc', 'cpm', 'frequencia', 'gasto')),
  operador text not null check (operador in ('maior_que', 'menor_que')),
  valor_limite numeric not null,
  janela_dias integer not null default 3,
  acao text not null check (acao in ('pausar', 'aumentar_orcamento', 'diminuir_orcamento')),
  acao_percentual numeric,
  gasto_minimo_centavos integer not null default 0,
  cooldown_horas integer not null default 24,
  ativa boolean not null default false,
  ultimo_disparo_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists smartads_regras_automacao_conta_idx on smartads_regras_automacao(conta_id);

alter table smartads_regras_automacao enable row level security;

-- ============================================================================
-- Log de auditoria de toda ação autônoma (regra, teste A/B, piloto automático) — o dono só vê
-- "um aviso do que foi feito" na tela, mas cada linha aqui guarda os números exatos que
-- motivaram a ação, pra investigar depois se precisar.
-- ============================================================================
create table if not exists smartads_execucoes_automacao (
  id uuid primary key default gen_random_uuid(),
  regra_id uuid references smartads_regras_automacao(id) on delete set null,
  campanha_id uuid references smartads_campanhas_criadas(id) on delete set null,
  tipo text not null check (tipo in ('regra', 'teste_ab', 'piloto_automatico')),
  descricao text not null,
  dados jsonb,
  sucesso boolean not null,
  erro_mensagem text,
  executado_em timestamptz not null default now()
);

create index if not exists smartads_execucoes_automacao_executado_idx on smartads_execucoes_automacao(executado_em desc);

alter table smartads_execucoes_automacao enable row level security;

-- ============================================================================
-- Teste A/B — usa as próprias variações de imagem já criadas na campanha (meta_ad_ids), não
-- duplica essa lista. Roda até completar duracao_dias_minima E gasto_minimo_centavos; se não
-- bater os dois, fica marcado "dado_insuficiente" em vez de forçar um vencedor sem confiança
-- estatística nenhuma.
-- ============================================================================
create table if not exists smartads_testes_ab (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references smartads_campanhas_criadas(id) on delete cascade,
  duracao_dias_minima integer not null default 7,
  gasto_minimo_centavos integer not null default 5000,
  status text not null default 'rodando' check (status in ('rodando', 'concluido', 'dado_insuficiente')),
  vencedor_meta_ad_id text,
  avaliado_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists smartads_testes_ab_campanha_idx on smartads_testes_ab(campanha_id);

alter table smartads_testes_ab enable row level security;

-- ============================================================================
-- Piloto automático por cliente — realoca orçamento entre as campanhas desse cliente sozinho,
-- dentro de um teto por execução. Desligado por padrão (ativo = false); o dono liga na tela de
-- Contas quando quiser.
-- ============================================================================
create table if not exists smartads_piloto_automatico (
  cliente_id uuid primary key references smartads_clientes(id) on delete cascade,
  ativo boolean not null default false,
  teto_realocacao_percentual numeric not null default 20,
  gasto_minimo_centavos integer not null default 10000,
  ultimo_ajuste_em timestamptz,
  created_at timestamptz not null default now()
);

alter table smartads_piloto_automatico enable row level security;
-- ============================================================================
-- Estratégia — o MOLDE reutilizável entre clientes/unidades (não pertence a um cliente específico
-- de propósito: o valor de padronizar uma rede franqueada é justamente aplicar o MESMO molde em
-- várias unidades). Define a sequência de campanhas-modelo que compõem a estratégia; o que varia
-- por unidade (público, investimento, localização, data de início) fica em smartads_planos_execucao,
-- nunca aqui.
-- ============================================================================
create table if not exists smartads_estrategias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table smartads_estrategias enable row level security;

-- ============================================================================
-- Etapas de uma estratégia — cada uma é uma campanha-modelo (mesmo enum de smartads_campanhas_
-- criadas.tipo_modelo) dentro da sequência. `percentual_orcamento` decide como o investimento
-- total informado na hora de aplicar a estratégia (smartads_planos_execucao.investimento_total_
-- centavos) se divide entre as etapas — a soma de todas as etapas de uma estratégia deveria fechar
-- 100, mas isso é validado na aplicação (rota), não aqui no banco. `offset_dias_inicio` permite
-- sequenciar (etapa 2 só começa X dias depois do início do plano) ou rodar em paralelo (offset
-- igual pra duas etapas). `duracao_dias` null = roda contínua até alguém pausar manualmente.
-- ============================================================================
create table if not exists smartads_estrategia_etapas (
  id uuid primary key default gen_random_uuid(),
  estrategia_id uuid not null references smartads_estrategias(id) on delete cascade,
  ordem integer not null,
  nome_etapa text not null,
  tipo_modelo text not null check (
    tipo_modelo in ('engajamento', 'alcance', 'formulario', 'visita_perfil', 'cliques_link')
  ),
  percentual_orcamento numeric not null check (percentual_orcamento > 0 and percentual_orcamento <= 100),
  offset_dias_inicio integer not null default 0,
  duracao_dias integer,
  created_at timestamptz not null default now()
);

create index if not exists smartads_estrategia_etapas_estrategia_idx on smartads_estrategia_etapas(estrategia_id);

alter table smartads_estrategia_etapas enable row level security;

-- ============================================================================
-- Plano de execução — a APLICAÇÃO de uma estratégia numa unidade/conta específica. É aqui que
-- entram os dados que variam por unidade: público (mesmo formato nativo de smartads_publicos_
-- salvos.targeting, editável na hora ou reaproveitado de um salvo), investimento total (dividido
-- entre as etapas pelo percentual_orcamento de cada uma) e data de início (permite escalonar o
-- lançamento entre unidades em vez de disparar tudo no mesmo dia).
-- ============================================================================
create table if not exists smartads_planos_execucao (
  id uuid primary key default gen_random_uuid(),
  estrategia_id uuid not null references smartads_estrategias(id) on delete restrict,
  cliente_id uuid not null references smartads_clientes(id) on delete cascade,
  conta_id uuid not null references smartads_contas_meta(id) on delete cascade,

  nome text not null,
  publico_id uuid references smartads_publicos_salvos(id) on delete set null,
  publico jsonb, -- preenchido quando o público foi montado na hora em vez de reaproveitar um salvo
  incluir_facebook boolean not null default false,
  investimento_total_centavos integer not null,
  data_inicio date not null,
  meta_negocio text, -- ex: "40 pedidos/semana" — linguagem de negócio, não métrica de mídia

  status text not null default 'planejado' check (
    status in ('planejado', 'em_andamento', 'concluido', 'pausado')
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists smartads_planos_execucao_conta_idx on smartads_planos_execucao(conta_id);
create index if not exists smartads_planos_execucao_cliente_idx on smartads_planos_execucao(cliente_id);

alter table smartads_planos_execucao enable row level security;

-- ============================================================================
-- Status de cada etapa dentro de um plano aplicado — o "checklist" da tela de Adm. `aguardando_
-- admin` é o estado usado quando a etapa precisa de uma ação humana antes de seguir (ex: aprovar
-- orçamento, franquia mandar criativo) — a `observacao` explica o quê especificamente.
-- ============================================================================
create table if not exists smartads_plano_etapas (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references smartads_planos_execucao(id) on delete cascade,
  estrategia_etapa_id uuid not null references smartads_estrategia_etapas(id) on delete restrict,
  campanha_id uuid references smartads_campanhas_criadas(id) on delete set null,

  status text not null default 'aguardando' check (
    status in ('aguardando', 'pronta_para_disparar', 'aguardando_admin', 'em_andamento', 'concluida', 'erro')
  ),
  data_prevista_inicio date not null,
  observacao text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists smartads_plano_etapas_plano_idx on smartads_plano_etapas(plano_id);

alter table smartads_plano_etapas enable row level security;

-- ============================================================================
-- Base de conhecimento — contexto que entra no prompt do Gemini na hora de gerar diagnóstico/
-- sugestões (boas práticas de tráfego pro setor, observações sobre concorrência, aprendizados do
-- que já funcionou). `cliente_id` null = conhecimento geral da rede (vale pra todas as unidades);
-- preenchido = específico de uma unidade.
-- ============================================================================
create table if not exists smartads_base_conhecimento (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references smartads_clientes(id) on delete cascade,
  titulo text not null,
  conteudo text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists smartads_base_conhecimento_cliente_idx on smartads_base_conhecimento(cliente_id);

alter table smartads_base_conhecimento enable row level security;

-- ============================================================================
-- Diagnóstico — resultado gerado pelo Gemini cruzando mídia paga + orgânico do Instagram +
-- comparação entre unidades + base de conhecimento. `dados_usados` guarda um snapshot do pacote
-- que foi mandado pro Gemini (auditoria: dá pra conferir depois em cima de que números ele decidiu).
-- ============================================================================
create table if not exists smartads_diagnosticos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references smartads_clientes(id) on delete cascade,
  conta_id uuid references smartads_contas_meta(id) on delete cascade,
  texto text not null,
  dados_usados jsonb not null,
  gerado_em timestamptz not null default now()
);

create index if not exists smartads_diagnosticos_cliente_idx on smartads_diagnosticos(cliente_id);
create index if not exists smartads_diagnosticos_gerado_idx on smartads_diagnosticos(gerado_em desc);

alter table smartads_diagnosticos enable row level security;

-- ============================================================================
-- Sugestões — ações concretas propostas pelo Gemini a partir de um diagnóstico, SEMPRE ligadas a
-- mídia paga (nova campanha, ajuste de orçamento, pausar, turbinar um post que performou bem
-- organicamente) — nunca conselho de conteúdo orgânico isolado. `token_aprovacao` permite aprovar
-- direto pelo link do e-mail semanal sem precisar logar no app (ver Fase 6).
-- ============================================================================
create table if not exists smartads_sugestoes (
  id uuid primary key default gen_random_uuid(),
  diagnostico_id uuid references smartads_diagnosticos(id) on delete set null,
  cliente_id uuid not null references smartads_clientes(id) on delete cascade,
  conta_id uuid references smartads_contas_meta(id) on delete cascade,

  tipo text not null check (
    tipo in ('nova_campanha', 'ajustar_orcamento', 'pausar_campanha', 'turbinar_post', 'outro')
  ),
  titulo text not null,
  descricao text not null,
  dados jsonb not null default '{}', -- parâmetros da ação, formato depende do `tipo`

  status text not null default 'pendente' check (
    status in ('pendente', 'aprovada', 'rejeitada', 'aplicada', 'erro')
  ),
  token_aprovacao text unique,

  created_at timestamptz not null default now(),
  decidido_em timestamptz
);

create index if not exists smartads_sugestoes_cliente_idx on smartads_sugestoes(cliente_id);
create index if not exists smartads_sugestoes_status_idx on smartads_sugestoes(status);

alter table smartads_sugestoes enable row level security;

-- ============================================================================
-- Meta de negócio por unidade (linguagem de negócio, não métrica de mídia — ex: "40 pedidos/
-- semana") — usada no relatório semanal e no diagnóstico pra falar a língua do dono da franquia.
-- Fica na conta (não no plano de execução) porque é relativamente estável, não muda a cada
-- estratégia aplicada.
-- ============================================================================
alter table smartads_contas_meta add column if not exists meta_negocio text;

-- ============================================================================
-- Empresa — o agrupador acima de "cliente" que faltava: uma REDE franqueada (várias unidades, o
-- mesmo molde de Estratégia aplicado em cada uma, faz sentido comparar desempenho entre elas) ou
-- um negócio INDIVIDUAL (uma unidade só, sem rede pra comparar — Estratégias/Semáforo/comparação
-- de mediana no Diagnóstico não fazem sentido, só campanha, insights e piloto automático).
-- `tipo` decide isso em cima de toda a UI que compara unidades entre si. Cada smartads_clientes
-- pertence a UMA empresa (empresa_id not null, on delete restrict — apagar a empresa por engano
-- não pode levar junto os clientes/campanhas que dependem dela).
-- ============================================================================
create table if not exists smartads_empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('individual', 'franquia')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table smartads_empresas enable row level security;

alter table smartads_clientes add column if not exists empresa_id uuid references smartads_empresas(id) on delete restrict;
create index if not exists smartads_clientes_empresa_idx on smartads_clientes(empresa_id);

-- ============================================================================
-- Campanha-Mãe — o "padrão de campanha" da franqueadora: uma Estratégia (molde já existente) +
-- período fixo + faixa de investimento permitida por unidade. Disparar uma Campanha-Mãe pra N
-- unidades cria um Plano de Execução por unidade (mesmo mecanismo de "aplicar estratégia" que já
-- existe), todos marcados com `campanha_mae_id` — isso que dá o rollup ("Páscoa Dona Baunilha
-- 2027: 16 unidades, quanto cada uma já gastou, como cada uma está performando").
-- ============================================================================
create table if not exists smartads_campanhas_mae (
  id uuid primary key default gen_random_uuid(),
  estrategia_id uuid not null references smartads_estrategias(id) on delete restrict,

  nome text not null,
  data_inicio date not null, -- igual pra todas as unidades participantes — é um dos "padrões"

  investimento_minimo_centavos integer not null check (investimento_minimo_centavos > 0),
  investimento_maximo_centavos integer not null check (investimento_maximo_centavos >= investimento_minimo_centavos),

  status text not null default 'ativa' check (status in ('ativa', 'encerrada')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table smartads_campanhas_mae enable row level security;

alter table smartads_planos_execucao add column if not exists campanha_mae_id uuid references smartads_campanhas_mae(id) on delete set null;
create index if not exists smartads_planos_execucao_campanha_mae_idx on smartads_planos_execucao(campanha_mae_id);

-- ============================================================================
-- Criativo por ETAPA da Campanha-Mãe, não mais um só pra campanha inteira — uma etapa de Alcance
-- e uma de Engajamento pedem criativos diferentes na prática (achado reportado ao vivo: uma etapa
-- de engajamento usa um post que já existe no feed com um botão específico, tipo webinar, que não
-- faz sentido reaproveitar como "o criativo oficial de tudo"). `modo` decide o comportamento:
-- 'oficial_upload' trava o mesmo criativo (imagem/texto/botão) pra toda unidade que passar por essa
-- etapa (ver ValoresIniciaisCampanha.criativoOficial em FormularioCampanha.tsx); 'livre_por_unidade'
-- não trava nada — cada unidade escolhe o próprio criativo (inclusive "usar publicação existente")
-- na hora de publicar, exatamente como já funciona fora de uma Campanha-Mãe. Os campos de criativo
-- ficam nullable de propósito: dá pra criar a Campanha-Mãe com o criativo de uma etapa futura ainda
-- "a definir", e preencher depois — ver aviso de criativo pendente no relatório semanal e na tela
-- da Campanha-Mãe.
-- ============================================================================
create table if not exists smartads_campanha_mae_criativos (
  id uuid primary key default gen_random_uuid(),
  campanha_mae_id uuid not null references smartads_campanhas_mae(id) on delete cascade,
  estrategia_etapa_id uuid not null references smartads_estrategia_etapas(id) on delete cascade,

  modo text not null default 'livre_por_unidade' check (modo in ('oficial_upload', 'livre_por_unidade')),

  -- Só preenchidos quando modo = 'oficial_upload'. Imagem em base64 (mesmo formato que já trafega
  -- em toda campanha criada pelo app, ver FormularioCampanha) em vez de storage próprio — poucas
  -- imagens por Campanha-Mãe, sem volume que justifique outra peça de infra.
  criativo_titulo text,
  criativo_mensagem text,
  criativo_imagem_base64 text,
  criativo_cta text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (campanha_mae_id, estrategia_etapa_id)
);

alter table smartads_campanha_mae_criativos enable row level security;
create index if not exists smartads_campanha_mae_criativos_campanha_idx on smartads_campanha_mae_criativos(campanha_mae_id);

-- ============================================================================
-- Cache do Financeiro — calculado 1x/dia pelo cron (ver /api/cron/financeiro), nunca ao vivo numa
-- visita à tela: evita bater na Meta (e no Supabase) toda vez que alguém abre /financeiro.
-- ============================================================================
create table if not exists smartads_financeiro_cache (
  conta_id uuid primary key references smartads_contas_meta(id) on delete cascade,

  -- Só uma das duas vem preenchida por conta, nunca as duas (ver comentário de SaldoContaMeta em
  -- src/lib/meta/api.ts): saldo_disponivel pra conta com fundo pré-pago (spend_cap configurado de
  -- verdade), fatura_em_aberto pra conta pós-paga (cobrada por fatura, sem spend_cap).
  saldo_disponivel_centavos integer,
  fatura_em_aberto_centavos integer,

  gasto_7d_centavos integer not null default 0,
  media_diaria_centavos integer not null default 0,
  projecao_mensal_centavos integer not null default 0,

  erro text,
  calculado_em timestamptz not null default now()
);

alter table smartads_financeiro_cache enable row level security;

-- ============================================================================
-- Boost automático: quando ligado numa conta, todo dia (depois da janela de postagem) o cron
-- confere o post mais recente do Instagram da conta e, se for de hoje e ainda não tiver sido
-- turbinado, dispara sozinho uma campanha de engajamento nele.
-- ============================================================================
alter table smartads_contas_meta add column if not exists boost_automatico_ativo boolean not null default false;
alter table smartads_contas_meta add column if not exists boost_automatico_publico_id uuid references smartads_publicos_salvos(id) on delete set null;
alter table smartads_contas_meta add column if not exists boost_automatico_orcamento_centavos integer;
-- Quantos dias a campanha roda antes de encerrar sozinha — escolhido por conta na hora de ligar
-- (vale igual pra franquia e pra empresa individual, não é uma feature exclusiva de rede).
alter table smartads_contas_meta add column if not exists boost_automatico_duracao_dias integer not null default 3 check (boost_automatico_duracao_dias in (3, 7));

-- Um post só é turbinado automaticamente UMA vez — unique(conta_id, instagram_media_id) trava isso
-- mesmo que o cron rode mais de uma vez ou o post continue sendo "o mais recente" em dias seguintes
-- (sem post novo, não teria como saber se é de hoje mesmo, mas a trava é redundante de propósito).
create table if not exists smartads_boost_automatico_log (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references smartads_contas_meta(id) on delete cascade,
  instagram_media_id text not null,
  campanha_criada_id uuid references smartads_campanhas_criadas(id) on delete set null,
  sucesso boolean not null,
  erro_mensagem text,
  created_at timestamptz not null default now(),
  unique (conta_id, instagram_media_id)
);

create index if not exists smartads_boost_automatico_log_conta_idx on smartads_boost_automatico_log(conta_id);

alter table smartads_boost_automatico_log enable row level security;

-- ============================================================================
-- Stories: diferente do feed, a Meta só expõe stories ATIVOS (postados nas últimas 24h) via Graph
-- API — não existe endpoint de histórico. Por isso o cron diário (/api/cron/stories, ver
-- src/lib/stories.ts) grava aqui cada story visto (id como chave primária, pra nunca contar o
-- mesmo story duas vezes mesmo rodando o cron mais de uma vez), e o dia é derivado do timestamp de
-- CRIAÇÃO do story (não de quando o cron rodou) — o contador nasce a partir de agora, sem como
-- recuperar o passado (o Instagram não expõe o Arquivo de stories via API pública).
-- ============================================================================
create table if not exists smartads_stories_vistos (
  id text primary key,
  conta_id uuid not null references smartads_contas_meta(id) on delete cascade,
  dia text not null,
  criado_em timestamptz not null default now()
);

create index if not exists smartads_stories_vistos_conta_dia_idx on smartads_stories_vistos(conta_id, dia);

alter table smartads_stories_vistos enable row level security;
