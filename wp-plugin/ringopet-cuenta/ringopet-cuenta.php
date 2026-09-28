<?php
/**
 * Plugin Name: RingoPet Cuenta
 * Description: "Mi cuenta" para Astro (/mi-cuenta/...): sesión, pedidos, direcciones, datos y recuperación de contraseña, todo con las cookies nativas de WordPress. Independiente de ringopet-pedido y ringopet-entrega (se puede desactivar sin afectarlos).
 * Version: 1.1.0
 * Author: Fluxa
 * Requires Plugins: woocommerce
 * Text Domain: ringopet-cuenta
 *
 * Endpoints, todos bajo /wp-json/ringopet/v1/cuenta/:
 *   GET  sesion       pública, sin datos personales si no hay sesión.
 *   POST ingresar     pública, wp_signon con límite de intentos.
 *   POST salir        requiere sesión (WordPress exige el nonce solo).
 *   GET  pedidos      requiere sesión.
 *   GET  pedido       requiere sesión, valida que el pedido sea del usuario.
 *   GET  direcciones  requiere sesión.
 *   POST direcciones  requiere sesión.
 *   GET  datos        requiere sesión.
 *   POST datos        requiere sesión.
 *   POST recuperar    pública, respuesta idéntica exista o no el email.
 *   POST nueva-clave  pública, valida la clave de recuperación de WordPress.
 *
 * Seguridad: WordPress ya exige un nonce válido (wp_rest) en cualquier
 * llamada de un visitante con sesión iniciada (rest_cookie_check_errors,
 * núcleo de WordPress) — no hace falta reimplementar eso acá. Lo que sí
 * hace este plugin: límite de intentos de login y de recuperación (por IP
 * y por usuario), mensajes genéricos (nunca revelan si un usuario o email
 * existen) y que cada operación sobre pedidos/direcciones/datos use
 * siempre get_current_user_id(), nunca un id que mande el navegador.
 */

defined( 'ABSPATH' ) || exit;

final class RingoPet_Cuenta {

	const ESPACIO         = 'ringopet/v1';
	const LIMITE_INTENTOS = 5;
	const VENTANA_INTENTOS = 15 * MINUTE_IN_SECONDS;

	// Misma lista de localidades que /finalizar-compra/ (ver PENDIENTE en
	// src/pages/finalizar-compra/index.astro y src/pages/mi-cuenta/direcciones/index.astro).
	const LOCALIDADES = array( 'Córdoba', 'La Calera', 'Saldán', 'Villa Allende', 'Mendiolaza', 'Unquillo', 'Río Ceballos' );

	public static function iniciar() {
		add_action( 'rest_api_init', array( __CLASS__, 'registrar_rutas' ) );

		// Enlaces de WordPress/WooCommerce que apuntan a Mi cuenta: a las páginas de Astro.
		add_filter( 'lostpassword_url', array( __CLASS__, 'url_recuperar' ), 10, 1 );
		add_filter( 'retrieve_password_message', array( __CLASS__, 'mensaje_recuperar' ), 10, 4 );
		add_filter( 'woocommerce_get_view_order_url', array( __CLASS__, 'url_ver_pedido' ), 10, 2 );
	}

	/* ------------------------------------------------------------------ */
	/* Enlaces hacia Astro                                                  */
	/* ------------------------------------------------------------------ */

	public static function url_recuperar( $url ) {
		return home_url( '/mi-cuenta/recuperar/' );
	}

	/** Reescribe el enlace de wp-login.php del email de "recuperar contraseña" (flujo de autoservicio). */
	public static function mensaje_recuperar( $mensaje, $key, $user_login, $user_data ) {
		$url_nueva = add_query_arg(
			array(
				'key'   => $key,
				'login' => rawurlencode( $user_login ),
			),
			home_url( '/mi-cuenta/nueva-clave/' )
		);
		// El mensaje de WordPress trae la URL de wp-login.php ya armada en una línea propia:
		// se reemplaza esa URL completa por la nuestra, sin tocar el resto del texto.
		$patron = '#https?://[^\s]*wp-login\.php\?action=rp[^\s]*#';
		return preg_replace( $patron, $url_nueva, $mensaje );
	}

