/** Búsqueda en vivo contra la Store API (isla chica, sin backend propio). */

interface ProductoBusqueda {
  id: number;
  name: string;
  permalink: string;
  prices: { price: string; price_range: { min_amount: string } | null; currency_minor_unit: number; currency_prefix: string; currency_suffix: string };
  images: { src: string; alt: string }[];
  has_options: boolean;
}

function tarjeta(p: ProductoBusqueda): string {
  const ruta = new URL(p.permalink).pathname;
  const unidad = 10 ** p.prices.currency_minor_unit;
  const centavos = p.prices.price_range ? p.prices.price_range.min_amount : p.prices.price;
  const precio = (Number(centavos) / unidad).toLocaleString('es-AR', { minimumFractionDigits: 2 });
  const imagen = p.images[0];
  return `
    <a href="${ruta}" class="group flex flex-col overflow-hidden rounded-xl border border-borde transition-shadow hover:shadow-lg">
      <div class="aspect-square overflow-hidden bg-fondo-suave">
        ${imagen ? `<img src="${imagen.src}" alt="${imagen.alt ?? ''}" loading="lazy" class="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-105" />` : ''}
      </div>
      <div class="p-3">
        <p class="line-clamp-2 text-sm font-medium">${p.name}</p>
        <p class="mt-1 font-semibold text-primario-oscuro">${p.prices.currency_prefix}${precio}${p.prices.currency_suffix}</p>
      </div>
    </a>`;
}

export function iniciarBusqueda() {
  const form = document.querySelector<HTMLFormElement>('[data-form-busqueda]');
  const input = document.querySelector<HTMLInputElement>('[data-input-busqueda]');
  const resultados = document.querySelector<HTMLElement>('[data-resultados]');
  const estado = document.querySelector<HTMLElement>('[data-estado-busqueda]');
  if (!form || !input || !resultados || !estado) return;
  const listaEl = resultados;
  const estadoEl = estado;

  let controlador: AbortController | null = null;

  async function buscar(termino: string) {
    const url = new URL(location.href);
    if (termino) url.searchParams.set('q', termino);
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);

    if (!termino) {
      listaEl.innerHTML = '';
      estadoEl.textContent = 'Escribí para buscar productos.';
      return;
    }

    controlador?.abort();
    controlador = new AbortController();
    estadoEl.textContent = 'Buscando...';

    try {
      const respuesta = await fetch(`/wp-json/wc/store/v1/products?search=${encodeURIComponent(termino)}&per_page=24`, {
        signal: controlador.signal,
        headers: { Accept: 'application/json' },
      });
      const productos = (await respuesta.json()) as ProductoBusqueda[];
      listaEl.innerHTML = productos.map(tarjeta).join('');
      estadoEl.textContent = productos.length ? `${productos.length} resultados` : 'No encontramos productos con ese nombre.';
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      estadoEl.textContent = 'No se pudo conectar con la tienda.';
    }
  }

  let temporizador: ReturnType<typeof setTimeout>;
  input.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => buscar(input.value.trim()), 300);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    buscar(input.value.trim());
  });

  const inicial = new URLSearchParams(location.search).get('q') ?? '';
  if (inicial) {
    input.value = inicial;
    buscar(inicial);
  } else {
    estado.textContent = 'Escribí para buscar productos.';
  }
}
