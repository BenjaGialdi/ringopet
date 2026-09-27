import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { sitio } from './src/config/sitio';

const familia = (name: string, cssVariable: string) => ({
  provider: fontProviders.fontsource(),
  name,
  cssVariable,
  weights: [400, 700] as [number, ...number[]],
  styles: ['normal'] as ['normal'],
  subsets: ['latin'] as [string, ...string[]],
  fallbacks: ['system-ui', 'sans-serif'],
});

const fuenteTexto = familia(sitio.tipografias.texto, '--fuente-texto');
const fuenteTitulos = familia(sitio.tipografias.titulos, '--fuente-titulos');

// Si títulos y texto usan la misma familia se registra una sola vez (ver global.css).
const fuentes = sitio.tipografias.titulos === sitio.tipografias.texto ? [fuenteTexto] : [fuenteTexto, fuenteTitulos];

export default defineConfig({
  site: sitio.dominio,
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // Sin pedido extra de CSS: el sitio es chico y así no bloquea el render.
    inlineStylesheets: 'always',
  },
  integrations: [
    sitemap({
      // gracias y 404 no se indexan ni entran al sitemap.
      filter: (pagina) => !/\/(gracias|404)\/?$/.test(pagina),
    }),
  ],
  vite: { plugins: [tailwindcss()] },
  fonts: fuentes,
});
