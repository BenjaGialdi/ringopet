<?php
/**
 * Plugin Name: RingoPet Entrega
 * Description: Fecha y turno de entrega para el pago hecho en Astro. Usa las reglas y la configuración de Order Delivery Date Lite (ORDDD), así todo sigue igual: mismos días, turnos, anticipación, feriados, cupos y los mismos datos guardados en el pedido.
 * Version: 1.0.0
 * Author: Fluxa
 * Requires Plugins: woocommerce
 * Text Domain: ringopet-entrega
 *
 * Cómo funciona:
 * 1. GET /wp-json/ringopet/v1/entrega devuelve los días disponibles con sus turnos,
 *    calculados con las mismas funciones de ORDDD que usa el pago clásico.
 * 2. El pago de Astro manda la elección en la Store API:
 *    extensions['order-delivery-date'] = {
 *      h_deliverydate: 'j-n-Y',            (ej. '29-9-2026')
 *      e_deliverydate: texto de la fecha,  (ej. '29 Septiembre, 2026')
 *      orddd_lite_time_slot: turno         (ej. '10:00 - 14:00')
 *    }
 *    ORDDD ya sabe guardar eso en el pedido (lo trae de fábrica para el pago de bloques).
 * 3. Este plugin valida ANTES de crear el pedido que la fecha y el turno sigan disponibles,
 *    y corta con un error claro en castellano si no.
 * 4. Registra el pedido en el plugin de repartos (Local Delivery Drivers), que solo
 *    escucha el pago clásico.
 */

defined( 'ABSPATH' ) || exit;

use Automattic\WooCommerce\StoreApi\Exceptions\RouteException;

final class RingoPet_Entrega {

	const ESPACIO = 'ringopet/v1';
	const MAX_DIAS_A_REVISAR = 60;

	public static function iniciar() {
		add_action( 'rest_api_init', array( __CLASS__, 'registrar_ruta' ) );
		// Prioridad 5: corre antes que ORDDD (10), así un turno vencido corta antes de guardar nada.
		add_action( 'woocommerce_store_api_checkout_update_order_from_request', array( __CLASS__, 'validar_pedido' ), 5, 2 );
		add_action( 'woocommerce_store_api_checkout_order_processed', array( __CLASS__, 'sincronizar_repartos' ), 20 );
	}

	/* ------------------------------------------------------------------ */
	/* Disponibilidad                                                      */
	/* ------------------------------------------------------------------ */

