/**
 * Riel + panel de categorías de escritorio (ver PanelCategorias.astro): abre con hover en el
 * riel o clic en "Categorías" del encabezado, arma las columnas en cascada al pasar el mouse
 * sobre una fila con hijas (alineadas con esa fila, nunca superpuestas) y cierra con 300ms de
 * demora al sacar el mouse de todo el sistema, con Escape o tocando el fondo oscurecido.
 */
interface NodoArbolCategoria {
  id: number;
  nombre: string;
  ruta: string;
  icono: string | null;
  hijos: NodoArbolCategoria[];
}

const DEMORA_CIERRE_MS = 300;

export function iniciarPanelCategorias() {
  const sistema = document.querySelector<HTMLElement>('[data-sistema-categorias]');
  const panel = sistema?.querySelector<HTMLElement>('[data-panel-categorias]');
  const overlay = sistema?.querySelector<HTMLElement>('[data-overlay-categorias]');
  const datosEl = sistema?.querySelector<HTMLScriptElement>('[data-arbol-categorias]');
  if (!sistema || !panel || !overlay || !datosEl) return;

  const arbol: NodoArbolCategoria[] = JSON.parse(datosEl.textContent || '[]');
  const porId = new Map<number, NodoArbolCategoria>();
  (function indexar(nodos: NodoArbolCategoria[]) {
    nodos.forEach((n) => {
      porId.set(n.id, n);
      indexar(n.hijos);
    });
  })(arbol);

  let timeoutCierre: ReturnType<typeof setTimeout> | null = null;
  let columnas: HTMLElement[] = [];
  let abierto = false;

  function cancelarCierre() {
    if (timeoutCierre) {
      clearTimeout(timeoutCierre);
      timeoutCierre = null;
    }
  }

  function cerrarColumnasDesde(nivel: number) {
    while (columnas.length > nivel) {
      columnas.pop()?.remove();
    }
  }

  function abrir() {
    cancelarCierre();
    if (abierto) return;
    abierto = true;
    overlay!.hidden = false;
    panel!.hidden = false;
    requestAnimationFrame(() => {
      overlay!.style.opacity = '1';
      panel!.style.translate = '0';
    });
    document.querySelectorAll('[data-abrir-panel-categorias]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
  }

  function cerrar() {
    cancelarCierre();
    abierto = false;
    overlay!.style.opacity = '0';
    panel!.style.translate = '';
    cerrarColumnasDesde(0);
    setTimeout(() => {
      if (!abierto) {
        overlay!.hidden = true;
        panel!.hidden = true;
      }
    }, 200);
    document.querySelectorAll('[data-abrir-panel-categorias]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }

  function programarCierre() {
    cancelarCierre();
    timeoutCierre = setTimeout(cerrar, DEMORA_CIERRE_MS);
  }

  function construirTarjeta(items: NodoArbolCategoria[], nivel: number): HTMLElement {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'fixed z-40 min-w-[220px] max-w-[280px] rounded-xl border border-borde bg-fondo p-2 shadow-lg';
    const lista = document.createElement('ul');
    items.forEach((nodo) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = nodo.ruta;
      a.className = 'flex h-11 items-center gap-3 rounded-lg px-2 text-sm font-medium hover:bg-fondo-suave';
      if (nodo.icono) {
        const img = document.createElement('img');
        img.src = nodo.icono;
        img.alt = '';
        img.width = 20;
        img.height = 20;
        img.loading = 'lazy';
        img.className = 'h-5 w-5 shrink-0 object-contain';
        a.appendChild(img);
      } else {
        const hueco = document.createElement('span');
        hueco.className = 'h-5 w-5 shrink-0';
        a.appendChild(hueco);
      }
      const nombre = document.createElement('span');
      nombre.className = 'min-w-0 flex-1 truncate';
      nombre.textContent = nodo.nombre;
      a.appendChild(nombre);
      if (nodo.hijos.length > 0) {
        a.insertAdjacentHTML(
          'beforeend',
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="shrink-0 text-texto-suave" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6"/></svg>',
        );
        a.addEventListener('mouseenter', () => mostrarColumna(a, nodo, nivel));
      } else {
        a.addEventListener('mouseenter', () => cerrarColumnasDesde(nivel));
      }
      li.appendChild(a);
      lista.appendChild(li);
    });
    tarjeta.appendChild(lista);
    return tarjeta;
  }

  /** nivel: 1 = primera columna (hijas de una fila del panel raíz), 2 = segunda, etc. */
  function mostrarColumna(fila: HTMLElement, nodo: NodoArbolCategoria, nivel: number) {
    cerrarColumnasDesde(nivel - 1);
    if (nodo.hijos.length === 0) return;

    const tarjeta = construirTarjeta(nodo.hijos, nivel);
    sistema!.appendChild(tarjeta);
    columnas.push(tarjeta);

    const izquierda = nivel === 1 ? panel!.getBoundingClientRect().right : columnas[nivel - 2].getBoundingClientRect().right;
    const filaRect = fila.getBoundingClientRect();
    tarjeta.style.left = `${izquierda}px`;
    tarjeta.style.top = `${filaRect.top}px`;

    requestAnimationFrame(() => {
      const rect = tarjeta.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 8) {
        tarjeta.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
      }
    });
  }

  // Filas del panel raíz (nivel 0): hover arma la columna de nivel 1.
  panel!.querySelectorAll<HTMLAnchorElement>('[data-fila-panel]').forEach((fila) => {
    const id = Number(fila.dataset.id);
    const nodo = porId.get(id);
    if (!nodo) return;
    if (nodo.hijos.length > 0) {
      fila.addEventListener('mouseenter', () => mostrarColumna(fila, nodo, 1));
    } else {
      fila.addEventListener('mouseenter', () => cerrarColumnasDesde(0));
    }
  });

  // Riel: pasar el mouse por cualquier ícono abre el panel (no arma columnas: eso es al entrar al panel).
  const riel = sistema.querySelector<HTMLElement>('[data-riel]');
  riel?.addEventListener('mouseenter', abrir);

  // Botón "Categorías" (riel y encabezado): alterna el panel.
  document.querySelectorAll('[data-abrir-panel-categorias]').forEach((boton) => {
    boton.addEventListener('click', (e) => {
      e.preventDefault();
      if (abierto) cerrar();
      else abrir();
    });
  });

  // Todo el sistema (riel + panel + columnas, aunque estas últimas estén "fuera" del riel
  // visualmente) cancela el cierre al entrar y lo programa al salir — mouseleave no burbujea
  // entre hijos, así que un solo listener acá alcanza para todo el árbol de descendientes.
  sistema.addEventListener('mouseenter', cancelarCierre);
  sistema.addEventListener('mouseleave', programarCierre);

  overlay!.addEventListener('mouseenter', programarCierre);
  overlay!.addEventListener('click', cerrar);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && abierto) cerrar();
  });

  // Reposicionar (o cerrar, más simple) si cambia el tamaño de la ventana con el panel abierto.
  addEventListener('resize', () => {
    if (abierto) cerrar();
  });

  // Fila activa (compu y celular comparten el mismo criterio: la categoría actual o una ancestra suya), en naranja.
  const ruta = location.pathname;
  [...sistema.querySelectorAll<HTMLAnchorElement>('[data-fila-raiz]'), ...panel!.querySelectorAll<HTMLAnchorElement>('[data-fila-panel]')].forEach((fila) => {
    const id = Number(fila.dataset.id);
    const nodo = porId.get(id);
    if (nodo && (ruta === nodo.ruta || ruta.startsWith(nodo.ruta))) {
      fila.classList.add('text-primario-oscuro');
    }
  });
}
