/**
 * Selector de variante (peso) en la página de producto: cambia el botón de
 * "Añadir al carrito" a la variación elegida y, si el sitio ya está publicado
 * (mismo dominio que WooCommerce), trae precio y stock en vivo desde la Store API.
 * En npm run dev, sin WooCommerce en el mismo origen, el fetch falla y se
 * mantiene el precio/stock generado en el build.
 */
export function iniciarSelectorVariantes() {
  const contenedor = document.querySelector<HTMLElement>('[data-producto]');
  if (!contenedor) return;

  const botones = Array.from(contenedor.querySelectorAll<HTMLButtonElement>('[data-variante]'));
  const boton = contenedor.querySelector<HTMLElement>('[data-agregar-carrito]');
  const precioEl = contenedor.querySelector<HTMLElement>('[data-precio]');
  const stockEl = contenedor.querySelector<HTMLElement>('[data-stock]');
  if (botones.length === 0 || !boton) return;

  async function seleccionar(btn: HTMLButtonElement) {
    botones.forEach((b) => {
      b.classList.toggle('border-primario', b === btn);
      b.classList.toggle('text-primario', b === btn);
      b.setAttribute('aria-pressed', String(b === btn));
    });
    const id = btn.dataset.variante!;
    boton!.setAttribute('data-id', id);

    try {
      const respuesta = await fetch(`/wp-json/wc/store/v1/products/${id}`, { headers: { Accept: 'application/json' } });
      if (!respuesta.ok) return;
      const producto = await respuesta.json();
      if (precioEl) {
        const unidad = 10 ** producto.prices.currency_minor_unit;
        const monto = (Number(producto.prices.price) / unidad).toLocaleString('es-AR', { minimumFractionDigits: 2 });
        precioEl.textContent = `${producto.prices.currency_prefix}${monto}${producto.prices.currency_suffix}`;
      }
      if (stockEl) {
        stockEl.textContent = producto.is_in_stock ? 'En stock' : 'Sin stock';
      }
      (boton as HTMLButtonElement).toggleAttribute('disabled', !producto.is_in_stock);
    } catch {
      // Sin WooCommerce en este origen (ej. dev local): se mantiene el precio del build.
    }
  }

  botones.forEach((b) => b.addEventListener('click', () => seleccionar(b)));
}
