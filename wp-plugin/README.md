# Plugin: RingoPet - Regenerar sitio Astro

Avisa a GitHub Actions cuando cambia un producto en WooCommerce, agrupando los
cambios: como mucho dispara una regeneración cada 10 minutos (más la
regeneración diaria programada del workflow, por si algo se escapa).

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
