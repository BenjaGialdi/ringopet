/**
 * Página /finalizar-compra/: un solo paso. Junta datos + entrega (ORDDD) +
 * medio de pago y manda todo a wc/store/v1/checkout. Si la Store API
 * devuelve un error de fecha/turno, vuelve a pedir la disponibilidad y
 * marca el campo, como pidió Benja.
 */
import { obtenerCarrito, actualizarCliente } from '../lib/tienda/carrito';
import { pagar, obtenerDisponibilidadEntrega } from '../lib/tienda/checkout';
import { llamarApi, ErrorApi } from '../lib/tienda/api-navegador';
import { formatearPrecio } from '../lib/moneda';
import type { Carrito, DireccionCarrito, Disponibilidad, DiaEntrega } from '../lib/tienda/tipos';

const TITULOS_PAGO: Record<string, string> = {
  bacs: 'Transferencia bancaria',
  'woo-mercado-pago-basic': 'Mercado Pago',
};

interface EstadoCheckout {
  disponibilidad: Disponibilidad | null;
  diaElegido: DiaEntrega | null;
  turnoElegido: string;
}

export function iniciarPaginaCheckout() {
  const form = document.querySelector<HTMLFormElement>('[data-form-checkout]');
  const resumenEl = document.querySelector<HTMLElement>('[data-resumen-items]');
  const totalEl = document.querySelector<HTMLElement>('[data-resumen-total]');
  const seccionVacio = document.querySelector<HTMLElement>('[data-checkout-vacio]');
  const seccionForm = document.querySelector<HTMLElement>('[data-checkout-form]');
  const diasEl = document.querySelector<HTMLElement>('[data-dias-entrega]');
  const turnosEl = document.querySelector<HTMLElement>('[data-turnos-entrega]');
  const notaEl = document.querySelector<HTMLElement>('[data-nota-entrega]');
  const pagoEl = document.querySelector<HTMLElement>('[data-medios-pago]');
  const erroresEl = document.querySelector<HTMLElement>('[data-checkout-errores]');
  const botonPagar = document.querySelector<HTMLButtonElement>('[data-boton-pagar]');
  if (!form || !seccionVacio || !seccionForm) return;
  const elVacio = seccionVacio;
  const elForm = seccionForm;

  const estado: EstadoCheckout = { disponibilidad: null, diaElegido: null, turnoElegido: '' };

  function pintarResumen(carrito: Carrito) {
    if (resumenEl) {
      resumenEl.innerHTML = carrito.items
        .map(
          (item) =>
            `<li class="flex justify-between gap-3 py-2 text-sm"><span class="min-w-0 truncate">${item.quantity} × ${item.name}</span><span class="shrink-0 font-medium">${formatearPrecio(item.totals.line_total, item.totals.currency_minor_unit, item.totals.currency_prefix, item.totals.currency_suffix)}</span></li>`,
        )
        .join('');
    }
    if (totalEl) totalEl.textContent = formatearPrecio(carrito.totals.total_price, carrito.totals.currency_minor_unit, carrito.totals.currency_prefix, carrito.totals.currency_suffix);

    if (pagoEl) {
      pagoEl.innerHTML = carrito.payment_methods
        .filter((id) => TITULOS_PAGO[id])
        .map(
          (id, i) => `
            <label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border-2 border-borde px-4 has-checked:border-primario">
              <input type="radio" name="payment_method" value="${id}" class="h-4 w-4 accent-primario" ${i === 0 ? 'checked' : ''} required />
              ${TITULOS_PAGO[id]}
            </label>`,
        )
        .join('');
    }

    if (erroresEl && carrito.errors.length) {
      erroresEl.innerHTML = carrito.errors.map((e) => `<p class="rounded-lg bg-fondo-suave p-3 text-sm" role="alert">${e.message}</p>`).join('');
    }
    if (botonPagar) botonPagar.toggleAttribute('disabled', carrito.errors.length > 0);
  }

  function pintarDias(disponibilidad: Disponibilidad) {
    if (!diasEl) return;
    diasEl.innerHTML = disponibilidad.dias
      .slice(0, 10)
      .map((dia, i) => `<button type="button" data-dia="${dia.valor}" aria-pressed="${i === 0 ? 'true' : 'false'}" class="min-h-11 rounded-lg border-2 px-4 text-sm font-medium ${i === 0 ? 'border-primario text-primario-oscuro' : 'border-borde'}">${dia.etiqueta}</button>`)
      .join('');
    diasEl.querySelectorAll<HTMLButtonElement>('[data-dia]').forEach((btn) => {
      btn.addEventListener('click', () => elegirDia(disponibilidad.dias.find((d) => d.valor === btn.dataset.dia)!));
    });
    elegirDia(disponibilidad.dias[0]);
    if (notaEl) notaEl.textContent = disponibilidad.nota;
  }

  function elegirDia(dia: DiaEntrega) {
    estado.diaElegido = dia;
    estado.turnoElegido = '';
    diasEl?.querySelectorAll<HTMLButtonElement>('[data-dia]').forEach((btn) => {
      const activo = btn.dataset.dia === dia.valor;
      btn.setAttribute('aria-pressed', String(activo));
      btn.classList.toggle('border-primario', activo);
      btn.classList.toggle('text-primario-oscuro', activo);
      btn.classList.toggle('border-borde', !activo);
    });
    if (!turnosEl) return;
    turnosEl.innerHTML = dia.turnos
      .map((t, i) => `<button type="button" data-turno="${t.valor}" aria-pressed="${i === 0 ? 'true' : 'false'}" class="min-h-11 rounded-lg border-2 px-4 text-sm font-medium ${i === 0 ? 'border-primario text-primario-oscuro' : 'border-borde'}">${t.etiqueta}</button>`)
      .join('');
    turnosEl.querySelectorAll<HTMLButtonElement>('[data-turno]').forEach((btn) => {
      btn.addEventListener('click', () => elegirTurno(btn.dataset.turno!));
    });
    if (dia.turnos[0]) elegirTurno(dia.turnos[0].valor);
  }

  function elegirTurno(valor: string) {
    estado.turnoElegido = valor;
    turnosEl?.querySelectorAll<HTMLButtonElement>('[data-turno]').forEach((btn) => {
      const activo = btn.dataset.turno === valor;
      btn.setAttribute('aria-pressed', String(activo));
      btn.classList.toggle('border-primario', activo);
      btn.classList.toggle('text-primario-oscuro', activo);
      btn.classList.toggle('border-borde', !activo);
    });
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
      return;
    }
    if (estado.disponibilidad?.turno_obligatorio && !estado.turnoElegido) {
      mostrarError('Elegí el turno de entrega.');
      return;
    }

    const metodoPago = form.querySelector<HTMLInputElement>('input[name="payment_method"]:checked')?.value;
    if (!metodoPago) {
      mostrarError('Elegí un medio de pago.');
      return;
    }

    const direccion = direccionDelFormulario();
    botonPagar?.setAttribute('disabled', 'true');
    if (botonPagar) botonPagar.textContent = 'Procesando...';

    try {
      await actualizarCliente(direccion);
      const respuesta = await pagar({
        billing_address: direccion,
        shipping_address: direccion,
        payment_method: metodoPago as 'bacs' | 'woo-mercado-pago-basic',
        create_account: await esInvitado(),
        customer_note: (form.querySelector<HTMLTextAreaElement>('[name="customer_note"]')?.value ?? '').trim(),
        extensions: {
          'order-delivery-date': {
            h_deliverydate: estado.diaElegido.valor,
            e_deliverydate: estado.diaElegido.etiqueta,
            orddd_lite_time_slot: estado.turnoElegido,
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
      botonPagar?.removeAttribute('disabled');
      if (botonPagar) botonPagar.textContent = 'Pagar pedido';
    }
  });

  async function esInvitado(): Promise<boolean> {
    try {
      const borrador = await llamarApi<{ customer_id: number }>('/checkout');
      return borrador.customer_id === 0;
    } catch {
      return true;
    }
  }

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
    const disponibilidad = await obtenerDisponibilidadEntrega().catch(() => null);

    if (carrito.items.length === 0) {
      elVacio.hidden = false;
      elForm.hidden = true;
      return;
    }
    elVacio.hidden = true;
    elForm.hidden = false;
    pintarResumen(carrito);

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
