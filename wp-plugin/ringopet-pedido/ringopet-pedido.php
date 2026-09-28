<?php
/**
 * Plugin Name: RingoPet Pedido
 * Description: Lectura de un pedido para la página "Gracias" de Astro (/pedido-recibido/), medios de pago para /finalizar-compra/ y alta de cuenta para pedidos de invitado. La Store API (wc/store/v1/order) no trae medio de pago, número de pedido ni fecha/turno de entrega: este endpoint sí. Además manda todas las vueltas de pago (incluida Mercado Pago) a /pedido-recibido/ en vez de la página de WordPress.
 * Version: 1.2.0
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
		add_action( 'rest_api_init', array( __CLASS__, 'registrar_ruta_medios_pago' ) );
		add_filter( 'woocommerce_get_checkout_order_received_url', array( __CLASS__, 'redirigir_a_gracias_astro' ), 20, 2 );

		// Astro paga siempre como invitado (create_account: false, "pago como invitado" ya
		// activado en Woo). Acá, después de crear el pedido, se asigna a una cuenta existente
		// o se crea una nueva — nunca se inicia sesión ni se manda nada de la cuenta al navegador.
		add_action( 'woocommerce_store_api_checkout_order_processed', array( __CLASS__, 'asignar_cuenta' ), 10 );

		// El listado de medios de pago se cachea unos minutos (ver responder_medios_pago);
		// se limpia solo si cambian los ajustes de pagos.
		add_action( 'woocommerce_settings_saved', array( __CLASS__, 'limpiar_cache_medios_pago' ) );
	}

	/* ------------------------------------------------------------------ */
	/* Alta de cuenta para pedidos de invitado                             */
	/* ------------------------------------------------------------------ */

	/**
	 * @param WC_Order $pedido
	 */
	public static function asignar_cuenta( $pedido ) {
		if ( ! $pedido instanceof WC_Order || $pedido->get_customer_id() ) {
			return; // Ya tiene sesión (cliente logueado): se deja como está.
		}

		$email = $pedido->get_billing_email();
		if ( ! is_email( $email ) ) {
			return;
		}

		$usuario = get_user_by( 'email', $email );
		if ( $usuario ) {
			$pedido->set_customer_id( $usuario->ID );
			$pedido->save();
			return;
		}

		// Usuario y contraseña en blanco: WooCommerce genera los dos solos y manda el
		// email de "elegí tu contraseña" (mismo flujo que el alta manual de Mi cuenta).
		$id_nuevo = wc_create_new_customer(
			$email,
			'',
			'',
			array(
				'first_name' => $pedido->get_billing_first_name(),
				'last_name'  => $pedido->get_billing_last_name(),
			)
		);
		if ( ! is_wp_error( $id_nuevo ) ) {
			$pedido->set_customer_id( $id_nuevo );
			$pedido->save();
		}
	}

	/* ------------------------------------------------------------------ */
	/* Medios de pago: título, descripción, ícono y privacidad de Woo       */
	/* ------------------------------------------------------------------ */

	public static function registrar_ruta_medios_pago() {
		register_rest_route(
			self::ESPACIO,
			'/medios-pago',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'responder_medios_pago' ),
			)
		);
	}

	public static function limpiar_cache_medios_pago() {
		delete_transient( 'ringopet_medios_pago' );
	}

	/**
	 * Título, descripción e ícono tal cual están en WooCommerce > Ajustes > Pagos, más el
	 * texto de privacidad del pago (wc_get_privacy_policy_text). Todo información pública,
	 * ya visible en el checkout clásico sin sesión. Se cachea 5 minutos (nada de esto cambia
	 * seguido) y se limpia solo si se guardan los ajustes de pagos.
	 */
	public static function responder_medios_pago() {
		if ( ! headers_sent() ) {
			nocache_headers();
		}

		$cache = get_transient( 'ringopet_medios_pago' );
		if ( false !== $cache ) {
			return rest_ensure_response( $cache );
		}

		// is_available() de algunos medios de pago mira el carrito (moneda, si necesita envío, etc.).
		if ( function_exists( 'wc_load_cart' ) && null === WC()->cart ) {
			wc_load_cart();
		}

		$medios = array();
		foreach ( WC()->payment_gateways()->get_available_payment_gateways() as $id => $gateway ) {
			$medios[ $id ] = array(
				'titulo'      => $gateway->get_title(),
				'descripcion' => $gateway->get_description(),
				// "bacs" usa el ícono de banco propio de Astro (pedido así); el resto (Mercado
				// Pago) trae su propio logo desde get_icon().
				'icono'       => 'bacs' === $id ? '' : $gateway->get_icon(),
			);
		}

		$texto_privacidad = function_exists( 'wc_get_privacy_policy_text' ) ? wc_get_privacy_policy_text( 'checkout' ) : '';
		// wc_get_privacy_policy_text() deja el placeholder [privacy_policy] tal cual: hay que
		// reemplazarlo por el enlace real a la página de privacidad configurada en WordPress.
		if ( $texto_privacidad && function_exists( 'wc_replace_policy_page_link_placeholders' ) ) {
			$texto_privacidad = wc_replace_policy_page_link_placeholders( $texto_privacidad );
		}

		$respuesta = array(
			'medios'           => $medios,
			'texto_privacidad' => $texto_privacidad,
		);

		set_transient( 'ringopet_medios_pago', $respuesta, 5 * MINUTE_IN_SECONDS );
		return rest_ensure_response( $respuesta );
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
		// para no revelar qué números de pedido son válidos. No importa si el pedido
		// quedó asignado a una cuenta o sigue de invitado: la clave alcanza siempre,
		// con o sin sesión iniciada — igual que la página de "gracias" nativa de Woo.
		if ( ! $pedido instanceof WC_Order || ! hash_equals( $pedido->get_order_key(), $clave ) ) {
			return new WP_Error( 'ringopet_pedido_no_encontrado', 'No encontramos ese pedido.', array( 'status' => 403 ) );
		}

		// Antes, un error de PHP acá adentro (por ejemplo una función de la que dependíamos
		// y no estaba cargada en el contexto de este endpoint) terminaba en una respuesta
		// 200 con el cuerpo vacío: Astro no tenía forma de saber qué pasó y mostraba "No
		// encontramos ese pedido", un mensaje engañoso. Envolver todo en try/catch evita el
		// cuerpo vacío: si algo vuelve a fallar, se ve el motivo real en el log del servidor
		// y Astro recibe un error explícito (no un 200 vacío disfrazado de "no encontrado").
		try {
			return rest_ensure_response( self::formatear( $pedido ) );
		} catch ( \Throwable $error ) {
			error_log( 'ringopet-pedido: error al formatear el pedido ' . $pedido->get_id() . ': ' . $error->getMessage() );
			return new WP_Error( 'ringopet_pedido_error', 'No pudimos preparar los datos del pedido.', array( 'status' => 500 ) );
		}
	}

	private static function formatear( WC_Order $pedido ) {
		$metodo = $pedido->get_payment_method();

		return array(
			'numero'                  => $pedido->get_order_number(),
			'estado'                  => $pedido->get_status(),
			'estado_label'            => wc_get_order_status_name( $pedido->get_status() ),
			// Antes usaba wc_rest_prepare_date_response(), de wc-rest-functions.php: en el
			// contexto de este endpoint (namespace propio, no wc/v3) esa función podía no
			// estar cargada todavía y tirar un error fatal — de ahí el cuerpo vacío que veía
			// Benja. Se arma la fecha a mano, sin esa dependencia.
			'fecha'                   => self::fecha_iso( $pedido->get_date_created() ),
			'email'                   => $pedido->get_billing_email(),
			'metodo_pago'             => $metodo,
			'metodo_pago_titulo'      => $pedido->get_payment_method_title(),
			'metodo_pago_descripcion' => self::descripcion_medio_pago( $metodo ),
			'items'                   => self::items( $pedido ),
			'subtotal'                => self::monto( self::subtotal( $pedido ) ),
			'descuento'               => self::monto( $pedido->get_total_discount() ),
			'envio'                   => '' !== $pedido->get_shipping_total() ? self::monto( $pedido->get_shipping_total() ) : null,
			'impuestos'               => self::monto( $pedido->get_total_tax() ),
			'total'                   => self::monto( $pedido->get_total() ),
			'moneda'                  => $pedido->get_currency(),
			'nota_cliente'            => $pedido->get_customer_note(),
			'cupones'                 => array_map( function ( $c ) {
				return $c->get_code();
			}, array_values( $pedido->get_items( 'coupon' ) ) ),
			'entrega'                 => self::entrega( $pedido ),
			'transferencia'           => 'bacs' === $metodo ? self::cuenta_bancaria() : null,
			'facturacion'             => self::direccion( $pedido, 'billing' ),
			'envio_direccion'         => self::direccion( $pedido, 'shipping' ),
		);
	}

	private static function fecha_iso( $fecha ) {
		return $fecha instanceof WC_DateTime ? $fecha->date( 'c' ) : null;
	}

	private static function descripcion_medio_pago( $metodo_id ) {
		if ( ! $metodo_id || ! function_exists( 'WC' ) || ! WC()->payment_gateways() ) {
			return '';
		}
		$gateways = WC()->payment_gateways()->payment_gateways();
		return isset( $gateways[ $metodo_id ] ) ? $gateways[ $metodo_id ]->get_description() : '';
	}

	/** Suma de los subtotales de línea (antes de descuentos), como el "Subtotal" del carrito. */
	private static function subtotal( WC_Order $pedido ) {
		$subtotal = 0;
		foreach ( $pedido->get_items() as $item ) {
			$subtotal += (float) $item->get_subtotal();
		}
		return $subtotal;
	}

	/**
	 * Dirección de facturación o envío. Para envío, null si el pedido no tiene una
	 * dirección de envío cargada (no necesitaba envío, o coincide con facturación y Woo
	 * no la duplicó) — Astro debe mostrar solo la de facturación en ese caso.
	 */
	private static function direccion( WC_Order $pedido, $prefijo ) {
		$campo = function ( $nombre ) use ( $pedido, $prefijo ) {
			$metodo = "get_{$prefijo}_{$nombre}";
			return method_exists( $pedido, $metodo ) ? $pedido->$metodo() : '';
		};

		$direccion1 = $campo( 'address_1' );
		if ( 'shipping' === $prefijo && '' === $direccion1 ) {
			return null;
		}

		return array(
			'nombre'    => trim( $campo( 'first_name' ) . ' ' . $campo( 'last_name' ) ),
			'telefono'  => 'billing' === $prefijo ? $pedido->get_billing_phone() : '',
			'direccion' => trim( $direccion1 . ' ' . $campo( 'address_2' ) ),
			'localidad' => $campo( 'city' ),
			'cp'        => $campo( 'postcode' ),
		);
	}

	private static function items( WC_Order $pedido ) {
		$items = array();
		foreach ( $pedido->get_items() as $item ) {
			$producto  = $item->get_product();
			$imagen    = $producto ? wp_get_attachment_image_url( $producto->get_image_id(), 'thumbnail' ) : null;
			$variacion = array();
			foreach ( $item->get_formatted_meta_data() as $meta ) {
				$variacion[] = wp_strip_all_tags( $meta->display_key ) . ': ' . wp_strip_all_tags( $meta->display_value );
			}
			$cantidad = $item->get_quantity();
			$items[]  = array(
				'nombre'          => $item->get_name(),
				'variacion'       => implode( ' · ', $variacion ),
				'cantidad'        => $cantidad,
				'precio_unitario' => self::monto( $cantidad ? $item->get_total() / $cantidad : 0 ),
				'total'           => self::monto( $item->get_total() ),
				'imagen'          => $imagen ?: null,
				'permalink'       => $producto ? $producto->get_permalink() : null,
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
