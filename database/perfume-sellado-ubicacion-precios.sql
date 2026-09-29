-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Ubicación por botella y precios personalizados para decants.
alter table public.productos
  add column if not exists precio_decant_3ml numeric(10, 2),
  add column if not exists precio_decant_5ml numeric(10, 2),
  add column if not exists precio_decant_10ml numeric(10, 2),
  add column if not exists precio_decant_30ml numeric(10, 2);

update public.productos
set ubicacion_stock = 'Tienda Local'
where tipo in ('Perfume Sellado', 'Perfume para Decant') and ubicacion_stock is null;
