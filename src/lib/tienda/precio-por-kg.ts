/**
 * Precio por kilo: se arma a partir del nombre del término de peso (atributo pa_peso de
 * WooCommerce, ej. "15kg", "500 g", "1,5 Kg") y el precio. Si el nombre no tiene un peso
 * reconocible, devuelve null — nunca se inventa el peso (regla del sitio).
 */
export function pesoEnKg(nombreTermino: string): number | null {
  const coincidencia = nombreTermino.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|gr|gramos?)\b/i);
  if (!coincidencia) return null;
  const numero = Number(coincidencia[1].replace(',', '.'));
  if (!Number.isFinite(numero) || numero <= 0) return null;
  const unidad = coincidencia[2].toLowerCase();
  return unidad.startsWith('k') ? numero : numero / 1000;
}

/** `precio` en unidad menor de moneda (centavos); devuelve el precio por kilo en la misma unidad, o null si no se puede calcular. */
export function precioPorKg(precio: number, kg: number | null): number | null {
  if (!kg || kg <= 0) return null;
  return Math.round(precio / kg);
}
