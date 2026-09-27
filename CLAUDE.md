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
- Convivencia por existencia de archivo: cada página de Astro es una carpeta
  real con su `index.html`, así que Apache la sirve directo. Lo que no es
  una carpeta real (`/carrito/`, `/mi-cuenta/`, rutas de `/wp-json/`...) cae
  al `index.php` de WordPress, como siempre. **Astro no publica ningún
  `.htaccess`** (ver "Publicación" más abajo): hace falta un agregado manual
  de una sola línea al `.htaccess` real del servidor para que esto funcione,
  documentado en `README.md`.
- Mismas URLs que ya usa WooCommerce. Verificado contra los 908 productos y
  las 35 categorías reales: el `permalink`/`link` de la Store API para todos
  ellos sigue el patrón `/producto/<slug>/` y
  `/categoria-producto/<...>/` sin excepciones, que es justo la estructura
  de carpetas que generan `src/pages/producto/[slug].astro` y
  `src/pages/categoria-producto/[...ruta].astro` (arman la ruta a partir del
  propio `permalink`, no de una convención escrita a mano).

## Capa de datos: `src/lib/tienda/`

Ningún componente ni página llama a la Store API directo. Todo pasa por acá:

| Archivo | Qué hace |
|---|---|
| `cliente.ts` | fetch base contra `WOO_URL` (build time), paginado |
| `productos.ts` | `obtenerTodosLosProductos` (908, con y sin stock, para generar TODAS las páginas), `obtenerProductosEnStock`, `obtenerProductoPorSlug`, `obtenerProductosPorCategoria`/`obtenerProductosRelacionados` (solo con stock, para listados), `obtenerEnOferta`, `obtenerMasPedidos`. Decodifica entidades HTML de los nombres (la Store API devuelve `&#8211;` en vez de `–`) |
| `categorias.ts` | árbol de categorías, migas de pan, orden Perros/Gatos primero |
| `carrito.ts` | **rutas relativas** (`/wp-json/...`), corre en el navegador del cliente, nunca contra `WOO_URL` |
| `tipos.ts` | tipos de la Store API que usamos |

`WOO_URL` (variable de entorno, `.env` en local / variable de repo en GitHub
Actions) apunta a la tienda que se lee en el build. Hoy: `prueba.ringopet.com.ar`
(ya resuelve). El carrito del navegador siempre pega al mismo dominio donde
está publicado el sitio, sin pasar por `WOO_URL`.

## Productos sin stock (nunca se borran, se ocultan)

RingoPet tiene activado "ocultar productos agotados del catálogo" en
WooCommerce y nunca borra un producto: lo deja sin stock. Comportamiento:

- **`obtenerTodosLosProductos()`** pide `stock_status=instock,outofstock,onbackorder`
  explícitamente, porque el ajuste de "ocultar agotados" hace que la Store
  API, por defecto (sin ese parámetro), devuelva **solo** los que tienen
  stock. Verificado: sin el parámetro son 380; con `stock_status=outofstock`
  son 528; juntos, 908 — el mismo número que muestra el admin en
  Productos > Todos (que cuenta productos padre, no variantes). Esta
  función genera **todas** las páginas de producto, con o sin stock: un
  producto nunca deja de tener página por quedarse sin stock, según lo
  pedido.
- **Los listados** (portada, categorías, relacionados) usan
  `obtenerProductosEnStock()` / `obtenerProductosPorCategoria()`, que
  filtran por `is_in_stock`: un producto sin stock no aparece ahí. La
  búsqueda en vivo (`busqueda.ts`) no manda `stock_status`, así que hereda
  el mismo comportamiento por defecto de la Store API (solo con stock), sin
  necesidad de filtrar nada del lado de Astro.
- **La página de producto sin stock** muestra "Sin stock", el botón de
  agregar desactivado y un botón "Consultar por WhatsApp" (con un mensaje
  que ya incluye el nombre del producto y su URL).
