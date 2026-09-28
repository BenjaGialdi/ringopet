/** Página /mi-cuenta/datos/: nombre, apellido, email y cambio de contraseña (pide la actual). */
import { requerirSesion, obtenerDatosCuenta, guardarDatosCuenta, ErrorCuenta } from '../lib/tienda/cuenta';

export function iniciarPaginaDatos() {
  const esqueleto = document.querySelector<HTMLElement>('[data-datos-esqueleto]');
  const form = document.querySelector<HTMLFormElement>('[data-form-datos]');
  const errorEl = document.querySelector<HTMLElement>('[data-datos-error]');
  const okEl = document.querySelector<HTMLElement>('[data-datos-ok]');
  const boton = document.querySelector<HTMLButtonElement>('[data-boton-guardar]');
  if (!esqueleto || !form) return;

  requerirSesion().then(async () => {
    try {
      const datos = await obtenerDatosCuenta();
      (form.elements.namedItem('first_name') as HTMLInputElement).value = datos.first_name;
      (form.elements.namedItem('last_name') as HTMLInputElement).value = datos.last_name;
      (form.elements.namedItem('email') as HTMLInputElement).value = datos.email;
    } finally {
      esqueleto!.hidden = true;
      form!.hidden = false;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = '';
    if (okEl) okEl.hidden = true;
    const datos = new FormData(form);
    const claveNueva = String(datos.get('clave_nueva') ?? '');
    const claveActual = String(datos.get('clave_actual') ?? '');

    if (claveNueva && !claveActual) {
      if (errorEl) errorEl.textContent = 'Ingresá tu contraseña actual para cambiarla.';
      return;
    }

    boton?.setAttribute('disabled', 'true');
    try {
      await guardarDatosCuenta({
        first_name: String(datos.get('first_name') ?? ''),
        last_name: String(datos.get('last_name') ?? ''),
        email: String(datos.get('email') ?? ''),
        ...(claveNueva ? { clave_actual: claveActual, clave_nueva: claveNueva } : {}),
      });
      if (okEl) okEl.hidden = false;
      (form.elements.namedItem('clave_actual') as HTMLInputElement).value = '';
      (form.elements.namedItem('clave_nueva') as HTMLInputElement).value = '';
    } catch (error) {
      if (errorEl) errorEl.textContent = error instanceof ErrorCuenta ? error.message : 'No pudimos guardar los cambios.';
    } finally {
      boton?.removeAttribute('disabled');
    }
  });
}
