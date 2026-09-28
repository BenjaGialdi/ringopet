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
