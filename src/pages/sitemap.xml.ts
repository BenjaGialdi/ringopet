import type { APIRoute } from 'astro';
import { sitio } from '../config/sitio';
import { urlAbsoluta } from '../lib/url';
import { obtenerTodosLosProductos, rutaLocal as rutaProducto } from '../lib/tienda/productos';
import { obtenerTodasLasCategorias, rutaLocal as rutaCategoria } from '../lib/tienda/categorias';
import { obtenerFechasDeProductos, obtenerPaginasIndexables } from '../lib/tienda/wordpress';

export const prerender = true;

interface EntradaSitemap {
  loc: string;
  lastmod?: string;
  imagenes?: string[];
}

function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function entradaXml({ loc, lastmod, imagenes }: EntradaSitemap): string {
  const imagenesXml = (imagenes ?? [])
    .map((src) => `\n    <image:image><image:loc>${escaparXml(src)}</image:loc></image:image>`)
    .join('');
  return `  <url>\n    <loc>${escaparXml(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}${imagenesXml}\n  </url>`;
}

export const GET: APIRoute = async () => {
  const [productos, categorias, fechasProductos, paginasWp] = await Promise.all([
    obtenerTodosLosProductos(),
    obtenerTodasLasCategorias(),
    obtenerFechasDeProductos(),
    obtenerPaginasIndexables(sitio.dominio),
  ]);

  const entradas: EntradaSitemap[] = [];

  entradas.push({ loc: urlAbsoluta('/') });

  // /tienda/: el listado completo, misma plantilla que cada categoría. lastmod = el más
  // reciente de todos los productos (cambia cada vez que cambia cualquier producto).
  let ultimaFechaGeneral: string | undefined;
  for (const fecha of fechasProductos.values()) {
    if (!ultimaFechaGeneral || fecha > ultimaFechaGeneral) ultimaFechaGeneral = fecha;
  }
  entradas.push({ loc: urlAbsoluta('/tienda/'), lastmod: ultimaFechaGeneral });

  const ultimaFechaPorCategoria = new Map<number, string>();
  for (const p of productos) {
    const fecha = fechasProductos.get(p.id);
    if (!fecha) continue;
    for (const c of p.categories) {
      const actual = ultimaFechaPorCategoria.get(c.id);
      if (!actual || fecha > actual) ultimaFechaPorCategoria.set(c.id, fecha);
    }
  }
  for (const categoria of categorias) {
    entradas.push({
      loc: urlAbsoluta(rutaCategoria(categoria.permalink)),
      lastmod: ultimaFechaPorCategoria.get(categoria.id),
    });
  }

  for (const producto of productos) {
    entradas.push({
      loc: urlAbsoluta(rutaProducto(producto.permalink)),
      lastmod: fechasProductos.get(producto.id),
      imagenes: producto.images.slice(0, 5).map((img) => img.src),
    });
  }

  for (const pagina of paginasWp) {
    entradas.push({ loc: pagina.loc, lastmod: pagina.lastmod });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entradas.map(entradaXml).join('\n')}
</urlset>
`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
