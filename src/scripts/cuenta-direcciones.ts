/** Página /mi-cuenta/direcciones/: ver y editar la dirección de entrega guardada. */
import { requerirSesion, obtenerDireccion, guardarDireccion, ErrorCuenta } from '../lib/tienda/cuenta';

export function iniciarPaginaDirecciones() {
  const esqueleto = document.querySelector<HTMLElement>('[data-direccion-esqueleto]');
  const form = document.querySelector<HTMLFormElement>('[data-form-direccion]');
  const errorEl = document.querySelector<HTMLElement>('[data-direccion-error]');
  const okEl = document.querySelector<HTMLElement>('[data-direccion-ok]');
  const boton = document.querySelector<HTMLButtonElement>('[data-boton-guardar]');
  if (!esqueleto || !form) return;

  requerirSesion().then(async () => {
    try {
      const direccion = await obtenerDireccion();
      (Object.keys(direccion) as (keyof typeof direccion)[]).forEach((campo) => {
        const input = form.elements.namedItem(campo) as HTMLInputElement | HTMLSelectElement | null;
        if (input) input.value = direccion[campo] ?? '';
      });
    } catch {
      /* si falla, se muestra el formulario vacío para cargar de cero */
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
    boton?.setAttribute('disabled', 'true');
    try {
      await guardarDireccion({
        first_name: String(datos.get('first_name') ?? ''),
        last_name: String(datos.get('last_name') ?? ''),
        phone: String(datos.get('phone') ?? ''),
        address_1: String(datos.get('address_1') ?? ''),
        address_2: String(datos.get('address_2') ?? ''),
        city: String(datos.get('city') ?? ''),
        postcode: String(datos.get('postcode') ?? ''),
      });
      if (okEl) okEl.hidden = false;
    } catch (error) {
      if (errorEl) errorEl.textContent = error instanceof ErrorCuenta ? error.message : 'No pudimos guardar la dirección.';
    } finally {
      boton?.removeAttribute('disabled');
    }
  });
}
