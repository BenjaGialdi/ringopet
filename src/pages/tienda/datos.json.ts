/**
 * JSON compacto, generado en el build, con lo que necesitan los filtros y las tarjetas del
 * listado único de productos (/tienda/ y cada /categoria-producto/.../): un solo fetch en
 * el navegador, filtrado ahí mismo (ver src/scripts/listado-productos.ts). Nunca se llama
 * a esto en el build de las páginas: es un endpoint estático más, como sitemap.xml.ts.
 */
import type { APIRoute } from 'astro';
import { obtenerProductosEnStock, obtenerRankingPopularidad, rutaLocal as rutaProducto } from '../../lib/tienda/productos';
import { obtenerTodasLasCategorias, idsConAncestros, rutaLocal as rutaCategoria } from '../../lib/tienda/categorias';
import { obtenerFechasDeCreacion } from '../../lib/tienda/wordpress';
import { pesoEnKg, precioPorKg } from '../../lib/tienda/precio-por-kg';
import type { ProductoListado, RespuestaListado, CategoriaListado, OpcionFiltro } from '../../lib/tienda/tipos';

export const prerender = true;

const TAX_PESO = 'pa_peso';
const TAX_ETAPA = 'pa_etapa-mascota';
const TAX_TAMANO = 'pa_tamano-mascota';

export const GET: APIRoute = async () => {
  const [productos, categorias, ranking, creados] = await Promise.all([
    obtenerProductosEnStock(),
    obtenerTodasLasCategorias(),
    obtenerRankingPopularidad(),
    obtenerFechasDeCreacion(),
  ]);

  const marcas = new Map<string, string>();
  const etapas = new Map<string, string>();
  const tamanos = new Map<string, string>();
  const pesos = new Map<string, string>();

  const listado: ProductoListado[] = productos.map((p) => {
    const marca = p.brands[0] ?? null;
    if (marca) marcas.set(marca.slug, marca.name);

    const atributoEtapa = p.attributes.find((a) => a.taxonomy === TAX_ETAPA);
    const atributoTamano = p.attributes.find((a) => a.taxonomy === TAX_TAMANO);
    const atributoPeso = p.attributes.find((a) => a.taxonomy === TAX_PESO);

    atributoEtapa?.terms.forEach((t) => etapas.set(t.slug, t.name));
    atributoTamano?.terms.forEach((t) => tamanos.set(t.slug, t.name));
    atributoPeso?.terms.forEach((t) => pesos.set(t.slug, t.name));

    const precio = Number(p.prices.price_range ? p.prices.price_range.min_amount : p.prices.price);
    const regular = Number(p.prices.regular_price || p.prices.price);
    const precioRegular = p.on_sale && regular > precio ? regular : null;

    // Precio por kilo: solo si el producto tiene un único peso reconocible (un producto
    // variable con varios pesos no tiene un precio por kilo único hasta elegir una
    // variante — eso se calcula en el navegador cuando se selecciona una).
    const unSoloPeso = atributoPeso?.terms.length === 1 ? atributoPeso.terms[0] : null;
    const kg = unSoloPeso ? pesoEnKg(unSoloPeso.name) : null;

    const variantes = p.type === 'variable' && atributoPeso
      ? p.variations
          .map((v) => {
            const nombrePeso = v.attributes.find((a) => a.name.toLowerCase() === atributoPeso.name.toLowerCase())?.value;
            const termino = nombrePeso ? atributoPeso.terms.find((t) => t.name === nombrePeso) : null;
            return termino ? { id: v.id, pesoSlug: termino.slug, pesoNombre: termino.name } : null;
          })
          .filter((v): v is NonNullable<typeof v> => v !== null)
      : [];

    return {
      id: p.id,
      nombre: p.name,
      ruta: rutaProducto(p.permalink),
      imagen: p.images[0]?.src ?? null,
      imagenAlt: p.images[0]?.alt || p.name,
      marcaNombre: marca?.name ?? null,
      marcaSlug: marca?.slug ?? null,
      categorias: idsConAncestros(categorias, p.categories.map((c) => c.id)),
      precio,
      precioRegular,
      enOferta: p.on_sale,
      pesoKg: kg,
      precioPorKg: precioPorKg(precio, kg),
      etapas: atributoEtapa?.terms.map((t) => t.slug) ?? [],
      tamanos: atributoTamano?.terms.map((t) => t.slug) ?? [],
      pesos: atributoPeso?.terms.map((t) => t.slug) ?? [],
      tieneOpciones: p.has_options,
      variantes,
      masVendidosRank: ranking.get(p.id) ?? Number.MAX_SAFE_INTEGER,
      creado: creados.get(p.id) ?? 0,
    } satisfies ProductoListado;
  });

  const nombreOrdenado = (mapa: Map<string, string>): OpcionFiltro[] =>
    Array.from(mapa, ([slug, nombre]) => ({ slug, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const categoriasListado: CategoriaListado[] = categorias.map((c) => ({
    id: c.id,
    nombre: c.name,
    slug: c.slug,
    padre: c.parent,
    ruta: rutaCategoria(c.permalink),
  }));

  const minorUnit = productos[0]?.prices.currency_minor_unit ?? 2;
  const respuesta: RespuestaListado = {
    productos: listado,
    moneda: { decimales: minorUnit, prefijo: productos[0]?.prices.currency_prefix ?? '$ ', sufijo: productos[0]?.prices.currency_suffix ?? '' },
    meta: {
      categorias: categoriasListado,
      marcas: nombreOrdenado(marcas),
      etapas: nombreOrdenado(etapas),
      tamanos: nombreOrdenado(tamanos),
      pesos: Array.from(pesos, ([slug, nombre]) => ({ slug, nombre })).sort(
        (a, b) => (pesoEnKg(a.nombre) ?? 0) - (pesoEnKg(b.nombre) ?? 0) || a.nombre.localeCompare(b.nombre),
      ),
    },
  };

  return new Response(JSON.stringify(respuesta), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
