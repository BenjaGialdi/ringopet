# RingoPet

Frente en Astro de la tienda RingoPet (Córdoba capital), que convive en el
mismo dominio con el WooCommerce existente. La arquitectura completa está en
`CLAUDE.md`; acá los comandos, la publicación y cómo probar contra
`prueba.ringopet.com.ar`.

## Comandos

```bash
npm install
npm run dev       # servidor de desarrollo (sin carrito ni precio en vivo: no hay WooCommerce en localhost)
npm run check     # astro check
npm run build     # genera dist/ leyendo el catálogo de WOO_URL
npm run preview   # sirve dist/ ya generado
```

Requiere Node 22.12 o superior. Antes del primer build, copiar `.env.example`
a `.env` y poner ahí la URL de la tienda (`WOO_URL`). Hoy en `.env` (local,
no se sube al repo) está en `https://prueba.ringopet.com.ar`.

## Astro nunca toca el `.htaccess` del servidor

`public/` no tiene `.htaccess`: si lo tuviera, la publicación lo subiría a
`public_html/` y **reemplazaría por completo** el `.htaccess` real de
WordPress (permalinks, reglas de LiteSpeed Cache, etc.), porque FTP sube
archivo por archivo a la misma ruta, no hace merge.

Agregar **una sola vez, a mano**, esta línea al `.htaccess` real del
servidor (tanto en `prueba.ringopet.com.ar` como, más adelante, en el sitio
real), cerca del principio del archivo, **antes** de cualquier bloque
`# BEGIN WordPress` o `# BEGIN LSCACHE` que ya exista:

```apache
DirectoryIndex index.html index.php
```

Por qué alcanza con esto: Astro genera cada página como una carpeta real con
su `index.html` adentro (por ejemplo `/producto/algo/index.html`). Cuando el
navegador pide `/producto/algo/`, Apache ve que la carpeta existe
(`-d` verdadero) y la regla de WordPress para mandar todo a `index.php` no
llega a aplicarse (esa regla exige que la carpeta NO exista). Lo único que
falta es decirle a Apache que, al entrar a una carpeta, prefiera
`index.html` sobre `index.php` si ambos podrían aplicar — eso es exactamente
lo que hace `DirectoryIndex`. No hace falta tocar ni reordenar nada más del
archivo existente: las rutas virtuales de WooCommerce que Astro no genera
(`/mi-cuenta/`, `/finalizar-compra/order-pay/123/` y similares) no son
carpetas reales, así que la regla de WordPress las sigue agarrando igual
que hoy. `/carrito/` y `/finalizar-compra/` en cambio SÍ son carpetas
reales ahora (las genera Astro): a partir de esta vuelta, esas dos URL
muestran las páginas de Astro, no las de WooCommerce.

Agregar también, en el mismo bloque: `/shop/` es el archivo de productos
que genera WooCommerce/WoodMart, que ya no se usa (la navegación real es la
de Astro). Redirige a la portada:

```apache
RewriteRule ^shop/?$ / [R=301,L]
```

Esta línea sí necesita `mod_rewrite` activo (`<IfModule mod_rewrite.c>` —
normalmente ya está, junto con el bloque de WordPress).

Opcional, buena práctica (no imprescindible): bloquear el archivo de estado
que deja la publicación por FTP, para que no se pueda ver desde afuera.
Se puede agregar como parte del mismo bloque:

```apache
<FilesMatch "^\.ftp-deploy-sync-state\.json$">
    Require all denied
</FilesMatch>
```

Después de agregarlo, probar que `https://prueba.ringopet.com.ar/` carga la
portada de Astro y que `https://prueba.ringopet.com.ar/wp-admin/` sigue
entrando a WordPress.

## Publicación automática en `prueba.ringopet.com.ar`

Cada push a `main` (o a mano, desde la pestaña Actions) dispara el workflow
**"Publicar en prueba"** (`.github/workflows/publicar-prueba.yml`), que:

1. Instala, revisa tipos (`astro check`) y genera el sitio con
   `WOO_URL=https://prueba.ringopet.com.ar` (fijo en el workflow, no una
   variable de repo).
2. Verifica por FTP que exista `wp-config.php` en la raíz de la cuenta FTP
   de prueba — si no lo encuentra, frena ahí mismo con error y no sube nada
   (protección contra apuntar por error a una cuenta FTP vacía o mal
   configurada).
3. Sube `dist/` a la raíz de esa cuenta FTP (que ya es directamente la
   carpeta de WordPress de prueba: no hace falta ninguna subcarpeta).
