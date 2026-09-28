/**
 * Copia del carrito (y de los medios de pago) en sessionStorage: el panel
 * lateral, /carrito/ y /finalizar-compra/ pintan esto primero, al instante,
 * y recién después llega la respuesta real de WooCommerce (que siempre gana
 * si difiere: precio, stock, etc.). Nunca falla si sessionStorage no está
 * disponible (navegación privada, etc.): se degrada a "sin caché".
 */
import type { Carrito, RespuestaMediosPago } from './tipos';

const CLAVE_CARRITO = 'ringopet_carrito';
const CLAVE_MEDIOS_PAGO = 'ringopet_medios_pago';

export function guardarCarritoCache(carrito: Carrito): void {
  try {
    sessionStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito));
  } catch {
    /* sessionStorage no disponible: sin caché, no pasa nada. */
  }
}

export function leerCarritoCache(): Carrito | null {
  try {
    const texto = sessionStorage.getItem(CLAVE_CARRITO);
    return texto ? (JSON.parse(texto) as Carrito) : null;
  } catch {
    return null;
  }
}

export function guardarMediosPagoCache(datos: RespuestaMediosPago): void {
  try {
    sessionStorage.setItem(CLAVE_MEDIOS_PAGO, JSON.stringify(datos));
  } catch {
    /* nada */
  }
}

export function leerMediosPagoCache(): RespuestaMediosPago | null {
  try {
    const texto = sessionStorage.getItem(CLAVE_MEDIOS_PAGO);
    return texto ? (JSON.parse(texto) as RespuestaMediosPago) : null;
  } catch {
    return null;
  }
}
