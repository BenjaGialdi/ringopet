# RingoPet — sitio híbrido Astro + WooCommerce

Las reglas generales están en `C:\sitios\CLAUDE.md`. Acá va lo específico de
este sitio, que es distinto al resto: no reemplaza a WordPress, convive con
él en el mismo dominio.

## Arquitectura

- WooCommerce (WordPress + tema WoodMart) sigue viva y sigue manejando: pago
  (`/finalizar-compra/`), carrito propio de Woo (`/carrito/`), `/mi-cuenta/`,
  login, pedidos, Mercado Pago, turnos de entrega (ORDDD) y los emails.
- Astro genera: portada (`/`), categorías (`/categoria-producto/.../`),
  productos (`/producto/<slug>/`) y búsqueda (`/busqueda/`), más un carrito
  lateral propio. Todo estático, se sube al mismo `public_html` que
  WordPress.
- Convivencia por existencia de archivo: Apache sirve primero el `index.html`
  que generó Astro; lo que no tiene archivo (`/carrito/`, `/mi-cuenta/`,
  `/wp-admin/`, `/wp-json/`...) cae al `index.php` de WordPress. Ver
  `public/.htaccess`.
- Mismas URLs que ya usa WooCommerce (`/producto/<slug>/`,
  `/categoria-producto/.../`), para no perder posicionamiento.

## Capa de datos: `src/lib/tienda/`

Ningún componente ni página llama a la Store API directo. Todo pasa por acá:

| Archivo | Qué hace |
|---|---|
| `cliente.ts` | fetch base contra `WOO_URL` (build time), paginado |
| `productos.ts` | `obtenerTodosLosProductos`, `obtenerProductoPorSlug`, `obtenerProductosPorCategoria`, `obtenerEnOferta`, `obtenerMasPedidos`. Decodifica entidades HTML de los nombres (la Store API devuelve `&#8211;` en vez de `–`) |
| `categorias.ts` | árbol de categorías, migas de pan, orden Perros/Gatos primero |
| `carrito.ts` | **rutas relativas** (`/wp-json/...`), corre en el navegador del cliente, nunca contra `WOO_URL` |
| `tipos.ts` | tipos de la Store API que usamos |

`WOO_URL` (variable de entorno, `.env` en local / variable de repo en GitHub
Actions) apunta a la tienda que se lee en el build. Hoy: `prueba.ringopet.com.ar`
cuando resuelva (todavía no, ver abajo); mientras tanto se usa
`ringopet.com.ar` **solo para lectura** (GET), nunca para probar el carrito o
el pago. El carrito del navegador siempre pega al mismo dominio donde está
publicado el sitio, sin pasar por `WOO_URL`.

## Página de producto: precio y stock en vivo

El build genera el precio y el stock que tenía WooCommerce en ese momento.
En la página de producto, `src/scripts/producto-variantes.ts` hace un fetch
chico a `/wp-json/wc/store/v1/products/<id>` al elegir una variante (peso) y
actualiza precio/stock sin recargar. Si no hay WooCommerce en el mismo origen
(por ejemplo `npm run dev` en la compu), el fetch falla en silencio y queda
el valor del build.

## Filtros de categoría y búsqueda: todo en el navegador

- `src/scripts/filtros-categoria.ts`: filtra y ordena sobre el HTML ya
  generado (atributos `data-marca`, `data-peso`, `data-etapa`, `data-precio`
  en cada tarjeta), sin pedir nada de nuevo. Paginado con "Mostrar más"
  (lotes de 24).
- `src/scripts/busqueda.ts`: búsqueda en vivo contra
  `/wp-json/wc/store/v1/products?search=...` (ruta relativa, solo funciona
  publicado en el mismo dominio que WooCommerce).

## Imágenes

