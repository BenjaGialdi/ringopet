/** Página /mi-cuenta/pedidos/: lista paginada de los pedidos del cliente logueado. */
import { requerirSesion, obtenerPedidos, leerPedidosCache } from '../lib/tienda/cuenta';
import { formatearPrecio } from '../lib/moneda';
import { lineaEstadoHtml } from '../lib/tienda/linea-estado';
import type { PedidoResumen } from '../lib/tienda/tipos';

export function iniciarPaginaPedidos() {
  const esqueleto = document.querySelector<HTMLElement>('[data-pedidos-esqueleto]');
  const vacio = document.querySelector<HTMLElement>('[data-pedidos-vacio]');
  const lista = document.querySelector<HTMLElement>('[data-lista-pedidos]');
  const paginado = document.querySelector<HTMLElement>('[data-paginado]');
  const btnAnterior = document.querySelector<HTMLButtonElement>('[data-pagina-anterior]');
  const btnSiguiente = document.querySelector<HTMLButtonElement>('[data-pagina-siguiente]');
  const paginaActualEl = document.querySelector<HTMLElement>('[data-pagina-actual]');
  if (!esqueleto || !vacio || !lista) return;

  let pagina = 1;

  function pintar(pedidos: PedidoResumen[], total_paginas: number) {
    esqueleto!.hidden = true;

    if (pedidos.length === 0) {
      vacio!.hidden = false;
      lista!.hidden = true;
      return;
    }

    vacio!.hidden = true;
    lista!.hidden = false;
    lista!.innerHTML = pedidos
      .map(
        (p) => `
          <li>
            <a href="/mi-cuenta/pedido/?id=${p.id}" class="block p-4 hover:bg-fondo-suave">
              <div class="flex items-center justify-between gap-4">
                <span>
                  <span class="block font-medium">Pedido #${p.numero}</span>
                  <span class="block text-sm text-texto-suave">${new Date(p.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </span>
                <span class="shrink-0 font-semibold">${formatearPrecio(p.total, p.moneda_decimales, '$ ')}</span>
              </div>
              <div class="mt-2">${lineaEstadoHtml(p)}</div>
            </a>
          </li>`,
      )
      .join('');

    if (total_paginas > 1) {
      paginado!.hidden = false;
      paginaActualEl!.textContent = `Página ${pagina} de ${total_paginas}`;
      btnAnterior!.disabled = pagina <= 1;
      btnSiguiente!.disabled = pagina >= total_paginas;
    } else {
      paginado!.hidden = true;
    }
  }

  async function cargar() {
    if (pagina !== 1) {
      esqueleto!.hidden = false;
      vacio!.hidden = true;
      lista!.hidden = true;
      paginado!.hidden = true;
    }
    const { pedidos, total_paginas } = await obtenerPedidos(pagina);
    pintar(pedidos, total_paginas);
  }

  btnAnterior?.addEventListener('click', () => {
    if (pagina > 1) {
      pagina -= 1;
      cargar();
    }
  });
  btnSiguiente?.addEventListener('click', () => {
    pagina += 1;
    cargar();
  });

  // Página 1 pintada al instante desde la última copia conocida (si hay), mientras se
  // confirma la sesión y llega la respuesta real, que siempre gana si difiere.
  const cache = leerPedidosCache();
  if (cache) pintar(cache, 1);

  requerirSesion().then(cargar);
}
