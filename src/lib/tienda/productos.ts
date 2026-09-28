import { obtenerJson, obtenerTodasLasPaginas } from './cliente';
import { decodificarEntidades } from '../texto';
import { idsConAncestros, obtenerTodasLasCategorias } from './categorias';
import type { Producto } from './tipos';

/** Ruta local del sitio a partir del permalink de WooCommerce (mismo dominio, misma estructura de URLs). */
export function rutaLocal(permalink: string): string {
  return new URL(permalink).pathname;
}

/** La Store API devuelve nombres con entidades HTML escapadas ("&#8211;"): se decodifican una sola vez acá. */
function normalizar(p: Producto): Producto {
  return {
    ...p,
    name: decodificarEntidades(p.name),
    short_description: decodificarEntidades(p.short_description),
    description: decodificarEntidades(p.description),
    brands: p.brands.map((b) => ({ ...b, name: decodificarEntidades(b.name) })),
    categories: p.categories.map((c) => ({ ...c, name: decodificarEntidades(c.name) })),
  };
}

let cache: Producto[] | null = null;

/**
 * Todos los productos padre del catálogo, con o sin stock (908 en producción:
 * 380 con stock más 528 sin stock que WooCommerce oculta del catálogo por
 * "ocultar productos agotados", pero la Store API los sigue devolviendo si se
 * pide el estado de stock explícitamente). Se usa para generar TODAS las
 * páginas de producto, incluidas las de "sin stock" (nunca se borran).
 * Build time, con caché en memoria para no repetir el fetch entre páginas.
 */
export async function obtenerTodosLosProductos(): Promise<Producto[]> {
  if (cache) return cache;
  cache = (await obtenerTodasLasPaginas<Producto>('/products', { stock_status: 'instock,outofstock,onbackorder' })).map(normalizar);
  return cache;
}

/** Solo los que tienen stock: para portada, categorías, relacionados y búsqueda (nunca se listan los agotados). */
export async function obtenerProductosEnStock(): Promise<Producto[]> {
  return (await obtenerTodosLosProductos()).filter((p) => p.is_in_stock);
}

export async function obtenerProductoPorSlug(slug: string): Promise<Producto | null> {
  const todos = await obtenerTodosLosProductos();
  return todos.find((p) => p.slug === slug) ?? null;
}

/** Productos de una categoría para listarlos (portada/categoría): excluye los agotados. */
export async function obtenerProductosPorCategoria(categoriaId: number): Promise<Producto[]> {
  const enStock = await obtenerProductosEnStock();
  return enStock.filter((p) => p.categories.some((c) => c.id === categoriaId));
}

export async function obtenerProductosRelacionados(producto: Producto, cantidad = 6): Promise<Producto[]> {
  const enStock = await obtenerProductosEnStock();
  const idsCategorias = new Set(producto.categories.map((c) => c.id));
  return enStock
    .filter((p) => p.id !== producto.id && p.categories.some((c) => idsCategorias.has(c.id)))
    .slice(0, cantidad);
}

/** Para la portada: en oferta y más pedidos, siempre desde datos reales de Woo (nunca escritos a mano). */
export async function obtenerEnOferta(cantidad = 12): Promise<Producto[]> {
  return (await obtenerJson<Producto[]>('/products', { on_sale: true, per_page: cantidad })).map(normalizar);
}

export async function obtenerMasPedidos(cantidad = 12): Promise<Producto[]> {
  return (await obtenerJson<Producto[]>('/products', { orderby: 'popularity', per_page: cantidad })).map(normalizar);
}

let cacheRanking: Map<number, number> | null = null;

/**
 * Puesto de cada producto en ventas (0 = el más vendido), para el orden "Más vendidos" de
 * /tienda/. Con caché: si no, cada categoría (35) más /tienda/ más datos.json.ts pedirían
 * el catálogo entero ordenado por popularidad cada una, por separado.
 */
export async function obtenerRankingPopularidad(): Promise<Map<number, number>> {
  if (cacheRanking) return cacheRanking;
  const enOrden = await obtenerTodasLasPaginas<{ id: number }>('/products', { orderby: 'popularity', stock_status: 'instock' });
  cacheRanking = new Map(enOrden.map((p, i) => [p.id, i]));
  return cacheRanking;
}

/**
 * Primera tanda de /tienda/ o de una categoría (con sus subcategorías), ya en el orden por
 * defecto ("Más vendidos"), para el HTML del build — el resto lo arma el navegador desde
 * datos.json.ts con el mismo criterio. Sin categoriaId: todo el catálogo con stock.
 */
export async function obtenerProductosParaListado(categoriaId?: number): Promise<Producto[]> {
  const [enStock, categorias, ranking] = await Promise.all([obtenerProductosEnStock(), obtenerTodasLasCategorias(), obtenerRankingPopularidad()]);
  const filtrados =
    categoriaId === undefined
      ? enStock
      : enStock.filter((p) => idsConAncestros(categorias, p.categories.map((c) => c.id)).includes(categoriaId));
  return [...filtrados].sort((a, b) => (ranking.get(a.id) ?? Infinity) - (ranking.get(b.id) ?? Infinity));
}
