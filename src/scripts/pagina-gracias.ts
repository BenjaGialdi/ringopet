/** Página /pedido-recibido/: lee el pedido con la clave de la URL (wp-plugin/ringopet-pedido). */
import { obtenerPedido } from '../lib/tienda/checkout';
import { formatearPrecio } from '../lib/moneda';
import { enlaceWhatsapp } from '../lib/url';
import { lineaEstadoHtml } from '../lib/tienda/linea-estado';
import type { DetallePedido, DireccionPedido } from '../lib/tienda/tipos';

function pintarDireccion(el: HTMLElement, direccion: DireccionPedido) {
  el.innerHTML = `
    <div>${direccion.nombre}</div>
    ${direccion.telefono ? `<div>${direccion.telefono}</div>` : ''}
    <div>${direccion.direccion}</div>
    <div>${direccion.localidad}${direccion.cp ? `, CP ${direccion.cp}` : ''}</div>
  `;
}

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
    const p = (moneda: string) => formatearPrecio(moneda, pedido.moneda_decimales, '$ ');

    contenido!.querySelector('[data-numero]')!.textContent = `#${pedido.numero}`;
    contenido!.querySelector('[data-estado]')!.textContent = pedido.estado_label;
    contenido!.querySelector('[data-email]')!.textContent = pedido.email;
    const fechaEl = contenido!.querySelector('[data-fecha]');
    if (fechaEl) {
      fechaEl.textContent = pedido.fecha ? new Date(pedido.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    }

    contenido!.querySelector('[data-subtotal]')!.textContent = p(pedido.subtotal);
    contenido!.querySelector('[data-total]')!.textContent = p(pedido.total);
    contenido!.querySelector('[data-metodo-pago]')!.textContent = pedido.metodo_pago_titulo;

    const lineaEl = contenido!.querySelector<HTMLElement>('[data-linea-estado]');
    if (lineaEl) lineaEl.innerHTML = lineaEstadoHtml(pedido);

    const descripcionEl = contenido!.querySelector<HTMLElement>('[data-metodo-pago-descripcion]');
    if (descripcionEl) {
      descripcionEl.hidden = !pedido.metodo_pago_descripcion;
      descripcionEl.textContent = pedido.metodo_pago_descripcion;
    }

    const filaDescuento = contenido!.querySelector<HTMLElement>('[data-fila-descuento]');
    if (filaDescuento) {
      const hay = Number(pedido.descuento) > 0;
      filaDescuento.hidden = !hay;
      if (hay) contenido!.querySelector('[data-descuento]')!.textContent = `-${p(pedido.descuento)}`;
    }

    const filaEnvio = contenido!.querySelector<HTMLElement>('[data-fila-envio]');
    if (filaEnvio) {
      const hay = pedido.envio !== null;
      filaEnvio.hidden = !hay;
      if (hay) {
        const monto = Number(pedido.envio);
        contenido!.querySelector('[data-envio]')!.textContent = monto === 0 ? 'Gratis' : p(pedido.envio!);
      }
    }

    const filaImpuestos = contenido!.querySelector<HTMLElement>('[data-fila-impuestos]');
    if (filaImpuestos) {
      const hay = Number(pedido.impuestos) > 0;
      filaImpuestos.hidden = !hay;
      if (hay) contenido!.querySelector('[data-impuestos]')!.textContent = p(pedido.impuestos);
    }

    const filaCupones = contenido!.querySelector<HTMLElement>('[data-fila-cupones]');
    if (filaCupones) {
      const hay = pedido.cupones.length > 0;
      filaCupones.hidden = !hay;
      if (hay) contenido!.querySelector('[data-cupones]')!.textContent = pedido.cupones.join(', ');
    }

    const filaNota = contenido!.querySelector<HTMLElement>('[data-fila-nota]');
    if (filaNota) {
      filaNota.hidden = !pedido.nota_cliente;
      if (pedido.nota_cliente) contenido!.querySelector('[data-nota]')!.textContent = pedido.nota_cliente;
    }

    const facturacionEl = contenido!.querySelector<HTMLElement>('[data-facturacion]');
    if (facturacionEl && pedido.facturacion) pintarDireccion(facturacionEl, pedido.facturacion);

    const bloqueEnvio = contenido!.querySelector<HTMLElement>('[data-bloque-envio]');
    const envioDireccionEl = contenido!.querySelector<HTMLElement>('[data-envio-direccion]');
    if (bloqueEnvio && envioDireccionEl) {
      if (pedido.envio_direccion) {
        bloqueEnvio.hidden = false;
        pintarDireccion(envioDireccionEl, pedido.envio_direccion);
      } else {
        bloqueEnvio.hidden = true;
      }
    }

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
              <span class="min-w-0 flex-1">
                <span class="block truncate">${item.cantidad} × ${item.nombre}</span>
                ${item.variacion ? `<span class="block text-xs text-texto-suave">${item.variacion}</span>` : ''}
              </span>
              <span class="shrink-0 font-medium">${p(item.total)}</span>
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
