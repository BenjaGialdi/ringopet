/**
 * Capa única de acceso a WooCommerce/WordPress, usada en el build. Ningún
 * componente ni página llama a `fetch` contra WooCommerce directamente:
 * todo pasa por las funciones de este directorio, así el día de mañana se
 * puede cambiar de backend sin tocar las páginas.
 */

export const WOO_URL = (import.meta.env.WOO_URL ?? 'https://prueba.ringopet.com.ar').replace(/\/$/, '');
/** Base de la Store API de WooCommerce (productos, categorías, carrito). */
const BASE_STORE = `${WOO_URL}/wp-json/wc/store/v1`;

export async function obtenerJson<T>(ruta: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const url = new URL(`${BASE_STORE}${ruta}`);
  for (const [clave, valor] of Object.entries(params)) {
    url.searchParams.set(clave, String(valor));
  }
  const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!respuesta.ok) {
    throw new Error(`Store API ${ruta} respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
  return respuesta.json() as Promise<T>;
}

export function totalPaginas(respuesta: Response): number {
  return Number(respuesta.headers.get('X-WP-TotalPages') ?? '1');
}

/**
 * Trae todas las páginas de un listado, 100 por página. Por defecto contra
 * la Store API de WooCommerce; con `base` se puede apuntar a otra API del
 * mismo sitio (por ejemplo `/wp-json/wp/v2`, para el sitemap).
 */
export async function obtenerTodasLasPaginas<T>(
  ruta: string,
  paramsExtra: Record<string, string | number | boolean> = {},
  base: string = BASE_STORE,
): Promise<T[]> {
  const porPagina = 100;
  const items: T[] = [];
  let pagina = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = new URL(`${base}${ruta}`);
    url.searchParams.set('per_page', String(porPagina));
    url.searchParams.set('page', String(pagina));
    for (const [clave, valor] of Object.entries(paramsExtra)) {
      url.searchParams.set(clave, String(valor));
    }
    const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!respuesta.ok) {
      throw new Error(`${ruta} respondió ${respuesta.status}: ${await respuesta.text()}`);
    }
    const lote = (await respuesta.json()) as T[];
    items.push(...lote);
    if (pagina >= totalPaginas(respuesta) || lote.length === 0) break;
    pagina += 1;
  }
  return items;
}
