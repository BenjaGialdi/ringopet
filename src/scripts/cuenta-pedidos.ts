/** Página /mi-cuenta/pedidos/: lista paginada de los pedidos del cliente logueado. */
import { requerirSesion, obtenerPedidos } from '../lib/tienda/cuenta';
import { formatearPrecio } from '../lib/moneda';

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

  async function cargar() {
    esqueleto!.hidden = false;
    vacio!.hidden = true;
    lista!.hidden = true;
    paginado!.hidden = true;

    const { pedidos, total_paginas } = await obtenerPedidos(pagina);
    esqueleto!.hidden = true;

    if (pedidos.length === 0) {
      vacio!.hidden = false;
      return;
    }

    lista!.hidden = false;
    lista!.innerHTML = pedidos
      .map(
        (p) => `
          <li>
            <a href="/mi-cuenta/pedido/?id=${p.id}" class="flex items-center justify-between gap-4 p-4 hover:bg-fondo-suave">
              <span>
                <span class="block font-medium">Pedido #${p.numero}</span>
                <span class="block text-sm text-texto-suave">${new Date(p.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })} · ${p.estado_label}</span>
              </span>
              <span class="shrink-0 font-semibold">${formatearPrecio(p.total, 2, '$ ')}</span>
            </a>
          </li>`,
      )
      .join('');

    if (total_paginas > 1) {
      paginado!.hidden = false;
      paginaActualEl!.textContent = `Página ${pagina} de ${total_paginas}`;
      btnAnterior!.disabled = pagina <= 1;
      btnSiguiente!.disabled = pagina >= total_paginas;
    }
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

  requerirSesion().then(cargar);
}
