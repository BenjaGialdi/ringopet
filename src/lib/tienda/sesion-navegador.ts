/**
 * Sesión de WordPress (wp-plugin/ringopet-cuenta) para /mi-cuenta/ y para el resto del
 * sitio: en cuanto alguien inicia sesión, WordPress exige un nonce (X-WP-Nonce) en
 * CUALQUIER llamada a /wp-json/* de ese navegador, no solo en las de Mi cuenta (es un
 * chequeo del núcleo de WordPress sobre la cookie de sesión, no algo que pidamos nosotros).
 * A un invitado sin sesión esto no le exige nada.
 *
 * Por eso el nonce se guarda acá, centralizado, y lo usan tanto api-navegador.ts (Store
 * API) como los fetch sueltos a /wp-json/ringopet/v1/* de todo el sitio.
 */
import type { PedidoResumen } from './tipos';

const CLAVE_SESION = 'ringopet_sesion';

export interface Sesion {
  sesion: boolean;
  nombre?: string;
  nonce?: string;
  /** Últimos 5 pedidos del cliente, para el panel de /mi-cuenta/ sin pedirlos aparte. */
  resumen?: { pedidos: PedidoResumen[] };
}

let sesionMemoria: Sesion | null = null;

function leerCache(): Sesion | null {
  try {
    const texto = sessionStorage.getItem(CLAVE_SESION);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

function guardarCache(sesion: Sesion) {
  sesionMemoria = sesion;
  try {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
  } catch {
    /* sin sessionStorage (navegación privada, etc.): sigue funcionando solo con la copia en memoria */
  }
}

export function limpiarSesion() {
  sesionMemoria = null;
  try {
    sessionStorage.removeItem(CLAVE_SESION);
  } catch {
    /* nada que limpiar si no hay sessionStorage */
  }
}

/** Última copia de la sesión conocida, sin pedir nada al servidor (para pintar al instante). */
export function sesionCacheada(): Sesion | null {
  return sesionMemoria ?? leerCache();
}

/** Nonce actual si hay sesión, sin pedir nada al servidor (lee la copia guardada). */
export function nonceActual(): string | null {
  const s = sesionCacheada();
  return s?.sesion && s.nonce ? s.nonce : null;
}

export function encabezadoNonce(): Record<string, string> {
  const nonce = nonceActual();
  return nonce ? { 'X-WP-Nonce': nonce } : {};
}

/** Guarda una sesión ya conocida (por ejemplo, la que devuelve POST /cuenta/ingresar). */
export function fijarSesion(sesion: Sesion) {
  guardarCache(sesion);
}

let pedidoEnCurso: Promise<Sesion> | null = null;

/** Pide /cuenta/sesion al servidor y actualiza la copia guardada. Comparte la llamada si ya hay una en curso. */
export function actualizarSesion(): Promise<Sesion> {
  if (pedidoEnCurso) return pedidoEnCurso;
  pedidoEnCurso = fetch('/wp-json/ringopet/v1/cuenta/sesion', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
    .then((r) => r.json())
    .then((sesion: Sesion) => {
      guardarCache(sesion);
      return sesion;
    })
    .catch(() => ({ sesion: false }) as Sesion)
    .finally(() => {
      pedidoEnCurso = null;
    });
  return pedidoEnCurso;
}
