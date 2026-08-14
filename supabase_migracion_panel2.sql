-- ============================================================
--  VadeMed · Migración 2 del PANEL: cambiar el código de un cliente
--  SQL Editor -> New query -> pega TODO -> Run
--
--  Cambiar el código no es un simple UPDATE: ese texto es la llave que
--  amarra al cliente con sus dispositivos y con su perfil (favoritos,
--  progreso del quiz). Si solo cambiáramos la fila del código, el
--  cliente perdería su perfil y sus dispositivos quedarían huérfanos.
--
--  Por eso: se crea la fila nueva, se mudan los hijos, y hasta entonces
--  se borra la vieja. En ese orden funciona haya o no llaves foráneas.
-- ============================================================

create or replace function public.admin_renombrar(p_viejo text, p_nuevo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text := upper(btrim(coalesce(p_viejo, '')));
  v_new text := upper(btrim(coalesce(p_nuevo, '')));
  v_disp int := 0;
  v_perf int := 0;
begin
  if length(v_new) < 4 then
    return json_build_object('ok', false, 'error', 'El código nuevo debe tener al menos 4 caracteres');
  end if;

  if v_old = v_new then
    return json_build_object('ok', true, 'codigo', v_new, 'sin_cambios', true);
  end if;

  if not exists (select 1 from public.codigos_acceso where codigo = v_old) then
    return json_build_object('ok', false, 'error', 'No existe el código original');
  end if;

  if exists (select 1 from public.codigos_acceso where codigo = v_new) then
    return json_build_object('ok', false, 'error', 'Ya hay otro cliente con ese código');
  end if;

  -- 1) fila nueva, copiando todo lo del cliente
  insert into public.codigos_acceso (codigo, nombre, activo, offline, vence, plan, contacto, nota, creado)
  select v_new, nombre, activo, offline, vence, plan, contacto, nota, creado
    from public.codigos_acceso
   where codigo = v_old;

  -- 2) mudar dispositivos y perfil al código nuevo
  update public.dispositivos set codigo = v_new where codigo = v_old;
  get diagnostics v_disp = row_count;

  update public.perfiles set codigo = v_new where codigo = v_old;
  get diagnostics v_perf = row_count;

  -- 3) ya sin hijos colgando, se va la vieja
  delete from public.codigos_acceso where codigo = v_old;

  return json_build_object('ok', true, 'codigo', v_new,
                           'dispositivos_movidos', v_disp,
                           'perfil_movido', v_perf);
end;
$$;

-- Cerrada como las demás: solo la Edge Function (service_role) puede llamarla.
revoke all on function public.admin_renombrar(text,text) from public, anon, authenticated;
grant execute on function public.admin_renombrar(text,text) to service_role;

-- Comprobación (debe devolver una fila):
--   select proname from pg_proc where proname = 'admin_renombrar';
