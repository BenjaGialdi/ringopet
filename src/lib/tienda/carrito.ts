/**
 * Carrito: siempre contra la Store API del mismo dominio (ver api-navegador.ts).
 * Cada respuesta se guarda en sessionStorage (cache-navegador.ts) para que la
 * próxima vez se pinte al instante, antes de tener respuesta de WooCommerce.
 */
import { llamarApi } from './api-navegador';
import { guardarCarritoCache } from './cache-navegador';
import type { Carrito, DireccionCarrito } from './tipos';

async function llamarYCachear(ruta: string, opciones?: RequestInit): Promise<Carrito> {
  const carrito = await llamarApi<Carrito>(ruta, opciones);
  guardarCarritoCache(carrito);
  return carrito;
}

export function obtenerCarrito(): Promise<Carrito> {
  return llamarYCachear('/cart');
}

export function agregarAlCarrito(id: number, cantidad = 1): Promise<Carrito> {
  return llamarYCachear('/cart/add-item', { method: 'POST', body: JSON.stringify({ id, quantity: cantidad }) });
}

export function actualizarCantidad(key: string, cantidad: number): Promise<Carrito> {
  return llamarYCachear('/cart/update-item', { method: 'POST', body: JSON.stringify({ key, quantity: cantidad }) });
}

export function quitarDelCarrito(key: string): Promise<Carrito> {
  return llamarYCachear('/cart/remove-item', { method: 'POST', body: JSON.stringify({ key }) });
}

export function aplicarCupon(codigo: string): Promise<Carrito> {
  return llamarYCachear('/cart/apply-coupon', { method: 'POST', body: JSON.stringify({ code: codigo }) });
}

export function quitarCupon(codigo: string): Promise<Carrito> {
  return llamarYCachear('/cart/remove-coupon', { method: 'POST', body: JSON.stringify({ code: codigo }) });
}

/** Carga la dirección en la sesión y calcula el envío (en RingoPet, siempre gratis dentro de la zona). */
export function actualizarCliente(direccion: DireccionCarrito): Promise<Carrito> {
  return llamarYCachear('/cart/update-customer', {
    method: 'POST',
    body: JSON.stringify({ billing_address: direccion, shipping_address: direccion }),
  });
}
