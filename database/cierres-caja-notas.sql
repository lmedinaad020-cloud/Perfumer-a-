-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Guarda una nota editable por fecha en el cierre diario de caja.

create table if not exists public.cierres_caja_notas (
  fecha date primary key,
  nota text not null default '',
  actualizado_por text,
  actualizado_en timestamptz not null default now()
);

alter table public.cierres_caja_notas enable row level security;

drop policy if exists "Usuarios autenticados pueden leer notas de cierre"
  on public.cierres_caja_notas;
create policy "Usuarios autenticados pueden leer notas de cierre"
  on public.cierres_caja_notas for select to authenticated
  using (true);

drop policy if exists "Administradores pueden crear notas de cierre"
  on public.cierres_caja_notas;
create policy "Administradores pueden crear notas de cierre"
  on public.cierres_caja_notas for insert to authenticated
  with check (lower(auth.jwt() ->> 'email') in ('diego@alpha.com', 'luis@alpha.com', 'mau@alpha.com'));

drop policy if exists "Administradores pueden editar notas de cierre"
  on public.cierres_caja_notas;
create policy "Administradores pueden editar notas de cierre"
  on public.cierres_caja_notas for update to authenticated
  using (lower(auth.jwt() ->> 'email') in ('diego@alpha.com', 'luis@alpha.com', 'mau@alpha.com'))
  with check (lower(auth.jwt() ->> 'email') in ('diego@alpha.com', 'luis@alpha.com', 'mau@alpha.com'));

grant select on public.cierres_caja_notas to authenticated;
grant insert, update on public.cierres_caja_notas to authenticated;
