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
archivo existente: las rutas virtuales de WooCommerce (`/carrito/`,
`/finalizar-compra/`, `/mi-cuenta/`) no son carpetas reales, así que la regla
de WordPress las sigue agarrando igual que hoy.

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

## Probar en `prueba.ringopet.com.ar` (subida manual, sin GitHub Actions)

Todavía no están cargados los secretos de GitHub Actions, así que por ahora
se sube `dist/` a mano. Nunca reemplazar toda la carpeta ni usar una opción
de "sincronizar y borrar": solo sumar/sobrescribir los archivos de `dist/`.

1. **Generar el build** apuntando a la prueba (ya es el `.env` actual):
   ```bash
   npm run build
   ```
2. **Ubicar la carpeta raíz** de `prueba.ringopet.com.ar` en Hostinger:
   hPanel > **Dominios > Subdominios**, columna "Ruta del documento" (algo
   como `public_html/prueba` o `domains/prueba.ringopet.com.ar/public_html`,
   según cómo esté armado el hosting). Esa carpeta es donde ya vive el
   WordPress de prueba (`wp-admin`, `wp-content`, etc.) — se sube ahí adentro,
   nunca en una subcarpeta nueva.
3. **Subir el contenido de `dist/`** (el contenido, no la carpeta `dist`
   en sí) a esa raíz, por una de estas dos vías:
   - **Administrador de archivos** (hPanel > Archivos > Administrador de
     archivos): comprimir en la compu todo lo que está DENTRO de `dist/` en
     un `.zip`, subir ese `.zip` a la raíz de la prueba con "Subir", click
     derecho > "Extraer" y confirmar que sobrescriba si pregunta. Borrar el
     `.zip` después de extraer.
   - **FTP** (FileZilla u otro cliente, con la cuenta de hPanel > Archivos >
     Cuentas FTP): conectarse, entrar a la raíz de la prueba y arrastrar el
     contenido de `dist/` ahí, sobrescribiendo lo que ya exista.
4. **Agregar el `DirectoryIndex`** al `.htaccess` de la prueba si todavía no
   está (ver sección de arriba) — sin esto, `prueba.ringopet.com.ar/` va a
   seguir mostrando WordPress en vez de la portada de Astro.
5. **Probar**, en este orden:
   - Portada, una categoría y un producto de Astro cargan bien.
   - Agregar productos al carrito (panel lateral).
   - "Finalizar compra" lleva a `/finalizar-compra/` de Woo **con el mismo
     carrito** (mismos productos y cantidades).
   - Completar el pago con **Mercado Pago** y, en otro pedido, con
     **transferencia**.
   - El pedido aparece en **Mi cuenta** > Pedidos.
   - `/wp-admin/` y el resto de WordPress siguen funcionando igual que antes.
6. Si algo no anda, revisar antes que nada el `.htaccess` (paso 4) y que la
   carpeta subida sea la raíz correcta del subdominio (paso 2).

## Publicación automática (GitHub Actions) — cuando se carguen los secretos

1. Repositorio privado en GitHub.
2. **Secretos** (Settings > Secrets and variables > Actions > Secrets):

   | Nombre | Valor |
   |---|---|
   | `FTP_SERVIDOR` | Servidor FTP de Hostinger |
   | `FTP_USUARIO` | Usuario FTP |
   | `FTP_CLAVE` | Contraseña de esa cuenta FTP |

3. **Variable** (Settings > Secrets and variables > Actions > Variables):

   | Nombre | Valor |
   |---|---|
   | `WOO_URL` | `https://ringopet.com.ar` (sin barra final) |

4. Push a `main`: el workflow instala, revisa tipos, genera el sitio (leyendo
   el catálogo de `WOO_URL`) y sube `dist/` por FTP a `public_html`.
5. El workflow también se puede disparar a mano, por `repository_dispatch`
   (lo usa el plugin de WordPress, ver `wp-plugin/README.md`) o corre solo
   todos los días a las 09:00 UTC.

### Por qué no borra archivos de WordPress al publicar

La acción de FTP (`dangerous-clean-slate: false`, ya configurado) guarda en
el propio servidor un archivo de estado
(`.ftp-deploy-sync-state.json`) con lo que ELLA subió en la corrida
anterior. En cada corrida compara `dist/` contra ese estado: sube lo nuevo o
cambiado, y borra del servidor solo los archivos que **ella misma** había
subido antes y que ahora ya no están en `dist/` (por ejemplo, si algún día
se borra una página). Nunca toca archivos que no están en ese estado, así
que WordPress (`wp-admin/`, `wp-content/`, etc.) no se ve afectado aunque
cambie todo el catálogo de productos de un build a otro.

Como las páginas de producto se generan siempre (incluidas las de "sin
stock", ver `CLAUDE.md`), en la práctica una página de producto solo
desaparece del servidor si el producto se borra de verdad en WooCommerce
(no si se queda sin stock).

## Antes de publicar en el sitio real

Ver la sección "Pendiente / a confirmar con Benja" de `CLAUDE.md`: completar
la dirección del negocio no aplica (es tienda online, ver `sitio.ts`),
probar contra `prueba.ringopet.com.ar` (carrito, pago, Mi cuenta) siguiendo
los pasos de arriba, agregar el `DirectoryIndex` al `.htaccess` real y
revisar el peso de las imágenes de algunos productos (ver Lighthouse en
`CLAUDE.md`).
