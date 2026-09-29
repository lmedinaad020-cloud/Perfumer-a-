-- Ejecutar en Supabase > SQL Editor después de perfume-sellado-ubicacion-precios.sql.
-- Publica el precio del perfume sellado y los precios de decant guardados en inventario.
alter table public.productos
  add column if not exists precio_decant_3ml numeric(10, 2),
  add column if not exists precio_decant_5ml numeric(10, 2),
  add column if not exists precio_decant_10ml numeric(10, 2),
  add column if not exists precio_decant_30ml numeric(10, 2);

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
