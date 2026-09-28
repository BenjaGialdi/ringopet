/** Página /carrito/: carrito completo (no el panel lateral, que sigue sirviendo para agregar rápido desde cualquier página). */
import { obtenerCarrito, actualizarCantidad, quitarDelCarrito, aplicarCupon, quitarCupon, agregarAlCarrito } from '../lib/tienda/carrito';
import { cancelarPedido } from '../lib/tienda/checkout';
import { leerCarritoCache } from '../lib/tienda/cache-navegador';
import { formatearPrecio } from '../lib/moneda';
import { ErrorApi } from '../lib/tienda/api-navegador';
import type { Carrito } from '../lib/tienda/tipos';

/**
 * Vuelta desde Mercado Pago sin pagar (cancelado o rechazado): MP redirige a
 * /carrito/?cancel_order=true&order=<clave>&order_id=<id>&... — WooCommerce arma esa misma
 * URL de "cancelar pedido" (get_cancel_order_url()) tanto si el cliente cancela a mano como
 * si el pago es rechazado, así que /carrito/ (que es de Astro: WooCommerce nunca procesa
 * ese cancel_order del lado del servidor) es quien tiene que cancelar el pedido pendiente y
 * reponer el carrito. Mercado Pago agrega sus propios parámetros de estado a la misma
 * vuelta (collection_status/status): si marcan un rechazo, el aviso es otro.
 */
async function manejarVueltaDeMercadoPago(avisoEl: HTMLElement | null, pintar: (c: Carrito) => void) {
  const parametros = new URLSearchParams(location.search);
  if (parametros.get('cancel_order') !== 'true') return;

  const pedidoId = Number(parametros.get('order_id'));
  const clave = parametros.get('order');
  if (!pedidoId || !clave) return;

  const estadoMp = (parametros.get('collection_status') || parametros.get('status') || '').toLowerCase();
  const rechazado = estadoMp === 'rejected';

  history.replaceState(null, '', location.pathname);

  try {
    const resultado = await cancelarPedido(pedidoId, clave);

    if (!resultado.cancelado) {
      // Ya estaba pagado (u otro estado que no se cancela): no hay nada que reponer al
      // carrito, el detalle real del pedido está en /pedido-recibido/.
      location.href = `/pedido-recibido/?pedido=${pedidoId}&key=${encodeURIComponent(clave)}`;
      return;
    }

    for (const producto of resultado.productos ?? []) {
      try {
        await agregarAlCarrito(producto.variation_id || producto.product_id, producto.cantidad);
      } catch {
        // Sin stock o algún otro problema puntual con ese producto: se sigue con el resto.
      }
    }

    if (avisoEl) {
      avisoEl.hidden = false;
      avisoEl.textContent = rechazado ? 'El pago fue rechazado, podés intentar de nuevo.' : 'Cancelaste el pago. Tus productos siguen en el carrito.';
    }
    pintar(await obtenerCarrito());
  } catch {
    if (avisoEl) {
      avisoEl.hidden = false;
      avisoEl.textContent = 'No pudimos recuperar tu pedido cancelado. Si hace falta, agregá los productos de nuevo.';
    }
  }
}

function actualizarContadores(carrito: Carrito) {
  document.querySelectorAll<HTMLElement>('[data-contador-carrito]').forEach((el) => {
    el.textContent = String(carrito.items_count);
    el.hidden = carrito.items_count === 0;
  });
}

