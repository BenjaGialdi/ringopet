/** Página /mi-cuenta/: login si no hay sesión, saludo + accesos si la hay. */
import { actualizarSesion, ingresar, salir, obtenerPedidos, ErrorCuenta } from '../lib/tienda/cuenta';
import { formatearPrecio } from '../lib/moneda';

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

  async function mostrarPanel(nombre: string) {
    esqueleto!.hidden = true;
    formIngresar!.hidden = true;
    panel!.hidden = false;
    panel!.querySelector('[data-saludo-nombre]')!.textContent = nombre;

    const bloque = panel!.querySelector<HTMLElement>('[data-bloque-ultimos-pedidos]');
    const lista = panel!.querySelector<HTMLElement>('[data-ultimos-pedidos]');
    if (!bloque || !lista) return;
    try {
      const { pedidos } = await obtenerPedidos(1);
      if (pedidos.length === 0) return;
      bloque.hidden = false;
      lista.innerHTML = pedidos
        .slice(0, 3)
        .map(
          (p) => `
            <li>
              <a href="/mi-cuenta/pedido/?id=${p.id}" class="flex items-center justify-between p-4 hover:bg-fondo-suave">
                <span>
                  <span class="block font-medium">Pedido #${p.numero}</span>
                  <span class="block text-sm text-texto-suave">${p.estado_label}</span>
                </span>
                <span class="font-semibold">${formatearPrecio(p.total, 2, '$ ')}</span>
              </a>
            </li>`,
        )
        .join('');
    } catch {
      /* si falla, el panel se ve igual sin la lista de últimos pedidos */
    }
  }

  actualizarSesion().then((sesion) => {
    if (sesion.sesion && sesion.nombre) {
      mostrarPanel(sesion.nombre);
    } else {
      esqueleto!.hidden = true;
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
