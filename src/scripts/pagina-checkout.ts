/**
 * Página /finalizar-compra/: un solo paso. Junta datos + entrega (ORDDD) +
 * medio de pago y manda todo a wc/store/v1/checkout. Si la Store API
 * devuelve un error de fecha/turno, vuelve a pedir la disponibilidad y
 * marca el campo. Todos los avisos (mínimo de compra, cupones, stock,
 * errores del pago) son los que manda la Store API, nada escrito a mano.
 */
import flatpickr from 'flatpickr';
import type { Instance as InstanciaFlatpickr } from 'flatpickr/dist/types/instance';
import { Spanish } from 'flatpickr/dist/l10n/es.js';
import 'flatpickr/dist/flatpickr.min.css';
import { obtenerCarrito, actualizarCliente } from '../lib/tienda/carrito';
import { pagar, obtenerDisponibilidadEntrega, obtenerTitulosMediosPago, obtenerBorradorCheckout, actualizarMedioDePago } from '../lib/tienda/checkout';
import { ErrorApi } from '../lib/tienda/api-navegador';
import { formatearPrecio } from '../lib/moneda';
import type { Carrito, DireccionCarrito, Disponibilidad, DiaEntrega } from '../lib/tienda/tipos';

interface EstadoCheckout {
  disponibilidad: Disponibilidad | null;
  diaElegido: DiaEntrega | null;
}

function pintarUnResumen(raiz: HTMLElement, carrito: Carrito) {
  const t = carrito.totals;
  const itemsEl = raiz.querySelector<HTMLElement>('[data-resumen-items]');
  if (itemsEl) {
    itemsEl.innerHTML = carrito.items
      .map((item) => {
        const imagen = item.images[0];
        const variacion = item.variation.map((v) => v.value).join(' · ');
        return `
          <li class="flex gap-3 py-3">
            <img src="${imagen?.thumbnail ?? imagen?.src ?? ''}" alt="" width="56" height="56" class="h-14 w-14 shrink-0 rounded-lg border border-borde object-contain p-1" loading="lazy" />
            <div class="min-w-0 flex-1 text-sm">
              <p class="truncate font-medium">${item.name}</p>
              <p class="text-texto-suave">${variacion ? `${variacion} · ` : ''}Cantidad: ${item.quantity}</p>
            </div>
            <p class="shrink-0 text-sm font-medium">${formatearPrecio(item.totals.line_total, item.totals.currency_minor_unit, item.totals.currency_prefix, item.totals.currency_suffix)}</p>
          </li>`;
      })
      .join('');
  }

  const subtotalEl = raiz.querySelector<HTMLElement>('[data-resumen-subtotal]');
  if (subtotalEl) subtotalEl.textContent = formatearPrecio(t.total_items, t.currency_minor_unit, t.currency_prefix, t.currency_suffix);

  const filaDescuento = raiz.querySelector<HTMLElement>('[data-resumen-fila-descuento]');
  const descuentoEl = raiz.querySelector<HTMLElement>('[data-resumen-descuento]');
  const hayDescuento = Number(t.total_discount) > 0;
  if (filaDescuento) filaDescuento.hidden = !hayDescuento;
  if (descuentoEl && hayDescuento) descuentoEl.textContent = `-${formatearPrecio(t.total_discount, t.currency_minor_unit, t.currency_prefix, t.currency_suffix)}`;

  const feesEl = raiz.querySelector<HTMLElement>('[data-resumen-fees]');
  if (feesEl) {
    feesEl.innerHTML = carrito.fees
      .map((fee) => `<div class="flex justify-between"><dt>${fee.name}</dt><dd>${formatearPrecio(fee.totals.total, t.currency_minor_unit, t.currency_prefix, t.currency_suffix)}</dd></div>`)
      .join('');
  }

  const filaEnvio = raiz.querySelector<HTMLElement>('[data-resumen-fila-envio]');
  const envioEl = raiz.querySelector<HTMLElement>('[data-resumen-envio]');
  const hayEnvio = carrito.needs_shipping && t.total_shipping !== null;
  if (filaEnvio) filaEnvio.hidden = !hayEnvio;
  if (envioEl && hayEnvio) {
    const monto = Number(t.total_shipping);
    envioEl.textContent = monto === 0 ? 'Gratis' : formatearPrecio(t.total_shipping!, t.currency_minor_unit, t.currency_prefix, t.currency_suffix);
  }

  const totalTexto = formatearPrecio(t.total_price, t.currency_minor_unit, t.currency_prefix, t.currency_suffix);
  raiz.querySelectorAll<HTMLElement>('[data-resumen-total]').forEach((el) => (el.textContent = totalTexto));
  const totalResumido = raiz.querySelector<HTMLElement>('[data-resumen-total-resumido]');
  if (totalResumido) totalResumido.textContent = totalTexto;
}

function pintarResumenes(carrito: Carrito) {
  document.querySelectorAll<HTMLElement>('[data-resumen-instancia]').forEach((raiz) => pintarUnResumen(raiz, carrito));
}

