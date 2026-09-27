import { obtenerTodasLasPaginas } from './cliente';
import { decodificarEntidades } from '../texto';
import type { Categoria } from './tipos';

let cache: Categoria[] | null = null;

export async function obtenerTodasLasCategorias(): Promise<Categoria[]> {
  if (cache) return cache;
  const categorias = await obtenerTodasLasPaginas<Categoria>('/products/categories');
  cache = categorias.map((c) => ({
    ...c,
    name: decodificarEntidades(c.name),
    description: decodificarEntidades(c.description),
  }));
  return cache;
}

/** Ruta local a partir del link de WooCommerce (mismo dominio, misma estructura de URLs). */
export function rutaLocal(link: string): string {
  return new URL(link).pathname;
}

export async function obtenerCategoriaPorRuta(ruta: string): Promise<Categoria | null> {
  const categorias = await obtenerTodasLasCategorias();
  return categorias.find((c) => rutaLocal(c.permalink) === ruta) ?? null;
}

/** Categorías raíz (Perros, Gatos, Conejos...), con sus hijas directas para el menú y la portada. */
export async function obtenerCategoriasPrincipales(): Promise<Categoria[]> {
  const categorias = await obtenerTodasLasCategorias();
  return ordenarPrincipales(categorias.filter((c) => c.parent === 0));
}

/** Perros y Gatos primero (las especies con más productos), el resto alfabético. */
export function ordenarPrincipales(categorias: Categoria[]): Categoria[] {
  const prioridad = ['perros', 'gatos'];
  return [...categorias].sort((a, b) => {
    const pa = prioridad.indexOf(a.slug);
    const pb = prioridad.indexOf(b.slug);
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    return a.name.localeCompare(b.name);
  });
}

export function hijasDe(categorias: Categoria[], padreId: number): Categoria[] {
  return categorias.filter((c) => c.parent === padreId);
}

/** Cadena de categorías desde la raíz hasta la dada, para las migas de pan. */
export function cadenaDeCategorias(categorias: Categoria[], categoria: Categoria): Categoria[] {
  const cadena = [categoria];
  let actual = categoria;
  while (actual.parent !== 0) {
    const padre = categorias.find((c) => c.id === actual.parent);
    if (!padre) break;
    cadena.unshift(padre);
    actual = padre;
  }
  return cadena;
}
