/**
 * UI del carrito lateral. Un solo script para todo el sitio (se importa una vez,
 * Vite lo deduplica). Delegación de eventos: cualquier botón con
 * [data-agregar-carrito][data-id] agrega ese producto, sin importar en qué página está.
 */
import { obtenerCarrito, agregarAlCarrito, actualizarCantidad, quitarDelCarrito } from '../lib/tienda/carrito';
import type { Carrito } from '../lib/tienda/tipos';

function formatearPrecio(centavos: string, minorUnit: number, prefijo: string, sufijo: string) {
  const monto = Number(centavos) / 10 ** minorUnit;
  const texto = monto.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${prefijo}${texto}${sufijo}`;
}

function pintarContadores(carrito: Carrito) {
  document.querySelectorAll<HTMLElement>('[data-contador-carrito]').forEach((el) => {
    el.textContent = String(carrito.items_count);
    el.hidden = carrito.items_count === 0;
  });
}

function pintarCarrito(carrito: Carrito) {
  const lista = document.querySelector<HTMLElement>('[data-carrito-items]');
  const vacio = document.querySelector<HTMLElement>('[data-carrito-vacio]');
  const subtotal = document.querySelector<HTMLElement>('[data-carrito-subtotal]');
  if (!lista || !vacio || !subtotal) return;

  vacio.hidden = carrito.items.length > 0;
  lista.hidden = carrito.items.length === 0;
  lista.innerHTML = carrito.items
    .map((item) => {
      const imagen = item.images[0];
      const variacion = item.variation.map((v) => v.value).join(' / ');
      return `
        <li class="flex gap-3 py-4" data-item="${item.key}">
          <img src="${imagen?.thumbnail ?? imagen?.src ?? ''}" alt="" width="64" height="64" class="h-16 w-16 shrink-0 rounded object-cover" loading="lazy" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">${item.name}</p>
            ${variacion ? `<p class="text-sm text-texto-suave">${variacion}</p>` : ''}
            <div class="mt-2 flex items-center gap-2">
              <button type="button" class="flex h-7 w-7 items-center justify-center rounded border border-borde" data-restar>−</button>
              <span class="w-6 text-center" data-cantidad>${item.quantity}</span>
              <button type="button" class="flex h-7 w-7 items-center justify-center rounded border border-borde" data-sumar>+</button>
              <button type="button" class="ml-auto text-sm text-texto-suave underline" data-quitar>Quitar</button>
            </div>
          </div>
          <p class="whitespace-nowrap font-semibold text-primario-oscuro">${formatearPrecio(item.totals.line_total, item.totals.currency_minor_unit, carrito.totals.currency_prefix, carrito.totals.currency_suffix)}</p>
        </li>`;
    })
    .join('');
  subtotal.textContent = formatearPrecio(
    carrito.totals.total_price,
    carrito.totals.currency_minor_unit,
    carrito.totals.currency_prefix,
    carrito.totals.currency_suffix,
  );

  lista.querySelectorAll<HTMLElement>('[data-item]').forEach((fila) => {
    const key = fila.dataset.item!;
    fila.querySelector('[data-sumar]')?.addEventListener('click', async () => {
      const cantidad = Number(fila.querySelector('[data-cantidad]')!.textContent) + 1;
      pintarCarrito(await actualizarCantidad(key, cantidad));
    });
    fila.querySelector('[data-restar]')?.addEventListener('click', async () => {
      const cantidad = Number(fila.querySelector('[data-cantidad]')!.textContent) - 1;
      pintarCarrito(cantidad > 0 ? await actualizarCantidad(key, cantidad) : await quitarDelCarrito(key));
    });
    fila.querySelector('[data-quitar]')?.addEventListener('click', async () => {
      pintarCarrito(await quitarDelCarrito(key));
    });
  });

  pintarContadores(carrito);
}

let cargado = false;

async function abrirCarrito() {
  const dialogo = document.querySelector<HTMLDialogElement>('[data-carrito-lateral]');
  if (!dialogo) return;
  dialogo.showModal();
  document.body.style.overflow = 'hidden';
  try {
    pintarCarrito(await obtenerCarrito());
  } catch {
    // Sin conexión a WooCommerce (ej. npm run dev sin backend): el panel queda vacío.
  }
}

function cerrarCarrito() {
  const dialogo = document.querySelector<HTMLDialogElement>('[data-carrito-lateral]');
  dialogo?.close();
  document.body.style.overflow = '';
}

export function iniciarCarritoUI() {
  document.addEventListener('click', async (e) => {
    const objetivo = e.target as HTMLElement;

    if (objetivo.closest('[data-abrir-carrito]')) {
      e.preventDefault();
      abrirCarrito();
    }
    if (objetivo.closest('[data-cerrar-carrito]')) {
      cerrarCarrito();
    }

    const botonAgregar = objetivo.closest<HTMLElement>('[data-agregar-carrito]');
    if (botonAgregar) {
      e.preventDefault();
      const id = Number(botonAgregar.dataset.id);
      const cantidadInput = botonAgregar.closest('form,[data-fila-producto]')?.querySelector<HTMLInputElement>('[data-cantidad-input]');
      const cantidad = cantidadInput ? Number(cantidadInput.value) || 1 : 1;
      const textoOriginal = botonAgregar.textContent;
      botonAgregar.setAttribute('aria-busy', 'true');
      botonAgregar.textContent = 'Agregando...';
      try {
        const carrito = await agregarAlCarrito(id, cantidad);
        pintarCarrito(carrito);
        await abrirCarrito();
      } catch (error) {
        alert(error instanceof Error ? error.message : 'No se pudo agregar al carrito.');
      } finally {
        botonAgregar.removeAttribute('aria-busy');
        botonAgregar.textContent = textoOriginal;
      }
    }
  });

  const dialogo = document.querySelector<HTMLDialogElement>('[data-carrito-lateral]');
  dialogo?.addEventListener('click', (e) => {
    if (e.target === dialogo) cerrarCarrito();
  });
  dialogo?.addEventListener('close', () => {
    document.body.style.overflow = '';
  });
  dialogo?.addEventListener('cancel', () => {
    document.body.style.overflow = '';
  });

  if (!cargado) {
    cargado = true;
    obtenerCarrito()
      .then(pintarContadores)
      .catch(() => {});
  }
}
