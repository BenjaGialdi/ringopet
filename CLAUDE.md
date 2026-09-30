# RingoPet — sitio híbrido Astro + WooCommerce

Las reglas generales están en `C:\sitios\CLAUDE.md`. Acá va lo específico de
este sitio, que es distinto al resto: no reemplaza a WordPress, convive con
él en el mismo dominio.

## Regla fija: Astro es solo el frente

Todo dato de negocio se configura en WooCommerce y Astro lo lee de ahí en el
momento (build o navegador, según corresponda). **Nunca** escribir en el
código: datos bancarios, medios de pago (ni sus títulos), precios, mínimos
de compra, turnos, zonas/localidades ni textos que ya se manejan desde Woo.
Si un dato hace falta y no se encuentra un ajuste de Woo (ni un plugin con
API) que lo tenga, no inventarlo ni copiarlo del HTML como texto fijo:
dejarlo marcado en el código con un comentario `PENDIENTE` explicando qué
falta y avisar en el informe, para decidir entre (a) armar un endpoint de
solo lectura nuevo como los de `wp-plugin/` o (b) confirmar que ese dato no
vive en Woo y va a seguir siendo un valor fijo a propósito.

## Arquitectura

- **WooCommerce es back-end**: WordPress + WoodMart siguen procesando los
  pedidos (Store API, Mercado Pago, ORDDD, stock, emails), pero el visitante
  ya no ve ninguna página de WordPress en la compra ni en Mi cuenta.
- Astro genera: portada (`/`), categorías (`/categoria-producto/.../`),
  productos (`/producto/<slug>/`), búsqueda (`/busqueda/`), carrito
  (`/carrito/`), pago (`/finalizar-compra/`), gracias
  (`/pedido-recibido/`) y Mi cuenta (`/mi-cuenta/` y sus 6 subpáginas, ver
  más abajo). Todo estático, se sube al mismo `public_html` que WordPress.
- Convivencia por existencia de archivo: cada página de Astro es una carpeta
  real con su `index.html`, así que Apache la sirve directo. Lo que no es
  una carpeta real (rutas de `/wp-json/`, subrutas como
  `/finalizar-compra/order-pay/123/` o `/mi-cuenta/order-pay/123/`...) cae
  al `index.php` de WordPress, como siempre — no son carpetas que Astro
  genere, así que siguen yendo a WooCommerce sin que haga falta ninguna
  regla aparte (confirmar `/finalizar-compra/order-pay/` una vez publicado:
  no se pudo probar en esta sesión sin un pedido pendiente de pago real).
  **Astro no publica ningún
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
| `api-navegador.ts` | fetch compartido del navegador contra la Store API (rutas relativas, Nonce entre llamadas). Lo usan `carrito.ts` y `checkout.ts` |
| `carrito.ts` | agregar/quitar/cambiar cantidad, cupón, `actualizarCliente` (dirección + cálculo de envío) |
| `checkout.ts` | `pagar()` (checkout), `obtenerDisponibilidadEntrega()` y `obtenerPedido()` (los dos endpoints propios, ver más abajo) |
| `wordpress.ts` | API core de WordPress (`wp/v2`, no `wc/store`): fecha real de modificación de cada producto y páginas de WordPress a indexar. Solo lo usa `sitemap.xml.ts` |
| `tipos.ts` | tipos de la Store API que usamos |

`src/lib/moneda.ts` tiene el único `formatearPrecio()` del sitio (antes
estaba duplicado en cada script).

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

## Listado único de productos (`/tienda/` y cada categoría)

Una sola plantilla (`src/components/ListadoProductos.astro`) para las dos
cosas que antes eran implementaciones separadas: `/tienda/` (todo el
catálogo, sin categoría aplicada) y cada `/categoria-producto/.../` (misma
plantilla, con esa categoría ya marcada en el árbol). Lo único que cambia
entre una y otra: título, descripción, migas de pan y qué categoría arranca
tildada — el resto (filtros, orden, tarjetas, "mostrar más") es
exactamente el mismo código.

**Datos**: `src/pages/tienda/datos.json.ts` arma en el build un JSON
compacto con los ~380 productos con stock (id, nombre, ruta, imagen, marca,
categorías **con sus ancestros** — así marcar "Perros" en el árbol trae
también los de "Perros > Alimentos" sin que Woo tenga que etiquetar el
producto dos veces —, precio, precio anterior si está en oferta, peso en
kg si se puede calcular con certeza, precio por kilo, etapa, tamaño de
raza, peso, variantes de peso si es un producto variable, puesto en
"Más vendidos" y fecha de creación) más los metadatos para armar las
listas de filtros (nombres de marca/etapa/tamaño/peso que existen de
verdad en el catálogo). `src/scripts/listado-productos.ts` lo pide una
sola vez y filtra, ordena, cuenta por opción y pagina todo en el
navegador — nunca vuelve a pedir nada a Woo salvo el precio/stock en vivo
al elegir un peso (ver más abajo).

**SEO**: la primera tanda (24 productos, en el orden "Más vendidos") va en
el HTML del build, para que un buscador vea contenido real sin JS; el resto
se arma con el JSON. El `<link rel="canonical">` de `Seo.astro` usa
`Astro.url.pathname` nada más (nunca la query string): como ya se genera
así en el build, una URL con filtros (`?marca=...`) automáticamente lleva
canonical a la página sin filtros, sin código aparte. `/tienda/` y cada
categoría están en `sitemap.xml.ts` (indexables, sin excepción).

