/**
 * Tarjeta de producto compartida por todo el sitio (listado, portada, relacionados y
 * búsqueda): esto arma el HTML de una tarjeta desde datos ya livianos (no la Store API
 * completa) y maneja el selector de peso, que revalida precio/stock en vivo igual que la
 * página de producto (producto-variantes.ts) — mismo criterio, pero para muchas tarjetas
 * a la vez en un listado, con un solo listener delegado en vez de uno por tarjeta.
 */
import { encabezadoNonce } from '../lib/tienda/sesion-navegador';
import { pesoEnKg, precioPorKg } from '../lib/tienda/precio-por-kg';
import type { ProductoListado } from '../lib/tienda/tipos';

export interface MonedaTarjeta {
  decimales: number;
  prefijo: string;
  sufijo: string;
}

function formatearMonto(centavos: number, moneda: MonedaTarjeta): string {
  const numero = (centavos / 10 ** moneda.decimales).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${moneda.prefijo}${numero}${moneda.sufijo}`;
}

/** HTML de una tarjeta. `p.pesos`/`p.variantes` ya vienen resueltos desde datos.json.ts (nunca inventados acá). */
export function tarjetaHtml(p: ProductoListado, moneda: MonedaTarjeta): string {
  const selectorPeso =
    p.tieneOpciones && p.variantes.length > 0
      ? `<div class="relative z-10 mt-1 flex flex-wrap gap-1" data-selector-peso>
          ${p.variantes
            .map(
              (v, i) => `
              <button type="button" class="rounded border px-1.5 py-0.5 text-xs ${i === 0 ? 'border-primario text-primario-oscuro' : 'border-borde text-texto-suave'}"
                data-variante-listado data-id="${v.id}" data-peso-slug="${v.pesoSlug}" aria-pressed="${i === 0}">${v.pesoNombre}</button>`,
            )
            .join('')}
        </div>`
      : '';

  const idInicial = p.variantes[0]?.id ?? p.id;
  // Variable pero sin variar por peso (ej. sabor, color): no hay selector acá, se elige en la ficha del producto.
  const botonAgregar =
    p.tieneOpciones && p.variantes.length === 0
      ? `<a href="${p.ruta}" class="boton-borde block w-full py-2 text-center text-sm">Elegir opciones</a>`
      : `<button type="button" data-agregar-carrito data-id="${idInicial}" class="boton w-full py-2 text-sm">Añadir al carrito</button>`;

  return `
    <article class="group relative flex flex-col overflow-hidden rounded-xl border border-borde bg-fondo transition-shadow hover:shadow-lg" data-tarjeta data-producto-id="${p.id}">
      ${p.enOferta ? '<span class="absolute left-3 top-3 z-10 rounded bg-primario-oscuro px-2 py-1 text-xs font-bold text-sobre-primario">Oferta</span>' : ''}
      <a href="${p.ruta}" aria-label="${p.nombre}" class="block overflow-hidden bg-fondo-suave">
        ${
          p.imagen
            ? `<img src="${p.imagen}" alt="${p.imagenAlt}" width="300" height="300" loading="lazy" decoding="async" class="aspect-square w-full object-contain p-3 transition-transform duration-300 group-hover:scale-105" />`
            : '<div class="aspect-square w-full"></div>'
        }
      </a>
      <div class="flex flex-1 flex-col gap-1 p-3">
        <h3 class="line-clamp-2 text-sm font-medium">
          <a href="${p.ruta}" class="after:absolute after:inset-0">${p.nombre}</a>
        </h3>
        ${p.marcaNombre ? `<p class="text-xs text-texto-suave">${p.marcaNombre}</p>` : ''}
        <p class="mt-auto pt-1" data-precio-wrap>
          ${p.precioRegular ? `<span class="mr-1.5 text-xs text-texto-suave line-through">${formatearMonto(p.precioRegular, moneda)}</span>` : ''}
          <span class="font-semibold text-primario-oscuro" data-precio>${formatearMonto(p.precio, moneda)}</span>
        </p>
        <p class="text-xs text-texto-suave" data-precio-kg ${p.precioPorKg ? '' : 'hidden'}>${p.precioPorKg ? `${formatearMonto(p.precioPorKg, moneda)}/kg` : ''}</p>
        ${selectorPeso}
        <div class="relative z-10 mt-2">${botonAgregar}</div>
      </div>
    </article>`;
}

async function actualizarTarjeta(tarjeta: HTMLElement, variacionId: string, pesoSlug: string, moneda: MonedaTarjeta) {
  const precioEl = tarjeta.querySelector<HTMLElement>('[data-precio]');
  const precioKgEl = tarjeta.querySelector<HTMLElement>('[data-precio-kg]');
  const botonAgregar = tarjeta.querySelector<HTMLButtonElement>('[data-agregar-carrito]');
  botonAgregar?.setAttribute('data-id', variacionId);

  try {
    const respuesta = await fetch(`/wp-json/wc/store/v1/products/${variacionId}`, { headers: { Accept: 'application/json', ...encabezadoNonce() } });
    if (!respuesta.ok) return;
    const producto = await respuesta.json();
    const centavos = Number(producto.prices.price);

    if (precioEl) precioEl.textContent = formatearMonto(centavos, moneda);

    if (precioKgEl) {
      const nombrePeso = tarjeta.querySelector(`[data-peso-slug="${pesoSlug}"]`)?.textContent ?? '';
      const kg = pesoEnKg(nombrePeso);
      const porKg = precioPorKg(centavos, kg);
      precioKgEl.hidden = !porKg;
      precioKgEl.textContent = porKg ? `${formatearMonto(porKg, moneda)}/kg` : '';
    }

    if (botonAgregar) {
      botonAgregar.toggleAttribute('disabled', !producto.is_in_stock);
      botonAgregar.textContent = producto.is_in_stock ? 'Añadir al carrito' : 'Sin stock';
    }
  } catch {
    // Sin WooCommerce en este origen (ej. dev local): se mantiene el precio del build.
  }
}

let iniciado = false;

/** Un solo listener delegado para toda la página: cubre tarjetas ya en el HTML y las que se agreguen después (filtros, "mostrar más"). */
export function iniciarTarjetasInteractivas(moneda: MonedaTarjeta) {
  if (iniciado) return;
  iniciado = true;

  document.addEventListener('click', (e) => {
    const boton = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-variante-listado]');
    if (!boton) return;
    const tarjeta = boton.closest<HTMLElement>('[data-tarjeta]');
    if (!tarjeta) return;

    tarjeta.querySelectorAll('[data-variante-listado]').forEach((b) => {
      b.classList.toggle('border-primario', b === boton);
      b.classList.toggle('text-primario-oscuro', b === boton);
      b.classList.toggle('border-borde', b !== boton);
      b.classList.toggle('text-texto-suave', b !== boton);
      b.setAttribute('aria-pressed', String(b === boton));
    });

    actualizarTarjeta(tarjeta, boton.dataset.id!, boton.dataset.pesoSlug!, moneda);
  });
}
