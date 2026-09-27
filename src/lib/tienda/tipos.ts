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
  quantity_limits: { minimum: number; maximum: number; multiple_of: number; editable: boolean };
  name: string;
  short_description: string;
  permalink: string;
  images: ImagenProducto[];
  prices: Precios;
  totals: { line_total: string; line_subtotal: string; currency_minor_unit: number; currency_prefix: string; currency_suffix: string };
  variation: { attribute: string; value: string }[];
}

export interface CuponCarrito {
  code: string;
  totals: { total_discount: string };
}

export interface FeeCarrito {
  id: string;
  name: string;
  totals: { total: string; total_tax: string };
}

export interface TotalesCarrito {
  total_items: string;
  total_discount: string;
  total_fees: string;
  total_shipping: string | null;
  total_price: string;
  currency_minor_unit: number;
  currency_prefix: string;
  currency_suffix: string;
}

export interface TarifaEnvio {
  rate_id: string;
  name: string;
  price: string;
  selected: boolean;
}

export interface ErrorCarrito {
  code: string;
  message: string;
}

export interface Carrito {
  items: ItemCarrito[];
  items_count: number;
  coupons: CuponCarrito[];
  fees: FeeCarrito[];
  totals: TotalesCarrito;
  shipping_address: DireccionCarrito | null;
  billing_address: DireccionCarrito | null;
  needs_payment: boolean;
  needs_shipping: boolean;
  has_calculated_shipping: boolean;
  shipping_rates: { package_id: number; shipping_rates: TarifaEnvio[] }[];
  payment_methods: string[];
  errors: ErrorCarrito[];
}

export interface DireccionCarrito {
  first_name: string;
  last_name: string;
  address_1: string;
  address_2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  phone: string;
  email?: string;
}

export interface RespuestaCheckout {
  order_id: number;
  order_key: string;
  status: string;
  payment_result: {
    payment_status: string;
    redirect_url: string;
  } | null;
}

export interface TurnoEntrega {
  valor: string;
  etiqueta: string;
}

export interface DiaEntrega {
  valor: string;
  iso: string;
  etiqueta: string;
  turnos: TurnoEntrega[];
}

export interface Disponibilidad {
  activo: boolean;
  fecha_obligatoria: boolean;
  turno_obligatorio: boolean;
  con_turnos: boolean;
  etiqueta_fecha: string;
  etiqueta_turno: string;
  nota: string;
  dias: DiaEntrega[];
}

export interface ItemPedido {
  nombre: string;
  cantidad: number;
  total: string;
  imagen: string | null;
  permalink: string | null;
}

export interface CuentaBancaria {
  titular: string;
  banco: string;
  cvu: string;
  alias: string;
}

export interface DetallePedido {
  numero: string;
  estado: string;
  estado_label: string;
  fecha: string;
  metodo_pago: string;
  metodo_pago_titulo: string;
  total: string;
  moneda: string;
  items: ItemPedido[];
  entrega: { etiqueta_fecha: string; fecha: string; etiqueta_turno: string; turno: string } | null;
  transferencia: CuentaBancaria | null;
}
