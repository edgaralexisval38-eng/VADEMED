-- ============================================================
--  VadeMed · Backend seguro (Supabase) — Tablas + RPC + RLS
--  SQL Editor -> New query -> pega TODO -> Run
-- ============================================================

-- 1) TABLAS ---------------------------------------------------
create table if not exists public.codigos_acceso (
  id      uuid primary key default gen_random_uuid(),
  codigo  text unique not null,
  nombre  text,
  activo  boolean not null default true,
  offline boolean not null default false,   -- true = puede abrir sin internet (uso personal del dueño)
  vence   timestamptz,
  creado  timestamptz not null default now()
);

create table if not exists public.intentos_acceso (
  ip        text primary key,
  fallidos  integer not null default 0,
  desde     timestamptz not null default now()
);

create table if not exists public.sugerencias (
  id          uuid primary key default gen_random_uuid(),
  tipo        text,
  mensaje     text not null,
  codigo      text,
  version_app text,
  creado      timestamptz not null default now()
);

-- 2) RLS: activo y SIN politicas publicas.
--    Solo la Edge Function (service_role) puede tocar las tablas.
alter table public.codigos_acceso  enable row level security;
alter table public.intentos_acceso enable row level security;
alter table public.sugerencias     enable row level security;

-- 3) RPC ------------------------------------------------------

-- Verifica un codigo: valido si activo y no vencido
create or replace function public.verificar_codigo(p_codigo text)
returns table (ok boolean, nombre text, offline boolean)
language sql
as $$
  select true as ok, c.nombre, coalesce(c.offline,false) as offline
  from public.codigos_acceso c
  where c.codigo = p_codigo
    and c.activo = true
    and (c.vence is null or c.vence > now())
  limit 1;
$$;

-- Esta la IP bloqueada por fuerza bruta? Resetea si la ventana ya paso.
create or replace function public.chequear_intento(
  p_ip text, p_max int default 10, p_min int default 15
)
returns table (bloqueado boolean, minutos_restantes int)
language plpgsql
as $$
declare r public.intentos_acceso%rowtype;
begin
  select * into r from public.intentos_acceso where ip = p_ip;

  if not found then
    return query select false, 0; return;
  end if;

  if r.desde < now() - make_interval(mins => p_min) then
    update public.intentos_acceso set fallidos = 0, desde = now() where ip = p_ip;
    return query select false, 0; return;
  end if;

  if r.fallidos >= p_max then
    return query select true,
      greatest(0, ceil(extract(epoch from ((r.desde + make_interval(mins => p_min)) - now())) / 60))::int;
    return;
  end if;

  return query select false, 0;
end;
$$;

-- Registra un fallo (UPSERT; resetea fallidos+desde si expiro la ventana)
create or replace function public.registrar_fallo(
  p_ip text, p_min int default 15
)
returns void
language sql
as $$
  insert into public.intentos_acceso (ip, fallidos, desde)
  values (p_ip, 1, now())
  on conflict (ip) do update set
    fallidos = case
      when public.intentos_acceso.desde < now() - make_interval(mins => p_min)
      then 1 else public.intentos_acceso.fallidos + 1 end,
    desde = case
      when public.intentos_acceso.desde < now() - make_interval(mins => p_min)
      then now() else public.intentos_acceso.desde end;
$$;

-- Guarda una sugerencia
create or replace function public.enviar_sugerencia(
  p_tipo text, p_mensaje text, p_codigo text, p_version text
)
returns void
language sql
as $$
  insert into public.sugerencias (tipo, mensaje, codigo, version_app)
  values (p_tipo, p_mensaje, p_codigo, p_version);
$$;

-- 4) Endurecer: anon/authenticated NO pueden ejecutar los RPC
--    (la Edge Function usa service_role, que si puede).
revoke all on function public.verificar_codigo(text)                 from anon, authenticated;
revoke all on function public.chequear_intento(text,int,int)         from anon, authenticated;
revoke all on function public.registrar_fallo(text,int)              from anon, authenticated;
revoke all on function public.enviar_sugerencia(text,text,text,text) from anon, authenticated;
