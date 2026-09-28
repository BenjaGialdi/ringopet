/** Página /mi-cuenta/recuperar/: pide el usuario o email y muestra siempre el mismo mensaje. */
import { recuperarClave } from '../lib/tienda/cuenta';

export function iniciarPaginaRecuperar() {
  const form = document.querySelector<HTMLFormElement>('[data-form-recuperar]');
  const ok = document.querySelector<HTMLElement>('[data-recuperar-ok]');
  const boton = document.querySelector<HTMLButtonElement>('[data-boton-recuperar]');
  if (!form || !ok) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario = String(new FormData(form).get('usuario') ?? '').trim();
    if (!usuario) return;
    boton?.setAttribute('disabled', 'true');
    try {
      // Respuesta idéntica exista o no el usuario/email: no hay nada que revisar acá.
      await recuperarClave(usuario);
    } finally {
      form.hidden = true;
      ok.hidden = false;
    }
  });
}
