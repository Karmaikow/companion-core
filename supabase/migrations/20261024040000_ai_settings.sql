-- IA geral dos Companions, trocada pelo painel do ADM (aba Servidor) sem republicar a função.
-- A chave da API fica só aqui: nenhuma política para anon/authenticated, só a função (service_role) lê e grava.
create table if not exists public.ai_settings (
  id smallint primary key default 1 check (id = 1),
  provider text not null default 'auto' check (provider in ('auto', 'anthropic', 'groq', 'openai', 'gemini', 'openrouter', 'custom')),
  model text,
  model_hq text,
  base_url text,
  api_key text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.ai_settings (id) values (1) on conflict (id) do nothing;
alter table public.ai_settings enable row level security;
revoke all on table public.ai_settings from anon, authenticated;
grant select, insert, update on table public.ai_settings to service_role;
