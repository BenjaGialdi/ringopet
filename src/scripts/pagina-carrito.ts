/** Página /carrito/: carrito completo (no el panel lateral, que sigue sirviendo para agregar rápido desde cualquier página). */
import { obtenerCarrito, actualizarCantidad, quitarDelCarrito, aplicarCupon, quitarCupon } from '../lib/tienda/carrito';
import { formatearPrecio } from '../lib/moneda';
import { ErrorApi } from '../lib/tienda/api-navegador';
import type { Carrito } from '../lib/tienda/tipos';

function actualizarContadores(carrito: Carrito) {
  document.querySelectorAll<HTMLElement>('[data-contador-carrito]').forEach((el) => {
    el.textContent = String(carrito.items_count);
    el.hidden = carrito.items_count === 0;
  });
}

export function iniciarPaginaCarrito() {
  const vacio = document.querySelector<HTMLElement>('[data-carrito-vacio]');
  const contenido = document.querySelector<HTMLElement>('[data-carrito-contenido]');
  const lista = document.querySelector<HTMLElement>('[data-carrito-items]');
  const erroresEl = document.querySelector<HTMLElement>('[data-carrito-errores]');
  const cuponesEl = document.querySelector<HTMLElement>('[data-carrito-cupones]');
  const subtotalEl = document.querySelector<HTMLElement>('[data-carrito-subtotal]');
  const filaDescuento = document.querySelector<HTMLElement>('[data-fila-descuento]');
  const descuentoEl = document.querySelector<HTMLElement>('[data-carrito-descuento]');
  const totalEl = document.querySelector<HTMLElement>('[data-carrito-total]');
  const botonFinalizar = document.querySelector<HTMLAnchorElement>('[data-boton-finalizar]');
  const formCupon = document.querySelector<HTMLFormElement>('[data-form-cupon]');
  if (!vacio || !contenido || !lista) return;

  function pintar(carrito: Carrito) {
    actualizarContadores(carrito);
    const hayItems = carrito.items.length > 0;
    vacio!.hidden = hayItems;
    contenido!.hidden = !hayItems;
    if (!hayItems) return;

    lista!.innerHTML = carrito.items
      .map((item) => {
        const imagen = item.images[0];
        const variacion = item.variation.map((v) => `${v.attribute}: ${v.value}`).join(' · ');
        return `
          <li class="flex gap-4 py-5" data-item="${item.key}">
            <a href="${item.permalink}" class="shrink-0">
              <img src="${imagen?.thumbnail ?? imagen?.src ?? ''}" alt="" width="90" height="90" class="h-20 w-20 rounded-lg border border-borde object-contain p-1 sm:h-24 sm:w-24" loading="lazy" />
            </a>
            <div class="min-w-0 flex-1">
              <a href="${item.permalink}" class="font-medium hover:text-primario-oscuro">${item.name}</a>
              ${variacion ? `<p class="mt-0.5 text-sm text-texto-suave">${variacion}</p>` : ''}
              <p class="mt-1 font-semibold text-primario-oscuro">${formatearPrecio(item.prices.price, item.prices.currency_minor_unit, item.prices.currency_prefix, item.prices.currency_suffix)}</p>
              <div class="mt-2 flex items-center gap-3">
                <div class="flex items-center rounded-lg border border-borde">
                  <button type="button" class="flex h-9 w-9 items-center justify-center" data-restar aria-label="Restar">−</button>
                  <span class="w-8 text-center" data-cantidad>${item.quantity}</span>
                  <button type="button" class="flex h-9 w-9 items-center justify-center" data-sumar aria-label="Sumar">+</button>
                </div>
                <button type="button" class="text-sm text-texto-suave underline" data-quitar>Quitar</button>
              </div>
            </div>
            <p class="whitespace-nowrap font-semibold" data-item-total>${formatearPrecio(item.totals.line_total, item.totals.currency_minor_unit, item.totals.currency_prefix, item.totals.currency_suffix)}</p>
          </li>`;
      })
      .join('');

    lista!.querySelectorAll<HTMLElement>('[data-item]').forEach((fila) => {
      const key = fila.dataset.item!;
      fila.querySelector('[data-sumar]')?.addEventListener('click', async () => {
        const cantidad = Number(fila.querySelector('[data-cantidad]')!.textContent) + 1;
        pintar(await actualizarCantidad(key, cantidad));
      });
      fila.querySelector('[data-restar]')?.addEventListener('click', async () => {
        const cantidad = Number(fila.querySelector('[data-cantidad]')!.textContent) - 1;
        pintar(cantidad > 0 ? await actualizarCantidad(key, cantidad) : await quitarDelCarrito(key));
      });
      fila.querySelector('[data-quitar]')?.addEventListener('click', async () => {
        pintar(await quitarDelCarrito(key));
      });
    });

    if (erroresEl) {
      erroresEl.innerHTML = carrito.errors
        .map((e) => `<p class="rounded-lg bg-fondo-suave p-3 text-sm text-texto" role="alert">${e.message}</p>`)
        .join('');
    }

    if (cuponesEl) {
      cuponesEl.innerHTML = carrito.coupons
        .map(
          (c) =>
            `<li class="flex items-center justify-between"><span>Cupón <strong>${c.code}</strong></span><button type="button" class="text-texto-suave underline" data-quitar-cupon="${c.code}">Quitar</button></li>`,
        )
        .join('');
      cuponesEl.querySelectorAll<HTMLButtonElement>('[data-quitar-cupon]').forEach((btn) => {
        btn.addEventListener('click', async () => pintar(await quitarCupon(btn.dataset.quitarCupon!)));
      });
    }

    if (subtotalEl) subtotalEl.textContent = formatearPrecio(carrito.totals.total_items, carrito.totals.currency_minor_unit, carrito.totals.currency_prefix, carrito.totals.currency_suffix);
    const hayDescuento = Number(carrito.totals.total_discount) > 0;
    if (filaDescuento) filaDescuento.hidden = !hayDescuento;
    if (descuentoEl && hayDescuento) descuentoEl.textContent = `-${formatearPrecio(carrito.totals.total_discount, carrito.totals.currency_minor_unit, carrito.totals.currency_prefix, carrito.totals.currency_suffix)}`;
    if (totalEl) totalEl.textContent = formatearPrecio(carrito.totals.total_price, carrito.totals.currency_minor_unit, carrito.totals.currency_prefix, carrito.totals.currency_suffix);

    const bloqueado = carrito.errors.length > 0;
    if (botonFinalizar) {
      botonFinalizar.classList.toggle('pointer-events-none', bloqueado);
      botonFinalizar.classList.toggle('opacity-50', bloqueado);
      botonFinalizar.setAttribute('aria-disabled', String(bloqueado));
    }
  }

  formCupon?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = formCupon.querySelector<HTMLInputElement>('input[type="text"]');
    if (!input || !input.value.trim()) return;
    const boton = formCupon.querySelector<HTMLButtonElement>('button[type="submit"]');
    boton?.setAttribute('disabled', 'true');
    try {
      pintar(await aplicarCupon(input.value.trim()));
      input.value = '';
    } catch (error) {
      if (erroresEl) erroresEl.innerHTML = `<p class="rounded-lg bg-fondo-suave p-3 text-sm text-texto" role="alert">${error instanceof ErrorApi ? error.message : 'No se pudo aplicar el cupón.'}</p>`;
    } finally {
      boton?.removeAttribute('disabled');
    }
  });

  obtenerCarrito()
    .then(pintar)
    .catch(() => {
      vacio.textContent = 'No pudimos cargar el carrito. Probá de nuevo en un momento.';
      vacio.hidden = false;
    });
}