4. Sube cada carpeta de `wp-plugin/` a `wp-content/plugins/<carpeta>/` de esa
   misma cuenta, cada una con su propio archivo de estado — así una
   carpeta de plugin no pisa el estado de sincronización de otra.
5. Intenta purgar la caché de LiteSpeed (ver "Purgar la caché" más abajo);
   si falla, no hace fallar el resto del workflow.

Ningún paso borra algo que él mismo no haya subido antes
(`dangerous-clean-slate: false`, un archivo de estado por carpeta): el
WordPress de prueba (`wp-admin/`, `wp-content/`, `wp-config.php`,
`.htaccess`) nunca se toca, ni aunque cambie todo el catálogo de productos
de una corrida a otra (ver "Por qué no borra archivos de WordPress" más
abajo).

**Un plugin nuevo** (una carpeta de `wp-plugin/` que todavía no exista en el
servidor) se sube igual que el resto, pero **hay que activarlo una vez a
mano** desde `wp-admin > Plugins` — el workflow no activa plugins, solo
sube archivos.

**Secretos necesarios** (Settings > Secrets and variables > Actions >
Secrets): `FTP_PRUEBA_SERVIDOR`, `FTP_PRUEBA_USUARIO`, `FTP_PRUEBA_CLAVE`
(ya cargados). Opcional: `RINGOPET_PURGE_TOKEN` (ver abajo).

### Purgar la caché de LiteSpeed

Si algo no se ve actualizado después de publicar, puede ser la caché de
LiteSpeed (independiente de la de Astro/WordPress). El workflow puede
purgarla solo, llamando a un endpoint nuevo de `ringopet-regenerar`
(`POST /wp-json/ringopet/v1/purgar-cache`), protegido por un token fijo
(no por sesión: lo llama GitHub Actions).

Para activarlo:

1. En `wp-config.php` del servidor de prueba (fuera del repositorio),
   agregar, antes de `/* ¡Eso es todo, deja de editar! */`:
   ```php
   define('RINGOPET_PURGE_TOKEN', 'un-token-largo-y-al-azar');
   ```
   (por ejemplo, generado con `openssl rand -hex 32`).
2. Cargar ese mismo valor como secreto de GitHub: `RINGOPET_PURGE_TOKEN`.

Sin este secreto cargado, el paso de purgar cae en un error silencioso
(`continue-on-error: true`) y el resto de la publicación sigue igual —no es
obligatorio para que la publicación funcione, solo evita tener que purgar a
mano.

### Por qué no borra archivos de WordPress al publicar

Cada acción de FTP (`dangerous-clean-slate: false`) guarda en el propio
servidor su propio archivo de estado (`.ftp-deploy-sync-state-*.json`) con
lo que ELLA subió en la corrida anterior. En cada corrida compara la
carpeta local contra ese estado: sube lo nuevo o cambiado, y borra del
servidor solo los archivos que **ella misma** había subido antes y que
ahora ya no están (por ejemplo, si algún día se borra una página o un
plugin deja de estar en el repositorio). Nunca toca archivos que no están
en su propio estado.

Como las páginas de producto se generan siempre (incluidas las de "sin
stock", ver `CLAUDE.md`), en la práctica una página de producto solo
desaparece del servidor si el producto se borra de verdad en WooCommerce
(no si se queda sin stock).

## Publicar en el sitio real (lanzamiento)

Workflow gemelo **"Publicar en el sitio real"**
(`.github/workflows/publicar-real.yml`), preparado pero **desactivado**: su
único disparador es `workflow_dispatch` (a mano, desde la pestaña Actions),
nunca push ni cron. No tocar el `on:` de ese archivo hasta el día del
lanzamiento.

Usa sus propios secretos, para no mezclar credenciales con la cuenta de
prueba: `FTP_REAL_SERVIDOR`, `FTP_REAL_USUARIO`, `FTP_REAL_CLAVE` (y,
opcional, `RINGOPET_PURGE_TOKEN_REAL` con su propia constante en el
`wp-config.php` del sitio real). Sube a `public_html/` — confirmar que sea
la raíz correcta de esa cuenta FTP antes de la primera corrida (puede
diferir de cómo está armada la de prueba).

Antes de activarlo, ver la sección "Pendiente / a confirmar con Benja" de
`CLAUDE.md`: agregar el `DirectoryIndex` y la redirección de `/shop/` al
`.htaccess` real, confirmar CVU/Alias en `ringopet-pedido`, y probar la
compra completa (transferencia y Mercado Pago) en prueba antes del
lanzamiento.
