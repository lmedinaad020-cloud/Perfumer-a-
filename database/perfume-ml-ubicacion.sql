-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Registra por separado cada frasco abierto para descontar sus mililitros
-- según el punto de venta. No cambia catalogo_publico.

alter table public.productos
  add column if not exists ubicacion_stock text,
  add column if not exists ml_restantes numeric(10, 2);

update public.productos
set ubicacion_stock = 'Tienda Local'
where tipo = 'Perfume para Decant' and ubicacion_stock is null;

update public.productos
set ml_restantes = greatest(0, stock) * coalesce(nullif(regexp_replace(tamano, '[^0-9]', '', 'g'), '')::numeric, 100)
where tipo = 'Perfume para Decant' and ml_restantes is null;

alter table public.productos
  add constraint productos_ubicacion_stock_valida
  check (ubicacion_stock is null or ubicacion_stock in ('Tienda Local', 'Alpha Móvil'));