	/**
	 * El email de "elegí tu contraseña" que manda WooCommerce al crear una cuenta desde el pago
	 * (wc_create_new_customer con contraseña en blanco) apunta al endpoint nativo de Mi cuenta
	 * (/mi-cuenta/lost-password/?key=...&login=...), que ahora es una carpeta de Astro: esa
	 * página redirige a /mi-cuenta/nueva-clave/ conservando key y login. No hace falta filtrar
	 * el email en sí — alcanza con que la página exista.
	 */

	/**
	 * @param string          $url
	 * @param WC_Order|int    $pedido El filtro nativo manda el WC_Order completo (WC_Abstract_Order::get_view_order_url),
	 *                                pero se acepta también un id suelto por las dudas de que algún llamador mande eso.
	 */
	public static function url_ver_pedido( $url, $pedido ) {
		$id = $pedido instanceof WC_Order ? $pedido->get_id() : (int) $pedido;
		return home_url( '/mi-cuenta/pedido/?id=' . $id );
	}

	/* ------------------------------------------------------------------ */
	/* Rutas                                                                */
	/* ------------------------------------------------------------------ */

	public static function registrar_rutas() {
		register_rest_route( self::ESPACIO, '/cuenta/sesion', array(
			'methods'             => 'GET',
			'permission_callback' => '__return_true',
			'callback'            => array( __CLASS__, 'sesion' ),
		) );

		register_rest_route( self::ESPACIO, '/cuenta/ingresar', array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true',
			'callback'            => array( __CLASS__, 'ingresar' ),
		) );

		register_rest_route( self::ESPACIO, '/cuenta/salir', array(
			'methods'             => 'POST',
			'permission_callback' => array( __CLASS__, 'requiere_sesion' ),
			'callback'            => array( __CLASS__, 'salir' ),
		) );

		register_rest_route( self::ESPACIO, '/cuenta/pedidos', array(
			'methods'             => 'GET',
			'permission_callback' => array( __CLASS__, 'requiere_sesion' ),
			'callback'            => array( __CLASS__, 'pedidos' ),
		) );

		register_rest_route( self::ESPACIO, '/cuenta/pedido', array(
			'methods'             => 'GET',
			'permission_callback' => array( __CLASS__, 'requiere_sesion' ),
			'callback'            => array( __CLASS__, 'pedido' ),
		) );

		register_rest_route( self::ESPACIO, '/cuenta/direcciones', array(
			array(
				'methods'             => 'GET',
				'permission_callback' => array( __CLASS__, 'requiere_sesion' ),
				'callback'            => array( __CLASS__, 'obtener_direccion' ),
			),
			array(
				'methods'             => 'POST',
				'permission_callback' => array( __CLASS__, 'requiere_sesion' ),
				'callback'            => array( __CLASS__, 'guardar_direccion' ),
			),
		) );

		register_rest_route( self::ESPACIO, '/cuenta/datos', array(
			array(
				'methods'             => 'GET',
				'permission_callback' => array( __CLASS__, 'requiere_sesion' ),
				'callback'            => array( __CLASS__, 'obtener_datos' ),
			),
			array(
				'methods'             => 'POST',
				'permission_callback' => array( __CLASS__, 'requiere_sesion' ),
				'callback'            => array( __CLASS__, 'guardar_datos' ),
			),
		) );

