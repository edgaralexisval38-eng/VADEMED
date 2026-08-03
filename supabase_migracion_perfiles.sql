-- ============================================================
--  VadeMed · Migración: sincronizar perfil + favoritos por código
--  SQL Editor -> New query -> pega TODO -> Run
-- ============================================================

-- 1) Tabla: un perfil por código (nombre, título, avatar, favoritos... en JSON)
create table if not exists public.perfiles (
  codigo       text primary key,
  datos        jsonb not null default '{}'::jsonb,
  actualizado  timestamptz not null default now()
);

-- RLS activo y SIN políticas públicas (solo la Edge Function con service_role entra)
alter table public.perfiles enable row level security;

-- 2) RPCs para leer/guardar
create or replace function public.perfil_get(p_codigo text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select datos from public.perfiles where codigo = p_codigo limit 1;
$$;

create or replace function public.perfil_set(p_codigo text, p_datos jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.perfiles (codigo, datos, actualizado)
  values (p_codigo, p_datos, now())
  on conflict (codigo) do update set datos = excluded.datos, actualizado = now();
$$;

-- 3) Endurecer: anon/authenticated NO pueden ejecutarlas
revoke all on function public.perfil_get(text)        from anon, authenticated;
revoke all on function public.perfil_set(text, jsonb) from anon, authenticated;

-- Verifica:
-- select codigo, actualizado, jsonb_pretty(datos) from public.perfiles;
