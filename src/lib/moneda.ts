/** Formatea un monto de la Store API (siempre en centavos/subunidad, como string) a texto. */
export function formatearPrecio(monto: string | number, minorUnit: number, prefijo = '$ ', sufijo = ''): string {
  const numero = (Number(monto) / 10 ** minorUnit).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${prefijo}${numero}${sufijo}`;
}