Las de producto y categoría son las que genera WordPress (con su propio
`srcset`/`sizes`), usadas tal cual: no se procesan con Astro. Con ~380
productos y varias imágenes cada uno, reprocesarlas en cada build sería
lento y no aporta nada, porque WordPress ya las sirve redimensionadas.
El logo y el crédito de Fluxa sí van por `astro:assets` (son un puñado de
archivos fijos, ahí Astro optimiza gratis).

## Carrito lateral

`src/scripts/carrito-ui.ts`: un solo script para todo el sitio. Cualquier
botón `[data-agregar-carrito][data-id]` agrega ese producto al carrito de
WooCommerce (Store API, cookies de sesión + Nonce) y abre el panel. El botón
"Finalizar compra" del panel lleva a `/finalizar-compra/` de Woo con el
mismo carrito.

## Regeneración automática

- `.github/workflows/publicar.yml`: build + FTP. Se dispara con push a
  `main`, a mano, por `repository_dispatch` (evento `regenerar`) y todos los
  días a las 09:00 UTC.
- `wp-plugin/ringopet-regenerar/`: plugin mínimo que, cuando cambia un
  producto en WooCommerce, agrupa los cambios y dispara el
  `repository_dispatch` (como mucho una vez cada 10 minutos). Instrucciones
  en `wp-plugin/README.md`. El token de GitHub va en `wp-config.php` del
  servidor, nunca en este repositorio.

## Pendiente / a confirmar con Benja antes de publicar

- **`prueba.ringopet.com.ar` no resolvía** al arrancar esta sesión (recién
  creado). El build de esta sesión leyó `ringopet.com.ar` en modo
  solo-lectura para no bloquearse. Antes de probar carrito, pago y "Mi
  cuenta" hay que apuntar `WOO_URL` (`.env` local) a la prueba una vez que
  resuelva, y probar ahí, nunca contra el sitio real.
- **`public/.htaccess` reemplaza por completo** al `.htaccess` que ya tiene
  WordPress en el servidor (la publicación sube al mismo `public_html`). Hay
  que traer el `.htaccess` real de Hostinger y pegar sus reglas (permalinks,
  algún plugin de seguridad o caché, etc.) en el bloque marcado con `TODO`
  antes de publicar. El bloque estándar de WordPress ya está como base.
- **Datos que faltan en `src/config/sitio.ts`** (quedaron con `"?"`):
  dirección exacta, número de WhatsApp. Completar antes de publicar (el
  botón flotante de WhatsApp no tiene número real todavía).
- **Reglas de Cloudflare/LiteSpeed**: no cachear `/wp-json/`, `/carrito/`,
  `/finalizar-compra/`, `/mi-cuenta/`; sí cachear los archivos de Astro
  (`/_astro/` ya tiene caché larga e inmutable por nombre con hash). Falta
  configurarlo en el panel de Cloudflare (no es algo que se resuelva desde
  el repositorio).
- **Lighthouse**: no se corrió en esta sesión (necesita el sitio publicado o
  al menos en HTTPS con WooCommerce respondiendo al lado). El JS total del
  sitio da ~22 KB sin comprimir entre todas las páginas (carrito, filtros,
  búsqueda, selector de variante, Embla solo en la portada).
- **WoodMart**: para que el paso de Astro a `/finalizar-compra/` no se
  sienta como otro sitio, conviene que el encabezado/pie de WoodMart usen
  los mismos colores (`#F95D00`) y tipografía que quedaron acá. No se tocó
  WordPress desde esta sesión.
- Filtro "Peso" apareció duplicado en el WoodMart real (dos widgets
  `pa_peso`); acá el filtro de categoría solo usa uno. No es un problema de
  este sitio, es de la configuración de WooCommerce/WoodMart.

## Comandos

```bash
npm run dev      # servidor local (el carrito y el precio en vivo no funcionan: no hay WooCommerce en localhost)
npm run check    # astro check
npm run build    # build completo (lee WOO_URL)
npm run preview  # sirve dist/ ya generado
```
