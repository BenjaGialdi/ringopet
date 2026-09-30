<?php
/**
 * Plugin Name: RingoPet - Regenerar sitio Astro
 * Description: Avisa a GitHub Actions cuando cambia un producto de WooCommerce (alta, edición, borrado o cambio de stock), agrupando los avisos: como mucho dispara una regeneración cada 10 minutos. También expone un endpoint para que el workflow de publicación purgue la caché de LiteSpeed después de subir el build nuevo.
 * Version: 1.1.0
 * Author: Fluxa
 */

if (!defined('ABSPATH')) {
    exit;
}

// El sitemap lo genera Astro (/sitemap.xml, con lastmod real e imágenes).
// Esto apaga el sitemap nativo de WordPress (/wp-sitemap.xml) para que no compita.
// Si en algún momento se instala un plugin de SEO (Yoast, RankMath, etc.), su
// sitemap también hay que apagarlo desde los ajustes de ese plugin.
add_filter('wp_sitemaps_enabled', '__return_false');

// Páginas del plugin de repartos: siguen funcionando, pero no se indexan ni
// van en el sitemap de Astro (se excluyen aparte, en src/lib/tienda/wordpress.ts).
add_filter('wp_robots', function (array $robots): array {
    if (is_page(['driver', 'tracking'])) {
        $robots['noindex'] = true;
    }
    return $robots;
});

define('RINGOPET_REGENERAR_INTERVALO', 10 * MINUTE_IN_SECONDS);
define('RINGOPET_REGENERAR_HOOK', 'ringopet_disparar_regeneracion');

/** Marca que hay cambios pendientes y programa un único disparo agrupado. */
function ringopet_marcar_pendiente(): void {
    if (!wp_next_scheduled(RINGOPET_REGENERAR_HOOK)) {
        wp_schedule_single_event(time() + RINGOPET_REGENERAR_INTERVALO, RINGOPET_REGENERAR_HOOK);
    }
}

// Edición del producto (título, precio, descripción, etc.).
add_action('save_post_product', 'ringopet_marcar_pendiente');
add_action('woocommerce_update_product', 'ringopet_marcar_pendiente');
add_action('woocommerce_new_product', 'ringopet_marcar_pendiente');

// Cambios de stock: por una venta, por carga manual o por cualquier plugin/integración
// que ajuste el inventario (no solo al guardar el producto desde el editor).
add_action('woocommerce_product_set_stock', 'ringopet_marcar_pendiente');
add_action('woocommerce_variation_set_stock', 'ringopet_marcar_pendiente');
add_action('woocommerce_product_set_stock_status', 'ringopet_marcar_pendiente');
add_action('woocommerce_variation_set_stock_status', 'ringopet_marcar_pendiente');

add_action('before_delete_post', function ($id): void {
    if (get_post_type($id) === 'product') {
        ringopet_marcar_pendiente();
    }
});

add_action(RINGOPET_REGENERAR_HOOK, 'ringopet_disparar_ahora');

/** Llama a la API de GitHub para que dispare el workflow de publicación (repository_dispatch). */
function ringopet_disparar_ahora(): void {
    if (!defined('RINGOPET_GH_TOKEN') || !defined('RINGOPET_GH_REPO')) {
        error_log('RingoPet: falta definir RINGOPET_GH_TOKEN y/o RINGOPET_GH_REPO en wp-config.php. No se avisó a GitHub.');
        return;
    }

    $respuesta = wp_remote_post('https://api.github.com/repos/' . RINGOPET_GH_REPO . '/dispatches', [
        'headers' => [
            'Authorization' => 'Bearer ' . RINGOPET_GH_TOKEN,
            'Accept' => 'application/vnd.github+json',
            'Content-Type' => 'application/json',
            'User-Agent' => 'RingoPet-WordPress',
        ],
        'body' => wp_json_encode(['event_type' => 'regenerar']),
        'timeout' => 15,
    ]);

    if (is_wp_error($respuesta)) {
        error_log('RingoPet: error al avisar a GitHub: ' . $respuesta->get_error_message());
        return;
    }

    $codigo = wp_remote_retrieve_response_code($respuesta);
    if ($codigo !== 204) {
        error_log('RingoPet: GitHub respondió ' . $codigo . ': ' . wp_remote_retrieve_body($respuesta));
    }
}

