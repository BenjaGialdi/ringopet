/**
 * Carrito: siempre contra la Store API del mismo dominio (ver api-navegador.ts).
 */
import { llamarApi } from './api-navegador';
import type { Carrito, DireccionCarrito } from './tipos';

export function obtenerCarrito(): Promise<Carrito> {
  return llamarApi('/cart');
}

export function agregarAlCarrito(id: number, cantidad = 1): Promise<Carrito> {
  return llamarApi('/cart/add-item', { method: 'POST', body: JSON.stringify({ id, quantity: cantidad }) });
}

export function actualizarCantidad(key: string, cantidad: number): Promise<Carrito> {
  return llamarApi('/cart/update-item', { method: 'POST', body: JSON.stringify({ key, quantity: cantidad }) });
}

export function quitarDelCarrito(key: string): Promise<Carrito> {
  return llamarApi('/cart/remove-item', { method: 'POST', body: JSON.stringify({ key }) });
}

export function aplicarCupon(codigo: string): Promise<Carrito> {
  return llamarApi('/cart/apply-coupon', { method: 'POST', body: JSON.stringify({ code: codigo }) });
}

export function quitarCupon(codigo: string): Promise<Carrito> {
  return llamarApi('/cart/remove-coupon', { method: 'POST', body: JSON.stringify({ code: codigo }) });
}

/** Carga la dirección en la sesión y calcula el envío (en RingoPet, siempre gratis dentro de la zona). */
export function actualizarCliente(direccion: DireccionCarrito): Promise<Carrito> {
  return llamarApi('/cart/update-customer', {
    method: 'POST',
    body: JSON.stringify({ billing_address: direccion, shipping_address: direccion }),
  });
}