	public static function registrar_ruta() {
		register_rest_route(
			self::ESPACIO,
			'/entrega',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'responder_disponibilidad' ),
			)
		);
	}

	public static function responder_disponibilidad() {
		if ( ! self::orddd_disponible() ) {
			return new WP_Error( 'ringopet_sin_orddd', 'Order Delivery Date Lite no está activo.', array( 'status' => 503 ) );
		}

		// Nunca cachear: depende de la hora y de los cupos.
		if ( ! headers_sent() ) {
			nocache_headers();
		}
		do_action( 'litespeed_control_set_nocache', 'ringopet entrega' );

		$respuesta = rest_ensure_response( self::disponibilidad() );
		$respuesta->header( 'Cache-Control', 'no-store, max-age=0' );
		return $respuesta;
	}

	/**
	 * Días disponibles con sus turnos.
	 *
	 * @return array
	 */
	public static function disponibilidad() {
		self::cargar_carrito();

		$ajustes = Orddd_Lite_Common::orddd_lite_localize_data_script();
		if ( empty( $ajustes ) ) {
			return array(
				'activo' => false,
				'dias'   => array(),
			);
		}

		$con_turnos   = 'on' === get_option( 'orddd_lite_enable_time_slot' );
		$feriados     = self::feriados( isset( $ajustes['orddd_lite_holidays'] ) ? $ajustes['orddd_lite_holidays'] : '' );
		$bloqueados   = self::lista_entre_comillas( isset( $ajustes['orddd_lite_lockout_days'] ) ? $ajustes['orddd_lite_lockout_days'] : '' );
		$cantidad     = absint( get_option( 'orddd_lite_number_of_dates' ) );
		$cantidad     = $cantidad > 0 ? $cantidad : 30;
		$fecha_minima = isset( $ajustes['orddd_min_date_set'] ) ? strtotime( $ajustes['orddd_min_date_set'] ) : 0;
		$ahora        = current_time( 'timestamp' ); // phpcs:ignore
		// current_time( 'timestamp' ) da la hora local de WordPress; gmdate() la lee tal cual.
		$hoy          = strtotime( gmdate( 'Y-m-d', $ahora ) );

		$dias = array();
		for ( $i = 0; $i < self::MAX_DIAS_A_REVISAR && count( $dias ) < $cantidad; $i++ ) {
			$dia = strtotime( '+' . $i . ' day', $hoy );

			if ( $fecha_minima && $dia < $fecha_minima ) {
				continue;
			}

			$semana = gmdate( 'w', $dia );
			if ( isset( $ajustes[ 'orddd_lite_weekday_' . $semana ] ) && 'checked' !== $ajustes[ 'orddd_lite_weekday_' . $semana ] ) {
				continue; // Día de la semana sin reparto.
			}

			$njy = gmdate( 'n-j-Y', $dia );
			$nj  = gmdate( 'n-j', $dia );
			if ( in_array( $njy, $feriados, true ) || in_array( $nj, $feriados, true ) ) {
				continue; // Feriado o día cerrado.
			}
			if ( in_array( $njy, $bloqueados, true ) || in_array( gmdate( 'j-n-Y', $dia ), $bloqueados, true ) ) {
				continue; // Día con el cupo lleno.
			}

			$turnos = $con_turnos ? self::turnos_del_dia( $dia, $ajustes ) : array();
			if ( $con_turnos && empty( $turnos ) ) {
				continue; // No queda ningún turno a tiempo ese día.
			}

			$dias[] = array(
				'valor'    => gmdate( 'j-n-Y', $dia ),
				'iso'      => gmdate( 'Y-m-d', $dia ),
				'etiqueta' => self::texto_fecha( $dia ),
				'turnos'   => $turnos,
			);
		}

		return array(
			'activo'               => true,
			'fecha_obligatoria'    => 'checked' === get_option( 'orddd_lite_date_field_mandatory' ),
			'turno_obligatorio'    => $con_turnos && 'checked' === get_option( 'orddd_lite_time_slot_mandatory' ),
			'con_turnos'           => $con_turnos,
			'etiqueta_fecha'       => get_option( 'orddd_lite_delivery_date_field_label' ) ? get_option( 'orddd_lite_delivery_date_field_label' ) : 'Fecha de entrega',
			'etiqueta_turno'       => get_option( 'orddd_lite_delivery_timeslot_field_label' ) ? get_option( 'orddd_lite_delivery_timeslot_field_label' ) : 'Turno de entrega',
			'nota'                 => wp_strip_all_tags( (string) get_option( 'orddd_lite_delivery_date_field_note' ) ),
			'generado'             => wp_date( 'c' ),
			'dias'                 => $dias,
		);
	}

	/**
	 * Turnos de un día, con la misma función que usa el pago clásico (anticipación mínima y cupos incluidos).
	 */
	private static function turnos_del_dia( $dia, $ajustes ) {
		// Orddd_Lite_Common::orddd_lite_get_timeslot_display() lee estos datos de $_POST,
		// igual que cuando lo llama el calendario del pago clásico por admin-ajax.
		$post_previo = $_POST; // phpcs:ignore WordPress.Security.NonceVerification

		$_POST['current_date']          = gmdate( 'j-n-Y', $dia );
		$_POST['current_date_to_check'] = isset( $ajustes['orddd_lite_current_day'] ) ? $ajustes['orddd_lite_current_day'] : gmdate( 'j-n-Y', current_time( 'timestamp' ) ); // phpcs:ignore
		$_POST['holidays_str']          = isset( $ajustes['orddd_lite_holidays'] ) ? $ajustes['orddd_lite_holidays'] : '';
		$_POST['lockout_str']           = isset( $ajustes['orddd_lite_lockout_days'] ) ? $ajustes['orddd_lite_lockout_days'] : '';

		$crudos = Orddd_Lite_Common::orddd_lite_get_timeslot_display( '' );

		$_POST = $post_previo;

		unset( $crudos['NA'], $crudos['asap'] );
		asort( $crudos );

		$turnos = array();
		foreach ( $crudos as $valor => $marca ) {
			$turnos[] = array(
				'valor'    => (string) $valor,
				'etiqueta' => (string) $valor,
			);
		}
		return $turnos;
	}

	/* ------------------------------------------------------------------ */
	/* Validación al pagar                                                 */
	/* ------------------------------------------------------------------ */

	/**
	 * @param WC_Order        $pedido
	 * @param WP_REST_Request $pedido_api
	 * @throws RouteException Si la fecha o el turno no son válidos.
	 */
	public static function validar_pedido( $pedido, $pedido_api ) {
		if ( ! self::orddd_disponible() || 'yes' !== Orddd_Lite_Common::orddd_lite_is_delivery_enabled() ) {
			return;
		}

		$extensiones = $pedido_api['extensions'];
		$datos       = isset( $extensiones['order-delivery-date'] ) && is_array( $extensiones['order-delivery-date'] ) ? $extensiones['order-delivery-date'] : array();
		$fecha       = isset( $datos['h_deliverydate'] ) ? sanitize_text_field( wp_unslash( $datos['h_deliverydate'] ) ) : '';
		$turno       = isset( $datos['orddd_lite_time_slot'] ) ? sanitize_text_field( wp_unslash( $datos['orddd_lite_time_slot'] ) ) : '';

		$disponible = self::disponibilidad();

		if ( '' === $fecha ) {
			if ( ! empty( $disponible['fecha_obligatoria'] ) ) {
				self::error( 'ringopet_fecha_falta', 'Elegí la fecha de entrega.' );
			}
			return;
		}

		$dia_elegido = null;
		foreach ( $disponible['dias'] as $dia ) {
			if ( self::misma_fecha( $dia['valor'], $fecha ) ) {
				$dia_elegido = $dia;
				break;
			}
		}
		if ( null === $dia_elegido ) {
			self::error( 'ringopet_fecha_no_disponible', 'La fecha elegida ya no está disponible. Elegí otra, por favor.' );
		}

		if ( empty( $disponible['con_turnos'] ) ) {
			return;
		}

		if ( '' === $turno || in_array( $turno, array( 'select', 'choose', 'NA' ), true ) ) {
			if ( ! empty( $disponible['turno_obligatorio'] ) ) {
				self::error( 'ringopet_turno_falta', 'Elegí el turno de entrega.' );
			}
			return;
		}

		$valores = wp_list_pluck( $dia_elegido['turnos'], 'valor' );
		if ( ! in_array( $turno, $valores, true ) ) {
			self::error( 'ringopet_turno_no_disponible', 'El turno elegido ya no está disponible (tiene que empezar con suficiente anticipación o se llenó el cupo). Elegí otro, por favor.' );
		}
	}

	private static function error( $codigo, $mensaje ) {
		throw new RouteException( $codigo, $mensaje, 400 ); // phpcs:ignore
	}

	/* ------------------------------------------------------------------ */
	/* Plugin de repartos                                                  */
	/* ------------------------------------------------------------------ */

	/**
	 * Local Delivery Drivers registra el pedido en su tabla con woocommerce_checkout_update_order_meta,
	 * que solo existe en el pago clásico. Lo hacemos acá para los pedidos que entran por la Store API.
	 *
	 * @param WC_Order $pedido
	 */
	public static function sincronizar_repartos( $pedido ) {
		if ( function_exists( 'lddfw_insert_sync_order_by_id' ) && $pedido instanceof WC_Order ) {
			lddfw_insert_sync_order_by_id( $pedido->get_id() );
		}
	}

	/* ------------------------------------------------------------------ */
	/* Utilidades                                                          */
	/* ------------------------------------------------------------------ */

	private static function orddd_disponible() {
		return class_exists( 'Orddd_Lite_Common' );
	}

	/** Algunas funciones de ORDDD miran el carrito (productos virtuales). En la API REST no se carga solo. */
	private static function cargar_carrito() {
		if ( function_exists( 'wc_load_cart' ) && function_exists( 'WC' ) && null === WC()->cart ) {
			wc_load_cart();
		}
	}

	/** '"Nombre:9-20-2026","Otro:12-25"' → array( '9-20-2026', '12-25' ) */
	private static function feriados( $texto ) {
		$salida = array();
		foreach ( self::lista_entre_comillas( $texto ) as $item ) {
			$partes = explode( ':', $item );
			$salida[] = trim( end( $partes ) );
		}
		return $salida;
	}

	/** '"9-29-2026","10-1-2026"' → array( '9-29-2026', '10-1-2026' ) */
	private static function lista_entre_comillas( $texto ) {
		if ( '' === trim( (string) $texto ) ) {
			return array();
		}
		return array_values( array_filter( array_map(
			function ( $item ) {
				return trim( $item, " \"'" );
			},
			explode( ',', $texto )
		) ) );
	}

	/** Compara '29-9-2026' con '29-09-2026' y similares. */
	private static function misma_fecha( $a, $b ) {
		$pa = array_map( 'intval', explode( '-', $a ) );
		$pb = array_map( 'intval', explode( '-', $b ) );
		return 3 === count( $pa ) && $pa === $pb;
	}

	/** Mismo texto que muestra el calendario de ORDDD (ej. '29 Septiembre, 2026'). */
	private static function texto_fecha( $dia ) {
		global $orddd_lite_date_formats;
		$formato_js  = get_option( 'orddd_lite_delivery_date_format' );
		$formato_php = ( is_array( $orddd_lite_date_formats ) && isset( $orddd_lite_date_formats[ $formato_js ] ) ) ? $orddd_lite_date_formats[ $formato_js ] : 'j F, Y';
		$texto       = date_i18n( $formato_php, $dia );
		return ucwords( $texto );
	}
}

add_action( 'plugins_loaded', array( 'RingoPet_Entrega', 'iniciar' ), 20 );
