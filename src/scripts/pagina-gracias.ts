/** Página /pedido-recibido/: lee el pedido con la clave de la URL (wp-plugin/ringopet-pedido). */
import { obtenerPedido } from '../lib/tienda/checkout';
import { formatearPrecio } from '../lib/moneda';
import { enlaceWhatsapp } from '../lib/url';
import type { DetallePedido } from '../lib/tienda/tipos';

export function iniciarPaginaGracias() {
  const cargando = document.querySelector<HTMLElement>('[data-gracias-cargando]');
  const errorEl = document.querySelector<HTMLElement>('[data-gracias-error]');
  const contenido = document.querySelector<HTMLElement>('[data-gracias-contenido]');
  if (!cargando || !errorEl || !contenido) return;

  const parametros = new URLSearchParams(location.search);
  const pedidoId = parametros.get('pedido');
  const clave = parametros.get('key');

  if (!pedidoId || !clave) {
    cargando.hidden = true;
    errorEl.hidden = false;
    return;
  }

  function pintar(pedido: DetallePedido) {
    contenido!.querySelector('[data-numero]')!.textContent = `#${pedido.numero}`;
    contenido!.querySelector('[data-estado]')!.textContent = pedido.estado_label;
    contenido!.querySelector('[data-total]')!.textContent = formatearPrecio(pedido.total, 2, '$ ');
    contenido!.querySelector('[data-metodo-pago]')!.textContent = pedido.metodo_pago_titulo;

    const entregaEl = contenido!.querySelector<HTMLElement>('[data-entrega]');
    if (entregaEl) {
      if (pedido.entrega) {
        entregaEl.hidden = false;
        entregaEl.querySelector('[data-etiqueta-fecha]')!.textContent = pedido.entrega.etiqueta_fecha;
        entregaEl.querySelector('[data-valor-fecha]')!.textContent = pedido.entrega.fecha;
        entregaEl.querySelector('[data-etiqueta-turno]')!.textContent = pedido.entrega.etiqueta_turno;
        entregaEl.querySelector('[data-valor-turno]')!.textContent = pedido.entrega.turno;
      } else {
        entregaEl.hidden = true;
      }
    }

    const itemsEl = contenido!.querySelector<HTMLElement>('[data-items]');
    if (itemsEl) {
      itemsEl.innerHTML = pedido.items
        .map(
          (item) => `
            <li class="flex items-center gap-3 py-3">
              ${item.imagen ? `<img src="${item.imagen}" alt="" width="56" height="56" class="h-14 w-14 shrink-0 rounded-lg border border-borde object-contain p-1" loading="lazy" />` : ''}
              <span class="min-w-0 flex-1 truncate">${item.cantidad} × ${item.nombre}</span>
              <span class="shrink-0 font-medium">${formatearPrecio(item.total, 2, '$ ')}</span>
            </li>`,
        )
        .join('');
    }

    const transferenciaEl = contenido!.querySelector<HTMLElement>('[data-transferencia]');
    if (transferenciaEl) {
      if (pedido.transferencia) {
        transferenciaEl.hidden = false;
        transferenciaEl.querySelector('[data-cvu]')!.textContent = pedido.transferencia.cvu;
        transferenciaEl.querySelector('[data-alias]')!.textContent = pedido.transferencia.alias;
        transferenciaEl.querySelector('[data-titular]')!.textContent = pedido.transferencia.titular;
        const botonWsp = transferenciaEl.querySelector<HTMLAnchorElement>('[data-whatsapp-comprobante]');
        if (botonWsp) {
          botonWsp.href = enlaceWhatsapp(`Hola, te paso el comprobante de transferencia del pedido #${pedido.numero}.`);
        }
      } else {
        transferenciaEl.hidden = true;
      }
    }

    cargando!.hidden = true;
    contenido!.hidden = false;
  }

  obtenerPedido(Number(pedidoId), clave)
    .then(pintar)
    .catch(() => {
      cargando.hidden = true;
      errorEl.hidden = false;
    });
}
