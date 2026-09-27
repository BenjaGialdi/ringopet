import { sitio } from '../config/sitio';

/** Convierte una ruta ("/nosotros/") o un archivo de public/ en URL absoluta. */
export function urlAbsoluta(ruta: string): string {
  if (/^https?:\/\//.test(ruta)) return ruta;
  return `${sitio.dominio}${ruta.startsWith('/') ? ruta : `/${ruta}`}`;
}

export function enlaceWhatsapp(mensaje: string = sitio.whatsapp.mensaje): string {
  return `https://wa.me/${sitio.whatsapp.numero}?text=${encodeURIComponent(mensaje)}`;
}

export function enlaceMapa(): string {
  const { lat, lng } = sitio.contacto.coordenadas;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function direccionEnUnaLinea(): string {
  const d = sitio.contacto.direccion;
  return `${d.calle}, ${d.localidad}`;
}

/** Fragmento de código de Search Console: acepta el código o la etiqueta completa pegada por error. */
export function codigoSearchConsole(): string {
  const valor = sitio.analitica.searchConsole.trim();
  const coincide = valor.match(/content="([^"]+)"/);
  return coincide ? coincide[1] : valor;
}
