/** Búsqueda en vivo contra la Store API (isla chica, sin backend propio). Misma tarjeta que el resto del sitio (ver tarjetas.ts). */
import { encabezadoNonce } from '../lib/tienda/sesion-navegador';
import { tarjetaHtml, iniciarTarjetasInteractivas } from './tarjetas';
import { pesoEnKg, precioPorKg } from '../lib/tienda/precio-por-kg';
import type { ProductoListado } from '../lib/tienda/tipos';

interface ProductoBusqueda {
  id: number;
  name: string;
  permalink: string;
  type: string;
  on_sale: boolean;
  has_options: boolean;
  prices: { price: string; regular_price: string; price_range: { min_amount: string } | null; currency_minor_unit: number; currency_prefix: string; currency_suffix: string };
  images: { src: string; alt: string }[];
  brands: { name: string; slug: string }[];
  attributes: { taxonomy: string; name: string; terms: { name: string; slug: string }[] }[];
  variations: { id: number; attributes: { name: string; value: string }[] }[];
}

/** Adapta el producto completo de la Store API a la misma forma que usa el resto del sitio (tarjetas.ts), sin pedir nada aparte. */
function aProductoListado(p: ProductoBusqueda): ProductoListado {
  const marca = p.brands[0] ?? null;
  const atributoPeso = p.attributes.find((a) => a.taxonomy === 'pa_peso');
  const precio = Number(p.prices.price_range ? p.prices.price_range.min_amount : p.prices.price);
  const regular = Number(p.prices.regular_price || p.prices.price);
  const precioRegular = p.on_sale && regular > precio ? regular : null;
  const unSoloPeso = atributoPeso?.terms.length === 1 ? atributoPeso.terms[0] : null;
  const kg = unSoloPeso ? pesoEnKg(unSoloPeso.name) : null;

  const variantes =
    p.type === 'variable' && atributoPeso
      ? p.variations
          .map((v) => {
            const nombrePeso = v.attributes.find((a) => a.name.toLowerCase() === atributoPeso.name.toLowerCase())?.value;
            const termino = nombrePeso ? atributoPeso.terms.find((t) => t.name === nombrePeso) : null;
            return termino ? { id: v.id, pesoSlug: termino.slug, pesoNombre: termino.name } : null;
          })
          .filter((v): v is NonNullable<typeof v> => v !== null)
      : [];

  return {
    id: p.id,
    nombre: p.name,
    ruta: new URL(p.permalink).pathname,
    imagen: p.images[0]?.src ?? null,
    imagenAlt: p.images[0]?.alt || p.name,
    marcaNombre: marca?.name ?? null,
    marcaSlug: marca?.slug ?? null,
    categorias: [],
    precio,
    precioRegular,
    enOferta: p.on_sale,
    pesoKg: kg,
    precioPorKg: precioPorKg(precio, kg),
    etapas: [],
    tamanos: [],
    pesos: [],
    tieneOpciones: p.has_options,
    variantes,
    masVendidosRank: 0,
    creado: 0,
  };
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
        headers: { Accept: 'application/json', ...encabezadoNonce() },
      });
      const productos = (await respuesta.json()) as ProductoBusqueda[];
      const moneda = productos[0]
        ? { decimales: productos[0].prices.currency_minor_unit, prefijo: productos[0].prices.currency_prefix, sufijo: productos[0].prices.currency_suffix }
        : { decimales: 2, prefijo: '$ ', sufijo: '' };
      listaEl.innerHTML = productos.map((p) => tarjetaHtml(aProductoListado(p), moneda)).join('');
      iniciarTarjetasInteractivas(moneda);
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
