/**
 * Panel de menú del celular (ver Encabezado.astro, <dialog data-menu-lateral>): pestañas
 * "Categorías"/"Menú" y el acordeón de categorías con animación de alto (grid-template-rows,
 * sin medir nada a mano). Un solo listener delegado, vale para cualquier profundidad del árbol.
 */
export function iniciarMenuMobile(root: ParentNode) {
  // Pestañas.
  const pestañas = root.querySelectorAll<HTMLButtonElement>('[data-pestana-mm]');
  const paneles = root.querySelectorAll<HTMLElement>('[data-panel-mm]');
  pestañas.forEach((boton) => {
    boton.addEventListener('click', () => {
      const objetivo = boton.dataset.pestanaMm;
      pestañas.forEach((b) => {
        const activa = b === boton;
        b.classList.toggle('border-primario', activa);
        b.classList.toggle('text-primario-oscuro', activa);
        b.classList.toggle('border-transparent', !activa);
        b.classList.toggle('text-texto-suave', !activa);
        b.setAttribute('aria-selected', String(activa));
      });
      paneles.forEach((p) => {
        p.hidden = p.dataset.panelMm !== objetivo;
      });
    });
  });

  // Acordeón de categorías: delegado, sirve para filas agregadas después (no hace falta acá, pero es gratis).
  root.querySelectorAll<HTMLElement>('[data-hijos-mm]').forEach((el) => {
    el.style.gridTemplateRows = '0fr';
  });

  (root as HTMLElement).addEventListener?.('click', (e) => {
    const boton = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-boton-expandir-mm]');
    if (!boton) return;
    e.preventDefault();
    const fila = boton.closest<HTMLElement>('[data-fila-mm]');
    const hijos = fila?.querySelector<HTMLElement>(':scope > [data-hijos-mm]');
    if (!hijos) return;
    const abierto = boton.getAttribute('aria-expanded') === 'true';
    boton.setAttribute('aria-expanded', String(!abierto));
    boton.toggleAttribute('data-abierto', !abierto);
    boton.querySelector<HTMLElement>('[data-flecha-mm]')!.style.transform = abierto ? '' : 'rotate(90deg)';
    hijos.style.gridTemplateRows = abierto ? '0fr' : '1fr';
  });
}