		register_rest_route( self::ESPACIO, '/cuenta/recuperar', array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true',
			'callback'            => array( __CLASS__, 'recuperar' ),
		) );

		register_rest_route( self::ESPACIO, '/cuenta/nueva-clave', array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true',
			'callback'            => array( __CLASS__, 'nueva_clave' ),
		) );
	}

	public static function requiere_sesion() {
		return is_user_logged_in();
	}

	private static function sin_cache() {
		if ( ! headers_sent() ) {
			nocache_headers();
		}
	}

	/* ------------------------------------------------------------------ */
	/* Sesión                                                               */
	/* ------------------------------------------------------------------ */

	public static function sesion() {
		self::sin_cache();
		// No usar is_user_logged_in(): en la API REST, WordPress trata como invitado a
		// cualquiera que no mande el nonce (rest_cookie_check_errors), y este endpoint es
		// justamente el que entrega el nonce. Se valida la cookie de sesión directamente.
		$id_usuario = wp_validate_auth_cookie( '', 'logged_in' );
		if ( ! $id_usuario ) {
			return rest_ensure_response( array( 'sesion' => false ) );
		}
		wp_set_current_user( $id_usuario );
		$usuario = wp_get_current_user();
		return rest_ensure_response( array(
			'sesion'  => true,
			'nombre'  => $usuario->first_name ? $usuario->first_name : $usuario->display_name,
			'nonce'   => wp_create_nonce( 'wp_rest' ),
			// El resumen (últimos 5 pedidos) va acá adentro para que /mi-cuenta/ resuelva
			// todo con una sola consulta, en vez de sesion + pedidos por separado.
			'resumen' => array( 'pedidos' => self::ultimos_pedidos( $id_usuario, 5 ) ),
		) );
	}

	private static function ultimos_pedidos( $id_usuario, $cantidad ) {
		$pedidos = wc_get_orders( array(
			'customer_id' => $id_usuario,
			'limit'       => $cantidad,
			'orderby'     => 'date',
			'order'       => 'DESC',
		) );
		return array_map( array( __CLASS__, 'resumen_pedido' ), $pedidos );
	}

	private static function resumen_pedido( WC_Order $pedido ) {
		return array(
			'id'           => $pedido->get_id(),
			'numero'       => $pedido->get_order_number(),
			'fecha'        => $pedido->get_date_created() ? $pedido->get_date_created()->date( 'c' ) : null,
			'estado'       => $pedido->get_status(),
			'estado_label' => wc_get_order_status_name( $pedido->get_status() ),
			'total'        => number_format( (float) $pedido->get_total(), 2, '.', '' ),
		) + self::avance( $pedido );
	}

	/* ------------------------------------------------------------------ */
	/* Límite de intentos (login y recuperar), por IP y por identidad       */
	/* ------------------------------------------------------------------ */

	private static function ip_actual() {
		return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '0.0.0.0';
	}

	/** @return true si se puede seguir, false si ya se pasó del límite. */
	private static function verificar_limite( $clave ) {
		$transient = 'ringopet_intentos_' . md5( $clave );
		$intentos  = (int) get_transient( $transient );
		return $intentos < self::LIMITE_INTENTOS;
	}

	private static function registrar_intento( $clave ) {
		$transient = 'ringopet_intentos_' . md5( $clave );
		$intentos  = (int) get_transient( $transient );
		set_transient( $transient, $intentos + 1, self::VENTANA_INTENTOS );
	}

	private static function limpiar_intentos( $clave ) {
		delete_transient( 'ringopet_intentos_' . md5( $clave ) );
	}

	/* ------------------------------------------------------------------ */
	/* Ingresar / salir                                                     */
	/* ------------------------------------------------------------------ */

	public static function ingresar( WP_REST_Request $peticion ) {
		self::sin_cache();

		$usuario = sanitize_text_field( (string) $peticion->get_param( 'usuario' ) );
		$clave   = (string) $peticion->get_param( 'clave' );
		$recordarme = (bool) $peticion->get_param( 'recordarme' );

		if ( '' === $usuario || '' === $clave ) {
			return new WP_Error( 'ringopet_datos_incompletos', 'Completá usuario y contraseña.', array( 'status' => 400 ) );
		}

		$clave_ip     = 'ip_' . self::ip_actual();
		$clave_usuario = 'user_' . strtolower( $usuario );

		if ( ! self::verificar_limite( $clave_ip ) || ! self::verificar_limite( $clave_usuario ) ) {
			return new WP_Error( 'ringopet_demasiados_intentos', 'Demasiados intentos. Probá de nuevo en unos minutos.', array( 'status' => 429 ) );
		}

		// El nonce depende del token de sesión que viaja en la cookie logged_in. En este
		// mismo pedido la cookie recién se está enviando al navegador y $_COOKIE todavía no
		// la tiene: se copia acá para que el nonce que se devuelve sea válido después.
		add_action(
			'set_logged_in_cookie',
			function ( $cookie ) {
				$_COOKIE[ LOGGED_IN_COOKIE ] = $cookie;
			}
		);

		$resultado = wp_signon( array(
			'user_login'    => $usuario,
			'user_password' => $clave,
			'remember'      => $recordarme,
		), is_ssl() );

		if ( is_wp_error( $resultado ) ) {
			self::registrar_intento( $clave_ip );
			self::registrar_intento( $clave_usuario );
			// Nunca decir cuál de los dos campos está mal: no revela si el usuario existe.
			return new WP_Error( 'ringopet_login_invalido', 'Usuario o contraseña incorrectos.', array( 'status' => 401 ) );
		}

		self::limpiar_intentos( $clave_ip );
		self::limpiar_intentos( $clave_usuario );

		wp_set_current_user( $resultado->ID );

		return rest_ensure_response( array(
			'sesion' => true,
			'nombre' => $resultado->first_name ? $resultado->first_name : $resultado->display_name,
			'nonce'  => wp_create_nonce( 'wp_rest' ),
		) );
	}

	public static function salir() {
		wp_logout();
		return rest_ensure_response( array( 'ok' => true ) );
	}

	/* ------------------------------------------------------------------ */
	/* Pedidos                                                              */
	/* ------------------------------------------------------------------ */

	public static function pedidos( WP_REST_Request $peticion ) {
		self::sin_cache();

		$pagina = max( 1, (int) $peticion->get_param( 'pagina' ) );
		$resultado = wc_get_orders( array(
			'customer_id' => get_current_user_id(),
			'limit'       => 10,
			'page'        => $pagina,
			'paginate'    => true,
			'orderby'     => 'date',
			'order'       => 'DESC',
		) );

		$pedidos = array_map( array( __CLASS__, 'resumen_pedido' ), $resultado->orders );

		return rest_ensure_response( array(
			'pedidos'      => $pedidos,
			'pagina'       => $pagina,
			'total_paginas' => (int) $resultado->max_num_pages,
		) );
	}

	public static function pedido( WP_REST_Request $peticion ) {
		self::sin_cache();

		$id     = (int) $peticion->get_param( 'id' );
		$pedido = wc_get_order( $id );

		if ( ! $pedido instanceof WC_Order || (int) $pedido->get_customer_id() !== get_current_user_id() ) {
			// Mismo error tanto si el pedido no existe como si es de otro cliente: no revela nada.
			return new WP_Error( 'ringopet_pedido_no_encontrado', 'No encontramos ese pedido.', array( 'status' => 404 ) );
		}

		try {
			return rest_ensure_response( self::formatear_pedido( $pedido ) );
		} catch ( \Throwable $error ) {
			error_log( 'ringopet-cuenta: error al formatear el pedido ' . $pedido->get_id() . ': ' . $error->getMessage() );
			return new WP_Error( 'ringopet_pedido_error', 'No pudimos preparar los datos del pedido.', array( 'status' => 500 ) );
		}
	}

	/** Mismo criterio que ringopet-pedido::formatear(), duplicado a propósito: cada plugin queda independiente. */
	private static function formatear_pedido( WC_Order $pedido ) {
		$metodo = $pedido->get_payment_method();

		$items    = array();
		$subtotal = 0;
		foreach ( $pedido->get_items() as $item ) {
			$producto = $item->get_product();
			$imagen   = $producto ? wp_get_attachment_image_url( $producto->get_image_id(), 'thumbnail' ) : null;
			$cantidad = $item->get_quantity();
			$subtotal += (float) $item->get_subtotal(); // WC_Order no tiene get_subtotal(): se suma línea por línea, antes del descuento.
			$items[]  = array(
				'nombre'          => $item->get_name(),
				'cantidad'        => $cantidad,
				'precio_unitario' => number_format( $cantidad ? (float) $item->get_total() / $cantidad : 0, 2, '.', '' ),
				'total'           => number_format( (float) $item->get_total(), 2, '.', '' ),
				'imagen'          => $imagen ?: null,
				'permalink'       => $producto ? $producto->get_permalink() : null,
			);
		}

		$etiqueta_fecha = get_option( 'orddd_lite_delivery_date_field_label' );
		$etiqueta_turno = get_option( 'orddd_lite_delivery_timeslot_field_label' );
		$fecha_entrega  = $etiqueta_fecha ? $pedido->get_meta( $etiqueta_fecha ) : '';
		$turno_entrega  = $etiqueta_turno ? $pedido->get_meta( $etiqueta_turno ) : '';

		return array(
			'id'                 => $pedido->get_id(),
			'numero'             => $pedido->get_order_number(),
			'estado'             => $pedido->get_status(),
			'estado_label'       => wc_get_order_status_name( $pedido->get_status() ),
			'fecha'              => $pedido->get_date_created() ? $pedido->get_date_created()->date( 'c' ) : null,
			'metodo_pago_titulo' => $pedido->get_payment_method_title(),
			'items'              => $items,
			'subtotal'           => number_format( $subtotal, 2, '.', '' ),
			'total'              => number_format( (float) $pedido->get_total(), 2, '.', '' ),
			'entrega'            => ( '' === $fecha_entrega && '' === $turno_entrega ) ? null : array(
				'etiqueta_fecha' => $etiqueta_fecha ?: 'Fecha de entrega',
				'fecha'          => $fecha_entrega,
				'etiqueta_turno' => $etiqueta_turno ?: 'Turno de entrega',
				'turno'          => $turno_entrega,
			),
			'transferencia'      => 'bacs' === $metodo ? self::cuenta_bancaria() : null,
		) + self::avance( $pedido );
	}

	/**
	 * Línea de avance de 4 pasos, mismo criterio que ringopet-pedido::avance() (duplicado
	 * a propósito, ver la nota de formatear_pedido()): lee los estados configurables del
	 * plugin de repartos (Local Delivery Drivers) directo de sus opciones.
	 *
	 * @return array{paso: int|null, aviso: string|null, texto: string|null}
	 */
	private static function avance( WC_Order $pedido ) {
		$estado = $pedido->get_status();

		$sin_prefijo = function ( $valor ) {
			$valor = (string) $valor;
			return 0 === strpos( $valor, 'wc-' ) ? substr( $valor, 3 ) : $valor;
		};

		$procesando      = $sin_prefijo( get_option( 'lddfw_processing_status' ) );
		$asignado        = $sin_prefijo( get_option( 'lddfw_driver_assigned_status' ) );
		$en_camino       = $sin_prefijo( get_option( 'lddfw_out_for_delivery_status' ) );
		$entregado       = $sin_prefijo( get_option( 'lddfw_delivered_status' ) ) ?: 'completed';
		$intento_fallido = $sin_prefijo( get_option( 'lddfw_failed_attempt_status' ) );

		if ( in_array( $estado, array( 'cancelled', 'refunded', 'failed' ), true ) ) {
			return array( 'paso' => null, 'aviso' => wc_get_order_status_name( $pedido->get_status() ), 'texto' => null );
		}

		if ( $intento_fallido && $estado === $intento_fallido ) {
			return array( 'paso' => null, 'aviso' => 'No pudimos entregar tu pedido, te vamos a contactar.', 'texto' => null );
		}

		if ( in_array( $estado, array( 'pending', 'on-hold' ), true ) ) {
			return array(
				'paso'  => 1,
				'aviso' => null,
				'texto' => 'bacs' === $pedido->get_payment_method() ? 'Esperando confirmación del pago' : null,
			);
		}

		if ( $estado === $entregado ) {
			return array( 'paso' => 4, 'aviso' => null, 'texto' => null );
		}

		if ( $en_camino && $estado === $en_camino ) {
			return array( 'paso' => 3, 'aviso' => null, 'texto' => null );
		}

		if ( ( $procesando && $estado === $procesando ) || ( $asignado && $estado === $asignado ) || 'processing' === $estado ) {
			return array( 'paso' => 2, 'aviso' => null, 'texto' => null );
		}

		return array( 'paso' => null, 'aviso' => wc_get_order_status_name( $pedido->get_status() ), 'texto' => null );
	}

	private static function cuenta_bancaria() {
		$cuentas = get_option( 'woocommerce_bacs_accounts' );
		if ( empty( $cuentas ) || ! is_array( $cuentas ) ) {
			return null;
		}
		$cuenta = $cuentas[0];
		return array(
			'titular' => isset( $cuenta['account_name'] ) ? $cuenta['account_name'] : '',
			'cvu'     => isset( $cuenta['account_number'] ) ? $cuenta['account_number'] : '',
			'alias'   => isset( $cuenta['iban'] ) ? $cuenta['iban'] : '',
		);
	}

	/* ------------------------------------------------------------------ */
	/* Direcciones                                                         */
	/* ------------------------------------------------------------------ */

	public static function obtener_direccion() {
		self::sin_cache();
		$cliente = new WC_Customer( get_current_user_id() );
		return rest_ensure_response( array(
			'first_name' => $cliente->get_shipping_first_name(),
			'last_name'  => $cliente->get_shipping_last_name(),
			'phone'      => $cliente->get_billing_phone(),
			'address_1'  => $cliente->get_shipping_address_1(),
			'address_2'  => $cliente->get_shipping_address_2(),
			'city'       => $cliente->get_shipping_city(),
			'postcode'   => $cliente->get_shipping_postcode(),
		) );
	}

	public static function guardar_direccion( WP_REST_Request $peticion ) {
		self::sin_cache();

		$city = sanitize_text_field( (string) $peticion->get_param( 'city' ) );
		if ( ! in_array( $city, self::LOCALIDADES, true ) ) {
			return new WP_Error( 'ringopet_localidad_invalida', 'Elegí una localidad de la lista.', array( 'status' => 400 ) );
		}

		$campos = array(
			'first_name' => sanitize_text_field( (string) $peticion->get_param( 'first_name' ) ),
			'last_name'  => sanitize_text_field( (string) $peticion->get_param( 'last_name' ) ),
			'phone'      => sanitize_text_field( (string) $peticion->get_param( 'phone' ) ),
			'address_1'  => sanitize_text_field( (string) $peticion->get_param( 'address_1' ) ),
			'address_2'  => sanitize_text_field( (string) $peticion->get_param( 'address_2' ) ),
			'city'       => $city,
			'postcode'   => sanitize_text_field( (string) $peticion->get_param( 'postcode' ) ),
		);

		foreach ( array( 'first_name', 'last_name', 'address_1', 'address_2', 'city', 'postcode' ) as $campo_obligatorio ) {
			if ( '' === $campos[ $campo_obligatorio ] && 'address_2' !== $campo_obligatorio ) {
				return new WP_Error( 'ringopet_direccion_incompleta', 'Completá todos los campos obligatorios.', array( 'status' => 400 ) );
			}
		}

		$cliente = new WC_Customer( get_current_user_id() );
		$cliente->set_shipping_first_name( $campos['first_name'] );
		$cliente->set_shipping_last_name( $campos['last_name'] );
		$cliente->set_billing_phone( $campos['phone'] );
		$cliente->set_shipping_address_1( $campos['address_1'] );
		$cliente->set_shipping_address_2( $campos['address_2'] );
		$cliente->set_shipping_city( $campos['city'] );
		$cliente->set_shipping_postcode( $campos['postcode'] );
		$cliente->set_shipping_country( 'AR' );
		// Facturación igual a envío: el pago tampoco pide una dirección de facturación distinta.
		$cliente->set_billing_first_name( $campos['first_name'] );
		$cliente->set_billing_last_name( $campos['last_name'] );
		$cliente->set_billing_address_1( $campos['address_1'] );
		$cliente->set_billing_address_2( $campos['address_2'] );
		$cliente->set_billing_city( $campos['city'] );
		$cliente->set_billing_postcode( $campos['postcode'] );
		$cliente->set_billing_country( 'AR' );
		$cliente->save();

		return rest_ensure_response( array( 'ok' => true ) );
	}

	/* ------------------------------------------------------------------ */
	/* Datos de la cuenta                                                   */
	/* ------------------------------------------------------------------ */

	public static function obtener_datos() {
		self::sin_cache();
		$usuario = wp_get_current_user();

		$nombre   = $usuario->first_name;
		$apellido = $usuario->last_name;

		// Si la cuenta nunca guardó nombre/apellido propios (por ejemplo una cuenta creada
		// sola desde un pago, ver "Cuenta para pedidos de invitado"), se completa con los
		// de facturación del cliente de WooCommerce. Si tampoco hay, queda vacío.
		if ( '' === $nombre || '' === $apellido ) {
			$cliente = new WC_Customer( $usuario->ID );
			if ( '' === $nombre ) {
				$nombre = $cliente->get_billing_first_name();
			}
			if ( '' === $apellido ) {
				$apellido = $cliente->get_billing_last_name();
			}
		}

		return rest_ensure_response( array(
			'first_name' => $nombre,
			'last_name'  => $apellido,
			'email'      => $usuario->user_email,
		) );
	}

	public static function guardar_datos( WP_REST_Request $peticion ) {
		self::sin_cache();

		$id     = get_current_user_id();
		$email  = sanitize_email( (string) $peticion->get_param( 'email' ) );
		$nombre = sanitize_text_field( (string) $peticion->get_param( 'first_name' ) );
		$apellido = sanitize_text_field( (string) $peticion->get_param( 'last_name' ) );
		$clave_actual = (string) $peticion->get_param( 'clave_actual' );
		$clave_nueva  = (string) $peticion->get_param( 'clave_nueva' );

		if ( ! is_email( $email ) ) {
			return new WP_Error( 'ringopet_email_invalido', 'Ese email no es válido.', array( 'status' => 400 ) );
		}
		$existente = email_exists( $email );
		if ( $existente && (int) $existente !== $id ) {
			return new WP_Error( 'ringopet_email_en_uso', 'Ese email ya está en uso por otra cuenta.', array( 'status' => 400 ) );
		}

		$datos_actualizar = array(
			'ID'         => $id,
			'user_email' => $email,
			'first_name' => $nombre,
			'last_name'  => $apellido,
		);

		if ( '' !== $clave_nueva ) {
			$usuario = get_userdata( $id );
			if ( ! $usuario || ! wp_check_password( $clave_actual, $usuario->user_pass, $id ) ) {
				return new WP_Error( 'ringopet_clave_actual_incorrecta', 'La contraseña actual no es correcta.', array( 'status' => 400 ) );
			}
			$datos_actualizar['user_pass'] = $clave_nueva;
		}

		$resultado = wp_update_user( $datos_actualizar );
		if ( is_wp_error( $resultado ) ) {
			return new WP_Error( 'ringopet_no_se_pudo_guardar', 'No pudimos guardar los cambios.', array( 'status' => 500 ) );
		}

		return rest_ensure_response( array( 'ok' => true ) );
	}

	/* ------------------------------------------------------------------ */
	/* Recuperar / elegir contraseña nueva                                 */
	/* ------------------------------------------------------------------ */

	public static function recuperar( WP_REST_Request $peticion ) {
		self::sin_cache();

		// retrieve_password() acepta usuario o email indistintamente.
		$valor = sanitize_text_field( (string) $peticion->get_param( 'usuario' ) );
		$clave_ip = 'ip_recuperar_' . self::ip_actual();

		// Respuesta siempre igual, exista o no el email/usuario — evita revelar cuentas.
		// El límite de intentos solo protege contra abuso masivo (spam de emails), no bloquea
		// al visitante: si se pasa, igual responde "ok" (nunca delata que hay un límite).
		if ( self::verificar_limite( $clave_ip ) && '' !== $valor ) {
			self::registrar_intento( $clave_ip );
			retrieve_password( $valor );
		}

		return rest_ensure_response( array( 'ok' => true ) );
	}

	public static function nueva_clave( WP_REST_Request $peticion ) {
		self::sin_cache();

		$key   = (string) $peticion->get_param( 'key' );
		$login = (string) $peticion->get_param( 'login' );
		$clave = (string) $peticion->get_param( 'clave' );

		if ( '' === $key || '' === $login || '' === $clave ) {
			return new WP_Error( 'ringopet_datos_incompletos', 'Faltan datos.', array( 'status' => 400 ) );
		}

		$usuario = check_password_reset_key( $key, $login );
		if ( is_wp_error( $usuario ) ) {
			return new WP_Error( 'ringopet_enlace_invalido', 'El enlace venció o no es válido. Pedí uno nuevo.', array( 'status' => 400 ) );
		}

		reset_password( $usuario, $clave );

		return rest_ensure_response( array( 'ok' => true ) );
	}
}

add_action( 'plugins_loaded', array( 'RingoPet_Cuenta', 'iniciar' ), 20 );
