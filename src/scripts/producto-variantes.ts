/**
 * Precio y stock en vivo en la página de producto: al cargar (y al elegir una
 * variante de peso) trae el dato actual desde la Store API y actualiza precio,
 * stock, el botón de agregar y el botón de WhatsApp. Si el sitio corre sin
 * WooCommerce en el mismo origen (ej. npm run dev), el fetch falla en
 * silencio y queda el precio/stock generado en el build.
 */
export function iniciarSelectorVariantes() {
  const contenedor = document.querySelector<HTMLElement>('[data-producto]');
  if (!contenedor) return;

  const botones = Array.from(contenedor.querySelectorAll<HTMLButtonElement>('[data-variante]'));
  const boton = contenedor.querySelector<HTMLButtonElement>('[data-agregar-carrito]');
  const botonWhatsapp = contenedor.querySelector<HTMLElement>('[data-boton-whatsapp-producto]');
  const precioEl = contenedor.querySelector<HTMLElement>('[data-precio]');
  const stockEl = contenedor.querySelector<HTMLElement>('[data-stock]');
  if (!boton) return;

  async function actualizar(id: string) {
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
      if (stockEl) stockEl.textContent = producto.is_in_stock ? 'En stock' : 'Sin stock';
      boton!.toggleAttribute('disabled', !producto.is_in_stock);
      boton!.textContent = producto.is_in_stock ? 'Añadir al carrito' : 'Sin stock';
      botonWhatsapp?.toggleAttribute('hidden', producto.is_in_stock);
    } catch {
      // Sin WooCommerce en este origen (ej. dev local): se mantiene el precio/stock del build.
    }
  }

  function seleccionar(btn: HTMLButtonElement) {
    botones.forEach((b) => {
      b.classList.toggle('border-primario', b === btn);
      b.classList.toggle('text-primario-oscuro', b === btn);
      b.setAttribute('aria-pressed', String(b === btn));
    });
    actualizar(btn.dataset.variante!);
  }

  botones.forEach((b) => b.addEventListener('click', () => seleccionar(b)));

  // Al cargar: revalida el stock/precio de la variante (o el producto simple) ya seleccionada.
  actualizar(boton.dataset.id!);
}
