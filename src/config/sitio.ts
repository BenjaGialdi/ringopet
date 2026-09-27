/**
 * Configuración central del sitio. Es lo primero que se edita al arrancar un cliente.
 * Ningún componente tiene datos del cliente escritos a mano: todo sale de acá.
 */

export interface EnlaceMenu {
  texto: string;
  /** Ruta interna, siempre con barra final. */
  ruta: string;
  destacado?: boolean;
}

export interface RedSocial {
  nombre: string;
  url: string;
}

export interface Colores {
  primario: string;
  sobrePrimario: string;
  acento: string;
  fondo: string;
  fondoSuave: string;
  texto: string;
  textoSuave: string;
  borde: string;
}

export type TipoSchema = 'LocalBusiness' | 'Organization';

export interface Sitio {
  nombre: string;
  descripcion: string;
  /** URL completa, sin barra final. Define también la versión canónica (con o sin www). */
  dominio: string;
  idioma: string;
  locale: string;

  logo: { archivo: string; alt: string; ancho: number; alto: number };
  colores: Colores;
  tipografias: { texto: string; titulos: string };

  contacto: {
    telefono: string;
    telefonoEnlace: string;
    email: string;
    direccion: {
      calle: string;
      localidad: string;
      provincia: string;
      codigoPostal: string;
      pais: string;
    };
    coordenadas: { lat: number; lng: number };
    /** Turnos de entrega que se muestran en la portada, en texto libre (el detalle real lo define ORDDD en el checkout). */
    horarios: { etiqueta: string }[];
  };

  whatsapp: {
    numero: string;
    mensaje: string;
    botonFlotante: boolean;
  };

  redes: RedSocial[];
  /** Enlaces principales del encabezado y el menú lateral (aparte de Carrito y Mi cuenta, que son fijos). */
  menu: EnlaceMenu[];

  imagenCompartir: { archivo: string; alt: string };

  schema: {
    tipo: TipoSchema;
    subtipo?: string;
  };

  analitica: {
    googleAnalytics: string;
    searchConsole: string;
  };

  /** Rutas de WooCommerce que Astro nunca genera ni pisa (ver public/.htaccess). */
  rutasWoo: {
    carrito: string;
    finalizarCompra: string;
    miCuenta: string;
  };

  beneficios: { icono: string; titulo: string; texto: string }[];

  textos: {
    inicio: {
      liquidacionTitulo: string;
      destacadosTitulo: string;
      categoriasTitulo: string;
    };
    noEncontrada: { titulo: string; mensaje: string };
    busqueda: { titulo: string; placeholder: string };
  };
}

export const sitio: Sitio = {
  nombre: 'RingoPet',
  descripcion:
    'Alimento balanceado y productos para mascotas en Córdoba capital, con reparto propio y turno de entrega a coordinar.',
  dominio: 'https://ringopet.com.ar',
  idioma: 'es',
  locale: 'es-AR',

  logo: { archivo: '/logo.webp', alt: 'RingoPet', ancho: 160, alto: 56 },
  colores: {
    primario: '#F95D00',
    sobrePrimario: '#ffffff',
    acento: '#1c1917',
    fondo: '#ffffff',
    fondoSuave: '#f7f5f3',
    texto: '#1c1917',
    textoSuave: '#57534e',
    borde: '#e7e5e4',
  },
  tipografias: { texto: 'Inter', titulos: 'Inter' },

  contacto: {
    telefono: '351 637-1993',
    telefonoEnlace: '+543516371993',
    email: 'info@ringopet.com.ar',
    direccion: {
      calle: '?',
      localidad: 'Córdoba',
      provincia: 'Córdoba',
      codigoPostal: '5000',
      pais: 'AR',
    },
    coordenadas: { lat: -31.4201, lng: -64.1888 },
    horarios: [{ etiqueta: 'Entrega programada: elegís el día y el turno al finalizar tu compra' }],
  },

  whatsapp: {
    numero: '?',
    mensaje: 'Hola, quería consultarte por un producto.',
    botonFlotante: true,
  },

  redes: [],
  menu: [
    { texto: 'Perros', ruta: '/categoria-producto/perros/' },
    { texto: 'Gatos', ruta: '/categoria-producto/gatos/' },
    { texto: 'Conejos', ruta: '/categoria-producto/conejos/' },
  ],

  imagenCompartir: { archivo: '/compartir.jpg', alt: 'RingoPet' },

  schema: { tipo: 'LocalBusiness', subtipo: 'PetStore' },

  analitica: { googleAnalytics: '', searchConsole: '' },

  rutasWoo: {
    carrito: '/carrito/',
    finalizarCompra: '/finalizar-compra/',
    miCuenta: '/mi-cuenta/',
  },

  beneficios: [
    { icono: 'camion', titulo: 'Envío gratis', texto: 'A toda la ciudad desde el monto mínimo de compra.' },
    { icono: 'tarjeta', titulo: 'Todos los medios de pago', texto: 'Tarjetas, transferencia bancaria y más.' },
    { icono: 'calendario', titulo: 'Entrega programada', texto: 'Elegís el día y el turno en el que querés recibir tu pedido.' },
    { icono: 'soporte', titulo: 'Soporte constante', texto: 'Todos los canales de comunicación disponibles para que recibas soporte.' },
  ],

  textos: {
    inicio: {
      liquidacionTitulo: 'Liquidación',
      destacadosTitulo: 'Más pedidos',
      categoriasTitulo: 'Categorías principales',
    },
    noEncontrada: {
      titulo: 'No encontramos esa página',
      mensaje: 'Puede que el enlace esté mal escrito o que el producto ya no esté disponible.',
    },
    busqueda: { titulo: 'Buscar productos', placeholder: 'Buscar productos' },
  },
};
