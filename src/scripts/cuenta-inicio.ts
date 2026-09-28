/** Página /mi-cuenta/: login si no hay sesión, saludo + últimos pedidos si la hay. */
import { actualizarSesion, sesionCacheada, ingresar, salir, ErrorCuenta } from '../lib/tienda/cuenta';
import { formatearPrecio } from '../lib/moneda';
import { lineaEstadoHtml } from '../lib/tienda/linea-estado';
import type { PedidoResumen } from '../lib/tienda/tipos';

export function iniciarPaginaCuentaInicio() {
  const esqueleto = document.querySelector<HTMLElement>('[data-cuenta-esqueleto]');
  const formIngresar = document.querySelector<HTMLFormElement>('[data-form-ingresar]');
  const panel = document.querySelector<HTMLElement>('[data-panel-cuenta]');
  const errorEl = document.querySelector<HTMLElement>('[data-ingresar-error]');
  const boton = document.querySelector<HTMLButtonElement>('[data-boton-ingresar]');
  if (!esqueleto || !formIngresar || !panel) return;

  // El email de "elegí tu contraseña" y el de recuperación de WordPress pueden apuntar
  // acá con ?action=rp&key=&login= (respaldo: el endpoint real es /mi-cuenta/lost-password/,
  // que también redirige, pero por si algún enlace viejo cae directo en /mi-cuenta/).
  const parametros = new URLSearchParams(location.search);
  const key = parametros.get('key');
  const login = parametros.get('login');
  if (key && login) {
    location.href = `/mi-cuenta/nueva-clave/?key=${encodeURIComponent(key)}&login=${encodeURIComponent(login)}`;
    return;
  }

  function irA(destino: string) {
    const volver = parametros.get('volver');
    location.href = volver || destino;
  }

  function pintarUltimosPedidos(pedidos: PedidoResumen[]) {
    const bloque = panel!.querySelector<HTMLElement>('[data-bloque-ultimos-pedidos]');
    const lista = panel!.querySelector<HTMLElement>('[data-ultimos-pedidos]');
    if (!bloque || !lista) return;
    bloque.hidden = pedidos.length === 0;
    if (pedidos.length === 0) return;
    lista.innerHTML = pedidos
      .slice(0, 3)
      .map(
        (p) => `
          <li>
            <a href="/mi-cuenta/pedido/?id=${p.id}" class="block p-4 hover:bg-fondo-suave">
              <div class="flex items-center justify-between">
                <span class="font-medium">Pedido #${p.numero}</span>
                <span class="font-semibold">${formatearPrecio(p.total, 2, '$ ')}</span>
              </div>
              <div class="mt-1">${lineaEstadoHtml(p)}</div>
            </a>
          </li>`,
      )
      .join('');
  }

  function mostrarPanel(nombre: string, pedidos: PedidoResumen[]) {
    esqueleto!.hidden = true;
    formIngresar!.hidden = true;
    panel!.hidden = false;
    panel!.querySelector('[data-saludo-nombre]')!.textContent = nombre;
    pintarUltimosPedidos(pedidos);
  }

  // Se pinta al instante con la última sesión conocida (si hay), sin esperar al servidor;
  // actualizarSesion() de abajo confirma o corrige apenas responde.
  const cache = sesionCacheada();
  if (cache?.sesion && cache.nombre) {
    mostrarPanel(cache.nombre, cache.resumen?.pedidos ?? []);
  } else if (cache && !cache.sesion) {
    esqueleto.hidden = true;
    formIngresar.hidden = false;
  }

  actualizarSesion().then((sesion) => {
    if (sesion.sesion && sesion.nombre) {
      mostrarPanel(sesion.nombre, sesion.resumen?.pedidos ?? []);
    } else {
      esqueleto!.hidden = true;
      panel!.hidden = true;
      formIngresar!.hidden = false;
    }
  });

  formIngresar.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = '';
    const datos = new FormData(formIngresar);
    boton?.setAttribute('disabled', 'true');
    try {
      const sesion = await ingresar(String(datos.get('usuario') ?? ''), String(datos.get('clave') ?? ''), datos.get('recordarme') === 'on');
      if (sesion.sesion) irA('/mi-cuenta/');
    } catch (error) {
      if (errorEl) errorEl.textContent = error instanceof ErrorCuenta ? error.message : 'No pudimos iniciar sesión.';
    } finally {
      boton?.removeAttribute('disabled');
    }
  });

  panel.querySelector('[data-boton-salir]')?.addEventListener('click', async () => {
    try {
      await salir();
    } finally {
      location.href = '/mi-cuenta/';
    }
  });
}
