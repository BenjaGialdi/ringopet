/**
 * Buscador en vivo del encabezado: a diferencia de /busqueda/ (que pega contra la Store API
 * en vivo, porque necesita resultados de cualquier producto), este usa el JSON del catálogo
 * que ya se pide para /tienda/ (src/pages/tienda/datos.json.ts) — instantáneo, sin esperar al
 * servidor, y ya filtrado a productos con stock. "Ver todos los resultados" manda a
 * /busqueda/, que sí vuelve a pedir en vivo (por si cambió algo desde el build).
 */
import type { RespuestaListado, ProductoListado } from '../lib/tienda/tipos';

let datosPromesa: Promise<RespuestaListado> | null = null;
function datos(): Promise<RespuestaListado> {
  if (!datosPromesa) datosPromesa = fetch('/tienda/datos.json', { headers: { Accept: 'application/json' } }).then((r) => r.json());
  return datosPromesa;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function filaHtml(p: ProductoListado, moneda: RespuestaListado['moneda']): string {
  const precio = `${moneda.prefijo}${(p.precio / 10 ** moneda.decimales).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${moneda.sufijo}`;
  return `
    <a href="${p.ruta}" class="flex items-center gap-3 rounded-lg p-2 outline-none hover:bg-fondo-suave focus-visible:bg-fondo-suave" data-resultado>
      ${
        p.imagen
          ? `<img src="${p.imagen}" alt="" width="44" height="44" loading="lazy" class="h-11 w-11 shrink-0 rounded-md bg-fondo-suave object-contain p-0.5" />`
          : '<div class="h-11 w-11 shrink-0 rounded-md bg-fondo-suave"></div>'
      }
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium">${p.nombre}</span>
        ${p.marcaNombre ? `<span class="block text-xs text-texto-suave">${p.marcaNombre}</span>` : ''}
      </span>
      <span class="shrink-0 text-sm font-semibold text-primario-oscuro">${precio}</span>
    </a>`;
}

function abrirPanel(panel: HTMLElement) {
  panel.hidden = false;
  requestAnimationFrame(() => panel.setAttribute('data-abierto', ''));
}
function cerrarPanel(panel: HTMLElement) {
  panel.removeAttribute('data-abierto');
  panel.hidden = true;
}

/** Puede haber más de un buscador del encabezado en el DOM (top bar de compu y de celular): cada uno con su propio estado. */
export function iniciarBusquedaHeader() {
  document.querySelectorAll<HTMLFormElement>('[data-form-busqueda-header]').forEach((form) => {
    const input = form.querySelector<HTMLInputElement>('input[name="q"]');
    const panel = form.querySelector<HTMLElement>('[data-panel-busqueda]');
    const lista = form.querySelector<HTMLElement>('[data-lista-busqueda]');
    const verTodos = form.querySelector<HTMLAnchorElement>('[data-ver-todos-busqueda]');
    if (!input || !panel || !lista) return;

    let temporizador: ReturnType<typeof setTimeout>;

    async function buscar(termino: string) {
      if (termino.length < 2) {
        cerrarPanel(panel!);
        return;
      }
      const { productos, moneda } = await datos();
      const q = normalizar(termino);
      const coincidencias = productos.filter((p) => normalizar(p.nombre).includes(q) || (p.marcaNombre && normalizar(p.marcaNombre).includes(q)))
        .slice(0, 8);
      lista!.innerHTML = coincidencias.length
        ? coincidencias.map((p) => filaHtml(p, moneda)).join('')
        : '<p class="p-3 text-sm text-texto-suave">No encontramos productos con ese nombre.</p>';
      if (verTodos) verTodos.href = `/busqueda/?q=${encodeURIComponent(termino)}`;
      abrirPanel(panel!);
    }

    input.addEventListener('input', () => {
      clearTimeout(temporizador);
      const valor = input.value.trim();
      temporizador = setTimeout(() => buscar(valor), 200);
    });
    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2) buscar(input.value.trim());
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        cerrarPanel(panel!);
        input.blur();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = Array.from(lista!.querySelectorAll<HTMLAnchorElement>('[data-resultado]'));
      if (!items.length) return;
      const actual = items.indexOf(document.activeElement as HTMLAnchorElement);
      const siguiente = e.key === 'ArrowDown' ? Math.min(actual + 1, items.length - 1) : Math.max(actual - 1, 0);
      (actual === -1 && e.key === 'ArrowUp' ? input : items[siguiente]).focus();
    });
    form.querySelector('[data-cerrar-busqueda]')?.addEventListener('click', () => {
      cerrarPanel(panel!);
      input.blur();
    });
    document.addEventListener('click', (e) => {
      if (!form.contains(e.target as Node)) cerrarPanel(panel!);
    });
  });
}
