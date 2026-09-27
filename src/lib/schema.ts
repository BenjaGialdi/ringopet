import { sitio } from '../config/sitio';
import { urlAbsoluta } from './url';
import type { Producto } from './tienda/tipos';

export interface Miga {
  nombre: string;
  /** Ruta interna con barra final. */
  ruta: string;
}

export const idNegocio = `${sitio.dominio}/#negocio`;
export const idSitioWeb = `${sitio.dominio}/#sitio`;

/** Tienda online sin local: Organization con areaServed, sin address ni geo (eso es para LocalBusiness). */
export function nodoNegocio() {
  const { contacto, schema } = sitio;
  return {
    '@type': schema.tipo,
    '@id': idNegocio,
    name: sitio.nombre,
    description: sitio.descripcion,
    url: sitio.dominio,
    logo: urlAbsoluta(sitio.logo.archivo),
    image: urlAbsoluta(sitio.imagenCompartir.archivo),
    telephone: contacto.telefonoEnlace,
    email: contacto.email,
    sameAs: sitio.redes.map((r) => r.url),
    areaServed: sitio.areaServed,
  };
}

export function nodoSitioWeb() {
  return {
    '@type': 'WebSite',
    '@id': idSitioWeb,
    url: sitio.dominio,
    name: sitio.nombre,
    inLanguage: sitio.locale,
    publisher: { '@id': idNegocio },
  };
}

export function nodoMigas(migas: Miga[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: migas.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: m.nombre,
      item: urlAbsoluta(m.ruta),
    })),
  };
}

/** JSON-LD Product con precio y disponibilidad, para la página de producto. */
export function nodoProducto(producto: Producto, ruta: string) {
  const precio = producto.prices.price_range
    ? producto.prices.price_range.min_amount
    : producto.prices.price;
  const unidad = 10 ** producto.prices.currency_minor_unit;
  return {
    '@type': 'Product',
    name: producto.name,
    description: producto.short_description.replace(/<[^>]+>/g, ''),
    sku: producto.sku,
    image: producto.images.map((img) => img.src),
    brand: producto.brands[0] ? { '@type': 'Brand', name: producto.brands[0].name } : undefined,
    offers: {
      '@type': 'Offer',
      url: urlAbsoluta(ruta),
      priceCurrency: 'ARS',
      price: (Number(precio) / unidad).toFixed(2),
      availability: producto.is_in_stock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };
}

/** Serializa para incrustar en <script type="application/ld+json"> sin romper el HTML. */
export function serializarLd(nodos: object[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodos }).replace(/</g, '\\u003c');
}
