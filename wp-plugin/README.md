# Plugins de WordPress

Cuatro carpetas, cada una un plugin independiente (se puede desactivar
cualquiera sin romper el resto). El workflow "Publicar en prueba" las sube
solas por FTP (ver `README.md` del repositorio); un plugin **nuevo** hay que
activarlo una vez a mano desde **Plugins** — el workflow no activa nada,
solo sube archivos.

- **`ringopet-entrega/`**: ya estaba instalado antes de la primera vuelta
  (fecha y turno de entrega con ORDDD). No se toca sin avisar.
- **`ringopet-regenerar/`**: dispara la publicación cuando cambia un
  producto o su stock, y expone el endpoint para purgar la caché de
  LiteSpeed después de publicar.
- **`ringopet-pedido/`**: lectura de un pedido para `/pedido-recibido/` de
  Astro, y manda ahí todas las vueltas de pago.
- **`ringopet-cuenta/`**: "Mi cuenta" en Astro (`/mi-cuenta/...`): sesión,
  login, pedidos, direcciones, datos y recuperación de contraseña.

## `ringopet-regenerar`

Avisa a GitHub Actions cuando cambia un producto en WooCommerce, agrupando los
cambios: como mucho dispara una regeneración cada 10 minutos (más la
regeneración diaria programada del workflow, por si algo se escapa).

También apaga el sitemap nativo de WordPress (`/wp-sitemap.xml`), para que no
compita con el que genera Astro (`/sitemap.xml`). Al activar el plugin no
hace falta ningún otro paso para eso. Si en algún momento se instala un
plugin de SEO (Yoast, Rank Math, All in One SEO...), su generador de sitemap
también hay que apagarlo, desde los ajustes propios de ese plugin (suele
estar en algo como "Ajustes generales > Sitemap XML").

También agrega `noindex` a `/driver/` y `/tracking/` (páginas del plugin de
repartos, identificadas por slug): siguen funcionando para quien las usa,
pero no se indexan ni entran al sitemap de Astro.

### Configurar

Agregar en `wp-config.php` (fuera del repositorio, directo en el servidor),
antes de la línea `/* ¡Eso es todo, deja de editar! */`:

```php
define('RINGOPET_GH_REPO', 'usuario/ringopet'); // owner/repo del repositorio de GitHub
define('RINGOPET_GH_TOKEN', 'ghp_xxxxxxxxxxxxxxxxxxxxx'); // token con permiso para disparar Actions
```

El token es un Personal Access Token de GitHub con permiso `repo` (clásico) o,
si es un token con permisos detallados (fine-grained), acceso de **lectura y
escritura** a "Actions" en este repositorio. Se genera desde GitHub en
Settings > Developer settings > Personal access tokens. Nunca va en el
repositorio ni en el chat: solo en `wp-config.php` del servidor.

### Purgar la caché de LiteSpeed después de publicar

`POST /wp-json/ringopet/v1/purgar-cache`, protegido por un token fijo (no
por sesión: lo llama el workflow de GitHub Actions, no un navegador). Sin
esto configurado, el paso de purgar del workflow falla en silencio y no
afecta al resto de la publicación — no es obligatorio.

```php
define('RINGOPET_PURGE_TOKEN', 'un-token-largo-y-al-azar'); // ej. openssl rand -hex 32
```

El mismo valor va como secreto de GitHub (`RINGOPET_PURGE_TOKEN` para el
workflow de prueba, `RINGOPET_PURGE_TOKEN_REAL` para el del sitio real —
cada servidor define esta misma constante con su propio valor).

## `ringopet-pedido`

La Store API (`wc/store/v1/order/<id>`) no trae medio de pago, número de
pedido ni fecha/turno de entrega — le faltaba lo que necesita
`/pedido-recibido/`. Este plugin agrega:

- `GET /wp-json/ringopet/v1/pedido/<id>?key=<clave del pedido>`: pedido,
  productos, total, medio de pago, fecha y turno de entrega (leídos con la
  misma etiqueta configurada en ORDDD, ver `ringopet-entrega`) y, si es
  transferencia, los datos de la cuenta de **WooCommerce > Ajustes > Pagos >
  Transferencia bancaria directa**. La clave del pedido (no la sesión ni el
  email) es lo que autoriza leerlo — es la misma clave larga que ya usa
  WooCommerce en la URL de "gracias".
- Manda **todas** las vueltas de pago (transferencia y Mercado Pago) a
  `/pedido-recibido/?pedido=<id>&key=<clave>` en vez de la página de
  WordPress (`woocommerce_get_checkout_order_received_url`).
- `GET /wp-json/ringopet/v1/medios-pago`: id → título de cada medio de pago
  habilitado, igual que **WooCommerce > Ajustes > Pagos > [medio] >
  Título** (información pública, sin datos sensibles). Lo usa
  `/finalizar-compra/` para no tener los nombres de los medios de pago
  escritos a mano.

**Revisar**: WooCommerce no tiene campos nativos "CVU" ni "Alias" (son de
Argentina). El plugin lee `account_number` como CVU y `iban` como Alias de
esa pantalla de ajustes — si ahí se cargó distinto, hay que ajustar el
mapeo en `cuenta_bancaria()` (una función chica, en
`ringopet-pedido/ringopet-pedido.php`).

No necesita configuración aparte.
