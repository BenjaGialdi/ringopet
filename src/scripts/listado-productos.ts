/**
 * Listado único de productos (/tienda/ y cada /categoria-producto/.../): filtros, orden,
 * conteos por opción y "mostrar más", todo contra src/pages/tienda/datos.json.ts (un solo
 * fetch). El HTML que ya vino en el build (primera tanda, para SEO) se reemplaza apenas
 * responde el JSON, así el resto de la interacción es siempre contra los mismos datos.
 */
import { tarjetaHtml, iniciarTarjetasInteractivas } from './tarjetas';
import type { ProductoListado, RespuestaListado, OpcionFiltro } from '../lib/tienda/tipos';

const LOTE = 24;

interface Estado {
  categorias: Set<string>;
  marcas: Set<string>;
  etapas: Set<string>;
  tamanos: Set<string>;
  pesos: Set<string>;
  precioMin: number | null;
  precioMax: number | null;
  oferta: boolean;
  buscar: string;
  orden: string;
}

function estadoVacio(): Estado {
  return {
    categorias: new Set(),
    marcas: new Set(),
    etapas: new Set(),
    tamanos: new Set(),
    pesos: new Set(),
    precioMin: null,
    precioMax: null,
    oferta: false,
    buscar: '',
    orden: 'vendidos',
  };
}

function leerEstadoDeUrl(): Estado {
  const p = new URLSearchParams(location.search);
  const set = (clave: string) => new Set((p.get(clave) ?? '').split(',').filter(Boolean));
  return {
    categorias: set('categoria'),
    marcas: set('marca'),
    etapas: set('etapa'),
    tamanos: set('tamano'),
    pesos: set('peso'),
    precioMin: p.get('precio_min') ? Number(p.get('precio_min')) : null,
    precioMax: p.get('precio_max') ? Number(p.get('precio_max')) : null,
    oferta: p.get('oferta') === '1',
    buscar: p.get('buscar') ?? '',
    orden: p.get('orden') ?? 'vendidos',
  };
}

function estadoAUrl(estado: Estado): string {
  const p = new URLSearchParams();
  const put = (clave: string, valores: Set<string>) => {
    if (valores.size) p.set(clave, Array.from(valores).join(','));
  };
  put('categoria', estado.categorias);
  put('marca', estado.marcas);
  put('etapa', estado.etapas);
  put('tamano', estado.tamanos);
  put('peso', estado.pesos);
  if (estado.precioMin !== null) p.set('precio_min', String(estado.precioMin));
  if (estado.precioMax !== null) p.set('precio_max', String(estado.precioMax));
  if (estado.oferta) p.set('oferta', '1');
  if (estado.buscar) p.set('buscar', estado.buscar);
  if (estado.orden !== 'vendidos') p.set('orden', estado.orden);
  const texto = p.toString();
  return texto ? `?${texto}` : location.pathname;
}