**Atributos de WooCommerce usados** (verificado en
`prueba.ringopet.com.ar` contra `wc/store/v1/products/attributes`):
`pa_peso` (Peso), `pa_etapa-mascota` (Etapa Mascota: Adulto, Adulto
asumido, Cachorro, Senior) y `pa_tamano-mascota` (Tamaño Mascota: Chica,
Mediana, Grande y combinaciones — nuevo esta vuelta, mapea a "tamaño de
raza"). Marca no es un atributo: es la taxonomía de marcas de WooCommerce
(`brands`), ya usada desde antes.

**"Presentación" no se pudo cargar**: no hay ningún atributo de Woo que
represente eso (bolsa/lata/sachet). Los dos candidatos que existen no
sirven: `pa_medida` son medidas de almohadillas para practicar (N3, N4...,
en cm, para un puñado de productos puntuales) y `pa_talle` mezcla talles
de ropa para mascota con nombres de variantes de shampoo (Buddy, Puppy,
Jabón Blanco Líquido Cremoso...) en el mismo listado — no son un filtro
usable tal cual están cargados. Si "presentación" tiene que existir como
filtro, hace falta cargar un atributo nuevo y limpio en WooCommerce
primero.

**Precio por kilo**: `src/lib/tienda/precio-por-kg.ts` (`pesoEnKg`,
`precioPorKg`), compartido entre el build (`datos.json.ts`,
`TarjetaProducto.astro`) y el navegador (`tarjetas.ts`). Solo se muestra
si el nombre del término de peso tiene un número reconocible (regex
`\d+(kg|g|gr...)`) y el producto tiene un único peso posible: un producto
variable con varios pesos no tiene un precio por kilo fijo hasta elegir
una variante (ahí se calcula en vivo, ver abajo). Nunca se inventa el
peso si no se puede leer con confianza.

**Tarjeta de producto**: un componente para el build
(`TarjetaProducto.astro`: portada, relacionados, primera tanda de
`/tienda/` y categorías) y una función JS gemela para todo lo que arma el
navegador (`src/scripts/tarjetas.ts`: filtros, "mostrar más", búsqueda) —
no se pueden compartir como un solo archivo porque uno corre en el build y
el otro en el navegador, así que se mantienen alineados a mano, con el
mismo diseño y los mismos datos. Selector de peso (si el producto varía
por peso) con precio y stock en vivo al elegir, igual criterio que
`producto-variantes.ts` en la ficha de producto — un solo listener
delegado por página (`iniciarTarjetasInteractivas`, iniciado una vez desde
`Encabezado.astro` para que funcione en cualquier tarjeta del sitio, no
solo en el listado). Si el producto varía por algo que no es peso (sabor,
color...), sigue mostrando "Elegir opciones" hacia la ficha, como antes.

**Filtros**: categoría (árbol completo, selección múltiple, con conteo por
opción), marca, peso, etapa, tamaño de raza, precio (mín/máx), "En
oferta" y un buscador dentro del listado. Cada opción muestra cuántos
productos quedarían si se sumara ese filtro a los ya activos (conteo
"facetado" de toda la vida: se recalcula sobre el catálogo completo
filtrado por todo MENOS el propio grupo que se está contando) — las que
dan 0 quedan deshabilitadas. Filtros activos como etiquetas con su ✕
arriba de la grilla, y "Limpiar todo". Todo en la URL
(`?categoria=&marca=&peso=&etapa=&tamano=&precio_min=&precio_max=&oferta=1&buscar=&orden=`),
con `history.pushState` en cada cambio para que "Atrás" del navegador
vuelva al filtro anterior. Un solo bloque de filtros (`<template>` en
`ListadoProductos.astro`, clonado dos veces) para la columna fija de
compu y el panel que sube desde abajo en celular — nunca dos
implementaciones.

**Orden**: Más vendidos (por defecto, `orderby=popularity` de la Store
API, con caché en el build — `obtenerRankingPopularidad()` — para no
pedir el catálogo entero ordenado una vez por cada una de las 35
categorías más `/tienda/` más `datos.json.ts`), menor/mayor precio, menor
precio por kilo, ofertas primero, más nuevos (fecha real de creación,
`wp/v2/product`).

**Búsqueda** (`src/scripts/busqueda.ts`): sigue siendo en vivo contra
`/wp-json/wc/store/v1/products?search=...` (no contra el listado
estático: necesita resultados de cualquier producto, no solo los primeros
24), pero ahora arma la misma tarjeta que el resto del sitio
(`tarjeta-html` vía `tarjetas.ts`), adaptando la respuesta completa de la
Store API a la misma forma que usa el listado — sin pedir nada extra,
esos campos ya venían en la respuesta y antes se ignoraban.

**`/shop/`**: ahora redirige a `/tienda/` en vez de a la portada (ver
`README.md` — falta el cambio manual en el `.htaccess` real del
servidor).

**Peso del JSON** (`/tienda/datos.json`, ~380 productos con stock): 266 KB
sin comprimir, **25,6 KB con gzip** — el navegador lo pide comprimido
siempre que el servidor lo permita (LiteSpeed lo hace por defecto para
`.json`).

**Rendimiento del build**: al principio el build tardaba más de 5 minutos
por un problema real — `obtenerRankingPopularidad()` (usada por cada una
de las 35 categorías más `/tienda/` más `datos.json.ts`) no tenía caché en
memoria, así que pedía el catálogo entero ordenado por popularidad una vez
por cada una de esas 37 páginas. Con la caché puesta (mismo patrón que ya
usaban `obtenerTodosLosProductos`/`obtenerTodasLasCategorias`), el build
completo quedó en ~55 segundos, en línea con lo que tardaba antes de esta
vuelta.

Pendiente de medir (no se pudo en esta sesión): Lighthouse móvil real de
`/tienda/` y de una categoría contra `prueba.ringopet.com.ar` publicado
(local, con `npm run preview`, no hay WooCommerce para el carrito/precio
en vivo — el mismo límite que ya aplicaba a `/carrito/` y
`/finalizar-compra/`, ver más abajo).

## Revisión de diseño — tanda 1: estructura general del sitio

Primera de 4 tandas de revisión visual, contra capturas reales de la tienda
actual en WoodMart (`.scratch/revision/`, punto 01 de `revision.txt`) —
pixel a pixel, no una idea a interpretar. Esta tanda tocó la estructura del
sitio entero, no una página puntual. Capturas del resultado en
`.scratch/revision/resultado/`.

- **Ancho**: `.contenedor` pasó de `max-w-6xl` (1152px) a `max-w-[1600px]`,
  con más padding lateral en pantallas grandes (`lg:px-10`). Probado de
  360px a 2560px.
- **Íconos de categoría**: WoodMart los guarda en dos campos propios del
  término (`product_cat`), "Icono de categoría" e "Icono de categoría
  grande" — confirmado con `get_term_meta` sobre una categoría cargada de
  verdad (726, "Accesorios" de Gatos). Claves reales:
  **`category_icon`** (chico) y **`category_icon_alt`** (grande), cada uno
  un array con `url` y/o `id` de adjunto. Dos motivos por los que el primer
  intento devolvía `[]`: no se conocía el nombre de la clave (se buscaba
  cualquier meta con "icon" en el nombre) y, aparte,
  `get_term_meta($id)` **sin** pedir una clave puntual no deserializa los
  valores (queda el string serializado crudo `a:2:{...}`) — hay que pedir
  `get_term_meta($id, 'category_icon', true)` clave por clave.
  `GET /wp-json/ringopet/v1/categorias-iconos` (`wp-plugin/ringopet-regenerar`,
  de solo lectura) devuelve `{ "<id>": { "chico": "<url>|null", "grande":
  "<url>|null" } }` — los menús usan `iconoMenu()` (`categorias.ts`): el
  chico y, si falta, el grande; si no hay ninguno, sin ícono (nunca se
  inventa ni queda un hueco). Respaldo si la categoría no tiene ningún
  campo de WoodMart cargado: la imagen de un ítem de menú que enlace a ella
  (ej. Conejos, cargado en Apariencia > Menús — clave de ese meta todavía
  sin confirmar, se busca por patrón). La caché (`transient`, 1 hora) se
  limpia sola al editar o crear una categoría, al editar un menú y, para el
  primer pedido después de cada publicación (no hay hook de "se actualizó
  el plugin" al subir por FTP), comparando `RINGOPET_ICONOS_VERSION` contra
  una opción guardada.
- **Solo categorías con stock**: `categoriasConStock()` en
  `src/lib/tienda/categorias.ts` calcula, a partir del catálogo con stock
  ya cacheado (no un fetch aparte), qué categorías (con sus ancestros)
  tienen al menos un producto — se usa en el riel, el panel y el menú de
  celular.
- **Encabezado de compu, en una sola fila** (`Encabezado.astro`): logo de
  56px de alto, botón "Categorías" (píldora naranja), buscador tipo
  píldora, enlace "Productos" con ícono (a `/tienda/`), espacio flexible,
  ícono de usuario + "Iniciar sesión / Registrarse" (o "Hola, {nombre}",
  pintado al instante desde la sesión cacheada en `sessionStorage`) y el
  carrito como círculo naranja de 44px con la cantidad en un globito
  blanco. Sin segunda fila de enlaces debajo.
- **Riel + panel de categorías de compu** (`src/components/PanelCategorias.astro`
  + `src/scripts/panel-categorias.ts`, un solo sistema: el botón
  "Categorías" del encabezado abre el mismo panel que el riel): riel fijo
  de 64px con solo íconos (24px, sin texto, tooltip con el nombre); al
  pasar el mouse se abre un panel blanco de 280px que desliza desde la
  izquierda (200ms) con el fondo oscurecido al 40%; adentro, las
  categorías principales (ícono 20px, nombre 15px, flecha) en filas de
  44px; al pasar sobre una fila con hijas, una tarjeta se arma **en
  JavaScript** (no con CSS `:hover` puro, por las tres cosas que pedían:
  alinearse con la fila exacta, nunca superponerse entre columnas — se
  posicionan en cascada con `getBoundingClientRect()`, cada una arranca
  donde termina la anterior — y cerrar con 300ms de demora). Un solo
  `mouseenter`/`mouseleave` en el contenedor de todo el sistema (riel +
  panel + tarjetas, aunque estas últimas estén fuera del riel
  visualmente: al ser descendientes del mismo contenedor, `mouseleave` no
  se dispara al pasar de una a otra) cancela o programa el cierre; el
  fondo oscurecido también programa el cierre al entrar y cierra al clic.
  Escape cierra siempre. `body` lleva `lg:padding-left: 64px` para que el
  resto del sitio no quede tapado por el riel.
  - **Bug real que costó encontrar**: Tailwind v4 separó `translate` de
    `transform` en dos propiedades CSS distintas (antes iban compuestas en
    `transform`). La clase `-translate-x-full` del panel usa la propiedad
    `translate`, no `transform` — el primer intento de abrir/cerrar el
    panel por JS hacía `element.style.transform = 'none'`, que no pisaba
    nada (la propiedad real seguía en `translate: -100%`) y el panel nunca
    se movía, aunque `hidden` sí cambiaba. Si se toca esta animación de
    nuevo, hay que tocar `element.style.translate`, no `.transform`.
- **Menú de celular, panel desde la izquierda (85vw, máx. 360px)**
  (`<dialog data-menu-lateral>` en `Encabezado.astro`): buscador arriba;
  pestañas "CATEGORÍAS"/"MENÚ" (la de Menú lleva Nosotros, Contacto,
  Envíos y preguntas frecuentes y Mayorista); filas de 50px con ícono +
  nombre y, si tiene hijas, un botón cuadrado de 50px con flecha aparte
  (no hace falta tocar la fila entera para desplegar, y la fila sigue
  siendo un enlace normal a la categoría). Al desplegar, el botón se pone
  naranja con la flecha rotada y las hijas aparecen con una animación de
  alto (`grid-template-rows: 0fr → 1fr`, sin medir nada a mano) — recursivo
  para cualquier profundidad (`src/components/FilaMenuMobile.astro` +
  `src/scripts/menu-mobile.ts`).
- **Panel "Mi cuenta" de celular** (`<dialog data-cuenta-lateral>`,
  desliza desde la derecha): mismo formulario de login y mismo panel de
  accesos que `/mi-cuenta/`, generalizando `iniciarPaginaCuentaInicio()`
  (`src/scripts/cuenta-inicio.ts`) para aceptar una raíz (`root`, en vez de
  `document` sin acotar — mismo criterio que el bug ya documentado de
  `/carrito/` con atributos duplicados) y una opción `navegar` (en la
  página redirige a `/mi-cuenta/`; en el panel se queda en la página
  actual y solo cambia lo que muestra).
- **Buscador en vivo del encabezado** (`src/scripts/busqueda-header.ts`):
  a diferencia de `/busqueda/` (que pega contra la Store API en vivo), usa
  el JSON que ya se pide para `/tienda/` (`datos.json.ts`) — sin esperar al
  servidor, y ya son solo productos con stock. Desde 2 caracteres, con 200ms
  de espera entre teclas. Desplegable con foto, marca, nombre y precio, más
  "Ver todos los resultados" hacia `/busqueda/?q=...` (esa sí, en vivo, por
  si cambió algo desde el build). En celular ocupa toda la pantalla (mismo
  panel, con clases responsive en vez de un diálogo aparte) y se puede
  navegar con flechas y cerrar con Escape.
- **Botón de WhatsApp flotante**: se corrió hacia arriba en celular
  (`bottom` con `calc()`) para no quedar tapado por la barra inferior
  nueva; en compu sigue en su lugar de siempre.
- **No pude verificar al 100%**: las herramientas de este entorno para
  probar en el navegador (capturas y clics simulados) fallan de forma
  consistente apenas se cambia el tamaño de la ventana a un ancho de
  escritorio (parece un problema del entorno de pruebas, no del sitio: a
  tamaño de celular, sin tocar el tamaño de ventana, los clics andan
  perfecto). Verifiqué el panel de compu inspeccionando el DOM directamente
  (posición, tamaño, estilos calculados — todo correcto) en vez de con una
  captura, y el encabezado de compu sí se pudo capturar antes de que
  apareciera el problema (calza con la referencia). Conviene que lo mires
  vos en un navegador real antes de darlo por cerrado del todo.
- Lighthouse de portada/listado/producto: no se pudo correr en esta vuelta
  (requiere el sitio publicado, no `npm run preview` sin WooCommerce) —
  sigue pendiente junto con el resto de `/tienda/` (ver la sección de
  arriba).

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

## SEO

- **Sitemap** (`src/pages/sitemap.xml.ts`): uno solo, hecho a mano (no
  `@astrojs/sitemap`, que no da lastmod real ni imágenes). Junta:
  - la portada,
  - las 35 categorías (con `<lastmod>` = la fecha del producto más nuevo
    de esa categoría),
  - los 908 productos —**con y sin stock**, un producto sin stock sigue
    indexado, solo deja de listarse (ver "Productos sin stock")—, cada uno
    con su `<lastmod>` real (fecha de modificación en WordPress, vía
    `wp/v2/product`, que a diferencia de la Store API no filtra por stock)
    y hasta 5 `<image:image>` con las fotos del producto,
  - las páginas de WordPress que siguen vivas (`wp/v2/pages`), salvo
    `/carrito/`, `/finalizar-compra/`, `/mi-cuenta/` (ya llevan
    `noindex, nofollow` propio de WooCommerce, verificado), `/driver/` y
    `/tracking/` (del plugin de repartos, con noindex propio agregado desde
    el plugin, ver más abajo), `/shop/` (el archivo de WooCommerce, redirige
    301 a la portada — ver `README.md`) y la home de WordPress (la
    reemplaza la portada de Astro). `/ideas-for-breakfest/` y `/wishlist/`
    (contenido de ejemplo de WoodMart) ya se borraron en WordPress: quedan
    afuera solos, sin necesidad de excluirlas a mano.

- **`robots.txt`** (`src/pages/robots.txt.ts`): permite todo por defecto,
  incluido `/wp-json/`, `/wp-content/` y `/mi-cuenta/` (bloquearla le
  impediría a Google leer el `noindex, nofollow` propio que ya tiene, ese
  sí de WooCommerce). Solo bloquea `/wp-admin/` (con
  `/wp-admin/admin-ajax.php` permitido, lo usan temas y plugins desde el
  front). Apunta a `/sitemap.xml`. `/carrito/`, `/finalizar-compra/` y
  `/pedido-recibido/` ya no dependen de WooCommerce para el noindex: son
  páginas de Astro y llevan `noindex` propio (`<Base noindex>`), tampoco
  bloqueadas en robots.txt por la misma razón que las de arriba.

- **`/driver/` y `/tracking/`** (páginas del plugin de repartos): siguen
  funcionando para quien las use, pero no están en el sitemap y llevan
  `noindex` agregado desde `wp-plugin/ringopet-regenerar/` con el filtro
  `wp_robots` de WordPress (`is_page(['driver', 'tracking'])`, por slug). No
  están bloqueadas en robots.txt: bloquear + noindex a la vez es
  redundante y le complica a Google leer el noindex.

- **Sitemap nativo de WordPress apagado por el plugin**: `wp-plugin/ringopet-regenerar/`
  agrega `add_filter('wp_sitemaps_enabled', '__return_false')`, así
  `/wp-sitemap.xml` no compite con el de Astro. Verificado en
  `prueba.ringopet.com.ar`: hoy no hay ningún plugin de SEO instalado (no
  aparece ningún namespace de Yoast/Rank Math/AIOSEO en `/wp-json/`) y
  `/wp-sitemap.xml` y `/sitemap_index.xml` ya daban 404 antes de tocar nada.
  Si el día de mañana se instala un plugin de SEO, hay que apagar su propio
  sitemap desde los ajustes de ese plugin (el filtro del plugin de acá solo
  cubre el sitemap nativo de WordPress).

- **JSON-LD `Product`** (`src/lib/schema.ts`): `availability` sale de
  `is_in_stock` (`InStock`/`OutOfStock`), ya estaba bien desde la vuelta
  anterior.

- **Título, descripción, canonical, Open Graph, un solo `h1`, migas
  (`BreadcrumbList`)**: ya estaban resueltos en `Seo.astro`/`Base.astro`
  desde el armado inicial, uno por página (portada, categoría, producto).
  Revisado de nuevo en esta vuelta, sin cambios.

- **Paginación de categorías**: no hay URLs separadas por página
  (`/pagina/2/` como en WooCommerce). El "Mostrar más" es solo visual: el
  HTML de la categoría trae **todos** los productos de esa categoría desde
  el primer request (el filtro los oculta con JavaScript después de
  cargar), así que un buscador ve el listado completo sin necesitar una
  segunda URL. No hace falta `rel=next/prev` ni entradas extra en el
  sitemap por esto.

- **Alt de imágenes**: se completó el que faltaba (las miniaturas de la
  galería de producto no tenían nombre accesible para el botón que las
  envuelve).

## Carrito lateral, carrito completo, pago y gracias

- **Carrito lateral** (`src/scripts/carrito-ui.ts`, en el encabezado): un
  solo script para todo el sitio. Cualquier botón
  `[data-agregar-carrito][data-id]` agrega ese producto (Store API, cookies
  de sesión + Nonce) y abre el panel. Ahora tiene dos botones: "Ver
  carrito" (`/carrito/`) y "Finalizar compra" (`/finalizar-compra/`).
- **`/carrito/`** (`src/scripts/pagina-carrito.ts`): carrito completo.
  Cantidades, quitar, cupón (aplicar/quitar), subtotal, descuento, fees
  (recargos o descuentos, ej. por medio de pago) y envío, total. Si el
  carrito tiene un error bloqueante (por ejemplo el monto mínimo, ver
  abajo) el botón "Finalizar compra" queda deshabilitado.

  **Ojo con esto** (bug real, ya corregido): el panel lateral del
  encabezado y esta página usan los mismos nombres de atributo
  (`data-carrito-items`, `data-carrito-subtotal`, `data-carrito-vacio`,
  hay dos de cada uno en el DOM en `/carrito/`). Un `document.querySelector`
  sin acotar agarra el primero que aparece en el documento — el del panel
  lateral, que va antes en el HTML — así que `pagina-carrito.ts` pintaba
  los productos en un `<ul>` oculto dentro de un `<dialog>` que nadie
  abre. Por eso no se veían los productos y el subtotal daba $0,00 (el
  total sí andaba: no hay ningún `data-carrito-total` en el panel
  lateral, no hay colisión ahí). Fix: todo el script busca dentro de
  `[data-pagina-carrito]`, nunca `document.querySelector` suelto. Si se
  agrega un nombre de atributo nuevo compartido entre el panel lateral y
  una página, hay que acotarlo de entrada.

- **`/finalizar-compra/`** (`src/scripts/pagina-checkout.ts`): un solo
  paso. Datos del cliente, dirección (localidad como `<select>` fijo, ver
  abajo), fecha (calendario) y turno de entrega, medio de pago
  (transferencia o Mercado Pago) y el botón de pagar. Si el carrito está
  vacío, redirige a un aviso con enlace a `/carrito/`.

  **Fecha de entrega**: [flatpickr](https://flatpickr.js.org/) (pedido
  explícitamente), en español, semana desde el lunes, solo habilita los
  días que devuelve `/wp-json/ringopet/v1/entrega` (`enable`), sin fecha
  preseleccionada, y muestra `dia.etiqueta` tal cual la manda la API (no
  el formato propio de flatpickr) vía la opción `formatDate`. Se carga
  solo en esta página (el import vive en `pagina-checkout.ts`, ninguna
  otra página lo importa, así que Vite no lo mete en ningún otro bundle).

  **Turno de entrega**: `<select>` común, deshabilitado hasta elegir
  fecha, arranca en "Elegí un turno".

  **Resumen del pedido**: cada producto con imagen, nombre, variante,
  cantidad y precio; subtotal, cupones, fees, envío y total — se pinta
  dos veces (`pintarUnResumen()` recibe la raíz y busca adentro, mismo
  patrón que el fix de arriba): un `<aside>` que en compu queda
  `sticky` debajo del encabezado (con su propio botón de pagar), y un
  `<details>` que en celular aparece plegado arriba del formulario
  mostrando el total. El medio de pago y el botón de pagar "de celular"
  quedan en el flujo normal del formulario (después de las notas), no
  adentro de ninguno de los dos resúmenes, así siempre están alcanzables
  en las dos resoluciones.
- **`/pedido-recibido/`** (`src/scripts/pagina-gracias.ts`): lee
  `?pedido=<id>&key=<clave>` de la URL y pide el detalle a
  `wp-plugin/ringopet-pedido`. Si es transferencia, muestra CVU/Alias y un
  botón de WhatsApp con el número de pedido ya en el mensaje.

### Cómo funciona el pago (Store API + ORDDD)

Probado a mano contra `prueba.ringopet.com.ar` (cookies de sesión reales)
antes de escribir el código:

1. `actualizarCliente(direccion)` → `POST cart/update-customer`: carga la
   dirección y calcula el envío (siempre "Envío gratuito" dentro de la
   zona). **Hace falta llamarlo antes del checkout**: sin esto, el checkout
   devuelve `woocommerce_rest_invalid_shipping_option` aunque la dirección
   ya venga en el body del propio checkout.
2. `pagar(datos)` → `POST checkout`, con
   `extensions['order-delivery-date'] = { h_deliverydate, e_deliverydate, orddd_lite_time_slot }`
   (mismo formato que ya usaba el pago clásico: `h_deliverydate` es
   `j-n-Y`, ej. `"29-9-2026"`). ORDDD ya sabe guardarlo en el pedido; no lo
   hace `ringopet-entrega` (que solo valida y sincroniza con repartos).
3. Sin `payment_result.redirect_url` (transferencia): se redirige a mano a
   `/pedido-recibido/?pedido=<order_id>&key=<order_key>`. Con
   `redirect_url` (Mercado Pago): se redirige ahí directo, es la URL real
   de pago de Mercado Pago.
4. Si la Store API devuelve un error de fecha/turno (el código incluye
   `fecha` o `turno`), `pagina-checkout.ts` vuelve a pedir
   `/wp-json/ringopet/v1/entrega` y repinta los días/turnos, además de
   marcar el campo — tal como se pidió.

**Monto mínimo de compra**: hay un plugin/regla en WooCommerce con un
mínimo de $30.000. Se ve como un `error` más dentro del carrito (mismo
array que cualquier otro error de stock), así que `/carrito/` y
`/finalizar-compra/` ya lo manejan sin código aparte: aparece el mensaje de
WooCommerce tal cual y el botón de pagar se desactiva.

**Localidad**: no es texto libre. Es un `<select>` fijo con las mismas 7
opciones que ya tiene el checkout clásico (Córdoba capital, La Calera,
Saldán, Villa Allende, Mendiolaza, Unquillo, Río Ceballos), relevadas del
HTML real de `/finalizar-compra/` en `prueba.ringopet.com.ar`. La
provincia se manda fija (`"X"`, Córdoba) sin mostrar el campo: solo se
reparte en esa zona.

**Cuenta de cliente**: ver "Cuenta para pedidos de invitado" más abajo.
Astro manda siempre `create_account: false`; quién asigna o crea la cuenta
es `ringopet-pedido`, del lado de WordPress.

**Fees por medio de pago (recargos/descuentos)**: al cambiar el radio de
medio de pago, `actualizarMedioDePago()` manda
`PUT /wc/store/v1/checkout` con `{ payment_method }` — **PUT, no POST**:
actualiza el borrador del pedido y recalcula (moneda, fees, lo que
dependa del medio elegido) sin pagar ni crear el pedido todavía. La
respuesta trae el carrito recalculado en `__experimentalCart`, que se usa
para repintar el resumen. Probado contra `prueba.ringopet.com.ar`: hoy
**no hay ningún fee configurado** (con `bacs` y con
`woo-mercado-pago-basic` el total da igual, `fees` vacío) — el mecanismo
ya queda armado para cuando Benja configure alguno.

**Vuelta de Mercado Pago sin pagar (cancelado, rechazado o pendiente)**:
MP redirige con `back_urls`, que WooCommerce arma él mismo. Probado con un
pedido real (#15032):

- **Cancelado o rechazado**: los dos caen en la misma URL,
  `/carrito/?cancel_order=true&order=<clave>&order_id=<id>&...` — es
  `$pedido->get_cancel_order_url()`, un método nativo de WooCommerce que
  arma la URL del carrito con esos parámetros; WooCommerce usa esa misma
  URL para las dos vueltas (no hay una distinta para "rechazado"). Como
  `/carrito/` es de Astro, WooCommerce nunca la procesa del lado del
  servidor (esa lógica vive en el carrito clásico de WordPress, que acá no
  se usa): el pedido quedaba "pending" para siempre y el cliente volvía sin
  ningún aviso. Ahora `pagina-carrito.ts` detecta `cancel_order=true` y
  llama a `POST /wp-json/ringopet/v1/pedido/<id>/cancelar?key=<clave>`
  (mismo criterio de la clave que la lectura del pedido): si el pedido
  seguía `pending`/`failed` y sin pagar, lo cancela (`update_status`, Woo
  repone el stock solo) y devuelve los productos para agregarlos de nuevo
  al carrito con la Store API (los que sigan con stock; si alguno ya no
  tiene, se sigue con el resto). Si ya estaba pagado (o en cualquier otro
  estado), el endpoint no toca nada y Astro manda a `/pedido-recibido/` de
  ese pedido en vez de tocar el carrito.
  - Para elegir el aviso ("Cancelaste el pago..." vs "El pago fue
    rechazado, podés intentar de nuevo"), se mira si Mercado Pago agregó
    su propio parámetro de estado a esa misma vuelta
    (`collection_status`/`status` = `rejected`) — no se pudo confirmar con
    un pago rechazado real en esta sesión (hace falta una tarjeta de
    prueba que la rechace), así que conviene probarlo antes de dar esto
    por cerrado del todo.
- **Pendiente** (efectivo, Rapipago): no se pudo confirmar con una vuelta
  real de este tipo en esta sesión. Lo más probable, a falta de poder
  probarlo, es que use la misma URL de "pedido recibido" que un pago
  aprobado (`get_checkout_order_received_url()`, ya redirigida a
  `/pedido-recibido/` por `redirigir_a_gracias_astro()`): por eso
  `avance()` ahora también muestra "Tu pago está pendiente" como texto del
  paso 1 para cualquier pedido `pending`/`on-hold` que no sea transferencia
  (antes ese texto era solo para `bacs`). Si Mercado Pago en realidad manda
  la vuelta pendiente a otro lado, avisar para ajustarlo.
- **La notificación de pago de Mercado Pago** (`/?wc-api=...`, la que pasa
  el pedido a "Procesando" cuando se confirma el pago del lado del
  servidor) **sigue llegando a WordPress**: probado en
  `prueba.ringopet.com.ar`, `GET /?wc-api=WC_Gateway_Mercado_Pago` devuelve
  `-1` (la respuesta típica de WooCommerce para un `wc-api` no
  reconocido), no la portada de Astro — así que el `DirectoryIndex` del
  `.htaccess` no le gana a esa ruta. No se tocó nada acá.

### `wp-plugin/ringopet-pedido/` (nuevo)

La Store API tiene un endpoint de lectura de pedido
(`GET wc/store/v1/order/<id>?key&billing_email`) pero no alcanza para
"Gracias": no trae medio de pago, número de pedido ni fecha/turno. Este
plugin agrega `GET /wp-json/ringopet/v1/pedido/<id>?key=<clave>` (la clave
del pedido alcanza, no hace falta el email) con todo lo que falta,
incluidos los datos de transferencia (de WooCommerce > Pagos >
Transferencia bancaria — **ojo**: WooCommerce no tiene campos nativos
CVU/Alias, se mapea `account_number` → CVU y `iban` → Alias, siempre con
los VALORES que haya cargados en esa pantalla; lo único que decide Astro
es el rótulo. Revisar que el mapeo de campos sea el correcto). También
filtra `woocommerce_get_checkout_order_received_url` para que toda vuelta
de pago (incluida Mercado Pago) caiga en `/pedido-recibido/` de Astro.
Detalle en `wp-plugin/README.md`.

También agrega `GET /wp-json/ringopet/v1/medios-pago`: por cada medio de
pago habilitado, título + descripción + ícono, tal cual WooCommerce >
Ajustes > Pagos > [medio] (información pública, ya se ve en cualquier
checkout sin sesión), más el texto de privacidad del pago
(`wc_get_privacy_policy_text('checkout')`). Se cachea 5 minutos
(`get_transient`/`set_transient`) y se limpia sola si se guardan los
ajustes de pagos (`woocommerce_settings_saved`). `pagina-checkout.ts` lo
usa para no tener nada de esto escrito a mano: título, descripción (se
muestra debajo del medio elegido, igual que el checkout clásico), ícono
(el de Mercado Pago es el que trae su propio plugin; "bacs" usa un SVG de
banco genérico hecho en Astro, no es un dato de negocio) y el texto de
privacidad, debajo del botón de pagar.

## Cuenta para pedidos de invitado

Benja activó "pago como invitado" en WooCommerce: Astro manda siempre
`create_account: false`. Quién asigna o crea la cuenta después es
`ringopet-pedido`, con el hook `woocommerce_store_api_checkout_order_processed`:

- Si el pedido ya tiene `customer_id` (cliente con sesión iniciada): no se
  toca nada, sigue como venía funcionando.
- Si no tiene cliente y el email ya existe como usuario: se asigna el
  pedido a esa cuenta (`set_customer_id` + `save`).
- Si el email no existe: se crea la cuenta con `wc_create_new_customer`
  (usuario y contraseña en blanco → WooCommerce los genera solos y manda
  el email de "elegí tu contraseña", el mismo flujo que un alta manual) y
  se le asigna el pedido.

Nunca se inicia sesión automáticamente ni se manda nada de la cuenta al
navegador: es un efecto de lado en WordPress, la respuesta del checkout
para Astro no cambia.

## Mi cuenta (`wp-plugin/ringopet-cuenta/`)

7 páginas nuevas bajo `/mi-cuenta/`, con las cookies nativas de WordPress
(no hay sesión propia de Astro): `/mi-cuenta/` (login o saludo + accesos +
últimos pedidos), `/mi-cuenta/pedidos/` (lista paginada),
`/mi-cuenta/pedido/?id=` (detalle, el servidor valida que sea del cliente
logueado), `/mi-cuenta/direcciones/`, `/mi-cuenta/datos/` (nombre, apellido,
email y cambio de contraseña con la actual), `/mi-cuenta/recuperar/` y
`/mi-cuenta/nueva-clave/?key=&login=`. Plugin independiente de
`ringopet-pedido`/`ringopet-entrega` (se puede desactivar sin romper el
resto): endpoints en `GET/POST /wp-json/ringopet/v1/cuenta/*`.

**Seguridad**: mensajes genéricos en login y recuperación (nunca revelan si
un usuario/email existe), límite de 5 intentos cada 15 minutos por IP y por
usuario (login) o por IP (recuperar, sin bloquear la respuesta — siempre
"ok"), y toda operación sobre pedidos/direcciones/datos usa
`get_current_user_id()`, nunca un id que mande el navegador. El CSRF lo
resuelve el núcleo de WordPress solo (ver más abajo), no hay nada propio.

**El nonce de WordPress, una vez que hay sesión, hace falta en todo el
sitio**: WordPress exige un `X-WP-Nonce` válido en cualquier llamada a
`/wp-json/*` de un visitante con sesión iniciada (`rest_cookie_check_errors`,
del núcleo — antes de esta vuelta nadie iniciaba sesión, así que esto nunca
se había necesitado). A un invitado sin sesión no le exige nada.
`src/lib/tienda/sesion-navegador.ts` guarda el nonce (en `sessionStorage`,
lo pisa el login o `GET .../cuenta/sesion`) y lo agregan tanto
`api-navegador.ts` (Store API: carrito, checkout) como los fetch sueltos a
`/wp-json/ringopet/v1/*` (`checkout.ts`, `busqueda.ts`,
`producto-variantes.ts`). Si el nonce guardado venció (pestaña nueva, sesión
vieja) y WordPress responde `rest_cookie_invalid_nonce`, `api-navegador.ts`
pide uno nuevo y reintenta la llamada una sola vez, sin que el visitante lo
note. Al cerrar sesión (`salir()` en `src/lib/tienda/cuenta.ts`) se borra el
nonce y la copia del carrito de `sessionStorage`: el carrito de un cliente
no debería quedar pintado para el siguiente visitante de ese navegador.

**Enlaces de email hacia Astro**: `POST /cuenta/recuperar` (el "¿Olvidaste
tu contraseña?" de `/mi-cuenta/recuperar/`) ya no usa `retrieve_password()`
de WordPress — dispara `do_action('woocommerce_reset_password_notification', ...)`
directo, así el email sale con la plantilla y el remitente de WooCommerce
(no los de WordPress) y con el enlace `?key=&id=` que arma Woo (manda el
id del usuario, no el `login`). El de "elegí tu contraseña" que manda
WooCommerce al crear una cuenta desde el pago (`wc_create_new_customer` con
contraseña en blanco) usa el mismo formato. Los dos apuntan al endpoint
nativo de Mi cuenta — verificado en `prueba.ringopet.com.ar`:
`/mi-cuenta/lost-password/?key=&id=` (slug en inglés aunque el texto de
WooCommerce esté en castellano) — que ahora es una carpeta propia de Astro
(`src/pages/mi-cuenta/lost-password/`) y redirige a
`/mi-cuenta/nueva-clave/` conservando `key` y `id` (o `login`, según cuál
mande el enlace). `POST /cuenta/nueva-clave` acepta cualquiera de los dos:
si viene `id` sin `login`, lo resuelve a `user_login` con `get_userdata()`.
`/mi-cuenta/` también detecta esos parámetros como respaldo, por si algún
enlace viejo cae ahí directo.

**Remitente de los emails de WordPress**: `wp_mail_from`/`wp_mail_from_name`
reemplazan el remitente por defecto ("WordPress <wordpress@dominio>") por
el de WooCommerce > Ajustes > Correos electrónicos, para que todo salga
como RingoPet — incluido el respaldo de `retrieve_password_message` (si
algo distinto de `/mi-cuenta/recuperar/` dispara el flujo nativo de
WordPress, por ejemplo `wp-login.php` directo), cuyo regex de reemplazo del
enlace también se corrigió (`action=rp` no siempre va primero en la URL
que arma WordPress).

**Direcciones**: mismos 7 campos y la misma lista fija de localidades que
`/finalizar-compra/` (mismo `PENDIENTE`, ver "Regla fija" arriba — hay que
mantener las dos listas iguales hasta encontrar de dónde la arma Woo de
verdad). Facturación se guarda igual a envío: el pago tampoco pide una
dirección de facturación distinta.

**Detalle de pedido**: `ringopet-cuenta` arma la respuesta con el mismo
criterio que `ringopet-pedido::formatear()`, pero duplicado a propósito en
vez de compartido entre plugins, para que cada uno siga siendo
independiente.

**Quedan en WordPress** (no son carpetas que Astro genere): pagar un pedido
pendiente (`/mi-cuenta/order-pay/<id>/`) y cualquier endpoint de extensión
que WooCommerce agregue a futuro y no esté cubierto acá (por ejemplo
descargas, si algún día hay productos descargables). Los endpoints nativos
`/mi-cuenta/orders/`, `/mi-cuenta/edit-address/` y `/mi-cuenta/edit-account/`
también siguen respondiendo (nadie los desactivó), pero ya no están
enlazados desde ningún lado de Astro ni de los emails.

## Autocompletado del navegador

Los campos de `/finalizar-compra/` tienen `autocomplete` correcto
(`given-name`, `family-name`, `tel`, `email`, `address-line1`,
`address-line2`, `address-level2`, `postal-code`) y los que no son de
dirección postal (fecha, turno, notas) van con `autocomplete="off"`. Antes
"Calle y número" no tenía `autocomplete`, y Chrome a veces ofrecía
autocompletar con datos de tarjeta guardados ahí — ningún campo del
formulario usa nombres que se puedan confundir con eso.

## Pasos de la compra

`src/components/PasosCompra.astro` (recibe `paso={1|2|3}`): "Carrito de
compra → Finalizar compra → Pedido completado", en `/carrito/`,
`/finalizar-compra/` y `/pedido-recibido/`. El paso actual va en
`primario-oscuro` y negrita; los anteriores son enlaces; los que todavía
no se alcanzaron quedan en gris, sin enlace (no tiene sentido linkear
adelante: no se puede saltear un paso todavía sin completar).

## Calendario con la marca

`src/styles/flatpickr-marca.css` (se importa en `pagina-checkout.ts`,
después de `flatpickr/dist/flatpickr.min.css`, para pisar sus colores):
día elegido en `--c-primario` con texto blanco, hoy con el borde en
`--c-primario` (relleno solo si además está elegido), hover en un naranja
suave (`color-mix`), días deshabilitados en gris claro sin hover, y
bordes redondeados iguales a los campos del formulario. La base de
`flatpickr.min.css` sigue haciendo falta (layout/posicionamiento del
popup): lo que se saca es el tema de colores por defecto, no el CSS
estructural.

## Más rápido: caché en sessionStorage y todo en paralelo

- **`src/lib/tienda/cache-navegador.ts`**: guarda la última respuesta del
  carrito (y de medios de pago) en `sessionStorage`. `carrito.ts` y
  `checkout.ts` guardan ahí el carrito después de cada llamada que lo
  devuelve (agregar, quitar, cantidad, cupón, cambiar dirección, cambiar
  medio de pago). El panel lateral, `/carrito/` y `/finalizar-compra/`
  pintan esa copia apenas cargan (antes de que responda WooCommerce) y
  vuelven a pintar cuando llega la respuesta real — **gana Woo** si difiere
  (precio, stock, lo que sea). Si `sessionStorage` no está disponible
  (navegación privada, etc.), se degrada solo a "sin caché", nunca rompe.
- **Sin caché (primera visita a `/carrito/` o `/finalizar-compra/`)**: se
  ve un esqueleto (bloques grises con la forma del contenido,
  `animate-pulse`) en vez de un espacio en blanco, hasta que responde
  WooCommerce.
- **`/finalizar-compra/`**: carrito, disponibilidad de entrega y medios de
  pago se piden los tres en paralelo (`Promise.all`) apenas carga la
  página, no uno atrás del otro. Medios de pago también queda en
  `sessionStorage` (cambia poco, no hace falta pedirlo de nuevo en la
  próxima visita si todavía no respondió).

### Cuánto tardan los endpoints (medido contra `prueba.ringopet.com.ar`)

| Endpoint | 3 mediciones |
|---|---|
| `GET wc/store/v1/cart` (nativo de WooCommerce) | 707 / 588 / 638 ms |
| `GET ringopet/v1/entrega` | 817 / 829 / 918 ms |
| `GET ringopet/v1/medios-pago` | 761 / 888 / 854 ms |

Los tres están en el mismo orden de magnitud que el endpoint **nativo** de
WooCommerce (`cart`, que no toca ningún código nuestro) — el grueso del
tiempo es el arranque de WordPress en este hosting compartido, no algo
puntual de `ringopet-entrega` o `ringopet-pedido`. Aun así, `entrega` pasa
los 500 ms pedidos.

Cacheados: `medios-pago` (plugin propio, 5 minutos, se limpia sola al
guardar los ajustes de pagos) y `entrega` (`ringopet-entrega`, 3 minutos,
se limpia al entrar un pedido o tocar un ajuste de ORDDD — versión que
instaló Benja directamente, sin tocar el plugin desde acá).

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

## Regeneración y publicación automática

- `.github/workflows/publicar-prueba.yml`: build (contra
  `prueba.ringopet.com.ar`, fijo en el workflow) + FTP de `dist/` y de cada
  carpeta de `wp-plugin/`, cada una con su propio estado de sincronización.
  Se dispara con push a `main`, a mano, por `repository_dispatch` (evento
  `regenerar`) y todos los días a las 09:00 UTC. Frena antes de subir si no
  encuentra `wp-config.php` en la raíz de la cuenta FTP. Detalle completo en
  `README.md`.
- `.github/workflows/publicar-real.yml`: mismo workflow contra
  `ringopet.com.ar`, con sus propios secretos (`FTP_REAL_*`) — preparado
  pero **desactivado** (solo `workflow_dispatch`) hasta el lanzamiento.
- `wp-plugin/ringopet-regenerar/`: plugin mínimo que, cuando cambia un
  producto o su stock en WooCommerce, agrupa los cambios y dispara el
  `repository_dispatch` (como mucho una vez cada 10 minutos). También expone
  `POST /wp-json/ringopet/v1/purgar-cache` (token fijo en `wp-config.php`,
  ver "Purgar la caché" en `README.md`), que el workflow llama después de
  publicar. Instrucciones completas en `wp-plugin/README.md`. El token de
  GitHub para disparar el workflow va en `wp-config.php` del servidor, nunca
  en este repositorio.
- Cada acción de FTP no borra archivos de WordPress al publicar: solo
  borra, del servidor, lo que ella misma subió antes y ya no está en la
  carpeta local correspondiente (guarda su propio archivo de estado). Como
  las páginas de producto se generan siempre —incluidas las de "sin
  stock"—, en la práctica una página de producto solo desaparece del
  servidor si el producto se borra de verdad en WooCommerce. Detalle en
  `README.md`.

## Lighthouse móvil (sobre `npm run preview`, build contra `prueba.ringopet.com.ar`)

| Página | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|
| Portada | 95-99* | 100 | 96 | 100 |
| Categoría (Perros > Alimentos) | 99 | 100 | 96 | 100 |
| Producto | 99 | 100 | 96 | 100 |
| Carrito | 100 | 100 | 96 | 69** |
| Finalizar compra | 94 | 100 | 96 | 69** |

\* Varió entre corridas en esta compu (LCP 1.8s a 2.8s), no es un cambio de
código: ver la imagen sin tamaños intermedios en "Imágenes".

\*\* El 69 de SEO en carrito y pago es **a propósito**: el audit
"Page is blocked from indexing" baja el puntaje porque esas páginas llevan
`noindex` (correcto, no son contenido para buscar). No es algo para
arreglar.

Carrito y pago se probaron con el carrito vacío (sin WooCommerce en
`npm run preview`), que es el peor caso de layout: la página pasa de "un
mensaje corto" a mostrar nada más, y el logo del pie (con `astro:assets`)
tenía un salto de layout chico al cargar sin tamaño explícito — ya
corregido (`aspect-[2048/714]` además de `width`/`height` en
`Encabezado.astro` y `Pie.astro`). Con un carrito real (más contenido en
pantalla) el número debería ser igual o mejor; conviene volver a correr
Lighthouse contra `prueba.ringopet.com.ar` con un pedido real en curso.

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

- **`/tienda/`**: Lighthouse móvil real (contra `prueba.ringopet.com.ar`
  publicado, no local — ver "Listado único de productos" más arriba) y
  decidir sobre "presentación" (no hay atributo de Woo que sirva tal cual
  está cargado hoy — ver la misma sección) y sobre `.htaccess` real
  (`/shop/` ahora apunta a `/tienda/`, ver `README.md`).
- **Probar con un pago de Mercado Pago realmente rechazado y con una
  vuelta "pendiente" real** (ver "Vuelta de Mercado Pago sin pagar" más
  arriba): solo se pudo probar el caso cancelado con un pedido real; el
  aviso "rechazado" y el texto "Tu pago está pendiente" quedaron armados
  con la mejor información disponible, sin poder confirmarlos con una
  vuelta real de esos dos tipos.
- **Instalar y activar `wp-plugin/ringopet-cuenta/`** en `prueba.ringopet.com.ar`
  (ver "Mi cuenta" más arriba): sin esto, `/mi-cuenta/*` no tiene con qué
  hablar del lado de WordPress. Falta correr ahí las pruebas de punta a
  punta: login correcto/incorrecto y su límite de intentos, recuperar
  contraseña (el link real del email, que no se pudo leer desde esta
  sesión), cuenta nueva desde el pago con su email de "elegí tu
  contraseña", ver pedidos y el detalle, intentar ver un pedido ajeno
  cambiando el id, editar dirección y datos, cerrar sesión.
- **Pagar un pedido pendiente** (`/mi-cuenta/order-pay/<id>/`) queda en
  WordPress por ahora, sin página propia de Astro.
- **Localidades del checkout** (`src/pages/finalizar-compra/index.astro`):
  no encontré de dónde las arma WooCommerce (no es un ajuste nativo ni de
  ningún plugin con API pública instalado). Quedaron escritas a mano,
  marcadas con `PENDIENTE` en el código — decime dónde están cargadas de
  verdad y armo un endpoint de solo lectura.
- **Número de WhatsApp** (`src/config/sitio.ts`): no es un dato de
  WooCommerce (no hay plugin de WhatsApp instalado). Me lo pasaste por
  chat, marcado con `PENDIENTE` en el código por si en algún momento pasa
  a vivir en un plugin con su propio ajuste.
- **Subir el build a `prueba.ringopet.com.ar`** (ver README.md, "Probar en
  prueba.ringopet.com.ar") y probar ahí de punta a punta: carrito, pago con
  transferencia y con Mercado Pago, `/pedido-recibido/`, pedido visible en
  el admin con fecha/turno y en el plugin de repartos, emails. En esta
  sesión solo se pudo probar la Store API directo (sin interfaz) y ver las
  páginas con datos simulados en `npm run dev`/`preview` — nunca contra un
  carrito real, porque no hay WooCommerce en localhost.
- **Borrar los pedidos de prueba** en `prueba.ringopet.com.ar`: **#14992**
  (transferencia) y **#14994** (Mercado Pago), y revisar si quedó un
  **#14993** como borrador abandonado (intento con turno inválido).
- **Comparar el pedido #14992 contra el #14989** en el admin (fecha, turno,
  sincronizado con el plugin de repartos) — quedó pendiente, hace falta
  acceso de solo lectura a wp-admin.
- **CVU/Alias**: confirmar que `account_number`/`iban` de WooCommerce >
  Pagos > Transferencia bancaria son efectivamente el CVU y el Alias (ver
  "`wp-plugin/ringopet-pedido/`"). Si no, es un cambio de una línea en el
  plugin.
- **`.htaccess` real**: agregar a mano el `DirectoryIndex` y la
  redirección de `/shop/` (ver `README.md`) en `prueba.ringopet.com.ar`
  primero, y en el sitio real el día de la migración.
- **Reglas de Cloudflare/LiteSpeed**: no cachear `/wp-json/`, `/mi-cuenta/`
  (`/carrito/`, `/finalizar-compra/` y `/pedido-recibido/` ahora son de
  Astro, se pueden cachear igual que el resto salvo que se prefiera no
  cachearlas por las dudas); sí cachear los archivos de Astro. Se configura
  en el panel, no desde el repositorio.
- **Imágenes sin tamaños intermedios** en WordPress (ver "Imágenes").
- **WoodMart**: como ya no hay ningún paso por una página de WordPress
  durante la compra, esto pierde urgencia, pero si `/mi-cuenta/` se sigue
  usando conviene que WoodMart use el mismo naranja (`#F95D00`) y
  tipografía. No se tocó WordPress desde esta sesión.
