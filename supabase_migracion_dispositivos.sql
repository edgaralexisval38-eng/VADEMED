-- ============================================================
--  VadeMed · Migración: LÍMITE de 2 dispositivos por código
--  SQL Editor -> New query -> pega TODO -> Run
-- ============================================================

-- 1) Tabla: qué dispositivos ha usado cada código
create table if not exists public.dispositivos (
  codigo     text not null,
  device_id  text not null,
  visto      timestamptz not null default now(),
  primary key (codigo, device_id)
);
alter table public.dispositivos enable row level security;

-- 2) Registrar/validar un dispositivo. Devuelve:
--    true  = permitido (ya conocido, o hay cupo)
--    false = supera el límite (código ya en p_max dispositivos)
create or replace function public.registrar_dispositivo(
  p_codigo text, p_device text, p_max int default 2
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  -- dispositivo ya conocido para este código -> permitir
  if exists (select 1 from public.dispositivos where codigo = p_codigo and device_id = p_device) then
    update public.dispositivos set visto = now() where codigo = p_codigo and device_id = p_device;
    return true;
  end if;
  -- ¿cuántos dispositivos tiene ya este código?
  select count(*) into n from public.dispositivos where codigo = p_codigo;
  if n >= p_max then
    return false;   -- lleno
  end if;
  insert into public.dispositivos (codigo, device_id) values (p_codigo, p_device);
  return true;
end;
$$;

revoke all on function public.registrar_dispositivo(text, text, int) from anon, authenticated;

-- ============================================================
--  PARA LIBERAR dispositivos de un código (cuando alguien cambia
--  de teléfono o quieres reiniciar su cupo), corre esto:
--    delete from public.dispositivos where codigo = 'EL-CODIGO';
--  Para ver qué códigos están llenos:
--    select codigo, count(*) from public.dispositivos group by codigo order by 2 desc;
-- ============================================================
