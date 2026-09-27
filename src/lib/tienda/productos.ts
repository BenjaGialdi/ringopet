import { obtenerJson, obtenerTodasLasPaginas } from './cliente';
import { decodificarEntidades } from '../texto';
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

/** Todos los productos del catálogo (build time, con caché en memoria para no repetir el fetch entre páginas). */
export async function obtenerTodosLosProductos(): Promise<Producto[]> {
  if (cache) return cache;
  cache = (await obtenerTodasLasPaginas<Producto>('/products')).map(normalizar);
  return cache;
}

export async function obtenerProductoPorSlug(slug: string): Promise<Producto | null> {
  const resultado = await obtenerJson<Producto[]>('/products', { slug });
  return resultado[0] ? normalizar(resultado[0]) : null;
}

export async function obtenerProductosPorCategoria(categoriaId: number): Promise<Producto[]> {
  const todos = await obtenerTodosLosProductos();
  return todos.filter((p) => p.categories.some((c) => c.id === categoriaId));
}

export async function obtenerProductosRelacionados(producto: Producto, cantidad = 6): Promise<Producto[]> {
  const todos = await obtenerTodosLosProductos();
  const idsCategorias = new Set(producto.categories.map((c) => c.id));
  return todos
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
