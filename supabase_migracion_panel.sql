-- ============================================================
--  VadeMed · Migración: PANEL DE CONTROL (admin)
--  SQL Editor -> New query -> pega TODO -> Run
--
--  Qué hace:
--   0) Normaliza los códigos a MAYÚSCULAS (evita "código inválido"
--      cuando el cliente lo escribe en minúsculas en la computadora).
--   1) Agrega columnas útiles para vender (plan, contacto, nota).
--   2) Crea las funciones que usa el panel: listar, crear, activar/
--      revocar, liberar dispositivos, extender y borrar.
-- ============================================================

-- 0) NORMALIZAR A MAYÚSCULAS ---------------------------------
--    (solo cambia las filas que no chocan con una ya existente)
update public.codigos_acceso c set codigo = upper(c.codigo)
 where c.codigo <> upper(c.codigo)
   and not exists (select 1 from public.codigos_acceso d where d.codigo = upper(c.codigo));

update public.dispositivos d set codigo = upper(d.codigo)
 where d.codigo <> upper(d.codigo)
   and not exists (select 1 from public.dispositivos e
                    where e.codigo = upper(d.codigo) and e.device_id = d.device_id);

update public.perfiles p set codigo = upper(p.codigo)
 where p.codigo <> upper(p.codigo)
   and not exists (select 1 from public.perfiles q where q.codigo = upper(p.codigo));


-- 1) COLUMNAS NUEVAS -----------------------------------------
alter table public.codigos_acceso add column if not exists plan     text;
alter table public.codigos_acceso add column if not exists contacto text;
alter table public.codigos_acceso add column if not exists nota     text;


-- 2) FUNCIONES DEL PANEL --------------------------------------

-- 2.1) Listar todos los códigos con sus datos y dispositivos usados
create or replace function public.admin_listar()
returns json
language sql
security definer
set search_path = public
as $$
  select coalesce(json_agg(x order by x.creado desc), '[]'::json)
  from (
    select
      c.codigo,
      c.nombre,
      c.activo,
      c.offline,
      c.plan,
      c.contacto,
      c.nota,
      c.vence,
      c.creado,
      (select count(*) from public.dispositivos d where d.codigo = c.codigo)::int as dispositivos,
      case
        when c.vence is null then null
        else ceil(extract(epoch from (c.vence - now())) / 86400)::int
      end as dias
    from public.codigos_acceso c
  ) x;
$$;

-- 2.2) Crear un código nuevo. p_dias = null -> sin vencimiento.
create or replace function public.admin_crear(
  p_codigo text,
  p_nombre text default null,
  p_dias int default null,
  p_plan text default null,
  p_contacto text default null,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cod   text := upper(btrim(coalesce(p_codigo, '')));
  v_vence timestamptz;
begin
  if length(v_cod) < 4 then
    return json_build_object('ok', false, 'error', 'El código debe tener al menos 4 caracteres');
  end if;

  if exists (select 1 from public.codigos_acceso where codigo = v_cod) then
    return json_build_object('ok', false, 'error', 'Ese código ya existe');
  end if;

  v_vence := case when p_dias is null then null
                  else now() + make_interval(days => p_dias) end;

  insert into public.codigos_acceso (codigo, nombre, activo, offline, vence, plan, contacto, nota)
  values (
    v_cod,
    nullif(btrim(coalesce(p_nombre, '')), ''),
    true,
    false,
    v_vence,
    nullif(btrim(coalesce(p_plan, '')), ''),
    nullif(btrim(coalesce(p_contacto, '')), ''),
    nullif(btrim(coalesce(p_nota, '')), '')
  );

  return json_build_object('ok', true, 'codigo', v_cod, 'vence', v_vence);
end;
$$;

-- 2.3) Activar / revocar un código
create or replace function public.admin_set_activo(p_codigo text, p_activo boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.codigos_acceso set activo = p_activo where codigo = upper(btrim(p_codigo));
  if not found then
    return json_build_object('ok', false, 'error', 'No existe ese código');
  end if;
  return json_build_object('ok', true, 'activo', p_activo);
end;
$$;

-- 2.4) Liberar los dispositivos de un código (cliente cambió de teléfono)
create or replace function public.admin_liberar(p_codigo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from public.dispositivos where codigo = upper(btrim(p_codigo));
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'liberados', n);
end;
$$;

-- 2.5) Extender la vigencia (renovación). Si ya venció, cuenta desde hoy.
create or replace function public.admin_extender(p_codigo text, p_dias int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cod  text := upper(btrim(p_codigo));
  v_base timestamptz;
  v_new  timestamptz;
begin
  select greatest(coalesce(vence, now()), now()) into v_base
    from public.codigos_acceso where codigo = v_cod;

  if v_base is null then
    return json_build_object('ok', false, 'error', 'No existe ese código');
  end if;

  v_new := v_base + make_interval(days => p_dias);
  update public.codigos_acceso set vence = v_new, activo = true where codigo = v_cod;

  return json_build_object('ok', true, 'vence', v_new);
end;
$$;

-- 2.6) Borrar un código por completo (para errores de dedo).
--      Se lleva sus dispositivos y su perfil.
create or replace function public.admin_borrar(p_codigo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_cod text := upper(btrim(p_codigo));
begin
  delete from public.dispositivos   where codigo = v_cod;
  delete from public.perfiles       where codigo = v_cod;
  delete from public.codigos_acceso where codigo = v_cod;
  if not found then
    return json_build_object('ok', false, 'error', 'No existe ese código');
  end if;
  return json_build_object('ok', true);
end;
$$;

-- 2.7) Editar datos del cliente (nombre, contacto, nota)
create or replace function public.admin_editar(
  p_codigo text, p_nombre text default null,
  p_contacto text default null, p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.codigos_acceso set
    nombre   = nullif(btrim(coalesce(p_nombre, '')), ''),
    contacto = nullif(btrim(coalesce(p_contacto, '')), ''),
    nota     = nullif(btrim(coalesce(p_nota, '')), '')
  where codigo = upper(btrim(p_codigo));
  if not found then
    return json_build_object('ok', false, 'error', 'No existe ese código');
  end if;
  return json_build_object('ok', true);
end;
$$;


-- 3) ENDURECER -----------------------------------------------
--    IMPORTANTE: revocar solo a "anon, authenticated" NO BASTA.
--    Postgres le da EXECUTE a PUBLIC por defecto, y anon hereda de PUBLIC.
--    Como estas funciones son SECURITY DEFINER (se saltan el RLS), había que
--    quitárselo a PUBLIC explícitamente. Si no, cualquiera con la anon key
--    (que va pública en la app) podría llamarlas desde fuera.
do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_listar()',
    'public.admin_crear(text,text,int,text,text,text)',
    'public.admin_set_activo(text,boolean)',
    'public.admin_liberar(text)',
    'public.admin_extender(text,int)',
    'public.admin_borrar(text)',
    'public.admin_editar(text,text,text,text)',
    -- estas ya existían con el mismo hueco: las tapamos de paso
    'public.registrar_dispositivo(text,text,int)',
    'public.perfil_get(text)',
    'public.perfil_set(text,jsonb)'
  ] loop
    execute 'revoke all on function '||f||' from public, anon, authenticated';
    execute 'grant execute on function '||f||' to service_role';
  end loop;
end $$;

-- Comprobación rápida (debe listar tus códigos):
--   select public.admin_listar();
--
-- Comprobación de que quedó cerrado (no debe aparecer anon ni PUBLIC):
--   select p.proname, p.proacl from pg_proc p
--    where p.proname like 'admin\_%' or p.proname in ('perfil_get','perfil_set','registrar_dispositivo');
