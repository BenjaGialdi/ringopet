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
  /** Variante más oscura del primario, solo para texto/etiquetas: el naranja de marca no da 4.5:1 de contraste como texto (AA). Bordes, íconos y fondos grandes siguen usando "primario". */
  primarioOscuro: string;
  sobrePrimario: string;
  acento: string;
  fondo: string;
  fondoSuave: string;
  texto: string;
  textoSuave: string;
  borde: string;
}

/** Tienda online sin local propio: siempre Organization (nunca LocalBusiness, que exige dirección). */
export type TipoSchema = 'Organization';

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
    /** Turnos de entrega que se muestran en la portada, en texto libre (el detalle real lo define ORDDD en el checkout). */
    horarios: { etiqueta: string }[];
  };

  /** Tienda online sin local ni dirección: zona que cubre el reparto propio, para el JSON-LD (areaServed). */
  areaServed: string;

  whatsapp: {
    numero: string;
    mensaje: string;
    botonFlotante: boolean;
  };

  redes: RedSocial[];
  /** Enlaces principales del encabezado y el menú lateral (aparte de Carrito y Mi cuenta, que son fijos). */
  menu: EnlaceMenu[];

  imagenCompartir: { archivo: string; alt: string };

  schema: { tipo: TipoSchema };

  analitica: {
    googleAnalytics: string;
    searchConsole: string;
  };

  /** finalizarCompra ya es una página de Astro (ver src/pages/finalizar-compra/); miCuenta sigue en WordPress. */
  rutas: {
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
    primarioOscuro: '#BA4500',
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
    horarios: [{ etiqueta: 'Entrega programada: elegís el día y el turno al finalizar tu compra' }],
  },

  areaServed: 'Córdoba capital, Argentina',

  // PENDIENTE (regla "Astro solo lee de Woo", ver CLAUDE.md): WooCommerce no
  // tiene un concepto nativo de "WhatsApp de la tienda" y no se detectó ningún
  // plugin de WhatsApp instalado (no aparece en /wp-json/ de prueba.ringopet.com.ar).
  // Este número me lo pasó Benja directo por chat. Si en algún momento se carga
  // en un plugin con su propio ajuste, avisame y lo leo de ahí.
  whatsapp: {
    numero: '5493516371993',
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

  schema: { tipo: 'Organization' },

  analitica: { googleAnalytics: '', searchConsole: '' },

  rutas: {
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
