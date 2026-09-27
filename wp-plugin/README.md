# Plugin: RingoPet - Regenerar sitio Astro

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

## Instalar

1. Subir la carpeta `ringopet-regenerar/` a `wp-content/plugins/` del servidor
   (por FTP o el instalador de plugins de WordPress, comprimida en .zip).
2. Activarlo desde **Plugins** en el escritorio de WordPress.

## Configurar

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
