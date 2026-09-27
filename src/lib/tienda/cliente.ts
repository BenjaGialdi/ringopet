/**
 * Capa única de acceso a la Store API pública de WooCommerce, usada en el build.
 * Ningún componente ni página llama a `fetch` contra WooCommerce directamente:
 * todo pasa por las funciones de este directorio, así el día de mañana se puede
 * cambiar de backend sin tocar las páginas.
 */

const WOO_URL = import.meta.env.WOO_URL ?? 'https://prueba.ringopet.com.ar';
const BASE = `${WOO_URL.replace(/\/$/, '')}/wp-json/wc/store/v1`;

export async function obtenerJson<T>(ruta: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const url = new URL(`${BASE}${ruta}`);
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

/** Trae todas las páginas de un listado (categorías, productos), 100 por página (máximo de la Store API). */
export async function obtenerTodasLasPaginas<T>(ruta: string, paramsExtra: Record<string, string | number | boolean> = {}): Promise<T[]> {
  const porPagina = 100;
  const items: T[] = [];
  let pagina = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = new URL(`${BASE}${ruta}`);
    url.searchParams.set('per_page', String(porPagina));
    url.searchParams.set('page', String(pagina));
    for (const [clave, valor] of Object.entries(paramsExtra)) {
      url.searchParams.set(clave, String(valor));
    }
    const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!respuesta.ok) {
      throw new Error(`Store API ${ruta} respondió ${respuesta.status}: ${await respuesta.text()}`);
    }
    const lote = (await respuesta.json()) as T[];
    items.push(...lote);
    if (pagina >= totalPaginas(respuesta) || lote.length === 0) break;
    pagina += 1;
  }
  return items;
}
