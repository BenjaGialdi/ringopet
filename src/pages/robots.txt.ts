import type { APIRoute } from 'astro';
import { urlAbsoluta } from '../lib/url';

// /carrito/, /finalizar-compra/ y /mi-cuenta/ NO se bloquean acá: ya llevan
// su propio "noindex, nofollow" (verificado), y bloquearlas en robots.txt le
// impediría a Google leer esa metaetiqueta. /wp-json/ y /wp-content/ quedan
// permitidos a propósito: ahí vive la API que lee Astro y las imágenes de
// producto. Solo se bloquea el admin de WordPress (salvo admin-ajax.php, que
// usan temas y plugins en el front).
export const GET: APIRoute = () =>
  new Response(
    `User-agent: *
Allow: /
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php

Sitemap: ${urlAbsoluta('/sitemap.xml')}
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
