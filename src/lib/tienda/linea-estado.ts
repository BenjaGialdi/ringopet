/**
 * Línea de avance del pedido (4 pasos) o aviso fuera de línea, a partir de
 * {paso, aviso, texto} que arman los plugins (ringopet-pedido y ringopet-cuenta) leyendo
 * los estados configurables del plugin de repartos. Nada de esto se decide en Astro.
 */
import type { AvancePedido } from './tipos';

const PASOS = ['Pedido recibido', 'Preparando', 'En camino', 'Entregado'];

export function lineaEstadoHtml({ paso, aviso, texto }: AvancePedido): string {
  if (aviso) {
    return `<p class="rounded-lg bg-fondo-suave p-3 text-sm" role="status">${aviso}</p>`;
  }
  if (!paso) return '';

  const pasos = PASOS.map((nombre, i) => {
    const n = i + 1;
    const actual = n === paso;
    const alcanzado = n <= paso;
    const clase = actual ? 'font-semibold text-primario-oscuro' : alcanzado ? 'text-primario-oscuro' : 'text-texto-suave';
    const separador = i > 0 ? '<span class="text-texto-suave" aria-hidden="true">&rsaquo;</span>' : '';
    return `${separador}<li class="${clase}"${actual ? ' aria-current="step"' : ''}>${nombre}</li>`;
  }).join('');

  return `
    <ol class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs sm:text-sm">${pasos}</ol>
    ${texto ? `<p class="mt-1 text-xs text-texto-suave">${texto}</p>` : ''}
  `;
}
