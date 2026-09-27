<?php
/**
 * Plugin Name: RingoPet - Regenerar sitio Astro
 * Description: Avisa a GitHub Actions cuando cambia un producto de WooCommerce (alta, edición, borrado o cambio de stock), agrupando los avisos: como mucho dispara una regeneración cada 10 minutos.
 * Version: 1.0.0
 * Author: Fluxa
 */

if (!defined('ABSPATH')) {
    exit;
}

define('RINGOPET_REGENERAR_INTERVALO', 10 * MINUTE_IN_SECONDS);
define('RINGOPET_REGENERAR_HOOK', 'ringopet_disparar_regeneracion');

/** Marca que hay cambios pendientes y programa un único disparo agrupado. */
function ringopet_marcar_pendiente(): void {
    if (!wp_next_scheduled(RINGOPET_REGENERAR_HOOK)) {
        wp_schedule_single_event(time() + RINGOPET_REGENERAR_INTERVALO, RINGOPET_REGENERAR_HOOK);
    }
}

add_action('save_post_product', 'ringopet_marcar_pendiente');
add_action('woocommerce_update_product', 'ringopet_marcar_pendiente');
add_action('woocommerce_new_product', 'ringopet_marcar_pendiente');
add_action('woocommerce_product_set_stock', 'ringopet_marcar_pendiente');
add_action('woocommerce_variation_set_stock', 'ringopet_marcar_pendiente');
add_action('woocommerce_product_set_stock_status', 'ringopet_marcar_pendiente');

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
