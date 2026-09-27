<?php
/**
 * Plugin Name: RingoPet Pedido
 * Description: Lectura de un pedido para la página "Gracias" de Astro (/pedido-recibido/). La Store API (wc/store/v1/order) no trae medio de pago, número de pedido ni fecha/turno de entrega: este endpoint sí. Además manda todas las vueltas de pago (incluida Mercado Pago) a /pedido-recibido/ en vez de la página de WordPress.
 * Version: 1.0.0
 * Author: Fluxa
 * Requires Plugins: woocommerce
 * Text Domain: ringopet-pedido
 *
 * GET /wp-json/ringopet/v1/pedido/<id>?key=<order_key>
 * Nunca requiere sesión ni email: la clave del pedido (wc_order_key, la misma
 * que ya usa la URL de "gracias" de WooCommerce) alcanza para leerlo, es un
 * secreto largo generado por WooCommerce.
 */

defined( 'ABSPATH' ) || exit;

final class RingoPet_Pedido {

	const ESPACIO = 'ringopet/v1';

	public static function iniciar() {
		add_action( 'rest_api_init', array( __CLASS__, 'registrar_ruta' ) );
		add_filter( 'woocommerce_get_checkout_order_received_url', array( __CLASS__, 'redirigir_a_gracias_astro' ), 20, 2 );
	}

	/* ------------------------------------------------------------------ */
	/* Redirección: toda vuelta de pago cae en /pedido-recibido/ de Astro   */
	/* ------------------------------------------------------------------ */

	/**
	 * @param string   $url
	 * @param WC_Order $pedido
	 * @return string
	 */
	public static function redirigir_a_gracias_astro( $url, $pedido ) {
		if ( ! $pedido instanceof WC_Order ) {
			return $url;
		}
		return add_query_arg(
			array(
				'pedido' => $pedido->get_id(),
				'key'    => $pedido->get_order_key(),
			),
			home_url( '/pedido-recibido/' )
		);
	}

	/* ------------------------------------------------------------------ */
	/* Lectura del pedido                                                   */
	/* ------------------------------------------------------------------ */

	public static function registrar_ruta() {
		register_rest_route(
			self::ESPACIO,
			'/pedido/(?P<id>\d+)',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'responder_pedido' ),
				'args'                => array(
					'id'  => array( 'validate_callback' => 'is_numeric' ),
					'key' => array( 'required' => true ),
				),
			)
		);
	}

	public static function responder_pedido( WP_REST_Request $peticion ) {
		if ( ! headers_sent() ) {
			nocache_headers();
		}

		$pedido = wc_get_order( (int) $peticion['id'] );
		$clave  = (string) $peticion->get_param( 'key' );

		// hash_equals evita comparar la clave letra por letra (timing attack) y de paso
		// devuelve el mismo 403 tanto si el pedido no existe como si la clave está mal,
		// para no revelar qué números de pedido son válidos.
		if ( ! $pedido instanceof WC_Order || ! hash_equals( $pedido->get_order_key(), $clave ) ) {
			return new WP_Error( 'ringopet_pedido_no_encontrado', 'No encontramos ese pedido.', array( 'status' => 403 ) );
		}

		return rest_ensure_response( self::formatear( $pedido ) );
	}

	private static function formatear( WC_Order $pedido ) {
		$metodo = $pedido->get_payment_method();

		return array(
			'numero'         => $pedido->get_order_number(),
			'estado'         => $pedido->get_status(),
			'estado_label'   => wc_get_order_status_name( $pedido->get_status() ),
			'fecha'          => wc_rest_prepare_date_response( $pedido->get_date_created() ),
			'metodo_pago'    => $metodo,
			'metodo_pago_titulo' => $pedido->get_payment_method_title(),
			'total'          => self::monto( $pedido->get_total() ),
			'moneda'         => $pedido->get_currency(),
			'items'          => self::items( $pedido ),
			'entrega'        => self::entrega( $pedido ),
			'transferencia'  => 'bacs' === $metodo ? self::cuenta_bancaria() : null,
		);
	}

	private static function items( WC_Order $pedido ) {
		$items = array();
		foreach ( $pedido->get_items() as $item ) {
			$producto = $item->get_product();
			$imagen   = $producto ? wp_get_attachment_image_url( $producto->get_image_id(), 'thumbnail' ) : null;
			$items[]  = array(
				'nombre'    => $item->get_name(),
				'cantidad'  => $item->get_quantity(),
				'total'     => self::monto( $item->get_total() ),
				'imagen'    => $imagen ?: null,
				'permalink' => $producto ? $producto->get_permalink() : null,
			);
		}
		return $items;
	}

	/** Fecha y turno guardados por ORDDD, leyendo la misma etiqueta configurada (ver plugin ringopet-entrega). */
	private static function entrega( WC_Order $pedido ) {
		$etiqueta_fecha = get_option( 'orddd_lite_delivery_date_field_label' );
		$etiqueta_turno = get_option( 'orddd_lite_delivery_timeslot_field_label' );

		$fecha = $etiqueta_fecha ? $pedido->get_meta( $etiqueta_fecha ) : '';
		$turno = $etiqueta_turno ? $pedido->get_meta( $etiqueta_turno ) : '';

		if ( '' === $fecha && '' === $turno ) {
			return null;
		}

		return array(
			'etiqueta_fecha' => $etiqueta_fecha ?: 'Fecha de entrega',
			'fecha'          => $fecha,
			'etiqueta_turno' => $etiqueta_turno ?: 'Turno de entrega',
			'turno'          => $turno,
		);
	}

	/**
	 * Cuenta de WooCommerce > Pagos > Transferencia bancaria (la primera activa).
	 * OJO: WooCommerce no tiene campos nativos "CVU"/"Alias" (son de Argentina);
	 * acá se usan los campos que ya existen en esa pantalla:
	 *   account_number -> CVU, iban -> Alias.
	 * Si en esa pantalla se cargó distinto, ajustar este mapeo.
	 */
	private static function cuenta_bancaria() {
		$cuentas = get_option( 'woocommerce_bacs_accounts' );
		if ( empty( $cuentas ) || ! is_array( $cuentas ) ) {
			return null;
		}
		$cuenta = $cuentas[0];
		return array(
			'titular' => isset( $cuenta['account_name'] ) ? $cuenta['account_name'] : '',
			'banco'   => isset( $cuenta['bank_name'] ) ? $cuenta['bank_name'] : '',
			'cvu'     => isset( $cuenta['account_number'] ) ? $cuenta['account_number'] : '',
			'alias'   => isset( $cuenta['iban'] ) ? $cuenta['iban'] : '',
		);
	}

	private static function monto( $valor ) {
		return number_format( (float) $valor, 2, '.', '' );
	}
}

add_action( 'plugins_loaded', array( 'RingoPet_Pedido', 'iniciar' ), 20 );
