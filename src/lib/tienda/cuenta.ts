/**
 * Todo lo de Mi cuenta (wp-plugin/ringopet-cuenta): sesión, login, pedidos,
 * direcciones y datos. Igual que checkout.ts: rutas relativas, mismo dominio
 * donde está publicado el sitio.
 */
import { encabezadoNonce, fijarSesion, actualizarSesion, limpiarSesion, sesionCacheada, type Sesion } from './sesion-navegador';
import { limpiarCarritoCache, guardarPedidosCache, leerPedidosCache, limpiarPedidosCache } from './cache-navegador';
import type { PedidoResumen, DetallePedidoCuenta, DireccionCuenta, DatosCuenta } from './tipos';

const BASE = '/wp-json/ringopet/v1/cuenta';

export class ErrorCuenta extends Error {
  codigo: string;
  constructor(mensaje: string, codigo: string) {
    super(mensaje);
    this.codigo = codigo;
  }
}

async function llamar<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...encabezadoNonce(),
      ...opciones.headers,
    },
  });
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new ErrorCuenta(cuerpo?.message ?? `Woo respondió ${respuesta.status}`, cuerpo?.code ?? '');
  }
  return cuerpo as T;
}

export { actualizarSesion, sesionCacheada, leerPedidosCache, type Sesion };

export async function ingresar(usuario: string, clave: string, recordarme: boolean): Promise<Sesion> {
  const sesion = await llamar<Sesion>('/ingresar', { method: 'POST', body: JSON.stringify({ usuario, clave, recordarme }) });
  fijarSesion(sesion);
  return sesion;
}

export async function salir(): Promise<void> {
  await llamar('/salir', { method: 'POST' });
  limpiarSesion();
  limpiarCarritoCache();
  limpiarPedidosCache();
}

export async function obtenerPedidos(pagina = 1): Promise<{ pedidos: PedidoResumen[]; pagina: number; total_paginas: number }> {
  const respuesta = await llamar<{ pedidos: PedidoResumen[]; pagina: number; total_paginas: number }>(`/pedidos?pagina=${pagina}`);
  if (pagina === 1) guardarPedidosCache(respuesta.pedidos);
  return respuesta;
}

export function obtenerPedidoCuenta(id: number): Promise<DetallePedidoCuenta> {
  return llamar(`/pedido?id=${id}`);
}

export function obtenerDireccion(): Promise<DireccionCuenta> {
  return llamar('/direcciones');
}

export function guardarDireccion(datos: DireccionCuenta): Promise<{ ok: true }> {
  return llamar('/direcciones', { method: 'POST', body: JSON.stringify(datos) });
}

export function obtenerDatosCuenta(): Promise<DatosCuenta> {
  return llamar('/datos');
}

export function guardarDatosCuenta(datos: DatosCuenta & { clave_actual?: string; clave_nueva?: string }): Promise<{ ok: true }> {
  return llamar('/datos', { method: 'POST', body: JSON.stringify(datos) });
}

export function recuperarClave(usuario: string): Promise<{ ok: true }> {
  return llamar('/recuperar', { method: 'POST', body: JSON.stringify({ usuario }) });
}

export function elegirClaveNueva(key: string, login: string, clave: string): Promise<{ ok: true }> {
  return llamar('/nueva-clave', { method: 'POST', body: JSON.stringify({ key, login, clave }) });
}

/** Para las páginas privadas de Mi cuenta: si no hay sesión, manda a /mi-cuenta/ (con vuelta) y no resuelve. */
export async function requerirSesion(): Promise<Sesion> {
  const sesion = await actualizarSesion();
  if (!sesion.sesion) {
    location.href = `/mi-cuenta/?volver=${encodeURIComponent(location.pathname + location.search)}`;
    return new Promise(() => {});
  }
  return sesion;
}