- **Precio y stock en vivo** (`producto-variantes.ts`): corre siempre al
  cargar la página (no solo al elegir una variante), así que si un producto
  se queda sin stock entre el build y la visita, el botón se desactiva y
  aparece "Sin stock" aunque la página se haya generado con stock. Mismo
  fetch de siempre a `/wp-json/wc/store/v1/products/<id>`.
- **El plugin** (`wp-plugin/ringopet-regenerar/`) escucha, además de guardar
  el producto, los hooks de WooCommerce que disparan solo por cambio de
  stock: `woocommerce_product_set_stock`, `woocommerce_variation_set_stock`,
  `woocommerce_product_set_stock_status` y
  `woocommerce_variation_set_stock_status`. Una venta o un cambio de stock a
  mano dispara la regeneración igual que editar el producto.

## Página de producto: precio y stock en vivo

Ver también la sección de arriba. El build genera el precio y el stock que
tenía WooCommerce en ese momento; en el navegador, `producto-variantes.ts`
los revalida al cargar la página y al elegir una variante (peso), sin
recargar. Si no hay WooCommerce en el mismo origen (por ejemplo `npm run dev`
en la compu), el fetch falla en silencio y queda el valor del build.

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
`srcset`/`sizes`), usadas tal cual: no se procesan con Astro. Con ~900
productos padre y varias imágenes cada uno, reprocesarlas en cada build
sería lento y no aporta nada la mayoría de las veces, porque WordPress ya
las sirve redimensionadas.

**Ojo**: no todas las imágenes tienen un `srcset` con tamaños chicos. Se
detectó al menos un caso (`Large_puppy_tn-1.png`, categoría Perros) donde
WordPress solo tiene el original: se descarga un PNG de 350 KB para
mostrarlo en un cuadro de 190×260 px, y le cuesta ~2 KIB de LCP en
Lighthouse. Es un problema de esa imagen puntual en el servidor, no del
código de Astro (que ya pide el tamaño correcto por `sizes`, pero solo
puede elegir entre lo que WordPress ofrece en el `srcset`). Antes de
publicar en el sitio real conviene revisar en WordPress qué imágenes de
producto no tienen tamaños intermedios generados (Regenerar miniaturas, o
resubirlas) — probablemente las que se cargaron por afuera del flujo normal
de "imagen destacada" de un producto.

El logo y el crédito de Fluxa sí van por `astro:assets` (son un puñado de
archivos fijos, ahí Astro optimiza gratis).

## Carrito lateral

`src/scripts/carrito-ui.ts`: un solo script para todo el sitio. Cualquier
botón `[data-agregar-carrito][data-id]` agrega ese producto al carrito de
WooCommerce (Store API, cookies de sesión + Nonce) y abre el panel. El botón
"Finalizar compra" del panel lleva a `/finalizar-compra/` de Woo con el
mismo carrito.

## Sin local ni dirección física

RingoPet es una tienda online con reparto propio (sin punto de venta al
público), así que:

- `sitio.ts` no tiene `direccion` ni `coordenadas`: tiene `areaServed`
  (`"Córdoba capital, Argentina"`).
- El JSON-LD (`src/lib/schema.ts`) usa `Organization` (nunca
  `LocalBusiness`, que exige domicilio) con `areaServed`, sin `address` ni
  `geo`.
- El pie de página muestra "Reparto propio en Córdoba capital, Argentina" en
  vez de una dirección.

## Contraste de color (WCAG AA)

El naranja de marca `#F95D00` no llega a 4.5:1 de contraste como texto
(blanco sobre naranja da 3.18:1; naranja sobre fondo claro da 2.9:1) — lo
detectó Lighthouse. Se agregó `colores.primarioOscuro` (`#BA4500`, misma
familia de color, ~5:1 con blanco y ~4.5:1 sobre fondo claro) para **texto y
etiquetas**: botones sólidos, precios, enlaces, la insignia "Oferta". El
naranja puro (`primario`) se mantiene para bordes, íconos y la marca en
general, donde el requisito de contraste no aplica igual.

## Regeneración automática

