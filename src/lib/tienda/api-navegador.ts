/**
 * Fetch compartido para todo lo que el carrito y el pago hacen en el
 * navegador (Store API, rutas relativas, mismo dominio donde está
 * publicado el sitio, nunca contra WOO_URL). Guarda el Nonce de la Store
 * API entre llamadas: cada respuesta manda uno nuevo. Aparte, si hay una
 * sesión de WordPress iniciada (Mi cuenta), agrega el X-WP-Nonce que
 * exige el núcleo de WordPress en ese caso (ver sesion-navegador.ts).
 */
import { encabezadoNonce, actualizarSesion } from './sesion-navegador';

const BASE = '/wp-json/wc/store/v1';
let nonce = '';

function leerNonce(respuesta: Response) {
  const valor = respuesta.headers.get('Nonce') ?? respuesta.headers.get('X-WC-Store-API-Nonce');
  if (valor) nonce = valor;
}

export class ErrorApi extends Error {
  codigo: string;
  constructor(mensaje: string, codigo: string) {
    super(mensaje);
    this.codigo = codigo;
  }
}

async function intentar(ruta: string, opciones: RequestInit): Promise<Response> {
  return fetch(`${BASE}${ruta}`, {
    ...opciones,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(nonce ? { Nonce: nonce } : {}),
      ...encabezadoNonce(),
      ...opciones.headers,
    },
  });
}

export async function llamarApi<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  let respuesta = await intentar(ruta, opciones);
  leerNonce(respuesta);

  // Si hay sesión de WordPress y el X-WP-Nonce guardado ya venció (nueva pestaña, sesión
  // vieja), WordPress rechaza con rest_cookie_invalid_nonce: se pide uno nuevo y se reintenta
  // una sola vez, sin que el visitante lo note.
  if (respuesta.status === 401 || respuesta.status === 403) {
    const cuerpoError = await respuesta.clone().json().catch(() => null);
    if (cuerpoError?.code === 'rest_cookie_invalid_nonce') {
      await actualizarSesion();
      respuesta = await intentar(ruta, opciones);
      leerNonce(respuesta);
    }
  }

  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new ErrorApi(cuerpo?.message ?? `La tienda respondió ${respuesta.status}`, cuerpo?.code ?? '');
  }
  return cuerpo as T;
}
