-- ============================================================
--  VadeMed · Migración: permiso "offline" por código
--  SQL Editor -> New query -> pega TODO -> Run
--  (No borra nada; solo agrega la columna, actualiza la función
--   y crea tu código personal con permiso offline.)
-- ============================================================

-- 1) Nueva columna: quién puede abrir sin internet
alter table public.codigos_acceso
  add column if not exists offline boolean not null default false;

-- 2) La función ahora también devuelve el permiso offline.
--    (Cambia el tipo de retorno, por eso hay que recrearla.)
drop function if exists public.verificar_codigo(text);

create function public.verificar_codigo(p_codigo text)
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

-- Endurecer de nuevo: anon/authenticated NO pueden ejecutarla
revoke all on function public.verificar_codigo(text) from anon, authenticated;

-- 3) TU código personal, con permiso offline (uso personal del dueño)
insert into public.codigos_acceso (codigo, nombre, offline, activo)
values ('12213100', 'Dueño', true, true)
on conflict (codigo) do update set offline = true, activo = true;

-- Listo. Verifica:
-- select codigo, nombre, activo, offline from public.codigos_acceso order by creado;
