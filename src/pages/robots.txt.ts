import type { APIRoute } from 'astro';
import { urlAbsoluta } from '../lib/url';

// /wp-json/ y /wp-content/ quedan permitidos a propósito: ahí vive la API que
// lee Astro y las imágenes de producto. Solo se bloquean las páginas de
// WooCommerce que ya llevan su propio noindex (carrito, pago, mi cuenta) y
// el admin de WordPress (salvo admin-ajax.php, que usan temas y plugins
// en el front).
export const GET: APIRoute = () =>
  new Response(
    `User-agent: *
Allow: /
Disallow: /carrito/
Disallow: /finalizar-compra/
Disallow: /mi-cuenta/
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php

Sitemap: ${urlAbsoluta('/sitemap.xml')}
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
