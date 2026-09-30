/**
 * Todo lo nuevo del encabezado que no era del carrito ni del menú lateral de siempre:
 * desplegable "Categorías" de compu, etiqueta de sesión ("Iniciar sesión..." / "Hola, x") y
 * los disparadores de la barra inferior de celular (Menú y Mi cuenta).
 */
import { sesionCacheada, actualizarSesion } from '../lib/tienda/sesion-navegador';
import { iniciarPaginaCuentaInicio } from './cuenta-inicio';

function abrir(panel: HTMLElement) {
  panel.hidden = false;
  requestAnimationFrame(() => panel.setAttribute('data-abierto', ''));
}
function cerrar(panel: HTMLElement) {
  panel.removeAttribute('data-abierto');
  panel.hidden = true;
}

function iniciarFlyoutCategorias() {
  const boton = document.querySelector<HTMLButtonElement>('[data-abrir-menu-flyout]');
  const panel = document.querySelector<HTMLElement>('[data-menu-flyout]');
  if (!boton || !panel) return;

  boton.addEventListener('click', () => {
    if (panel.hidden) {
      abrir(panel);
      boton.setAttribute('aria-expanded', 'true');
    } else {
      cerrar(panel);
      boton.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target as Node) && !boton.contains(e.target as Node)) {
      cerrar(panel);
      boton.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      cerrar(panel);
      boton.setAttribute('aria-expanded', 'false');
      boton.focus();
    }
  });
}

/** "Iniciar sesión / Registrarse" o "Hola, {nombre}", sin esperar al servidor si ya hay una copia guardada. */
function iniciarEtiquetaSesion() {
  const etiquetas = document.querySelectorAll<HTMLElement>('[data-etiqueta-sesion]');
  if (!etiquetas.length) return;

  function pintar(nombre: string | null) {
    etiquetas.forEach((el) => {
      el.textContent = nombre ? `Hola, ${nombre}` : 'Iniciar sesión / Registrarse';
    });
  }

  const cache = sesionCacheada();
  if (cache) pintar(cache.sesion ? (cache.nombre ?? null) : null);

  actualizarSesion().then((sesion) => pintar(sesion.sesion ? (sesion.nombre ?? null) : null));
}

function iniciarPanelesMobile() {
  const menuLateral = document.querySelector<HTMLDialogElement>('[data-menu-lateral]');
  document.querySelectorAll('[data-abrir-menu-lateral]').forEach((boton) => {
    boton.addEventListener('click', () => {
      menuLateral?.showModal();
      document.body.style.overflow = 'hidden';
    });
  });

  const cuentaLateral = document.querySelector<HTMLDialogElement>('[data-cuenta-lateral]');
  if (cuentaLateral) {
    document.querySelectorAll('[data-abrir-cuenta]').forEach((boton) => {
      boton.addEventListener('click', () => {
        cuentaLateral.showModal();
        document.body.style.overflow = 'hidden';
      });
    });
    cuentaLateral.addEventListener('close', () => {
      document.body.style.overflow = '';
    });
    cuentaLateral.querySelector('[data-cerrar-cuenta]')?.addEventListener('click', () => cuentaLateral.close());
    cuentaLateral.addEventListener('click', (e) => {
      if (e.target === cuentaLateral) cuentaLateral.close();
    });
    // navegar:false — el panel se queda en la página actual y solo cambia lo que muestra (ver cuenta-inicio.ts).
    iniciarPaginaCuentaInicio(cuentaLateral, { navegar: false });
  }
}

export function iniciarEncabezadoUI() {
  iniciarFlyoutCategorias();
  iniciarEtiquetaSesion();
  iniciarPanelesMobile();
}