export function iniciarListadoProductos() {
  const raiz = document.querySelector<HTMLElement>('[data-listado]');
  if (!raiz) return;

  const categoriaInicial = raiz.dataset.categoriaInicial || '';
  const grilla = raiz.querySelector<HTMLElement>('[data-grilla]');
  const totalEl = raiz.querySelector<HTMLElement>('[data-total-resultados]');
  const sinResultados = raiz.querySelector<HTMLElement>('[data-sin-resultados]');
  const chipsEl = raiz.querySelector<HTMLElement>('[data-chips]');
  const botonMas = raiz.querySelector<HTMLButtonElement>('[data-mostrar-mas]');
  const selectorOrden = raiz.querySelector<HTMLSelectElement>('[data-orden]');
  const contenedorEscritorio = raiz.querySelector<HTMLElement>('[data-filtros-escritorio]');
  const plantilla = document.querySelector<HTMLTemplateElement>('[data-plantilla-filtros]');
  const panelCelular = document.querySelector<HTMLElement>('[data-filtros-celular]');
  const dialogoFiltros = document.querySelector<HTMLDialogElement>('[data-panel-filtros]');
  const botonAbrirFiltros = raiz.querySelector<HTMLButtonElement>('[data-abrir-filtros]');
  const botonCerrarFiltros = document.querySelector<HTMLButtonElement>('[data-cerrar-filtros]');
  const botonVerProductos = document.querySelector<HTMLButtonElement>('[data-ver-productos]');
  if (!grilla || !plantilla || !contenedorEscritorio) return;

  // Un solo bloque de filtros (categoría, buscador, precio) clonado en la columna de compu
  // y en el panel de celular: nunca dos implementaciones, como pidió Benja.
  contenedorEscritorio.appendChild(plantilla.content.cloneNode(true));
  if (panelCelular) panelCelular.appendChild(plantilla.content.cloneNode(true));

  let datos: RespuestaListado | null = null;
  let idPorSlugCategoria = new Map<string, number>();
  let visibles = LOTE;
  let estado = estadoVacio();
  if (categoriaInicial) estado.categorias.add(categoriaInicial);
  Object.assign(estado, leerEstadoDeUrl());
  if (categoriaInicial && estado.categorias.size === 0) estado.categorias.add(categoriaInicial);

  function coincide(p: ProductoListado): boolean {
    if (estado.categorias.size) {
      const ids = Array.from(estado.categorias).map((s) => idPorSlugCategoria.get(s));
      if (!ids.some((id) => id !== undefined && p.categorias.includes(id))) return false;
    }
    if (estado.marcas.size && !(p.marcaSlug && estado.marcas.has(p.marcaSlug))) return false;
    if (estado.etapas.size && !p.etapas.some((e) => estado.etapas.has(e))) return false;
    if (estado.tamanos.size && !p.tamanos.some((t) => estado.tamanos.has(t))) return false;
    if (estado.pesos.size && !p.pesos.some((w) => estado.pesos.has(w))) return false;
    if (estado.oferta && !p.enOferta) return false;
    const unidad = 10 ** (datos?.moneda.decimales ?? 2);
    if (estado.precioMin !== null && p.precio < estado.precioMin * unidad) return false;
    if (estado.precioMax !== null && p.precio > estado.precioMax * unidad) return false;
    if (estado.buscar && !p.nombre.toLowerCase().includes(estado.buscar.toLowerCase())) return false;
    return true;
  }

  function ordenar(lista: ProductoListado[]): ProductoListado[] {
    const copia = [...lista];
    switch (estado.orden) {
      case 'precio-asc':
        return copia.sort((a, b) => a.precio - b.precio);
      case 'precio-desc':
        return copia.sort((a, b) => b.precio - a.precio);
      case 'precio-kg-asc':
        return copia.sort((a, b) => (a.precioPorKg ?? Infinity) - (b.precioPorKg ?? Infinity));
      case 'oferta':
        return copia.sort((a, b) => Number(b.enOferta) - Number(a.enOferta));
      case 'nuevos':
        return copia.sort((a, b) => b.creado - a.creado);
      default:
        return copia.sort((a, b) => a.masVendidosRank - b.masVendidosRank);
    }
  }

  /** Conteo por opción de un grupo, mirando los filtros de TODOS los demás grupos (faceted search de siempre). */
  function contarGrupo(obtenerValores: (p: ProductoListado) => (string | number)[], omitir: keyof Estado): Map<string | number, number> {
    const estadoSinGrupo = { ...estado, [omitir]: omitir === 'oferta' ? false : omitir === 'buscar' ? '' : new Set() };
    const conteo = new Map<string | number, number>();
    for (const p of datos!.productos) {
      if (!coincideCon(p, estadoSinGrupo)) continue;
      for (const v of obtenerValores(p)) conteo.set(v, (conteo.get(v) ?? 0) + 1);
    }
    return conteo;
  }

  // coincide() usa el `estado` cerrado por clausura; para los conteos hace falta la misma
  // lógica pero contra un estado distinto (sin el grupo que se está contando).
  function coincideCon(p: ProductoListado, e: Estado): boolean {
    const guardado = estado;
    estado = e;
    const resultado = coincide(p);
    estado = guardado;
    return resultado;
  }

  function renderGrupoOpciones(selector: string, opciones: OpcionFiltro[], conteos: Map<string | number, number>, activos: Set<string>, tipo: string, grupoWrapper: string) {
    const huboOpciones = opciones.length > 0;
    document.querySelectorAll<HTMLElement>(grupoWrapper).forEach((det) => (det.hidden = !huboOpciones));
    if (!huboOpciones) return;

    const html = opciones
      .map((o) => {
        const n = conteos.get(o.slug) ?? 0;
        const marcado = activos.has(o.slug);
        const deshabilitado = n === 0 && !marcado;
        return `<li>
          <label class="flex min-h-9 cursor-pointer items-center gap-2 text-sm ${deshabilitado ? 'opacity-40' : ''}">
            <input type="checkbox" data-filtro-${tipo} value="${o.slug}" ${marcado ? 'checked' : ''} ${deshabilitado ? 'disabled' : ''} class="h-4 w-4 accent-primario" />
            ${o.nombre} <span class="text-texto-suave">(${n})</span>
          </label>
        </li>`;
      })
      .join('');
    document.querySelectorAll<HTMLElement>(selector).forEach((ul) => (ul.innerHTML = html));
  }

  function sincronizarCategoriaCheckboxes() {
    document.querySelectorAll<HTMLInputElement>('[data-filtro-categoria]').forEach((chk) => {
      chk.checked = estado.categorias.has(chk.value);
      const id = Number(chk.dataset.id);
      const n = idPorSlugCategoria.size ? conteoCategoria.get(id) ?? 0 : 0;
      chk.closest('li,div')?.querySelectorAll(`[data-conteo-categoria="${chk.value}"]`).forEach((span) => (span.textContent = `(${n})`));
    });
  }

  let conteoCategoria = new Map<number, number>();

  function renderChips() {
    if (!chipsEl || !datos) return;
    const chips: { texto: string; quitar: () => void }[] = [];
    const nombreCategoria = (slug: string) => datos!.meta.categorias.find((c) => c.slug === slug)?.nombre ?? slug;
    const nombreOpcion = (lista: OpcionFiltro[], slug: string) => lista.find((o) => o.slug === slug)?.nombre ?? slug;

    estado.categorias.forEach((s) => chips.push({ texto: nombreCategoria(s), quitar: () => estado.categorias.delete(s) }));
    estado.marcas.forEach((s) => chips.push({ texto: nombreOpcion(datos!.meta.marcas, s), quitar: () => estado.marcas.delete(s) }));
    estado.etapas.forEach((s) => chips.push({ texto: nombreOpcion(datos!.meta.etapas, s), quitar: () => estado.etapas.delete(s) }));
    estado.tamanos.forEach((s) => chips.push({ texto: nombreOpcion(datos!.meta.tamanos, s), quitar: () => estado.tamanos.delete(s) }));
    estado.pesos.forEach((s) => chips.push({ texto: nombreOpcion(datos!.meta.pesos, s), quitar: () => estado.pesos.delete(s) }));
    if (estado.oferta) chips.push({ texto: 'En oferta', quitar: () => (estado.oferta = false) });
    if (estado.precioMin !== null || estado.precioMax !== null) {
      chips.push({
        texto: `Precio: ${estado.precioMin ?? 0} – ${estado.precioMax ?? '∞'}`,
        quitar: () => {
          estado.precioMin = null;
          estado.precioMax = null;
        },
      });
    }
    if (estado.buscar) chips.push({ texto: `"${estado.buscar}"`, quitar: () => (estado.buscar = '') });

    chipsEl.innerHTML = chips
      .map(
        (c, i) => `<li><button type="button" data-quitar-chip="${i}" class="inline-flex items-center gap-1 rounded-full border border-borde px-3 py-1.5 text-sm hover:border-primario">
          ${c.texto} <span aria-hidden="true">✕</span>
        </button></li>`,
      )
      .join('');
    chipsEl.querySelectorAll<HTMLButtonElement>('[data-quitar-chip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        chips[Number(btn.dataset.quitarChip)].quitar();
        aplicar(true);
      });
    });
  }

  function renderizar() {
    if (!datos) return;
    const filtrados = ordenar(datos.productos.filter(coincide));

    if (totalEl) totalEl.textContent = String(filtrados.length);
    if (botonVerProductos) botonVerProductos.textContent = `Ver ${filtrados.length} producto${filtrados.length === 1 ? '' : 's'}`;
    if (sinResultados) sinResultados.hidden = filtrados.length > 0;

    const visiblesAhora = filtrados.slice(0, visibles);
    grilla!.innerHTML = visiblesAhora.map((p) => tarjetaHtml(p, datos!.moneda)).join('');
    if (botonMas) botonMas.hidden = filtrados.length <= visibles;

    conteoCategoria = contarGrupo((p) => p.categorias, 'categorias') as Map<number, number>;
    renderGrupoOpciones('[data-lista-marca]', datos.meta.marcas, contarGrupo((p) => (p.marcaSlug ? [p.marcaSlug] : []), 'marcas'), estado.marcas, 'marca', '[data-grupo-marca]');
    renderGrupoOpciones('[data-lista-peso]', datos.meta.pesos, contarGrupo((p) => p.pesos, 'pesos'), estado.pesos, 'peso', '[data-grupo-peso]');
    renderGrupoOpciones('[data-lista-etapa]', datos.meta.etapas, contarGrupo((p) => p.etapas, 'etapas'), estado.etapas, 'etapa', '[data-grupo-etapa]');
    renderGrupoOpciones('[data-lista-tamano]', datos.meta.tamanos, contarGrupo((p) => p.tamanos, 'tamanos'), estado.tamanos, 'tamano', '[data-grupo-tamano]');
    sincronizarCategoriaCheckboxes();
    renderChips();
    iniciarTarjetasInteractivas(datos.moneda);
  }

  function aplicar(nuevaEntradaHistorial: boolean) {
    const url = estadoAUrl(estado);
    if (nuevaEntradaHistorial) history.pushState(estado, '', url);
    else history.replaceState(estado, '', url);
    renderizar();
  }

  // Delegado: cubre los checkboxes de categoría (fijos) y los de marca/peso/etapa/tamaño
  // (se regeneran en cada renderizar(), por eso no se les pone un listener propio).
  document.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.matches('[data-filtro-categoria]')) {
      visibles = LOTE;
      el.checked ? estado.categorias.add(el.value) : estado.categorias.delete(el.value);
      aplicar(true);
    } else if (el.matches('[data-filtro-marca]')) {
      visibles = LOTE;
      el.checked ? estado.marcas.add(el.value) : estado.marcas.delete(el.value);
      aplicar(true);
    } else if (el.matches('[data-filtro-peso]')) {
      visibles = LOTE;
      el.checked ? estado.pesos.add(el.value) : estado.pesos.delete(el.value);
      aplicar(true);
    } else if (el.matches('[data-filtro-etapa]')) {
      visibles = LOTE;
      el.checked ? estado.etapas.add(el.value) : estado.etapas.delete(el.value);
      aplicar(true);
    } else if (el.matches('[data-filtro-tamano]')) {
      visibles = LOTE;
      el.checked ? estado.tamanos.add(el.value) : estado.tamanos.delete(el.value);
      aplicar(true);
    } else if (el.matches('[data-filtro-oferta]')) {
      visibles = LOTE;
      estado.oferta = el.checked;
      aplicar(true);
    } else if (el.matches('[data-precio-min]')) {
      visibles = LOTE;
      estado.precioMin = el.value ? Number(el.value) : null;
      aplicar(true);
    } else if (el.matches('[data-precio-max]')) {
      visibles = LOTE;
      estado.precioMax = el.value ? Number(el.value) : null;
      aplicar(true);
    }
  });

  let temporizadorBusqueda: ReturnType<typeof setTimeout>;
  document.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (!el.matches('[data-buscar-listado]')) return;
    document.querySelectorAll<HTMLInputElement>('[data-buscar-listado]').forEach((otro) => {
      if (otro !== el) otro.value = el.value;
    });
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => {
      visibles = LOTE;
      estado.buscar = el.value.trim();
      aplicar(true);
    }, 300);
  });

  document.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.matches('[data-limpiar-filtros]')) {
      visibles = LOTE;
      const cat = categoriaInicial;
      estado = estadoVacio();
      if (cat) estado.categorias.add(cat);
      document.querySelectorAll<HTMLInputElement>('[data-buscar-listado]').forEach((i) => (i.value = ''));
      document.querySelectorAll<HTMLInputElement>('[data-precio-min],[data-precio-max]').forEach((i) => (i.value = ''));
      aplicar(true);
    }
  });

  selectorOrden?.addEventListener('change', () => {
    estado.orden = selectorOrden.value;
    aplicar(true);
  });

  botonMas?.addEventListener('click', () => {
    visibles += LOTE;
    renderizar();
  });

  botonAbrirFiltros?.addEventListener('click', () => dialogoFiltros?.showModal());
  botonCerrarFiltros?.addEventListener('click', () => dialogoFiltros?.close());
  botonVerProductos?.addEventListener('click', () => dialogoFiltros?.close());

  window.addEventListener('popstate', () => {
    estado = leerEstadoDeUrl();
    if (categoriaInicial && estado.categorias.size === 0) estado.categorias.add(categoriaInicial);
    visibles = LOTE;
    renderizar();
  });

  fetch('/tienda/datos.json')
    .then((r) => r.json())
    .then((respuesta: RespuestaListado) => {
      datos = respuesta;
      idPorSlugCategoria = new Map(datos.meta.categorias.map((c) => [c.slug, c.id]));
      if (selectorOrden) selectorOrden.value = estado.orden;
      const buscarInput = document.querySelector<HTMLInputElement>('[data-buscar-listado]');
      if (buscarInput) buscarInput.value = estado.buscar;
      if (estado.precioMin !== null) document.querySelectorAll<HTMLInputElement>('[data-precio-min]').forEach((i) => (i.value = String(estado.precioMin)));
      if (estado.precioMax !== null) document.querySelectorAll<HTMLInputElement>('[data-precio-max]').forEach((i) => (i.value = String(estado.precioMax)));
      document.querySelectorAll<HTMLInputElement>('[data-filtro-oferta]').forEach((i) => (i.checked = estado.oferta));
      renderizar();
    })
    .catch(() => {
      // Sin datos.json (ej. dev local sin WooCommerce): se queda con lo generado en el build.
    });
}
