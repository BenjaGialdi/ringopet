/**
 * Llamadas a la API core de WordPress (wp/v2), aparte de la Store API de
 * WooCommerce: se usan solo para el sitemap (fecha real de modificación de
 * cada producto, y las páginas de WordPress que hay que indexar).
 */
import { obtenerTodasLasPaginas, WOO_URL } from './cliente';

const BASE_WP = `${WOO_URL}/wp-json/wp/v2`;

interface ProductoWp {
  id: number;
  modified_gmt: string;
}

interface PaginaWp {
  link: string;
  modified_gmt: string;
  slug: string;
  status: string;
}

/** WordPress devuelve la fecha GMT sin zona ("2026-09-22T19:43:30"): le agrega la "Z" que pide el formato W3C del sitemap. */
function comoFechaUtc(fechaGmt: string): string {
  return `${fechaGmt}Z`;
}

/** Fecha real de modificación de cada producto (id de WordPress -> ISO date), para el <lastmod> del sitemap. */
export async function obtenerFechasDeProductos(): Promise<Map<number, string>> {
  const items = await obtenerTodasLasPaginas<ProductoWp>('/product', { _fields: 'id,modified_gmt' }, BASE_WP);
  return new Map(items.map((p) => [p.id, comoFechaUtc(p.modified_gmt)]));
}

/**
 * Páginas de WordPress publicadas para el sitemap, salvo el carrito, el
 * pago y "Mi cuenta" (esas llevan noindex propio de WooCommerce y no son
 * contenido). La portada ("/") no se incluye: la genera Astro.
 */
export async function obtenerPaginasIndexables(dominio: string): Promise<{ loc: string; lastmod: string }[]> {
  const excluidas = new Set(['carrito', 'finalizar-compra', 'mi-cuenta']);
  const paginas = await obtenerTodasLasPaginas<PaginaWp>('/pages', { _fields: 'link,modified_gmt,slug,status' }, BASE_WP);
  return paginas
    .filter((p) => p.status === 'publish' && !excluidas.has(p.slug) && new URL(p.link).pathname !== '/')
    .map((p) => ({ loc: p.link.replace(new URL(p.link).origin, dominio), lastmod: comoFechaUtc(p.modified_gmt) }));
}
