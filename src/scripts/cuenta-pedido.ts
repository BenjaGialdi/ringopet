/** Página /mi-cuenta/pedido/?id=: detalle de un pedido del cliente logueado (el servidor valida que sea suyo). */
import { obtenerPedidoCuenta, actualizarSesion, sesionCacheada } from '../lib/tienda/cuenta';
import { formatearPrecio } from '../lib/moneda';
import { lineaEstadoHtml } from '../lib/tienda/linea-estado';

export function iniciarPaginaDetallePedido() {
  const esqueleto = document.querySelector<HTMLElement>('[data-pedido-esqueleto]');
  const errorEl = document.querySelector<HTMLElement>('[data-pedido-error]');
  const contenido = document.querySelector<HTMLElement>('[data-pedido-contenido]');
  if (!esqueleto || !errorEl || !contenido) return;

  const id = Number(new URLSearchParams(location.search).get('id'));
  if (!id) {
    esqueleto.hidden = true;
    errorEl.hidden = false;
    return;
  }

  function pintar(pedido: Awaited<ReturnType<typeof obtenerPedidoCuenta>>) {
    const p = (m: string) => formatearPrecio(m, 2, '$ ');

    contenido!.querySelector('[data-numero]')!.textContent = `#${pedido.numero}`;
    contenido!.querySelector('[data-estado]')!.textContent = pedido.estado_label;
    contenido!.querySelector('[data-fecha]')!.textContent = pedido.fecha
      ? new Date(pedido.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    contenido!.querySelector('[data-subtotal]')!.textContent = p(pedido.subtotal);
    contenido!.querySelector('[data-total]')!.textContent = p(pedido.total);
    contenido!.querySelector('[data-metodo-pago]')!.textContent = pedido.metodo_pago_titulo;

    const lineaEl = contenido!.querySelector<HTMLElement>('[data-linea-estado]');
    if (lineaEl) lineaEl.innerHTML = lineaEstadoHtml(pedido);

    const entregaEl = contenido!.querySelector<HTMLElement>('[data-entrega]');
    if (entregaEl && pedido.entrega) {
      entregaEl.hidden = false;
      entregaEl.querySelector('[data-etiqueta-fecha]')!.textContent = pedido.entrega.etiqueta_fecha;
      entregaEl.querySelector('[data-valor-fecha]')!.textContent = pedido.entrega.fecha;
      entregaEl.querySelector('[data-etiqueta-turno]')!.textContent = pedido.entrega.etiqueta_turno;
      entregaEl.querySelector('[data-valor-turno]')!.textContent = pedido.entrega.turno;
    }

    const itemsEl = contenido!.querySelector<HTMLElement>('[data-items]');
    if (itemsEl) {
      itemsEl.innerHTML = pedido.items
        .map(
          (item) => `
            <li class="flex items-center gap-3 py-3">
              ${item.imagen ? `<img src="${item.imagen}" alt="" width="56" height="56" class="h-14 w-14 shrink-0 rounded-lg border border-borde object-contain p-1" loading="lazy" />` : ''}
              <span class="min-w-0 flex-1 truncate">${item.cantidad} × ${item.nombre}</span>
              <span class="shrink-0 font-medium">${p(item.total)}</span>
            </li>`,
        )
        .join('');
    }

    const transferenciaEl = contenido!.querySelector<HTMLElement>('[data-transferencia]');
    if (transferenciaEl && pedido.transferencia) {
      transferenciaEl.hidden = false;
      transferenciaEl.querySelector('[data-cvu]')!.textContent = pedido.transferencia.cvu;
      transferenciaEl.querySelector('[data-alias]')!.textContent = pedido.transferencia.alias;
      transferenciaEl.querySelector('[data-titular]')!.textContent = pedido.transferencia.titular;
    }

    esqueleto!.hidden = true;
    contenido!.hidden = false;
  }

  // Si ya hay un nonce guardado (visita anterior en esta pestaña), se pide el pedido al
  // toque, EN PARALELO con la confirmación de sesión — no una cosa atrás de la otra. Sin
  // nonce todavía (primera visita), hay que esperar igual a actualizarSesion() para tenerlo.
  const pedidoAdelantado = sesionCacheada()?.sesion ? obtenerPedidoCuenta(id).catch(() => null) : null;

  actualizarSesion().then(async (sesion) => {
    if (!sesion.sesion) {
      location.href = `/mi-cuenta/?volver=${encodeURIComponent(location.pathname + location.search)}`;
      return;
    }
    try {
      const pedido = (await pedidoAdelantado) ?? (await obtenerPedidoCuenta(id));
      pintar(pedido);
    } catch {
      // 404 esperado si el pedido no existe o no es del cliente logueado: el mensaje genérico alcanza.
      esqueleto!.hidden = true;
      errorEl!.hidden = false;
    }
  });
}
