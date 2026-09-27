/**
 * Carrito: siempre contra la Store API del mismo dominio (rutas relativas), nunca
 * contra WOO_URL, porque en producción corre en el navegador del cliente y el
 * carrito tiene que ser el que después ve /finalizar-compra/ de WooCommerce.
 */
import type { Carrito } from './tipos';

const BASE = '/wp-json/wc/store/v1';
let nonce = '';

function leerNonce(respuesta: Response) {
  const valor = respuesta.headers.get('Nonce') ?? respuesta.headers.get('X-WC-Store-API-Nonce');
  if (valor) nonce = valor;
}

async function llamar(ruta: string, opciones: RequestInit = {}): Promise<Carrito> {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(nonce ? { Nonce: nonce } : {}),
      ...opciones.headers,
    },
  });
  leerNonce(respuesta);
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    throw new Error(cuerpo?.message ?? `El carrito respondió ${respuesta.status}`);
  }
  return respuesta.json();
}

export function obtenerCarrito(): Promise<Carrito> {
  return llamar('/cart');
}

export function agregarAlCarrito(id: number, cantidad = 1): Promise<Carrito> {
  return llamar('/cart/add-item', { method: 'POST', body: JSON.stringify({ id, quantity: cantidad }) });
}

export function actualizarCantidad(key: string, cantidad: number): Promise<Carrito> {
  return llamar('/cart/update-item', { method: 'POST', body: JSON.stringify({ key, quantity: cantidad }) });
}

export function quitarDelCarrito(key: string): Promise<Carrito> {
  return llamar('/cart/remove-item', { method: 'POST', body: JSON.stringify({ key }) });
}
