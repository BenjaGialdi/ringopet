/**
 * Pago: Store API de WooCommerce (checkout) más los dos endpoints propios de
 * wp-plugin/ringopet-entrega (disponibilidad) y wp-plugin/ringopet-pedido
 * (detalle del pedido para "Gracias"). Todo por rutas relativas, mismo
 * dominio donde está publicado el sitio.
 */
import { llamarApi } from './api-navegador';
import type { DireccionCarrito, Disponibilidad, DetallePedido, RespuestaCheckout, Carrito } from './tipos';

export interface BorradorCheckout {
  customer_id: number;
  payment_method: string;
  /** El carrito con los totales ya recalculados para el payment_method del borrador. */
  __experimentalCart: Carrito;
}

export interface DatosCheckout {
  billing_address: DireccionCarrito;
  shipping_address: DireccionCarrito;
  payment_method: 'bacs' | 'woo-mercado-pago-basic';
  create_account?: boolean;
  customer_note?: string;
  extensions?: {
    'order-delivery-date'?: {
      h_deliverydate: string;
      e_deliverydate: string;
      orddd_lite_time_slot: string;
    };
  };
}

export function pagar(datos: DatosCheckout): Promise<RespuestaCheckout> {
  return llamarApi('/checkout', { method: 'POST', body: JSON.stringify(datos) });
}

export function obtenerBorradorCheckout(): Promise<BorradorCheckout> {
  return llamarApi('/checkout');
}

/**
 * Avisa a WooCommerce qué medio de pago se eligió, SIN pagar todavía (PUT, no
 * POST): así, si algún plugin agrega un descuento o un recargo según el medio
 * de pago, el carrito ya recalculado. Devuelve el carrito actualizado.
 */
export async function actualizarMedioDePago(payment_method: string): Promise<Carrito> {
  const borrador = await llamarApi<BorradorCheckout>('/checkout', { method: 'PUT', body: JSON.stringify({ payment_method }) });
  return borrador.__experimentalCart;
}

export async function obtenerDisponibilidadEntrega(): Promise<Disponibilidad> {
  const respuesta = await fetch('/wp-json/ringopet/v1/entrega', { headers: { Accept: 'application/json' } });
  if (!respuesta.ok) throw new Error('No se pudo consultar la disponibilidad de entrega.');
  return respuesta.json();
}

export async function obtenerPedido(id: number, clave: string): Promise<DetallePedido> {
  const respuesta = await fetch(`/wp-json/ringopet/v1/pedido/${id}?key=${encodeURIComponent(clave)}`, {
    headers: { Accept: 'application/json' },
  });
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error(cuerpo?.message ?? 'No encontramos ese pedido.');
  return cuerpo;
}

/** Título de cada medio de pago tal como está cargado en WooCommerce > Ajustes > Pagos (id -> título). */
export async function obtenerTitulosMediosPago(): Promise<Record<string, string>> {
  const respuesta = await fetch('/wp-json/ringopet/v1/medios-pago', { headers: { Accept: 'application/json' } });
  if (!respuesta.ok) throw new Error('No se pudieron consultar los medios de pago.');
  return respuesta.json();
}
