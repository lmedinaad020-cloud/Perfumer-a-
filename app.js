const SUPABASE_URL = 'https://zmvuueizrehqibjjcbgd.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptdnV1ZWl6cmVocWliampjYmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NTY0MDMsImV4cCI6MjEwNTMzMjQwM30.HVgy61_hS7ecm7sHMz2h5mKtb7r1LXesIjfoH5lZG8M';
    const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
    });

    // Cargar el archivo de sonido
    const sonidoVenta = new Audio('./assets/venta.mp3');

    const COMPROBANTES_BUCKET = 'comprobantes';
    const BORRADORES_DB = 'alpha-perfumes-local';
    const BORRADORES_STORE = 'borradores_venta';

    const ADMIN_EMAILS = ['diego@alpha.com', 'luis@alpha.com', 'mau@alpha.com'];

    let usuarioActual = null;
    let listaProductos = [];
    let carritoVenta = [];
    let comprobanteBase64 = null;
    let listaVentasCache = [];
    let listaAsistenciaCache = [];
    let registroAsistenciaActivo = null;
    let intervalTimer = null;
    
    // INSTANCIAS DE LOS DOS GRÁFICOS
    let miGraficoVentas = null;
    let miGraficoVendedores = null;

    let categoriaFiltroActual = 'TODOS';
    let procesandoVenta = false;
    let perfumesRegaloFiltrados = [];

    const PUNTO_EQUILIBRIO = 140;
    const META_DIARIA = 199;

    const IMG_DEFAULT = 'https://static.vecteezy.com/system/resources/thumbnails/067/553/667/small/minimalist-graphic-illustration-of-a-bottle-useful-for-beauty-wellness-or-container-themes-simplicity-and-clean-design-enhance-visual-impact-vector.jpg';

    function esAdmin() {
      return usuarioActual && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(usuarioActual.email.toLowerCase());
    }

    // Restaurar la sesión persistente al volver a abrir o cambiar de app.
    client.auth.getSession().then(({ data, error }) => {
      if (error) console.error('No se pudo recuperar la sesión:', error.message);
      if (data?.session?.user) {
        usuarioActual = data.session.user;
        iniciarApp();
      }
    });

    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        usuarioActual = null;
        if (intervalTimer) clearInterval(intervalTimer);
        document.getElementById('sec-app').classList.add('hidden');
        document.getElementById('sec-login').classList.remove('hidden');
      }
    });

    document.getElementById('formLogin').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPass').value;
      
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) alert('Error al ingresar: ' + error.message);
      else {
        usuarioActual = data.user;
        iniciarApp();
      }
    });

    async function iniciarApp() {
      document.getElementById('sec-login').classList.add('hidden');
      document.getElementById('sec-app').classList.remove('hidden');
      document.getElementById('userLogged').innerText = `Usuario: ${usuarioActual.email} ${esAdmin() ? ' (ADMIN)' : ''}`;
      
      const btnExcel = document.getElementById('btnExportarExcel');
      const btnAsistenciaExcel = document.getElementById('btnExportarAsistencia');
      const secCrearProducto = document.getElementById('secCrearProducto');

      if (esAdmin()) {
        btnExcel.classList.remove('hidden');
        btnAsistenciaExcel.classList.remove('hidden');
        secCrearProducto.classList.remove('hidden');
      } else {
        btnExcel.classList.add('hidden');
        btnAsistenciaExcel.classList.add('hidden');
        secCrearProducto.classList.add('hidden');
      }

      await restaurarBorradorVenta();
      renderizarCarrito();
      cargarTodo();
    }

    async function cerrarSesion() {
      if (intervalTimer) clearInterval(intervalTimer);
      await borrarBorradorVenta();
      const { error } = await client.auth.signOut();
      if (error) alert('No se pudo cerrar sesión: ' + error.message);
    }

    let avisoTimer = null;
    function mostrarAviso(mensaje, tipo = 'success') {
      const aviso = document.getElementById('avisoApp');
      aviso.textContent = mensaje;
      aviso.className = 'toast-region toast-' + tipo + ' is-visible';
      clearTimeout(avisoTimer);
      avisoTimer = setTimeout(() => aviso.classList.remove('is-visible'), 3600);
    }

    function mostrarTab(tab) {
      const secciones = ['venta', 'stock', 'historial', 'asistencia'];
      if (!secciones.includes(tab)) return;
      secciones.forEach(t => {
        document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab);
        const boton = document.querySelector('.nav-tabs [data-tab="' + t + '"]');
        if (boton) {
          if (t === tab) boton.setAttribute('aria-current', 'page');
          else boton.removeAttribute('aria-current');
        }
      });
      if (tab === 'asistencia') cargarEstadoAsistencia();
    }
   

    async function cargarTodo() {
      const { data: prods } = await client.from('productos').select('*').order('id', { ascending: false });
      listaProductos = prods || [];
      renderizarStock();
      actualizarOpcionesVenta();
      cargarHistorial();
      cargarEstadoAsistencia();
    }

    function toggleCamposStock() {
      const stkTipoVal = document.getElementById('stkTipo').value;
      const esVacio = stkTipoVal === 'Decant Vacío';
      
      document.getElementById('grpTamanoVacios').classList.toggle('hidden', !esVacio);
      document.getElementById('grpTamanoBotella').classList.toggle('hidden', esVacio);
      
      document.getElementById('lblPrecioStock').innerText = esVacio ? 'Costo Total del Lote (S/)' : 'Costo Comprado (S/)';
      document.getElementById('lblCantidadStock').innerText = esVacio ? 'Cantidad de envases en el Lote' : 'Cantidad inicial de frascos';
    }

    function normalizarTexto(texto) {
      return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    function filtrarInventario() {
      renderizarStock();
    }

    function filtrarCategoriaChip(cat, btnEl) {
      categoriaFiltroActual = cat;
      document.querySelectorAll('.chip-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      if (btnEl) {
        btnEl.classList.add('active');
        btnEl.setAttribute('aria-pressed', 'true');
      }
      renderizarStock();
    }

    function renderizarStock() {
      const query = normalizarTexto(document.getElementById('inputBusqueda').value.trim());

      document.getElementById('metrTotal').innerText = listaProductos.length;
      document.getElementById('metrBajo').innerText = listaProductos.filter(p => Number(p.stock) > 0 && Number(p.stock) <= 4).length;
      document.getElementById('metrAgotado').innerText = listaProductos.filter(p => Number(p.stock) <= 0).length;

      let filtrados = listaProductos.filter(p => normalizarTexto(String(p.nombre) + ' ' + String(p.tipo) + ' ' + String(p.tamano || '')).includes(query));

      if (categoriaFiltroActual === 'SELLADO') filtrados = filtrados.filter(p => p.tipo === 'Perfume Sellado');
      else if (categoriaFiltroActual === 'DECANT') filtrados = filtrados.filter(p => p.tipo === 'Perfume para Decant');
      else if (categoriaFiltroActual === 'VACIO') filtrados = filtrados.filter(p => p.tipo === 'Decant Vacío');
      else if (categoriaFiltroActual === 'BAJO') filtrados = filtrados.filter(p => Number(p.stock) > 0 && Number(p.stock) <= 4);
      else if (categoriaFiltroActual === 'AGOTADO') filtrados = filtrados.filter(p => Number(p.stock) <= 0);

      const modoOrden = document.getElementById('ordenInventario').value;
      filtrados.sort((a, b) => {
        if (modoOrden === 'stock_asc') return Number(a.stock) - Number(b.stock);
        if (modoOrden === 'stock_desc') return Number(b.stock) - Number(a.stock);
        if (modoOrden === 'precio_asc') return Number(a.precio_sugerido || 0) - Number(b.precio_sugerido || 0);
        if (modoOrden === 'precio_desc') return Number(b.precio_sugerido || 0) - Number(a.precio_sugerido || 0);
        return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
      });
      const contGrid = document.getElementById('gridInventario');
      if (!filtrados.length) {
        contGrid.innerHTML = '<p class="empty-msg" style="grid-column: 1/-1; text-align:center; padding:20px;">No se encontraron productos en esta categoría.</p>';
        return;
      }

      contGrid.innerHTML = filtrados.map(p => {
        let badgeClass = 'badge-ok';
        let badgeText = `Stock: ${p.stock}`;
        let barColor = 'var(--success)';
        let pct = Math.min((p.stock / 10) * 100, 100);

        if (p.stock === 0) {
          badgeClass = 'badge-zero';
          badgeText = 'AGOTADO';
          barColor = 'var(--danger)';
          pct = 100;
        } else if (p.stock <= 4) {
          badgeClass = 'badge-low';
          badgeText = `Bajo: ${p.stock}`;
          barColor = 'var(--warning)';
        }

        const tamanoPerfume = p.tamano || '100ml';
        const mlBase = parseInt(tamanoPerfume) || 100;

        let labelTipo = `SELLADO (${tamanoPerfume})`;
        if (p.tipo === 'Perfume para Decant') labelTipo = `ABIERTO (${tamanoPerfume})`;
        else if (p.tipo === 'Decant Vacío') labelTipo = `ENVASE (${p.tamano ? p.tamano : ''})`;

        const costoBaseVal = parseFloat(p.precio || 0);
        const precioSugeridoVal = parseFloat(p.precio_sugerido || 0);

        return `
          <div class="product-card">
            <div class="product-card-img-wrapper">
              <img src="${p.imagen_url || IMG_DEFAULT}" class="product-card-img" alt="${p.nombre}" onerror="this.src='${IMG_DEFAULT}'">
              <span class="badge product-card-badge">${labelTipo}</span>
            </div>
            <div class="product-card-body">
              <div>
                <h4 class="product-card-title">${p.nombre}</h4>
                <div style="margin-bottom:6px; font-size:0.83rem;">
                  Precio Sugerido (PVP): <strong style="color:var(--gold-light);">S/ ${precioSugeridoVal.toFixed(2)}</strong>
                </div>
                ${esAdmin() ? `
                  <div class="product-card-meta">
                    ${p.tipo === 'Decant Vacío' ? 
                      `Costo Unit/Envase: <strong style="color:var(--gold-light);">S/ ${costoBaseVal.toFixed(2)}</strong>` : 
                      `Costo Botella: <strong style="color:var(--gold-light);">S/ ${costoBaseVal.toFixed(2)}</strong> <br><span style="font-size:0.7rem; color:var(--muted);">(Costo/ml: S/ ${(costoBaseVal/mlBase).toFixed(2)})</span>`
                    }
                  </div>` : ''}
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span class="badge ${badgeClass}">${badgeText}</span>
                  <span style="font-size:0.75rem; color:var(--muted);">${p.stock} unids.</span>
                </div>
                <div class="product-card-stock-bar">
                  <div class="product-card-stock-fill" style="width: ${pct}%; background: ${barColor};"></div>
                </div>
              </div>

              ${esAdmin() ? `
                <div class="product-card-actions">
                  <button onclick="editarProducto(${p.id})" class="btn-sec" style="padding:4px 8px; font-size:0.75rem;">✏️ Editar Producto</button>
                  <button onclick="sumarStockOLote(${p.id})" class="btn-add">➕ Ingresar Nuevo Lote / Stock</button>
                  ${p.tipo === 'Perfume Sellado' && p.stock > 0 ? `<button onclick="abrirPerfumeSellado(${p.id})" class="btn-open">🍾 Abrir p/ Decant</button>` : ''}
                  ${p.tipo !== 'Perfume Sellado' && p.stock > 0 ? `<button onclick="marcarComoVacio(${p.id}, '${p.nombre.replace(/'/g, "\\'")}', ${p.stock})" class="btn-empty">🚫 Marcar 1 menos</button>` : ''}
                  <button onclick="eliminarProducto(${p.id}, '${p.nombre.replace(/'/g, "\\\'")}')" class="btn-del" style="margin-top:2px;">🗑️ Eliminar Producto</button>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    async function sumarStockOLote(id) {
      if (!esAdmin()) return alert('Acceso denegado: Solo los administradores pueden gestionar el inventario.');

      const producto = listaProductos.find(p => p.id === id);
      if (!producto) return;

      if (producto.tipo === 'Decant Vacío') {
        const cantStr = prompt(`📦 INGRESAR NUEVO LOTE DE DECANTS (${producto.nombre} ${producto.tamano || ''})\n\n¿Cuántos envases vienen en el nuevo lote que compraste? (Ej: 112):`);
        if (!cantStr || isNaN(cantStr) || parseInt(cantStr) <= 0) return;
        const cantLote = parseInt(cantStr);

        const precioLoteStr = prompt(`💰 Precio TOTAL pagado por ese lote de ${cantLote} envases (S/): (Ej: 75.00)`);
        if (!precioLoteStr || isNaN(precioLoteStr) || parseFloat(precioLoteStr) < 0) return;
        const precioLote = parseFloat(precioLoteStr);

        const nuevoCostoUnitario = cantLote > 0 ? (precioLote / cantLote) : parseFloat(producto.precio || 0);
        const nuevoStockTotal = producto.stock + cantLote;

        const { error } = await client.from('productos').update({
          stock: nuevoStockTotal,
          precio: nuevoCostoUnitario
        }).eq('id', id);

        if (error) alert('Error al actualizar lote: ' + error.message);
        else {
          alert(`¡Lote agregado con éxito!\n- Envases agregados: ${cantLote}\n- Nuevo Stock Total: ${nuevoStockTotal}\n- Nuevo Costo Unitario por Envase: S/ ${nuevoCostoUnitario.toFixed(2)}`);
          cargarTodo();
        }
        return;
      }

      const cantidadStr = prompt(`¿Cuántas botellas/unidades deseas sumar al stock de "${producto.nombre}"?`);
      if (!cantidadStr || isNaN(cantidadStr) || parseInt(cantidadStr) <= 0) return;

      const precioBotellaStr = prompt(`Costo Comprado en S/ (deja en blanco para mantener S/ ${parseFloat(producto.precio || 0).toFixed(2)}):`, producto.precio);
      let nuevoPrecio = parseFloat(producto.precio || 0);
      if (precioBotellaStr && !isNaN(precioBotellaStr) && parseFloat(precioBotellaStr) >= 0) {
        nuevoPrecio = parseFloat(precioBotellaStr);
      }

      const pvpStr = prompt(`Precio Sugerido de Venta (PVP) en S/ (deja en blanco para mantener S/ ${parseFloat(producto.precio_sugerido || 0).toFixed(2)}):`, producto.precio_sugerido);
      let nuevoPVP = parseFloat(producto.precio_sugerido || 0);
      if (pvpStr && !isNaN(pvpStr) && parseFloat(pvpStr) >= 0) {
        nuevoPVP = parseFloat(pvpStr);
      }

      const nuevoStock = producto.stock + parseInt(cantidadStr);
      const { error } = await client.from('productos').update({ 
        stock: nuevoStock, 
        precio: nuevoPrecio,
        precio_sugerido: nuevoPVP 
      }).eq('id', id);

      if (error) alert('Error al actualizar stock: ' + error.message);
      else {
        alert(`¡Stock actualizado! Nuevo total: ${nuevoStock} unidades.`);
        cargarTodo();
      }
    }

    async function abrirPerfumeSellado(idSellado) {
      if (!esAdmin()) return alert('Acceso denegado: Solo los administradores pueden modificar el inventario.');

      const perfumeSelladoObj = listaProductos.find(p => p.id === idSellado);
      if (!perfumeSelladoObj || perfumeSelladoObj.stock < 1) return alert('No hay stock disponible para abrir.');

      const confirmar = confirm(`¿Deseas ABRIR 1 frasco sellado de "${perfumeSelladoObj.nombre}" (${perfumeSelladoObj.tamano || '100ml'})?\n\n- Se descontará 1 unidad de Perfumes Sellados.\n- Se sumará 1 unidad a "Perfume para Decant".`);
      if (!confirmar) return;

      const nuevoStockSellado = perfumeSelladoObj.stock - 1;
      const { error: err1 } = await client.from('productos').update({ stock: nuevoStockSellado }).eq('id', idSellado);
      if (err1) return alert('Error al actualizar stock sellado: ' + err1.message);

      const perfumeAbiertoObj = listaProductos.find(p => p.tipo === 'Perfume para Decant' && p.nombre.toLowerCase() === perfumeSelladoObj.nombre.toLowerCase());

      if (perfumeAbiertoObj) {
        await client.from('productos').update({ stock: perfumeAbiertoObj.stock + 1 }).eq('id', perfumeAbiertoObj.id);
      } else {
        await client.from('productos').insert([{
          nombre: perfumeSelladoObj.nombre,
          tipo: 'Perfume para Decant',
          tamano: perfumeSelladoObj.tamano || '100ml',
          precio: perfumeSelladoObj.precio,
          precio_sugerido: perfumeSelladoObj.precio_sugerido,
          stock: 1,
          imagen_url: perfumeSelladoObj.imagen_url
        }]);
      }

      alert(`¡"${perfumeSelladoObj.nombre}" se abrió correctamente! Quedan ${nuevoStockSellado} sellados.`);
      cargarTodo();
    }

    async function editarProducto(id) {
      if (!esAdmin()) return alert('Acceso denegado: Solo los administradores pueden editar productos.');

      const prod = listaProductos.find(p => p.id === id);
      if (!prod) return;

      const nuevoNombre = prompt("Editar nombre:", prod.nombre);
      if (nuevoNombre === null) return;

      const nuevoStockStr = prompt("Editar stock actual:", prod.stock);
      if (nuevoStockStr === null) return;
      const nuevoStock = parseInt(nuevoStockStr);

      const nuevoPrecioStr = prompt("Editar costo comprado (S/):", prod.precio);
      if (nuevoPrecioStr === null) return;
      const nuevoPrecio = parseFloat(nuevoPrecioStr);

      const nuevoPVPStr = prompt("Editar precio sugerido PVP (S/):", prod.precio_sugerido);
      if (nuevoPVPStr === null) return;
      const nuevoPVP = parseFloat(nuevoPVPStr);

      const nuevaImagen = prompt("Editar URL de imagen:", prod.imagen_url || "");
      if (nuevaImagen === null) return;

      if (isNaN(nuevoStock) || isNaN(nuevoPrecio) || isNaN(nuevoPVP)) {
        return alert("Por favor ingresa valores numéricos válidos.");
      }

      const { error } = await client.from('productos').update({
        nombre: nuevoNombre.trim(),
        stock: nuevoStock,
        precio: nuevoPrecio,
        precio_sugerido: nuevoPVP,
        imagen_url: nuevaImagen.trim() || null
      }).eq('id', id);

      if (error) alert('Error al editar producto: ' + error.message);
      else {
        alert('¡Producto actualizado correctamente!');
        cargarTodo();
      }
    }

    async function eliminarProducto(id, nombre) {
      if (!esAdmin()) return alert('Acceso denegado: Solo los administradores pueden eliminar productos.');

      const confirmar = confirm(`⚠️ ¿Confirmas que deseas ELIMINAR permanentemente el producto "${nombre}"?\n\nEsta acción no se puede deshacer.`);
      if (!confirmar) return;

      const { error } = await client.from('productos').delete().eq('id', id);
      if (error) alert('Error al eliminar producto: ' + error.message);
      else {
        alert(`El producto "${nombre}" ha sido eliminado del inventario.`);
        cargarTodo();
      }
    }

    async function marcarComoVacio(id, nombre, stockActual) {
      if (!esAdmin()) return alert('Acceso denegado: Solo los administradores pueden modificar el inventario.');
      if (stockActual <= 0) return alert(`"${nombre}" ya no tiene unidades disponibles.`);

      const confirmar = confirm(`¿Confirmas que se terminó 1 unidad de "${nombre}"?\n\nStock actual: ${stockActual} ➔ Quedarán: ${stockActual - 1}`);
      if (!confirmar) return;

      const nuevoStock = stockActual - 1;
      const { error } = await client.from('productos').update({ stock: nuevoStock }).eq('id', id);

      if (error) alert('Error al actualizar: ' + error.message);
      else {
        alert(`Se descontó 1 unidad de "${nombre}". Quedan: ${nuevoStock}.`);
        cargarTodo();
      }
    }

    function actualizarOpcionesVenta() {
      filtrarPerfumesVenta();
    }

    function filtrarPerfumesVenta() {
      const itemTipoVal = document.getElementById('itemTipo').value;
      const query = document.getElementById('itemBuscador').value.toLowerCase().trim();
      const isDecant = itemTipoVal === 'Decant';
      
      document.getElementById('grpTamano').classList.toggle('hidden', !isDecant);
      
      const tipo = isDecant ? 'Perfume para Decant' : 'Perfume Sellado';
      const filtrados = listaProductos.filter(p => p.tipo === tipo && p.stock > 0 && p.nombre.toLowerCase().includes(query));
      
      const selectPerfume = document.getElementById('itemPerfume');
      if (filtrados.length === 0) {
        selectPerfume.innerHTML = `<option value="">-- Sin resultados disponibles --</option>`;
      } else {
        selectPerfume.innerHTML = filtrados.map(p => `<option value="${p.id}">${p.nombre} [${p.tamano || '100ml'}] (Stock: ${p.stock})</option>`).join('');
      }

      mostrarPreviewPerfumeVenta();
    }

    function obtenerPrecioSugeridoVenta(perfumeObj, tipoVenta, tamanoDecant) {
      if (!perfumeObj) return 0;

      if (tipoVenta === 'Perfume Sellado') {
        return parseFloat(perfumeObj.precio_sugerido || 0);
      }

      const nombreNorm = perfumeObj.nombre.toUpperCase().trim();

      if (nombreNorm.includes('AL HARAMAIN') || nombreNorm.includes('GOLD EDITION')) {
        if (tamanoDecant === '3ml') return 25;
        if (tamanoDecant === '5ml') return 45;
        if (tamanoDecant === '10ml') return 65;
        if (tamanoDecant === '2ml') return 18;
      }

      if (nombreNorm.includes('LIQUID BRUN') || nombreNorm.includes('LIQUID BRUM')) {
        if (tamanoDecant === '3ml') return 20;
        if (tamanoDecant === '5ml') return 30;
        if (tamanoDecant === '10ml') return 40;
        if (tamanoDecant === '2ml') return 15;
      }

      if (nombreNorm.includes('9PM NIGHT OUT') || nombreNorm.includes('NIGHT OUT')) {
        if (tamanoDecant === '3ml') return 20;
        if (tamanoDecant === '5ml') return 30;
        if (tamanoDecant === '10ml') return 40;
        if (tamanoDecant === '2ml') return 15;
      }

      if (tamanoDecant === '3ml') return 15;
      if (tamanoDecant === '5ml') return 25;
      if (tamanoDecant === '10ml') return 35;
      if (tamanoDecant === '2ml') return 10;

      return parseFloat(perfumeObj.precio_sugerido || 0);
    }

    function mostrarPreviewPerfumeVenta() {
      const perfumeId = document.getElementById('itemPerfume').value;
      const cardPreview = document.getElementById('previewPerfumeVenta');
      const tipoVenta = document.getElementById('itemTipo').value;
      const tamanoDecant = document.getElementById('itemTamano').value;

      if (!perfumeId) {
        cardPreview.classList.add('hidden');
        document.getElementById('itemPrecio').value = '';
        return;
      }

      const perfume = listaProductos.find(p => p.id == perfumeId);
      if (perfume) {
        const precioAuto = obtenerPrecioSugeridoVenta(perfume, tipoVenta, tamanoDecant);

        document.getElementById('prevNombre').innerText = `${perfume.nombre} (${tipoVenta === 'Decant' ? tamanoDecant : (perfume.tamano || '100ml')})`;
        document.getElementById('prevStock').innerText = `Stock disponible: ${perfume.stock} unidades | PVP Sugerido: S/ ${precioAuto.toFixed(2)}`;
        document.getElementById('prevImg').src = perfume.imagen_url || IMG_DEFAULT;
        cardPreview.classList.remove('hidden');

        document.getElementById('itemPrecio').value = precioAuto > 0 ? precioAuto.toFixed(2) : '';
      } else {
        cardPreview.classList.add('hidden');
      }
    }

    function abrirModalQRYape() {
      document.getElementById('modalQRYape').classList.remove('hidden');
    }

    function cerrarModalQRYape() {
      document.getElementById('modalQRYape').classList.add('hidden');
    }

    function previsualizarComprobante(e) {
      const file = e.target.files[0];
      if (!file) {
        comprobanteBase64 = null;
        document.getElementById('previewComprobanteContainer').classList.add('hidden');
        guardarBorradorVenta();
        return;
      }

      const reader = new FileReader();
      reader.onload = function(evt) {
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          const maxDimension = 800;
          let width = img.width;
          let height = img.height;

          if (width > height && width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          comprobanteBase64 = canvas.toDataURL('image/jpeg', 0.7);
          document.getElementById('imgComprobantePreview').src = comprobanteBase64;
          document.getElementById('previewComprobanteContainer').classList.remove('hidden');
          guardarBorradorVenta();
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    }

    function abrirBaseDatosBorradores() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(BORRADORES_DB, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(BORRADORES_STORE)) {
            request.result.createObjectStore(BORRADORES_STORE);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async function guardarBorradorVenta() {
      if (!usuarioActual) return;
      try {
        const db = await abrirBaseDatosBorradores();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(BORRADORES_STORE, 'readwrite');
          tx.objectStore(BORRADORES_STORE).put({
            carritoVenta,
            comprobanteBase64,
            vtaNotas: document.getElementById('vtaNotas').value,
            vtaCanal: document.getElementById('vtaCanal').value,
            vtaMetodoPago: document.getElementById('vtaMetodoPago').value,
            actualizado: new Date().toISOString()
          }, usuarioActual.id);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      } catch (error) {
        console.error('No se pudo guardar el borrador de venta:', error);
      }
    }

    async function restaurarBorradorVenta() {
      if (!usuarioActual) return;
      try {
        const db = await abrirBaseDatosBorradores();
        const borrador = await new Promise((resolve, reject) => {
          const tx = db.transaction(BORRADORES_STORE, 'readonly');
          const request = tx.objectStore(BORRADORES_STORE).get(usuarioActual.id);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
        db.close();
        if (!borrador) return;

        carritoVenta = Array.isArray(borrador.carritoVenta) ? borrador.carritoVenta : [];
        comprobanteBase64 = borrador.comprobanteBase64 || null;
        document.getElementById('vtaNotas').value = borrador.vtaNotas || '';
        if (borrador.vtaCanal) document.getElementById('vtaCanal').value = borrador.vtaCanal;
        if (borrador.vtaMetodoPago) document.getElementById('vtaMetodoPago').value = borrador.vtaMetodoPago;
        if (comprobanteBase64) {
          document.getElementById('imgComprobantePreview').src = comprobanteBase64;
          document.getElementById('previewComprobanteContainer').classList.remove('hidden');
        }
      } catch (error) {
        console.error('No se pudo recuperar el borrador de venta:', error);
      }
    }

    async function borrarBorradorVenta() {
      if (!usuarioActual || !('indexedDB' in window)) return;
      try {
        const db = await abrirBaseDatosBorradores();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(BORRADORES_STORE, 'readwrite');
          tx.objectStore(BORRADORES_STORE).delete(usuarioActual.id);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      } catch (error) {
        console.error('No se pudo borrar el borrador de venta:', error);
      }
    }

    async function guardarComprobanteEnStorage(dataUrl) {
      if (!dataUrl) return null;
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const ruta = `${usuarioActual.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await client.storage.from(COMPROBANTES_BUCKET).upload(ruta, blob, {
        contentType: 'image/jpeg',
        upsert: false
      });
      if (error) throw new Error(`No se pudo guardar el comprobante: ${error.message}`);
      return ruta;
    }

    async function obtenerUrlComprobante(valor) {
      if (!valor) return null;
      // Compatibilidad con ventas antiguas que guardaron la imagen como Base64.
      if (valor.startsWith('data:image/')) return valor;
      const { data, error } = await client.storage.from(COMPROBANTES_BUCKET).createSignedUrl(valor, 300);
      if (error) throw new Error(`No se pudo abrir el comprobante: ${error.message}`);
      return data.signedUrl;
    }

    function agregarAlCarrito() {
      const perfumeId = document.getElementById('itemPerfume').value;
      const tipoVenta = document.getElementById('itemTipo').value;
      const tamanoDecant = document.getElementById('itemTamano').value;
      const cantidad = parseInt(document.getElementById('itemCantidad').value) || 1;
      const precioVentaCobrado = parseFloat(document.getElementById('itemPrecio').value);

      if (!perfumeId) return alert('Selecciona un perfume válido.');
      if (isNaN(precioVentaCobrado) || precioVentaCobrado <= 0) return alert('Ingresa un precio cobrado válido mayor a 0.');

      const perfumeObj = listaProductos.find(p => p.id == perfumeId);
      if (!perfumeObj) return alert('Producto no encontrado en inventario.');

      if (tipoVenta === 'Decant') {
        const envase = listaProductos.find(p => p.tipo === 'Decant Vacío' && p.tamano === tamanoDecant);
        const cantidadEnCarrito = carritoVenta.reduce((total, item) =>
          item.tipo === 'Decant' && item.tamano === tamanoDecant ? total + Number(item.cantidad || 0) : total, 0);
        if (envase && cantidadEnCarrito + cantidad > Number(envase.stock)) {
          return alert('Stock insuficiente de envases de ' + tamanoDecant + '. Disponibles: ' + envase.stock + '.');
        }
      }
      if (tipoVenta === 'Perfume Sellado' && perfumeObj.stock < cantidad) {
        return alert(`Stock insuficiente. Solo quedan ${perfumeObj.stock} unidades de ${perfumeObj.nombre}.`);
      }

      let costoUnitarioFinal = 0;

      if (tipoVenta === 'Perfume Sellado') {
        costoUnitarioFinal = parseFloat(perfumeObj.precio || 0);
      } else {
        const precioBotella = parseFloat(perfumeObj.precio || 0);
        const mlBotellaBase = parseInt(perfumeObj.tamano) || 100;
        const costoPorMl = precioBotella / mlBotellaBase;
        const mlVendido = parseInt(tamanoDecant) || 3;
        
        const costoLiquido = costoPorMl * mlVendido;

        const vacioObj = listaProductos.find(p => p.tipo === 'Decant Vacío' && p.tamano === tamanoDecant);
        const costoEnvaseVacio = vacioObj ? parseFloat(vacioObj.precio || 0) : 0;

        costoUnitarioFinal = costoLiquido + costoEnvaseVacio;

        if (costoUnitarioFinal >= precioVentaCobrado) {
          costoUnitarioFinal = precioVentaCobrado * 0.50;
        }
      }

      const item = {
        producto_id: perfumeObj.id,
        nombre: perfumeObj.nombre,
        tipo: tipoVenta,
        tamano: tipoVenta === 'Decant' ? tamanoDecant : (perfumeObj.tamano || 'Frasco Entero'),
        cantidad: cantidad,
        precio_unitario: precioVentaCobrado,
        costo_unitario: costoUnitarioFinal,
        subtotal: cantidad * precioVentaCobrado,
        costo_total: cantidad * costoUnitarioFinal,
        imagen_url: perfumeObj.imagen_url,
        es_regalo: false
      };

      carritoVenta.push(item);
      guardarBorradorVenta();

      if (tipoVenta === 'Perfume Sellado') {
        const quiereRegalo = confirm(`🎁 ¡PROMOCIÓN DE REGALO!\n\n¿Deseas agregar un Decant de 3ml DE REGALO para esta compra de "${perfumeObj.nombre}"?`);
        if (quiereRegalo) {
          ofrecerRegaloDecant3ml();
        }
      }

      document.getElementById('itemPrecio').value = '';
      document.getElementById('itemCantidad').value = '1';
      renderizarCarrito();
    }

    function ofrecerRegaloDecant3ml() {
      const perfumesAbiertos = listaProductos.filter(p => p.tipo === 'Perfume para Decant' && p.stock > 0);
      if (!perfumesAbiertos.length) {
        alert('⚠️ No hay perfumes abiertos disponibles para preparar el decant de regalo.');
        return;
      }

      document.getElementById('regaloBuscador').value = '';
      filtrarRegalosModal();
      document.getElementById('modalRegaloPerfume').classList.remove('hidden');
    }

    function filtrarRegalosModal() {
      const query = document.getElementById('regaloBuscador').value.toLowerCase().trim();
      perfumesRegaloFiltrados = listaProductos.filter(p => p.tipo === 'Perfume para Decant' && p.stock > 0 && p.nombre.toLowerCase().includes(query));

      const selectRegalo = document.getElementById('selectRegaloModal');
      if (!perfumesRegaloFiltrados.length) {
        selectRegalo.innerHTML = '<option value="">-- Sin perfumes disponibles --</option>';
      } else {
        selectRegalo.innerHTML = perfumesRegaloFiltrados.map(p => `<option value="${p.id}">${p.nombre} [${p.tamano || '100ml'}] (Stock: ${p.stock})</option>`).join('');
      }

      mostrarPreviewRegaloModal();
    }

    function mostrarPreviewRegaloModal() {
      const regaloId = document.getElementById('selectRegaloModal').value;
      const cardPreview = document.getElementById('previewRegaloCard');

      if (!regaloId) {
        cardPreview.classList.add('hidden');
        return;
      }

      const perfume = listaProductos.find(p => p.id == regaloId);
      if (perfume) {
        document.getElementById('nombreRegaloPreview').innerText = `${perfume.nombre} (Regalo Decant 3ml)`;
        document.getElementById('stockRegaloPreview').innerText = `Stock disponible: ${perfume.stock} frascos`;
        document.getElementById('imgRegaloPreview').src = perfume.imagen_url || IMG_DEFAULT;
        cardPreview.classList.remove('hidden');
      } else {
        cardPreview.classList.add('hidden');
      }
    }

    function cerrarModalRegalo() {
      document.getElementById('modalRegaloPerfume').classList.add('hidden');
    }

    function confirmarRegaloDecant3ml() {
      const regaloId = document.getElementById('selectRegaloModal').value;
      if (!regaloId) {
        alert('Por favor selecciona un perfume para el regalo.');
        return;
      }

      const perfumeRegalo = listaProductos.find(p => p.id == regaloId);
      if (!perfumeRegalo) return;

      const vacioRegalo = listaProductos.find(p => p.tipo === 'Decant Vacío' && p.tamano === '3ml');
      let costoVacio = 0;
      if (vacioRegalo) {
        costoVacio = parseFloat(vacioRegalo.precio || 0);
        if (vacioRegalo.stock < 1) {
          alert('⚠️ Nota: No quedan envases vacíos de 3ml registrados en el inventario para el regalo.');
        }
      }

      const mlBase = parseInt(perfumeRegalo.tamano) || 100;
      const costoLiquido3ml = (parseFloat(perfumeRegalo.precio || 0) / mlBase) * 3;
      const costoRegaloTotal = costoLiquido3ml + costoVacio;

      const regaloItem = {
        producto_id: perfumeRegalo.id,
        nombre: `🎁 REGALO: Decant 3ml (${perfumeRegalo.nombre})`,
        tipo: 'Decant',
        tamano: '3ml',
        cantidad: 1,
        precio_unitario: 0.00,
        costo_unitario: costoRegaloTotal,
        subtotal: 0.00,
        costo_total: costoRegaloTotal,
        imagen_url: perfumeRegalo.imagen_url,
        es_regalo: true
      };

      carritoVenta.push(regaloItem);
      guardarBorradorVenta();
      cerrarModalRegalo();
      renderizarCarrito();
      alert(`¡Decant de 3ml de "${perfumeRegalo.nombre}" agregado como REGALO (S/ 0.00)!`);
    }

    function ajustarCantidadCarrito(indice, cambio) {
      const item = carritoVenta[indice];
      if (!item) return;
      const nuevaCantidad = Number(item.cantidad) + cambio;
      if (nuevaCantidad < 1) return;

      if (item.tipo === 'Perfume Sellado') {
        const producto = listaProductos.find(p => p.id == item.producto_id);
        const otrasUnidades = carritoVenta.reduce((total, otro, i) =>
          i !== indice && otro.tipo === 'Perfume Sellado' && otro.producto_id == item.producto_id
            ? total + Number(otro.cantidad || 0) : total, 0);
        if (producto && nuevaCantidad + otrasUnidades > Number(producto.stock)) {
          return alert('No hay suficiente stock para aumentar esta cantidad.');
        }
      } else if (item.tipo === 'Decant') {
        const envase = listaProductos.find(p => p.tipo === 'Decant Vacío' && p.tamano === item.tamano);
        const otrosDecants = carritoVenta.reduce((total, otro, i) =>
          i !== indice && otro.tipo === 'Decant' && otro.tamano === item.tamano
            ? total + Number(otro.cantidad || 0) : total, 0);
        if (envase && nuevaCantidad + otrosDecants > Number(envase.stock)) {
          return alert('Solo quedan ' + envase.stock + ' envases de ' + item.tamano + '.');
        }
      }

      item.cantidad = nuevaCantidad;
      item.subtotal = item.cantidad * Number(item.precio_unitario || 0);
      item.costo_total = item.cantidad * Number(item.costo_unitario || 0);
      renderizarCarrito();
      guardarBorradorVenta();
    }

    function eliminarDelCarrito(index) {
      carritoVenta.splice(index, 1);
      renderizarCarrito();
      guardarBorradorVenta();
    }

    function renderizarCarrito() {
      const cont = document.getElementById('listaCarrito');
      if (!carritoVenta.length) {
        cont.innerHTML = '<p class="empty-msg">El carrito está vacío. Agrega productos arriba.</p>';
        document.getElementById('txtTotalVenta').innerText = 'Total a cobrar: S/ 0.00';
        return;
      }

      let total = 0;
      cont.innerHTML = carritoVenta.map((item, idx) => {
        total += item.subtotal;
        return `
          <div class="cart-item">
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="${item.imagen_url || IMG_DEFAULT}" style="width:36px; height:36px; object-fit:cover; border-radius:5px; border:1px solid var(--border);" onerror="this.src='${IMG_DEFAULT}'">
              <div>
                <strong>${item.cantidad}x ${item.nombre}</strong> <span class="badge ${item.es_regalo ? 'badge-gift' : ''}">${item.es_regalo ? '🎁 GRATIS' : `${item.tipo} - ${item.tamano}`}</span><br>
                <span style="color:var(--muted); font-size:0.75rem;">Cobrado: S/ ${item.precio_unitario.toFixed(2)} | Costo Estimado: S/ ${item.costo_unitario.toFixed(2)}</span>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <div class="cart-item-controls"><div class="cart-quantity-controls"><button type="button" onclick="ajustarCantidadCarrito(${idx}, -1)" aria-label="Restar una unidad">−</button><span>${item.cantidad}</span><button type="button" onclick="ajustarCantidadCarrito(${idx}, 1)" aria-label="Sumar una unidad">+</button></div><strong style="color:${item.es_regalo ? '#a3e6af' : 'var(--gold-light)'};">S/ ${item.subtotal.toFixed(2)}</strong></div>
              <button type="button" onclick="eliminarDelCarrito(${idx})" class="btn-del">❌</button>
            </div>
          </div>
        `;
      }).join('');

      document.getElementById('txtTotalVenta').innerText = `Total a cobrar: S/ ${total.toFixed(2)}`;
    }

    document.getElementById('formStock').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!esAdmin()) return alert('Acceso denegado: Solo los administradores pueden crear nuevos productos.');

      const tipo = document.getElementById('stkTipo').value;
      const nombreInput = document.getElementById('stkNombre').value.trim();
      const imagenInput = document.getElementById('stkImagen').value.trim();
      const cantidadReg = parseInt(document.getElementById('stkCantidad').value) || 1;
      const precioMontoInput = parseFloat(document.getElementById('stkPrecio').value) || 0;
      const precioSugeridoInput = parseFloat(document.getElementById('stkPrecioSugerido').value) || 0;

      let tamanoValor = null;
      if (tipo === 'Decant Vacío') {
        tamanoValor = document.getElementById('stkTamanoVacios').value;
      } else {
        tamanoValor = document.getElementById('stkTamanoBotella').value;
      }

      let costoUnitarioCalculado = precioMontoInput;
      if (tipo === 'Decant Vacío' && cantidadReg > 0) {
        costoUnitarioCalculado = precioMontoInput / cantidadReg;
      }

      const nuevo = {
        nombre: nombreInput,
        tipo: tipo,
        tamano: tamanoValor,
        precio: costoUnitarioCalculado,
        precio_sugerido: precioSugeridoInput,
        stock: cantidadReg,
        imagen_url: imagenInput || null
      };

      const { error } = await client.from('productos').insert([nuevo]);
      if (error) alert('Error: ' + error.message);
      else {
        alert('Registrado correctamente');
        document.getElementById('formStock').reset();
        toggleCamposStock();
        cargarTodo();
      }
    });

    async function restaurarReservaStock(reservas) {
      for (const reserva of [...reservas].reverse()) {
        const { data, error } = await client.from('productos')
          .update({ stock: reserva.stockAnterior })
          .eq('id', reserva.id)
          .eq('stock', reserva.stockReservado)
          .select('id')
          .maybeSingle();
        if (error || !data) console.error('No se pudo revertir una reserva de stock; requiere revisión manual.', reserva.id, error);
      }
    }

    async function reservarStockVenta(items) {
      const cantidades = new Map();
      items.forEach(item => {
        let productoId = null;
        if (item.tipo === 'Perfume Sellado') productoId = item.producto_id;
        else if (item.tipo === 'Decant') {
          const envase = listaProductos.find(p => p.tipo === 'Decant Vacío' && p.tamano === item.tamano);
          if (envase) productoId = envase.id;
        }
        if (productoId !== null) cantidades.set(productoId, (cantidades.get(productoId) || 0) + Number(item.cantidad || 0));
      });
      const reservas = [];
      try {
        for (const [id, cantidad] of [...cantidades.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
          const { data: producto, error: errorLectura } = await client.from('productos').select('stock').eq('id', id).single();
          if (errorLectura || !producto) throw new Error('No se pudo verificar el stock del producto ' + id + '.');
          const stockAnterior = Number(producto.stock);
          if (stockAnterior < cantidad) throw new Error('Stock insuficiente. Actualiza el inventario antes de registrar la venta.');
          const stockReservado = stockAnterior - cantidad;
          const { data: actualizado, error: errorActualizacion } = await client.from('productos')
            .update({ stock: stockReservado }).eq('id', id).eq('stock', stockAnterior).select('id').maybeSingle();
          if (errorActualizacion) throw new Error('No se pudo descontar el stock: ' + errorActualizacion.message);
          if (!actualizado) throw new Error('El inventario cambió mientras procesabas la venta. Revisa el carrito e inténtalo de nuevo.');
          reservas.push({ id, stockAnterior, stockReservado });
        }
        return reservas;
      } catch (error) {
        await restaurarReservaStock(reservas);
        throw error;
      }
    }

    document.getElementById('formVenta').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (procesandoVenta) return;
      if (!carritoVenta.length) return alert('¡Agrega al menos un producto al carrito antes de procesar la venta!');

      const btnSubmit = document.getElementById('btnSubmitVenta');
      let reservaStock = [];
      let ventaGuardada = false;
      
      try {
        procesandoVenta = true;
        btnSubmit.disabled = true;
        btnSubmit.innerText = '⏳ Procesando Venta...';

        const canal = document.getElementById('vtaCanal').value;
        const metodoPago = document.getElementById('vtaMetodoPago').value;
        const notasTexto = document.getElementById('vtaNotas').value.trim();
        const totalMonto = carritoVenta.reduce((acc, item) => acc + item.subtotal, 0);
        const totalCosto = carritoVenta.reduce((acc, item) => acc + item.costo_total, 0);
        
        const gananciaNetaVenta = totalMonto - totalCosto;

        const rutaComprobante = comprobanteBase64
          ? await guardarComprobanteEnStorage(comprobanteBase64)
          : null;

        reservaStock = await reservarStockVenta(carritoVenta);

        const resumenNombres = carritoVenta.map(i => `${i.cantidad}x ${i.nombre} (${i.tamano})`).join(', ');
        const primerTipo = carritoVenta[0] ? carritoVenta[0].tipo : 'Venta Mixta';

        const venta = {
          producto_nombre: resumenNombres,
          tipo_venta: primerTipo,
          monto_total: totalMonto,
          ganancia_neta: gananciaNetaVenta,
          vendedor_email: usuarioActual.email,
          ubicacion_venta: `${canal} (${metodoPago})`,
          detalles: carritoVenta,
          comprobante_url: rutaComprobante,
          notas: notasTexto || null
        };

        const { error } = await client.from('ventas').insert([venta]);
        if (error) {
          await restaurarReservaStock(reservaStock);
          reservaStock = [];
          alert('Error al registrar la venta: ' + error.message);
        } else {
          ventaGuardada = true;

          // --- REPRODUCIR SONIDO AL TENER ÉXITO ---
          sonidoVenta.currentTime = 0; // Reinicia el audio si se presiona varias veces seguidas
          sonidoVenta.play().catch(err => {
              console.warn("El navegador bloqueó la reproducción automática del audio:", err);
          });

          mostrarAviso('Venta registrada correctamente.', 'success');
          carritoVenta = [];
          comprobanteBase64 = null;
          document.getElementById('vtaNotas').value = '';
          document.getElementById('vtaFotoComprobante').value = '';
          document.getElementById('previewComprobanteContainer').classList.add('hidden');
          await borrarBorradorVenta();
          renderizarCarrito();
          document.getElementById('itemBuscador').value = '';
          actualizarOpcionesVenta();
          cargarTodo();
        }
      } catch (err) {
        if (!ventaGuardada && reservaStock.length) await restaurarReservaStock(reservaStock);
        alert('Ocurrió un error inesperado al procesar la venta: ' + err.message);
      } finally {
        procesandoVenta = false;
        btnSubmit.disabled = false;
        btnSubmit.innerText = '✅ Procesar Venta Completa';
      }
    });

    ['vtaNotas', 'vtaCanal', 'vtaMetodoPago'].forEach(id => {
      const campo = document.getElementById(id);
      campo.addEventListener('input', guardarBorradorVenta);
      campo.addEventListener('change', guardarBorradorVenta);
    });

    async function cargarHistorial() {
      const { data: ventasCargadas } = await client.from('ventas').select('*').order('fecha', { ascending: false });
      listaVentasCache = ventasCargadas || [];
      const fechaDesde = document.getElementById('fechaReporteDesde').value;
      const fechaHasta = document.getElementById('fechaReporteHasta').value;
      if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
        document.getElementById('listaVentas').innerHTML = '<p class="empty-msg">La fecha inicial debe ser anterior a la fecha final.</p>';
        renderizarGraficoVentas({});
        actualizarGraficoVendedores();
        return;
      }
      const ventas = listaVentasCache.filter(v => {
        const fecha = new Date(v.fecha);
        const clave = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0') + '-' + String(fecha.getDate()).padStart(2, '0');
        return (!fechaDesde || clave >= fechaDesde) && (!fechaHasta || clave <= fechaHasta);
      });
      
      const contenedor = document.getElementById('listaVentas');
      
      if (!ventas || !ventas.length) {
        contenedor.innerHTML = '<p class="empty-msg">No hay ventas registradas aún.</p>';
        renderizarGraficoVentas({});
        actualizarGraficoVendedores();
        return;
      }

      let catalogo = listaProductos;
      if (!catalogo || !catalogo.length) {
        const { data: prods } = await client.from('productos').select('*');
        catalogo = prods || [];
        listaProductos = catalogo;
      }

      const esUsuarioAdmin = esAdmin();
      const grupos = {};
      
      ventas.forEach((v, index) => {
        const fechaObj = new Date(v.fecha);
        const ano = fechaObj.getFullYear();
        const mes = String(fechaObj.getMonth() + 1).padStart(2, '0');
        const dia = String(fechaObj.getDate()).padStart(2, '0');
        const claveFechaLocal = `${ano}-${mes}-${dia}`;

        if (!grupos[claveFechaLocal]) {
          grupos[claveFechaLocal] = {
            fechaFormateada: fechaObj.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            etiquetaCorta: fechaObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
            ventas: [],
            totalGanado: 0,
            gananciaNetaTotal: 0
          };
        }
        
        let ganNeta = 0;
        const montoVenta = parseFloat(v.monto_total || 0);

        if (v.ganancia_neta !== undefined && v.ganancia_neta !== null && parseFloat(v.ganancia_neta) > 0) {
          ganNeta = parseFloat(v.ganancia_neta);
        } else if (Array.isArray(v.detalles) && v.detalles.length > 0) {
          let costoTotalCalculado = 0;

          v.detalles.forEach(item => {
            let cUnit = parseFloat(item.costo_unitario || 0);
            const cant = parseInt(item.cantidad) || 1;
            const pUnit = parseFloat(item.precio_unitario || 0);
            
            if (cUnit === 0 || cUnit >= pUnit) {
              const prodObj = catalogo.find(p => p.id === item.producto_id) || 
                              catalogo.find(p => p.nombre.toLowerCase() === (item.nombre || '').toLowerCase());
              
              if (prodObj) {
                const precioBotella = parseFloat(prodObj.precio || 0);
                const mlBotellaBase = parseInt(prodObj.tamano) || 100;

                if (item.tipo === 'Decant') {
                  const mlVendido = parseInt(item.tamano) || 3;
                  const costoLiquido = (precioBotella / mlBotellaBase) * mlVendido;
                  const envaseObj = catalogo.find(p => p.tipo === 'Decant Vacío' && p.tamano === item.tamano);
                  const costoEnvase = envaseObj ? parseFloat(envaseObj.precio || 0) : 0;

                  cUnit = costoLiquido + costoEnvase;
                } else {
                  cUnit = precioBotella;
                }
              }

              if (cUnit >= pUnit && pUnit > 0) {
                cUnit = pUnit * 0.50;
              }
            }
            costoTotalCalculado += cUnit * cant;
          });

          ganNeta = montoVenta - costoTotalCalculado;
          if (ganNeta < 0) {
            ganNeta = montoVenta * 0.50;
          }
        } else {
          ganNeta = montoVenta * 0.50;
        }

        v._gananciaCalculada = ganNeta;

        grupos[claveFechaLocal].ventas.push({ venta: v, indexGlobal: listaVentasCache.indexOf(v), gananciaNetaCalculada: ganNeta });
        grupos[claveFechaLocal].totalGanado += montoVenta;
        grupos[claveFechaLocal].gananciaNetaTotal += ganNeta;
      });

      renderizarGraficoVentas(grupos);
      actualizarGraficoVendedores();

      const clavesOrdenadas = Object.keys(grupos).sort().reverse();

      contenedor.innerHTML = clavesOrdenadas.map((clave, dayIdx) => {
        const grupo = grupos[clave];
        const numVentas = grupo.ventas.length;
        const totalVentaSoles = grupo.totalGanado.toFixed(2);
        const gananciaNetaSoles = grupo.gananciaNetaTotal.toFixed(2);
        const esPrimerDia = dayIdx === 0;

        const htmlVentas = grupo.ventas.map(item => {
          const v = item.venta;
          const idx = item.indexGlobal;
          const gNeta = item.gananciaNetaCalculada.toFixed(2);
          
          return `
            <div class="stock-item" style="margin-top:8px; padding:10px; background:rgba(2,19,38,.5); border-radius:8px; border:1px solid var(--border);">
              <div>
                <p style="margin:0;font-size:.72rem; color:var(--muted);">${new Date(v.fecha).toLocaleTimeString()}</p>
                <h4 style="margin:5px 0; color:var(--ivory);">${v.producto_nombre}</h4>
                <p class="price" style="margin:0;font-size:.83rem;">
                  Total Venta: S/ ${parseFloat(v.monto_total).toFixed(2)}
                  ${esUsuarioAdmin ? ` | <span style="color:#a3e6af;">Margen: S/ ${gNeta}</span>` : ''}
                </p>
                <p style="margin:4px 0 0;font-size:.72rem;">Vendido por: <strong>${v.vendedor_email}</strong> vía <strong>${v.ubicacion_venta}</strong></p>
                
                ${v.notas ? `<div class="nota-box">📌 <strong>Nota:</strong> ${v.notas}</div>` : ''}

                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px;">
                  ${v.comprobante_url ? `<button type="button" onclick="abrirModalComprobante(${idx})" class="btn-sec" style="padding:4px 10px; font-size:0.75rem; width:auto; margin:0;">📸 Ver Captura</button>` : ''}
                  ${esUsuarioAdmin ? `<button type="button" onclick="deshacerVenta(${v.id})" class="btn-undo">↩️ Deshacer Venta</button>` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('');

        return `
          <div class="day-group">
            <button type="button" class="day-header" onclick="toggleDiaHistorial('${clave}')">
              <span class="day-header-title">📋 Cierre de Caja: ${grupo.fechaFormateada}</span>
              <span class="day-header-summary">
                <strong>${numVentas} ${numVentas === 1 ? 'venta' : 'ventas'}</strong><br>
                <span>Venta Total: <strong>S/ ${totalVentaSoles}</strong></span>
                ${esUsuarioAdmin ? ` | <span style="color:#a3e6af;">Margen: <strong>S/ ${gananciaNetaSoles}</strong></span>` : ''}
                <span id="arrow-${clave}">${esPrimerDia ? '▲' : '▼'}</span>
              </span>
            </button>
            <div id="content-${clave}" class="day-content ${esPrimerDia ? '' : 'hidden'}">
              ${htmlVentas}
            </div>
          </div>
        `;
      }).join('');
    }

    async function deshacerVenta(idVenta) {
      if (!esAdmin()) return alert('Acceso denegado: Solo los administradores pueden deshacer o anular ventas.');

      const ventaObj = listaVentasCache.find(v => v.id === idVenta);
      if (!ventaObj) return alert('No se encontró el registro de la venta.');

      const confirmar = confirm(`⚠️ ¿Confirmas que deseas DESHACER y ANULAR la venta #${idVenta}?\n\n- Se eliminará del historial.\n- Se devolverá automáticamente el stock a los productos/envases correspondientes.`);
      if (!confirmar) return;

      if (Array.isArray(ventaObj.detalles)) {
        for (const item of ventaObj.detalles) {
          if (item.tipo === 'Perfume Sellado') {
            const perf = listaProductos.find(p => p.id === item.producto_id);
            if (perf) {
              await client.from('productos').update({ stock: perf.stock + item.cantidad }).eq('id', perf.id);
            }
          } else {
            const vacioObj = listaProductos.find(p => p.tipo === 'Decant Vacío' && p.tamano === item.tamano);
            if (vacioObj) {
              await client.from('productos').update({ stock: vacioObj.stock + item.cantidad }).eq('id', vacioObj.id);
            }
          }
        }
      }

      const { error } = await client.from('ventas').delete().eq('id', idVenta);
      if (error) {
        alert('Error al deshacer la venta: ' + error.message);
      } else {
        alert('¡Venta anulada correctamente! El stock fue devuelto al inventario.');
        cargarTodo();
      }
    }

    function renderizarGraficoVentas(grupos) {
      const ctx = document.getElementById('chartVentasDiarias');
      if (!ctx) return;

      const esUsuarioAdmin = esAdmin();
      const txtTitulo = document.getElementById('txtTituloGrafico');
      
      if (txtTitulo) {
        txtTitulo.innerText = esUsuarioAdmin ? '📈 Rendimiento Diario (Margen de Contribución vs Metas)' : '📈 Rendimiento Diario de Ventas';
      }

      const clavesOrdenadas = Object.keys(grupos).sort();
      const labels = clavesOrdenadas.map(c => grupos[c].etiquetaCorta);
      const dataGanancias = clavesOrdenadas.map(c => esUsuarioAdmin ? grupos[c].gananciaNetaTotal : grupos[c].totalGanado);

      const coloresBarras = dataGanancias.map(valor => {
        if (valor >= META_DIARIA) return '#85b88f';
        if (valor >= PUNTO_EQUILIBRIO) return '#f1c36d';
        return '#d99076';
      });

      if (miGraficoVentas) {
        miGraficoVentas.destroy();
      }

      miGraficoVentas = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: esUsuarioAdmin ? 'Margen de Contribución Diario (S/)' : 'Ventas Totales (S/)',
            data: dataGanancias,
            backgroundColor: coloresBarras,
            borderColor: 'rgba(226, 177, 86, 0.6)',
            borderWidth: 1,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return ` ${esUsuarioAdmin ? 'Margen' : 'Total Venta'}: S/ ${context.parsed.y.toFixed(2)}`;
                }
              }
            },
            annotation: {
              annotations: {
                lineEquilibrio: {
                  type: 'line',
                  yMin: PUNTO_EQUILIBRIO,
                  yMax: PUNTO_EQUILIBRIO,
                  borderColor: '#efc66e',
                  borderWidth: 2,
                  borderDash: [6, 6],
                  label: {
                    display: true,
                    content: `P. Equilibrio: S/ ${PUNTO_EQUILIBRIO}`,
                    position: 'start',
                    backgroundColor: 'rgba(3, 26, 52, 0.8)',
                    color: '#efc66e',
                    font: { size: 10 }
                  }
                },
                lineMeta: {
                  type: 'line',
                  yMin: META_DIARIA,
                  yMax: META_DIARIA,
                  borderColor: '#85b88f',
                  borderWidth: 2,
                  borderDash: [4, 4],
                  label: {
                    display: true,
                    content: `Meta: S/ ${META_DIARIA}`,
                    position: 'end',
                    backgroundColor: 'rgba(3, 26, 52, 0.8)',
                    color: '#85b88f',
                    font: { size: 10 }
                  }
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: '#b8c6d5' },
              grid: { color: 'rgba(246,240,231,0.08)' }
            },
            x: {
              ticks: { color: '#b8c6d5' },
              grid: { display: false }
            }
          }
        }
      });
    }

    function limpiarFiltroFechas() {
      document.getElementById('fechaReporteDesde').value = '';
      document.getElementById('fechaReporteHasta').value = '';
      cargarHistorial();
    }

    function actualizarGraficoVendedores() {
      const ctx = document.getElementById('chartVentasVendedor');
      if (!ctx) return;

      const filtro = document.getElementById('selectFiltroVendedor').value;
      const esUsuarioAdmin = esAdmin();

      const ahora = new Date();
      const anoHoy = ahora.getFullYear();
      const mesHoy = String(ahora.getMonth() + 1).padStart(2, '0');
      const diaHoy = String(ahora.getDate()).padStart(2, '0');
      const fechaHoyStr = `${anoHoy}-${mesHoy}-${diaHoy}`;

      const inicioFiltro = document.getElementById('fechaReporteDesde').value;
      const finFiltro = document.getElementById('fechaReporteHasta').value;
      let ventasFiltradas = listaVentasCache.filter(v => {
        const fecha = new Date(v.fecha);
        const clave = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0') + '-' + String(fecha.getDate()).padStart(2, '0');
        return (!inicioFiltro || clave >= inicioFiltro) && (!finFiltro || clave <= finFiltro);
      });
      if (filtro === 'HOY') {
        ventasFiltradas = ventasFiltradas.filter(v => {
          const f = new Date(v.fecha);
          const fStr = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
          return fStr === fechaHoyStr;
        });
      }

      const resumenVendedores = {};

      ventasFiltradas.forEach(v => {
        let vend = v.vendedor_email || 'Sin Asignar';
        vend = vend.split('@')[0];

        if (!resumenVendedores[vend]) {
          resumenVendedores[vend] = 0;
        }

        const monto = esUsuarioAdmin ? (v._gananciaCalculada || parseFloat(v.monto_total || 0) * 0.5) : parseFloat(v.monto_total || 0);
        resumenVendedores[vend] += monto;
      });

      const labels = Object.keys(resumenVendedores);
      const dataValores = Object.values(resumenVendedores);

      if (miGraficoVendedores) {
        miGraficoVendedores.destroy();
      }

      miGraficoVendedores = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels.length ? labels : ['Sin Datos'],
          datasets: [{
            label: esUsuarioAdmin ? 'Margen Generado (S/)' : 'Total Vendido (S/)',
            data: dataValores.length ? dataValores : [0],
            backgroundColor: 'rgba(96, 165, 250, 0.75)',
            borderColor: '#60a5fa',
            borderWidth: 1,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return ` Total: S/ ${context.parsed.y.toFixed(2)}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: '#b8c6d5' },
              grid: { color: 'rgba(246,240,231,0.08)' }
            },
            x: {
              ticks: { color: '#b8c6d5' },
              grid: { display: false }
            }
          }
        }
      });
    }

    function toggleDiaHistorial(claveFecha) {
      const el = document.getElementById(`content-${claveFecha}`);
      const arrow = document.getElementById(`arrow-${claveFecha}`);
      if (el) {
        const estaOculto = el.classList.toggle('hidden');
        if (arrow) arrow.innerText = estaOculto ? '▼' : '▲';
      }
    }

    async function abrirModalComprobante(idx) {
      const venta = listaVentasCache[idx];
      if (venta && venta.comprobante_url) {
        try {
          const url = await obtenerUrlComprobante(venta.comprobante_url);
          document.getElementById('modalImgComprobante').src = url;
          document.getElementById('modalComprobante').classList.remove('hidden');
        } catch (error) {
          alert(error.message);
        }
      }
    }

    function cerrarModalComprobante() {
      document.getElementById('modalComprobante').classList.add('hidden');
      document.getElementById('modalImgComprobante').src = '';
    }

    function exportarExcel() {
      if (!esAdmin()) return alert('Acceso denegado: Solo los administradores pueden descargar el archivo de ventas.');
      if (!listaVentasCache || !listaVentasCache.length) return alert('No hay ventas registradas para exportar.');
      const desde = document.getElementById('fechaReporteDesde').value;
      const hasta = document.getElementById('fechaReporteHasta').value;
      const ventasParaExportar = listaVentasCache.filter(v => {
        const f = new Date(v.fecha);
        const fecha = f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
        return (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
      });
      if (!ventasParaExportar.length) return alert('No hay ventas en el período seleccionado.');
      if (typeof XLSX === 'undefined') return alert('Error: La librería de Excel aún se está cargando. Por favor reintenta en un momento.');

      const datosExcel = [
        ["ID", "Fecha y Hora", "Productos Vendidos", "Venta Total (S/)", "Margen de Contribución (S/)", "Vendedor", "Canal / Pago", "Notas / Observaciones", "Tiene Comprobante"]
      ];

      ventasParaExportar.forEach(v => {
        let ganNeta = 0;
        if (v.ganancia_neta !== undefined && v.ganancia_neta !== null) {
          ganNeta = parseFloat(v.ganancia_neta);
        } else if (Array.isArray(v.detalles) && v.detalles.length > 0) {
          let costoTotalDetalles = 0;
          v.detalles.forEach(item => {
            let cUnit = parseFloat(item.costo_unitario || 0);
            if (cUnit === 0 && item.producto_id) {
              const prod = listaProductos.find(p => p.id === item.producto_id);
              if (prod) cUnit = parseFloat(prod.precio || 0);
            }
            costoTotalDetalles += cUnit * (parseInt(item.cantidad) || 1);
          });
          ganNeta = parseFloat(v.monto_total || 0) - costoTotalDetalles;
        } else {
          ganNeta = parseFloat(v.monto_total || 0);
        }

        datosExcel.push([
          v.id || '',
          new Date(v.fecha).toLocaleString(),
          v.producto_nombre || '',
          parseFloat(v.monto_total || 0),
          ganNeta,
          v.vendedor_email || '',
          v.ubicacion_venta || '',
          v.notas || '',
          v.comprobante_url ? 'SÍ' : 'NO'
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(datosExcel);
      const colWidths = datosExcel[0].map((col, colIdx) => {
        let maxLen = col.toString().length;
        datosExcel.forEach(row => {
          const val = row[colIdx] ? row[colIdx].toString() : '';
          if (val.length > maxLen) maxLen = val.length;
        });
        return { wch: Math.min(Math.max(maxLen + 3, 10), 60) };
      });
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ventas");

      const fechaHoy = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Reporte_Ventas_ALPHA_${fechaHoy}.xlsx`);
    }

    async function cargarEstadoAsistencia() {
      if (!usuarioActual) return;

      const { data } = await client.from('asistencia')
        .select('*')
        .eq('vendedor_email', usuarioActual.email)
        .is('fecha_salida', null)
        .order('fecha_ingreso', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        registroAsistenciaActivo = data[0];
        document.getElementById('txtEstadoJornada').innerText = `🟢 En jornada laboral desde: ${new Date(registroAsistenciaActivo.fecha_ingreso).toLocaleTimeString()}`;
        document.getElementById('btnMarcarIngreso').classList.add('hidden');
        document.getElementById('btnMarcarSalida').classList.remove('hidden');
        iniciarCronometro(new Date(registroAsistenciaActivo.fecha_ingreso));
      } else {
        registroAsistenciaActivo = null;
        if (intervalTimer) clearInterval(intervalTimer);
        document.getElementById('txtEstadoJornada').innerText = '🔴 Fuera de turno de trabajo';
        document.getElementById('timerDisplay').innerText = '00:00:00';
        document.getElementById('btnMarcarIngreso').classList.remove('hidden');
        document.getElementById('btnMarcarSalida').classList.add('hidden');
      }

      cargarHistorialAsistencia();
    }

    function iniciarCronometro(fechaIngreso) {
      if (intervalTimer) clearInterval(intervalTimer);
      
      function actualizar() {
        const ahora = new Date();
        const diffMs = ahora - fechaIngreso;
        const totalSegs = Math.floor(diffMs / 1000);
        
        const hrs = String(Math.floor(totalSegs / 3600)).padStart(2, '0');
        const mins = String(Math.floor((totalSegs % 3600) / 60)).padStart(2, '0');
        const segs = String(totalSegs % 60).padStart(2, '0');
        
        document.getElementById('timerDisplay').innerText = `${hrs}:${mins}:${segs}`;
      }

      actualizar();
      intervalTimer = setInterval(actualizar, 1000);
    }

    async function marcarIngresoTrabajo() {
      const confirmar = confirm(`¿Confirmas que estás INICIANDO tu jornada laboral como ${usuarioActual.email}?`);
      if (!confirmar) return;

      const nuevoRegistro = {
        vendedor_email: usuarioActual.email,
        fecha_ingreso: new Date().toISOString()
      };

      const { error } = await client.from('asistencia').insert([nuevoRegistro]);
      if (error) alert('Error al marcar ingreso: ' + error.message);
      else {
        alert('¡Jornada de trabajo iniciada con éxito!');
        cargarEstadoAsistencia();
      }
    }

    async function marcarSalidaTrabajo() {
      if (!registroAsistenciaActivo) return;

      const fechaIngreso = new Date(registroAsistenciaActivo.fecha_ingreso);
      const fechaSalida = new Date();
      const horasTrabajadas = ((fechaSalida - fechaIngreso) / (1000 * 60 * 60)).toFixed(2);

      const confirmar = confirm(`¿Confirmas que deseas MARCAR TU SALIDA?\n\nTiempo total aproximado: ${horasTrabajadas} horas.`);
      if (!confirmar) return;

      const { error } = await client.from('asistencia').update({
        fecha_salida: fechaSalida.toISOString(),
        horas_trabajadas: parseFloat(horasTrabajadas)
      }).eq('id', registroAsistenciaActivo.id);

      if (error) alert('Error al marcar salida: ' + error.message);
      else {
        alert(`¡Salida registrada! Trabajaste un total de ${horasTrabajadas} horas.`);
        if (intervalTimer) clearInterval(intervalTimer);
        cargarEstadoAsistencia();
      }
    }

    async function cargarHistorialAsistencia() {
      let query = client.from('asistencia').select('*').order('fecha_ingreso', { ascending: false }).limit(20);

      if (!esAdmin()) {
        query = query.eq('vendedor_email', usuarioActual.email);
      }

      const { data: registros } = await query;
      listaAsistenciaCache = registros || [];

      const cont = document.getElementById('listaAsistencia');
      if (!registros || !registros.length) {
        cont.innerHTML = '<p class="empty-msg">No hay registros de asistencia recientes.</p>';
        return;
      }

      cont.innerHTML = registros.map(r => {
        const ingreso = new Date(r.fecha_ingreso).toLocaleString();
        const salida = r.fecha_salida ? new Date(r.fecha_salida).toLocaleString() : 'En curso...';
        const horas = r.horas_trabajadas ? `${r.horas_trabajadas} hrs` : '--';

        return `
          <div class="stock-item">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
              <div>
                <strong>👤 ${r.vendedor_email}</strong><br>
                <span style="font-size:0.78rem; color:var(--muted);">Entrada: ${ingreso} | Salida: ${salida}</span>
              </div>
              <div style="text-align:right;">
                <span class="badge ${r.fecha_salida ? 'badge-ok' : 'badge-low'}">${horas}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function exportarAsistenciaExcel() {
      if (!esAdmin()) return alert('Acceso denegado: Solo los administradores pueden exportar asistencia.');
      if (!listaAsistenciaCache || !listaAsistenciaCache.length) return alert('No hay registros de asistencia para exportar.');
      if (typeof XLSX === 'undefined') return alert('Error: La librería de Excel aún se está cargando. Por favor reintenta en un momento.');

      const datosExcel = [
        ["ID", "Vendedor / Trabajador", "Fecha de Ingreso", "Fecha de Salida", "Horas Trabajadas"]
      ];

      listaAsistenciaCache.forEach(r => {
        datosExcel.push([
          r.id || '',
          r.vendedor_email || '',
          r.fecha_ingreso ? new Date(r.fecha_ingreso).toLocaleString() : '',
          r.fecha_salida ? new Date(r.fecha_salida).toLocaleString() : 'En curso',
          r.horas_trabajadas || 0
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(datosExcel);
      const colWidths = datosExcel[0].map((col, colIdx) => {
        let maxLen = col.toString().length;
        datosExcel.forEach(row => {
          const val = row[colIdx] ? row[colIdx].toString() : '';
          if (val.length > maxLen) maxLen = val.length;
        });
        return { wch: Math.min(Math.max(maxLen + 3, 12), 40) };
      });
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Asistencia");

      const fechaHoy = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Reporte_Asistencia_ALPHA_${fechaHoy}.xlsx`);
    }
