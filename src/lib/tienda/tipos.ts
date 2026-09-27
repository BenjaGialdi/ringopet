/** Tipos de la Store API pública de WooCommerce (wc/store/v1) que usamos del sitio. */

export interface ImagenProducto {
  id: number;
  src: string;
  thumbnail: string;
  srcset: string;
  sizes: string;
  name: string;
  alt: string;
}

export interface TerminoAtributo {
  id: number;
  name: string;
  slug: string;
}

export interface AtributoProducto {
  id: number;
  name: string;
  taxonomy: string;
  /** true: el atributo genera variaciones (ej. peso). false: es solo informativo/filtrable. */
  has_variations: boolean;
  terms: TerminoAtributo[];
}

export interface VariacionResumen {
  id: number;
  attributes: { name: string; value: string }[];
}

export interface CategoriaResumen {
  id: number;
  name: string;
  slug: string;
  link: string;
}

export interface MarcaResumen {
  id: number;
  name: string;
  slug: string;
  link: string;
}

export interface Precios {
  price: string;
  regular_price: string;
  sale_price: string;
  price_range: { min_amount: string; max_amount: string } | null;
  currency_minor_unit: number;
  currency_prefix: string;
  currency_suffix: string;
}

export interface Producto {
  id: number;
  name: string;
  slug: string;
  type: 'simple' | 'variable' | 'variation';
  permalink: string;
  sku: string;
  short_description: string;
  description: string;
  on_sale: boolean;
  prices: Precios;
  images: ImagenProducto[];
  categories: CategoriaResumen[];
  brands: MarcaResumen[];
  attributes: AtributoProducto[];
  variations: VariacionResumen[];
  is_purchasable: boolean;
  is_in_stock: boolean;
  has_options: boolean;
  add_to_cart: { text: string; description: string };
}

export interface Categoria {
  id: number;
  name: string;
  slug: string;
  description: string;
  parent: number;
  count: number;
  permalink: string;
  image: { src: string; alt: string } | null;
}

export interface ItemCarrito {
  key: string;
  id: number;
  quantity: number;
  name: string;
  short_description: string;
  images: ImagenProducto[];
  prices: Precios;
  totals: { line_total: string; line_subtotal: string; currency_minor_unit: number };
  variation: { attribute: string; value: string }[];
}

export interface Carrito {
  items: ItemCarrito[];
  items_count: number;
  totals: {
    total_price: string;
    currency_minor_unit: number;
    currency_prefix: string;
    currency_suffix: string;
  };
}
