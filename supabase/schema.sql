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
  ativo boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists smartads_contas_meta_cliente_idx on smartads_contas_meta(cliente_id);

-- uma conta de anúncio Meta não pode estar associada a dois clientes ao mesmo tempo
create unique index if not exists smartads_contas_meta_ad_account_unico
  on smartads_contas_meta(meta_ad_account_id);

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
  calculado_em timestamptz not null default now()
);

alter table smartads_saude_contas enable row level security;

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
