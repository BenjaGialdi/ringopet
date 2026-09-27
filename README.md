# RingoPet

Frente en Astro de la tienda RingoPet (Córdoba capital), que convive en el
mismo dominio con el WooCommerce existente. La arquitectura completa está en
`CLAUDE.md`; acá solo los comandos y los pasos de publicación.

## Comandos

```bash
npm install
npm run dev       # servidor de desarrollo (sin carrito ni precio en vivo: no hay WooCommerce en localhost)
npm run check     # astro check
npm run build     # genera dist/ leyendo el catálogo de WOO_URL
npm run preview   # sirve dist/ ya generado
```

Requiere Node 22.12 o superior. Antes del primer build, copiar `.env.example`
a `.env` y poner ahí la URL de la tienda (`WOO_URL`).

## Publicación (GitHub Actions)

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
   el catálogo de `WOO_URL`) y sube `dist/` por FTP a `public_html`, sin
   borrar nada (ahí vive WordPress).
5. El workflow también se puede disparar a mano, por `repository_dispatch`
   (lo usa el plugin de WordPress, ver `wp-plugin/README.md`) o corre solo
   todos los días a las 09:00 UTC.

## Antes de publicar en el sitio real

Ver la sección "Pendiente / a confirmar con Benja" de `CLAUDE.md`: falta
mergear el `.htaccess` real del servidor, completar dirección y WhatsApp en
`sitio.ts`, probar contra `prueba.ringopet.com.ar` (carrito, pago, Mi
cuenta) y correr Lighthouse sobre el sitio publicado.
