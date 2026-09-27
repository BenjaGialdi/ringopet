/**
 * Filtros y orden de la grilla de categoría: todo en el navegador, sobre el HTML
 * ya generado (sin pedir nada de nuevo a WooCommerce). Un solo script, isla chica.
 */
export function iniciarFiltrosCategoria() {
  const grilla = document.querySelector<HTMLElement>('[data-grilla]');
  const panel = document.querySelector<HTMLElement>('[data-filtros]');
  const botonMas = document.querySelector<HTMLButtonElement>('[data-mostrar-mas]');
  const selectorOrden = document.querySelector<HTMLSelectElement>('[data-orden]');
  if (!grilla) return;
  const grillaEl = grilla;

  const items = Array.from(grillaEl.querySelectorAll<HTMLElement>('[data-item]'));
  const LOTE = 24;
  let visibles = LOTE;

  function filtrosActivos(): { marca: string[]; peso: string[]; etapa: string[] } {
    const marca = Array.from(panel?.querySelectorAll<HTMLInputElement>('[data-filtro-marca]:checked') ?? []).map((i) => i.value);
    const peso = Array.from(panel?.querySelectorAll<HTMLInputElement>('[data-filtro-peso]:checked') ?? []).map((i) => i.value);
    const etapa = Array.from(panel?.querySelectorAll<HTMLInputElement>('[data-filtro-etapa]:checked') ?? []).map((i) => i.value);
    return { marca, peso, etapa };
  }

  function coincide(item: HTMLElement, filtros: ReturnType<typeof filtrosActivos>) {
    const marca = item.dataset.marca ?? '';
    const pesos = (item.dataset.peso ?? '').split(' ');
    const etapas = (item.dataset.etapa ?? '').split(' ');
    if (filtros.marca.length && !filtros.marca.includes(marca)) return false;
    if (filtros.peso.length && !filtros.peso.some((p) => pesos.includes(p))) return false;
    if (filtros.etapa.length && !filtros.etapa.some((e) => etapas.includes(e))) return false;
    return true;
  }

  function aplicar() {
    const filtros = filtrosActivos();
    const coinciden = items.filter((item) => coincide(item, filtros));

    if (selectorOrden) {
      const orden = selectorOrden.value;
      if (orden === 'precio-asc') coinciden.sort((a, b) => Number(a.dataset.precio) - Number(b.dataset.precio));
      if (orden === 'precio-desc') coinciden.sort((a, b) => Number(b.dataset.precio) - Number(a.dataset.precio));
    }

    items.forEach((item) => {
      item.hidden = true;
    });
    coinciden.forEach((item, i) => {
      grillaEl.appendChild(item);
      item.hidden = i >= visibles;
    });

    const contador = document.querySelector('[data-total-resultados]');
    if (contador) contador.textContent = String(coinciden.length);
    if (botonMas) botonMas.hidden = coinciden.length <= visibles;
  }

  panel?.addEventListener('change', () => {
    visibles = LOTE;
    aplicar();
  });
  selectorOrden?.addEventListener('change', aplicar);
  botonMas?.addEventListener('click', () => {
    visibles += LOTE;
    aplicar();
  });
  document.querySelector('[data-limpiar-filtros]')?.addEventListener('click', () => {
    panel?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((i) => (i.checked = false));
    visibles = LOTE;
    aplicar();
  });

  aplicar();
}