export function iniciarPaginaCheckout() {
  const form = document.querySelector<HTMLFormElement>('[data-form-checkout]');
  const seccionVacio = document.querySelector<HTMLElement>('[data-checkout-vacio]');
  const seccionForm = document.querySelector<HTMLElement>('[data-checkout-form]');
  const inputFecha = document.querySelector<HTMLInputElement>('[data-input-fecha]');
  const selectTurno = document.querySelector<HTMLSelectElement>('[data-select-turno]');
  const notaEl = document.querySelector<HTMLElement>('[data-nota-entrega]');
  const pagoEl = document.querySelector<HTMLElement>('[data-medios-pago]');
  const erroresEl = document.querySelector<HTMLElement>('[data-checkout-errores]');
  const botonesPagar = document.querySelectorAll<HTMLButtonElement>('[data-boton-pagar], [data-boton-pagar-escritorio]');
  if (!form || !seccionVacio || !seccionForm || !inputFecha || !selectTurno) return;
  const elVacio = seccionVacio;
  const elForm = seccionForm;

  const estado: EstadoCheckout = { disponibilidad: null, diaElegido: null };
  let calendario: InstanciaFlatpickr | null = null;

  function mostrarAvisosCarrito(carrito: Carrito) {
    if (!erroresEl) return;
    erroresEl.innerHTML = carrito.errors.map((e) => `<p class="rounded-lg bg-fondo-suave p-3 text-sm" role="alert">${e.message}</p>`).join('');
  }

  function habilitarPago(carrito: Carrito) {
    const bloqueado = carrito.errors.length > 0;
    botonesPagar.forEach((b) => b.toggleAttribute('disabled', bloqueado));
  }

  function pintarMediosDePago(carrito: Carrito, titulosPago: Record<string, string>, elegido?: string) {
    if (!pagoEl) return;
    pagoEl.innerHTML = carrito.payment_methods
      .map(
        (id) => `
          <label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border-2 border-borde px-4 has-checked:border-primario">
            <input type="radio" name="payment_method" value="${id}" class="h-4 w-4 accent-primario" ${id === (elegido ?? carrito.payment_methods[0]) ? 'checked' : ''} required />
            ${titulosPago[id] ?? id}
          </label>`,
      )
      .join('');
    pagoEl.querySelectorAll<HTMLInputElement>('input[name="payment_method"]').forEach((input) => {
      input.addEventListener('change', async () => {
        try {
          const carritoActualizado = await actualizarMedioDePago(input.value);
          pintarResumenes(carritoActualizado);
          mostrarAvisosCarrito(carritoActualizado);
          habilitarPago(carritoActualizado);
        } catch {
          // Si falla el recálculo seguimos con los totales que ya estaban; el checkout los vuelve a validar igual.
        }
      });
    });
  }

  function pintarDias(disponibilidad: Disponibilidad) {
    calendario?.destroy();
    estado.diaElegido = null;
    selectTurno!.innerHTML = '<option value="">Elegí un turno</option>';
    selectTurno!.disabled = true;

    const fechasHabilitadas = disponibilidad.dias.map((d) => d.iso);
    calendario = flatpickr(inputFecha!, {
      locale: { ...Spanish, firstDayOfWeek: 1 },
      dateFormat: 'Y-m-d',
      enable: fechasHabilitadas,
      defaultDate: undefined,
      disableMobile: true,
      formatDate: (fecha) => {
        const iso = flatpickr.formatDate(fecha, 'Y-m-d');
        const dia = disponibilidad.dias.find((d) => d.iso === iso);
        return dia?.etiqueta ?? flatpickr.formatDate(fecha, 'j-n-Y');
      },
      onChange: (fechas) => {
        if (!fechas[0]) return;
        const iso = flatpickr.formatDate(fechas[0], 'Y-m-d');
        const dia = disponibilidad.dias.find((d) => d.iso === iso);
        elegirDia(dia ?? null);
      },
    }) as InstanciaFlatpickr;

    if (notaEl) notaEl.textContent = disponibilidad.nota;
  }

  function elegirDia(dia: DiaEntrega | null) {
    estado.diaElegido = dia;
    if (!dia) {
      selectTurno!.innerHTML = '<option value="">Elegí un turno</option>';
      selectTurno!.disabled = true;
      return;
    }
    selectTurno!.disabled = false;
    selectTurno!.innerHTML =
      '<option value="">Elegí un turno</option>' + dia.turnos.map((t) => `<option value="${t.valor}">${t.etiqueta}</option>`).join('');
  }

  function marcarCampo(nombre: string) {
    const campo = form!.querySelector<HTMLElement>(`[data-campo="${nombre}"]`);
    campo?.classList.add('border-red-500');
    campo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function mostrarError(mensaje: string) {
    if (erroresEl) erroresEl.innerHTML = `<p class="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">${mensaje}</p>`;
    erroresEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function direccionDelFormulario(): DireccionCarrito {
    const dato = (nombre: string) => (form!.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${nombre}"]`)?.value ?? '').trim();
    return {
      first_name: dato('first_name'),
      last_name: dato('last_name'),
      address_1: dato('address_1'),
      address_2: dato('address_2'),
      city: dato('city'),
      state: 'X',
      postcode: dato('postcode'),
      country: 'AR',
      phone: dato('phone'),
      email: dato('email'),
    };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (erroresEl) erroresEl.innerHTML = '';
    form.querySelectorAll('[data-campo]').forEach((el) => el.classList.remove('border-red-500'));

    if (!estado.diaElegido) {
      mostrarError('Elegí la fecha de entrega.');
      marcarCampo('fecha');
      return;
    }
    if (estado.disponibilidad?.turno_obligatorio && !selectTurno!.value) {
      mostrarError('Elegí el turno de entrega.');
      marcarCampo('turno');
      return;
    }

    const metodoPago = form.querySelector<HTMLInputElement>('input[name="payment_method"]:checked')?.value;
    if (!metodoPago) {
      mostrarError('Elegí un medio de pago.');
      return;
    }

    const direccion = direccionDelFormulario();
    botonesPagar.forEach((b) => {
      b.setAttribute('disabled', 'true');
      b.textContent = 'Procesando...';
    });

    try {
      await actualizarCliente(direccion);
      const borrador = await obtenerBorradorCheckout();
      const respuesta = await pagar({
        billing_address: direccion,
        shipping_address: direccion,
        payment_method: metodoPago as 'bacs' | 'woo-mercado-pago-basic',
        create_account: borrador.customer_id === 0,
        customer_note: (form.querySelector<HTMLTextAreaElement>('[name="customer_note"]')?.value ?? '').trim(),
        extensions: {
          'order-delivery-date': {
            h_deliverydate: estado.diaElegido.valor,
            e_deliverydate: estado.diaElegido.etiqueta,
            orddd_lite_time_slot: selectTurno!.value,
          },
        },
      });

      if (respuesta.payment_result?.redirect_url) {
        window.location.href = respuesta.payment_result.redirect_url;
      } else {
        window.location.href = `/pedido-recibido/?pedido=${respuesta.order_id}&key=${encodeURIComponent(respuesta.order_key)}`;
      }
    } catch (error) {
      const codigo = error instanceof ErrorApi ? error.codigo : '';
      const mensaje = error instanceof Error ? error.message : 'No se pudo procesar el pago.';

      if (codigo.includes('fecha') || codigo.includes('turno')) {
        // La fecha/turno elegidos ya no están disponibles: se vuelve a pedir todo, como pidió Benja.
        try {
          const fresca = await obtenerDisponibilidadEntrega();
          estado.disponibilidad = fresca;
          pintarDias(fresca);
        } catch {
          /* si ni la disponibilidad responde, se queda con el error general de abajo */
        }
        marcarCampo(codigo.includes('turno') ? 'turno' : 'fecha');
      }
      mostrarError(mensaje);
    } finally {
      botonesPagar.forEach((b) => {
        b.removeAttribute('disabled');
        b.textContent = 'Pagar pedido';
      });
    }
  });

  async function iniciar() {
    let carrito: Carrito;
    try {
      carrito = await obtenerCarrito();
    } catch {
      elVacio.textContent = 'No pudimos cargar tu carrito. Probá de nuevo en un momento.';
      elVacio.hidden = false;
      elForm.hidden = true;
      return;
    }

    if (carrito.items.length === 0) {
      elVacio.hidden = false;
      elForm.hidden = true;
      return;
    }
    elVacio.hidden = true;
    elForm.hidden = false;

    const [disponibilidad, titulosPago] = await Promise.all([
      obtenerDisponibilidadEntrega().catch(() => null),
      obtenerTitulosMediosPago().catch(() => ({}) as Record<string, string>),
    ]);

    pintarResumenes(carrito);
    mostrarAvisosCarrito(carrito);
    habilitarPago(carrito);
    pintarMediosDePago(carrito, titulosPago);

    // Precarga lo que ya sabe WooCommerce del cliente (sesión iniciada o dirección guardada).
    const direccion = carrito.shipping_address?.first_name ? carrito.shipping_address : carrito.billing_address;
    if (direccion) {
      (['first_name', 'last_name', 'address_1', 'address_2', 'city', 'postcode', 'phone'] as const).forEach((campo) => {
        const input = form!.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${campo}"]`);
        const valor = direccion[campo];
        if (input && valor) input.value = valor;
      });
      const email = carrito.billing_address?.email;
      const inputEmail = form!.querySelector<HTMLInputElement>('[name="email"]');
      if (inputEmail && email) inputEmail.value = email;
    }

    if (disponibilidad) {
      estado.disponibilidad = disponibilidad;
      pintarDias(disponibilidad);
    } else if (notaEl) {
      notaEl.textContent = 'No pudimos cargar los turnos de entrega. Recargá la página.';
    }
  }

  iniciar();
}
