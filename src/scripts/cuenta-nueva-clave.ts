/** Página /mi-cuenta/nueva-clave/?key=&login=: la usan la recuperación y el email de "elegí tu contraseña". */
import { elegirClaveNueva, ErrorCuenta } from '../lib/tienda/cuenta';

export function iniciarPaginaNuevaClave() {
  const errorEnlace = document.querySelector<HTMLElement>('[data-clave-error-enlace]');
  const form = document.querySelector<HTMLFormElement>('[data-form-nueva-clave]');
  const errorEl = document.querySelector<HTMLElement>('[data-clave-error]');
  const ok = document.querySelector<HTMLElement>('[data-clave-ok]');
  const boton = document.querySelector<HTMLButtonElement>('[data-boton-guardar]');
  if (!errorEnlace || !form || !ok) return;

  const parametros = new URLSearchParams(location.search);
  const key = parametros.get('key');
  const login = parametros.get('login');

  if (!key || !login) {
    form.hidden = true;
    errorEnlace.hidden = false;
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = '';
    const datos = new FormData(form);
    const clave = String(datos.get('clave') ?? '');
    const confirmar = String(datos.get('clave_confirmar') ?? '');

    if (clave !== confirmar) {
      if (errorEl) errorEl.textContent = 'Las contraseñas no coinciden.';
      return;
    }

    boton?.setAttribute('disabled', 'true');
    try {
      await elegirClaveNueva(key, login, clave);
      form.hidden = true;
      ok.hidden = false;
    } catch (error) {
      if (errorEl) errorEl.textContent = error instanceof ErrorCuenta ? error.message : 'No pudimos guardar la contraseña.';
    } finally {
      boton?.removeAttribute('disabled');
    }
  });
}
