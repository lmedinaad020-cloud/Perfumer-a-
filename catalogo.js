(() => {
  const IMG_DEFAULT = 'https://static.vecteezy.com/system/resources/thumbnails/067/553/667/small/minimalist-graphic-illustration-of-a-bottle-useful-for-beauty-wellness-or-container-themes-simplicity-and-clean-design-enhance-visual-impact-vector.jpg';
  const grid = document.getElementById('catalog-grid');
  const count = document.getElementById('product-count');
  const search = document.getElementById('catalog-search');
  const status = document.getElementById('catalog-status');
  let products = [];
  let currentAudio = null;
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

  function playProductAudio(product) {
    if (!product.audio_url) {
      status.textContent = `El perfume ${product.nombre} todavía no tiene audio.`;
      return;
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    currentAudio = new Audio(product.audio_url);
    currentAudio.play().then(() => {
      status.textContent = `Reproduciendo audio de ${product.nombre}.`;
    }).catch(error => {
      status.textContent = `No se pudo reproducir el audio de ${product.nombre}.`;
      console.error('Error al reproducir audio del catálogo:', error);
    });
  }

  function makeAudioButton(product, content, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', `Reproducir audio de ${product.nombre}`);
    button.title = product.audio_url ? 'Reproducir audio y mostrar precios de decant' : 'Mostrar precios de decant';
    button.append(content);
    button.addEventListener('click', () => {
      playProductAudio(product);
      const details = button.closest('.product-card').querySelector('.decant-prices');
      details.hidden = !details.hidden;
      button.closest('.product-card').querySelectorAll('.product-image-trigger,.product-name-trigger')
        .forEach(trigger => trigger.setAttribute('aria-expanded', String(!details.hidden)));
    });
    return button;
  }

  function getDecantPrices(name) {
    const normalized = norm(name).toUpperCase();
    if (normalized.includes('AL HARAMAIN') || normalized.includes('GOLD EDITION')) return [25, 45, 65, 195];
    if (normalized.includes('VALENTINO INTENSE') || normalized.includes('VALENTINO INTENSE')) return [30, 45, 80, 240];
    if (normalized.includes('LIQUID BRUN') || normalized.includes('LIQUID BRUM') || normalized.includes('NIGHT OUT')) return [20, 30, 40, 120];
    return [15, 25, 35, 90];
  }

  function deduplicateProducts(items) {
    const unique = new Map();
    const score = product => (product.tipo === 'Perfume para Decant' ? 4 : 0)
      + (Number(product.precio_venta) > 0 ? 2 : 0)
      + (product.audio_url ? 1 : 0);
    items.forEach(product => {
      const key = norm(product.nombre).replace(/\s+/g, ' ').trim();
      const current = unique.get(key);
      if (!current || score(product) > score(current)) unique.set(key, product);
    });
    return [...unique.values()];
  }

  function renderProducts() {
    const query = norm(search.value.trim());
    const visible = products.filter(product => norm(`${product.nombre} ${product.tipo || ''} ${product.tamano || ''}`).includes(query));
    count.textContent = `${visible.length} ${visible.length === 1 ? 'perfume' : 'perfumes'}`;
    grid.replaceChildren();
    if (!visible.length) {
      const message = document.createElement('p');
      message.className = 'message';
      message.textContent = products.length ? 'No encontramos perfumes con esa búsqueda.' : 'Todavía no hay perfumes disponibles en el catálogo.';
      grid.append(message);
      return;
    }

    visible.forEach(product => {
      const card = document.createElement('article');
      card.className = 'product-card';
      const image = document.createElement('img');
      image.className = 'product-image';
      image.src = product.imagen_url || IMG_DEFAULT;
      image.alt = product.nombre || 'Perfume';
      image.loading = 'lazy';
      image.addEventListener('error', () => { image.src = IMG_DEFAULT; }, { once: true });
      const imageButton = makeAudioButton(product, image, 'product-image-trigger');
      imageButton.setAttribute('aria-expanded', 'false');
      card.append(imageButton);

      const info = document.createElement('div');
      info.className = 'product-info';
      const name = document.createElement('h3');
      name.className = 'product-name';
      const nameButton = makeAudioButton(product, document.createTextNode(product.nombre || 'Perfume'), 'product-name-trigger');
      nameButton.setAttribute('aria-expanded', 'false');
      name.append(nameButton);
      const price = document.createElement('p');
      price.className = 'product-price';
      const values = getDecantPrices(product.nombre);
      const salePrice = Number(product.precio_venta || 0);
      price.textContent = salePrice > 0
        ? `Precio de venta: S/ ${salePrice.toFixed(2)}`
        : `Decants desde S/ ${values[0].toFixed(2)} (3 ml)`;
      if (product.agotado) {
        const badge = document.createElement('span');
        badge.className = 'product-status-out';
        badge.textContent = 'Agotado';
        info.append(name, price, badge);
      }
      const decantPrices = document.createElement('div');
      decantPrices.className = 'decant-prices';
      decantPrices.hidden = true;
      const decantHeading = document.createElement('p');
      decantHeading.className = 'decant-prices-heading';
      decantHeading.textContent = 'Precios de decant';
      ['3ml', '5ml', '10ml', '30ml'].forEach((size, index) => {
        const row = document.createElement('p');
        row.className = 'decant-price-row';
        row.textContent = `${size}: S/ ${values[index].toFixed(2)}`;
        decantPrices.append(row);
      });
      decantPrices.prepend(decantHeading);
      if (!product.agotado) info.append(name, price);
      info.append(decantPrices);
      card.append(info);
      grid.append(card);
    });
  }

  async function loadCatalog() {
    try {
      const { data, error } = await window.supabaseClient.from('catalogo_publico')
        .select('id,nombre,tipo,tamano,precio_venta,imagen_url,audio_url,agotado')
        .order('nombre', { ascending: true });
      if (error) throw error;
      products = deduplicateProducts(data || []);
      renderProducts();
    } catch (error) {
      count.textContent = 'No disponible';
      grid.replaceChildren();
      const message = document.createElement('p');
      message.className = 'message';
      message.textContent = 'No se pudo cargar el catálogo. Ejecuta la configuración SQL del catálogo y revisa tu conexión.';
      grid.append(message);
      console.error('Error al cargar el catálogo:', error);
    }
  }

  search.addEventListener('input', renderProducts);
  loadCatalog();
  // Detecta nuevos productos o cambios de stock mientras el catálogo sigue abierto.
  window.setInterval(() => { if (!document.hidden) loadCatalog(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadCatalog(); });
})();
