-- Configuración para asociar audios y ofrecer el catálogo público.
-- Ejecutar una sola vez en Supabase > SQL Editor.

alter table public.productos
  add column if not exists audio_url text,
  add column if not exists precio_decant_3ml numeric(10, 2),
  add column if not exists precio_decant_5ml numeric(10, 2),
  add column if not exists precio_decant_10ml numeric(10, 2),
  add column if not exists precio_decant_30ml numeric(10, 2);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalogo-audios',
  'catalogo-audios',
  true,
  20971520,
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read catalog audio" on storage.objects;
create policy "Public can read catalog audio"
  on storage.objects for select
  using (bucket_id = 'catalogo-audios');

drop policy if exists "Authenticated users can upload catalog audio" on storage.objects;
create policy "Authenticated users can upload catalog audio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'catalogo-audios'
    and lower(auth.jwt() ->> 'email') in ('diego@alpha.com', 'luis@alpha.com', 'mau@alpha.com')
  );

create or replace view public.catalogo_publico as
select
  id,
  nombre,
  tipo,
  tamano,
  precio_sugerido as precio_venta,
  imagen_url,
  audio_url,
  (tipo = 'Perfume Sellado' and stock <= 0) as agotado,
  precio_decant_3ml,
  precio_decant_5ml,
  precio_decant_10ml,
  precio_decant_30ml
from public.productos
where (tipo = 'Perfume para Decant' and stock > 0)
   or (tipo = 'Perfume Sellado' and stock > 0);

grant select on public.catalogo_publico to anon, authenticated;