// Al desactivar el plugin, se cancela cualquier disparo pendiente.
register_deactivation_hook(__FILE__, function (): void {
    $marca = wp_next_scheduled(RINGOPET_REGENERAR_HOOK);
    if ($marca) {
        wp_unschedule_event($marca, RINGOPET_REGENERAR_HOOK);
    }
});

/**
 * POST /wp-json/ringopet/v1/purgar-cache
 * Lo llama el workflow de publicación después de subir el build nuevo, para que LiteSpeed
 * no siga sirviendo páginas viejas desde su caché. Protegido por un token fijo (no por
 * sesión: lo llama GitHub Actions, no un navegador) definido en wp-config.php:
 *
 *   define('RINGOPET_PURGE_TOKEN', 'un-token-largo-y-al-azar');
 *
 * El mismo valor va como secreto de GitHub (RINGOPET_PURGE_TOKEN en el repo, o
 * RINGOPET_PURGE_TOKEN_REAL para el workflow del sitio real, que usa su propio
 * wp-config.php con su propio valor de esta constante).
 */
add_action('rest_api_init', function (): void {
    register_rest_route('ringopet/v1', '/purgar-cache', [
        'methods' => 'POST',
        'permission_callback' => '__return_true',
        'callback' => 'ringopet_purgar_cache_endpoint',
    ]);
});

function ringopet_purgar_cache_endpoint(WP_REST_Request $peticion) {
    if (!defined('RINGOPET_PURGE_TOKEN') || '' === RINGOPET_PURGE_TOKEN) {
        return new WP_Error('ringopet_purga_no_configurada', 'Falta definir RINGOPET_PURGE_TOKEN en wp-config.php.', ['status' => 501]);
    }

    $autorizacion = (string) $peticion->get_header('authorization');
    $token = trim(str_ireplace('Bearer', '', $autorizacion));

    if (!hash_equals(RINGOPET_PURGE_TOKEN, $token)) {
        return new WP_Error('ringopet_purga_no_autorizada', 'Token inválido.', ['status' => 403]);
    }

    if (has_action('litespeed_purge_all')) {
        do_action('litespeed_purge_all');
    }

    return rest_ensure_response(['ok' => true]);
}

/**
 * GET /wp-json/ringopet/v1/categorias-iconos
 * Íconos de categoría cargados en WordPress (el menú de categorías de Astro no inventa
 * ninguno: si una categoría no devuelve nada acá, se muestra sin ícono). WoodMart guarda los
 * dos campos propios de cada categoría ("Icono de categoría" e "Icono de categoría grande")
 * como term meta — claves confirmadas a mano con get_term_meta sobre una categoría real
 * (726, "Accesorios" de Gatos): `category_icon` (chico) y `category_icon_alt` (grande), cada
 * uno un array con 'url' y/o 'id' de adjunto. Ojo: get_term_meta($id) SIN clave (pidiendo
 * todo el meta de una) no lo deserializa — hay que pedir cada clave puntual
 * (get_term_meta($id, 'category_icon', true)) para recibir el array ya armado en vez del
 * string serializado crudo. Devuelve { "<id de categoría>": "<url>" }. Información pública
 * (ya se ve en el sitio actual), sin datos sensibles: sin permission_callback restrictivo.
 */
add_action('rest_api_init', function (): void {
    register_rest_route('ringopet/v1', '/categorias-iconos', [
        'methods' => 'GET',
        'permission_callback' => '__return_true',
        'callback' => 'ringopet_categorias_iconos_endpoint',
    ]);
});

