/**
 * Copia del carrito (y de los medios de pago) en sessionStorage: el panel
 * lateral, /carrito/ y /finalizar-compra/ pintan esto primero, al instante,
 * y recién después llega la respuesta real de WooCommerce (que siempre gana
 * si difiere: precio, stock, etc.). Nunca falla si sessionStorage no está
 * disponible (navegación privada, etc.): se degrada a "sin caché".
 */
import type { Carrito, RespuestaMediosPago, PedidoResumen } from './tipos';

const CLAVE_CARRITO = 'ringopet_carrito';
const CLAVE_MEDIOS_PAGO = 'ringopet_medios_pago';
const CLAVE_PEDIDOS = 'ringopet_pedidos_p1';

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

/** Al cerrar sesión: el carrito de un cliente no debería quedar pintado para el siguiente visitante del navegador. */
export function limpiarCarritoCache(): void {
  try {
    sessionStorage.removeItem(CLAVE_CARRITO);
  } catch {
    /* nada */
  }
}

/** Solo la primera página de /mi-cuenta/pedidos/ (la que se ve al entrar), para pintarla al instante. */
export function guardarPedidosCache(pedidos: PedidoResumen[]): void {
  try {
    sessionStorage.setItem(CLAVE_PEDIDOS, JSON.stringify(pedidos));
  } catch {
    /* nada */
  }
}

export function leerPedidosCache(): PedidoResumen[] | null {
  try {
    const texto = sessionStorage.getItem(CLAVE_PEDIDOS);
    return texto ? (JSON.parse(texto) as PedidoResumen[]) : null;
  } catch {
    return null;
  }
}

export function limpiarPedidosCache(): void {
  try {
    sessionStorage.removeItem(CLAVE_PEDIDOS);
  } catch {
    /* nada */
  }
}
