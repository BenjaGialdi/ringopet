import type { APIRoute } from 'astro';
import { sitio } from '../config/sitio';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: sitio.nombre,
      short_name: sitio.nombre,
      description: sitio.descripcion,
      lang: sitio.locale,
      start_url: '/',
      display: 'browser',
      background_color: sitio.colores.fondo,
      theme_color: sitio.colores.primario,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    }),
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