export function iniciarPaginaCarrito() {
  // Ojo: el panel lateral del encabezado (siempre presente) usa los mismos nombres de
  // atributo (data-carrito-items, data-carrito-subtotal, etc.). Todo se busca DENTRO de
  // [data-pagina-carrito] para no pisar ni leer del panel lateral por error.
  const raiz = document.querySelector<HTMLElement>('[data-pagina-carrito]');
  if (!raiz) return;
  const q = <T extends HTMLElement>(selector: string) => raiz.querySelector<T>(selector);

  const esqueleto = q<HTMLElement>('[data-carrito-esqueleto]');
  const vacio = q<HTMLElement>('[data-carrito-vacio]');
  const contenido = q<HTMLElement>('[data-carrito-contenido]');
  const lista = q<HTMLElement>('[data-carrito-items]');
  const erroresEl = q<HTMLElement>('[data-carrito-errores]');
  const cuponesEl = q<HTMLElement>('[data-carrito-cupones]');
  const subtotalEl = q<HTMLElement>('[data-carrito-subtotal]');
  const filaDescuento = q<HTMLElement>('[data-fila-descuento]');
  const descuentoEl = q<HTMLElement>('[data-carrito-descuento]');
  const feesEl = q<HTMLElement>('[data-carrito-fees]');
  const filaEnvio = q<HTMLElement>('[data-fila-envio]');
  const envioEl = q<HTMLElement>('[data-carrito-envio]');
  const totalEl = q<HTMLElement>('[data-carrito-total]');
  const botonFinalizar = q<HTMLAnchorElement>('[data-boton-finalizar]');
  const formCupon = q<HTMLFormElement>('[data-form-cupon]');
  const avisoMp = q<HTMLElement>('[data-aviso-mp]');
  if (!vacio || !contenido || !lista) return;

  function pintar(carrito: Carrito) {
    if (esqueleto) esqueleto.hidden = true;
    actualizarContadores(carrito);
    const hayItems = carrito.items.length > 0;
    vacio!.hidden = hayItems;
    contenido!.hidden = !hayItems;

    // Los avisos de WooCommerce (mínimo de compra, stock ajustado, etc.) se muestran
    // siempre, tenga o no items el carrito.
    if (erroresEl) {
      erroresEl.innerHTML = carrito.errors.map((e) => `<p class="rounded-lg bg-fondo-suave p-3 text-sm" role="alert">${e.message}</p>`).join('');
    }
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

    const t = carrito.totals;
    if (subtotalEl) subtotalEl.textContent = formatearPrecio(t.total_items, t.currency_minor_unit, t.currency_prefix, t.currency_suffix);

    const hayDescuento = Number(t.total_discount) > 0;
    if (filaDescuento) filaDescuento.hidden = !hayDescuento;
    if (descuentoEl && hayDescuento) descuentoEl.textContent = `-${formatearPrecio(t.total_discount, t.currency_minor_unit, t.currency_prefix, t.currency_suffix)}`;

    if (feesEl) {
      feesEl.innerHTML = carrito.fees
        .map(
          (fee) => `
            <div class="flex justify-between">
              <dt>${fee.name}</dt>
              <dd>${formatearPrecio(fee.totals.total, t.currency_minor_unit, t.currency_prefix, t.currency_suffix)}</dd>
            </div>`,
        )
        .join('');
    }

    const hayEnvio = carrito.needs_shipping && t.total_shipping !== null;
    if (filaEnvio) filaEnvio.hidden = !hayEnvio;
    if (envioEl && hayEnvio) {
      const monto = Number(t.total_shipping);
      envioEl.textContent = monto === 0 ? 'Gratis' : formatearPrecio(t.total_shipping!, t.currency_minor_unit, t.currency_prefix, t.currency_suffix);
    }

    if (totalEl) totalEl.textContent = formatearPrecio(t.total_price, t.currency_minor_unit, t.currency_prefix, t.currency_suffix);

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

  // Se pinta al instante con la última copia conocida; si no hay ninguna (primera visita),
  // se ve el esqueleto en vez de un espacio vacío hasta que responda WooCommerce.
  const cache = leerCarritoCache();
  if (cache) pintar(cache);

  obtenerCarrito()
    .then(pintar)
    .catch(() => {
      if (esqueleto) esqueleto.hidden = true;
      if (!cache) {
        vacio.textContent = 'No pudimos cargar el carrito. Probá de nuevo en un momento.';
        vacio.hidden = false;
      }
    });

  manejarVueltaDeMercadoPago(avisoMp, pintar);
}