/** Valor de un campo de ícono de WoodMart (array con 'url'/'id') o de un meta genérico (ID de adjunto o URL) resuelto a una URL de imagen. */
function ringopet_url_de_campo_icono($valor): ?string {
    $valor = maybe_unserialize($valor);
    if (is_array($valor)) {
        if (!empty($valor['url']) && is_string($valor['url']) && preg_match('#^https?://#', $valor['url'])) {
            return $valor['url'];
        }
        if (!empty($valor['id'])) {
            return wp_get_attachment_image_url((int) $valor['id'], 'thumbnail') ?: null;
        }
        return null;
    }
    if (is_numeric($valor)) {
        return wp_get_attachment_image_url((int) $valor, 'thumbnail') ?: null;
    }
    if (is_string($valor) && preg_match('#^https?://#', $valor)) {
        return $valor;
    }
    return null;
}

/** Ícono chico (category_icon) o, si falta, el grande (category_icon_alt) — los dos campos de WoodMart para el ícono de categoría. */
function ringopet_icono_categoria(int $term_id): ?string {
    foreach (['category_icon', 'category_icon_alt'] as $clave) {
        $icono = ringopet_url_de_campo_icono(get_term_meta($term_id, $clave, true));
        if ($icono) {
            return $icono;
        }
    }
    return null;
}

/** Respaldo si la categoría no tiene ícono propio de WoodMart: la imagen de un ítem de menú que enlaza a ella (ej. Conejos, cargado en Apariencia > Menús) — clave desconocida, se busca por patrón. */
function ringopet_icono_de_item_menu(int $post_id): ?string {
    foreach (get_post_meta($post_id) as $clave => $valores) {
        if (stripos($clave, 'icon') === false) {
            continue;
        }
        $icono = ringopet_url_de_campo_icono(is_array($valores) ? reset($valores) : $valores);
        if ($icono) {
            return $icono;
        }
    }
    return null;
}

// Subir este número invalida la caché sola en el próximo pedido después de publicar, sin
// esperar a que venza el transient ni depender de un hook de "actualizar plugin" que no
// existe (esto se sube por FTP, no por el actualizador de WordPress).
define('RINGOPET_ICONOS_VERSION', 2);

function ringopet_categorias_iconos_endpoint() {
    if ((int) get_option('ringopet_iconos_version') !== RINGOPET_ICONOS_VERSION) {
        delete_transient('ringopet_categorias_iconos');
        update_option('ringopet_iconos_version', RINGOPET_ICONOS_VERSION);
    }

    $cacheados = get_transient('ringopet_categorias_iconos');
    if (false !== $cacheados) {
        return rest_ensure_response($cacheados);
    }

    $terminos = get_terms(['taxonomy' => 'product_cat', 'hide_empty' => false]);
    if (is_wp_error($terminos)) {
        return rest_ensure_response(new stdClass());
    }

    $por_menu = [];
    foreach (wp_get_nav_menus() as $menu) {
        $items = wp_get_nav_menu_items($menu->term_id);
        if (!$items) {
            continue;
        }
        foreach ($items as $item) {
            if ($item->object === 'product_cat' && $item->object_id && !isset($por_menu[(int) $item->object_id])) {
                $icono = ringopet_icono_de_item_menu($item->ID);
                if ($icono) {
                    $por_menu[(int) $item->object_id] = $icono;
                }
            }
        }
    }

    $resultado = [];
    foreach ($terminos as $termino) {
        $icono = ringopet_icono_categoria($termino->term_id) ?: ($por_menu[$termino->term_id] ?? null);
        if ($icono) {
            $resultado[$termino->term_id] = $icono;
        }
    }

    set_transient('ringopet_categorias_iconos', $resultado, HOUR_IN_SECONDS);
    return rest_ensure_response($resultado);
}

// Los íconos casi no cambian, pero si se edita o se crea una categoría, o se edita un menú,
// no hay que esperar una hora a que venza el transient solo.
add_action('edited_product_cat', function (): void {
    delete_transient('ringopet_categorias_iconos');
});
add_action('created_product_cat', function (): void {
    delete_transient('ringopet_categorias_iconos');
});
add_action('wp_update_nav_menu', function (): void {
    delete_transient('ringopet_categorias_iconos');
});
