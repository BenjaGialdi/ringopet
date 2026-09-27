/**
 * Fetch compartido para todo lo que el carrito y el pago hacen en el
 * navegador (Store API, rutas relativas, mismo dominio donde está
 * publicado el sitio, nunca contra WOO_URL). Guarda el Nonce entre
 * llamadas: cada respuesta de la Store API manda uno nuevo.
 */
const BASE = '/wp-json/wc/store/v1';
let nonce = '';

function leerNonce(respuesta: Response) {
  const valor = respuesta.headers.get('Nonce') ?? respuesta.headers.get('X-WC-Store-API-Nonce');
  if (valor) nonce = valor;
}

export class ErrorApi extends Error {
  codigo: string;
  constructor(mensaje: string, codigo: string) {
    super(mensaje);
    this.codigo = codigo;
  }
}

export async function llamarApi<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(nonce ? { Nonce: nonce } : {}),
      ...opciones.headers,
    },
  });
  leerNonce(respuesta);
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new ErrorApi(cuerpo?.message ?? `La tienda respondió ${respuesta.status}`, cuerpo?.code ?? '');
  }
  return cuerpo as T;
}