- `.github/workflows/publicar.yml`: build + FTP. Se dispara con push a
  `main`, a mano, por `repository_dispatch` (evento `regenerar`) y todos los
  días a las 09:00 UTC. Necesita la variable `WOO_URL` además de los tres
  secretos de FTP (ver `README.md`).
- `wp-plugin/ringopet-regenerar/`: plugin mínimo que, cuando cambia un
  producto o su stock en WooCommerce, agrupa los cambios y dispara el
  `repository_dispatch` (como mucho una vez cada 10 minutos). Instrucciones
  en `wp-plugin/README.md`. El token de GitHub va en `wp-config.php` del
  servidor, nunca en este repositorio.
- La acción de FTP no borra archivos de WordPress al publicar: solo borra,
  del servidor, lo que ella misma subió antes y ya no está en `dist/`
  (guarda su propio archivo de estado). Como las páginas de producto se
  generan siempre —incluidas las de "sin stock"—, en la práctica una
  página de producto solo desaparece del servidor si el producto se borra
  de verdad en WooCommerce. Detalle en `README.md`.

## Lighthouse móvil (sobre `npm run preview`, build contra `prueba.ringopet.com.ar`)

| Página | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|
| Portada | 99 | 100 | 96 | 100 |
| Categoría (Perros > Alimentos) | 99 | 100 | 96 | 100 |
| Producto | 99 | 100 | 96 | 100 |

Lo que falta para el 100 parejo, en las tres páginas:

- **Rendimiento (99)**: la imagen `Large_puppy_tn-1.png` sin tamaños
  intermedios (ver "Imágenes" más arriba) — no es algo que se arregle desde
  Astro. El resto de la performance (LCP, JS) está al máximo.
- **Buenas prácticas (96)**: un solo audit falla, "errores en la consola",
  y es un falso positivo de probar sin WooCommerce: el carrito hace un
  fetch a `/wp-json/wc/store/v1/cart` al cargar cualquier página para saber
  cuántos ítems mostrar en el ícono, que en `npm run preview` (sin backend)
  responde 404 y Chrome lo loguea como error. En el sitio publicado, con
  WooCommerce en el mismo dominio, esa respuesta es 200 y el audit no debería
  fallar — conviene volver a correr Lighthouse una vez publicado en
  `prueba.ringopet.com.ar` para confirmarlo.

Ya corregido en esta vuelta (antes daba accesibilidad 87 en portada, 95 en
producto): el botón "Categorías" sin nombre accesible en mobile, el enlace
de la imagen de producto en el carrusel sin texto alternativo confiable, y
el input de cantidad sin `<label>`.

## Comandos

```bash
npm run dev      # servidor local (el carrito y el precio en vivo no funcionan: no hay WooCommerce en localhost)
npm run check    # astro check
npm run build    # build completo (lee WOO_URL)
npm run preview  # sirve dist/ ya generado
```

## Pendiente / a confirmar con Benja antes de publicar en el sitio real

- **WhatsApp** ya cargado (`5493516371993`). Falta el mensaje predefinido
  personalizado si lo querés distinto del genérico que quedó en `sitio.ts`.
- **`.htaccess` real**: agregar a mano el `DirectoryIndex` (ver `README.md`)
  en `prueba.ringopet.com.ar` primero, y en el sitio real el día de la
  migración.
- **Reglas de Cloudflare/LiteSpeed**: no cachear `/wp-json/`, `/carrito/`,
  `/finalizar-compra/`, `/mi-cuenta/`; sí cachear los archivos de Astro. Se
  configura en el panel, no desde el repositorio.
- **Imágenes sin tamaños intermedios** en WordPress (ver "Imágenes").
- **WoodMart**: para que el paso de Astro a `/finalizar-compra/` no se
  sienta como otro sitio, conviene que el encabezado/pie de WoodMart usen
  el mismo naranja (`#F95D00`) y tipografía que quedaron acá. No se tocó
  WordPress desde esta sesión.
- Probar carrito, pago (Mercado Pago y transferencia) y Mi cuenta contra
  `prueba.ringopet.com.ar` siguiendo los pasos de `README.md` (subida
  manual, todavía sin secretos de GitHub Actions cargados).
