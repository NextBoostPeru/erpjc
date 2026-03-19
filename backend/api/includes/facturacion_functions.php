<?php
// backend/api/includes/facturacion_functions.php

function enviarComprobanteNubefact($conn, $id, $simulate = false) {
    // Unir con clientes para obtener dirección y email
    $stmt = $conn->prepare("SELECT c.*, cl.direccion as cli_direccion, cl.email as cli_email 
                          FROM comprobantes_electronicos c 
                          LEFT JOIN clientes cl ON c.cliente_num_doc = cl.num_doc 
                          WHERE c.id = :id");
    $stmt->execute([':id' => $id]);
    $comp = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$comp) return ['success' => false, 'message' => "Comprobante no encontrado"];

    $stmtItems = $conn->prepare("SELECT * FROM comprobantes_electronicos_detalle WHERE comprobante_id = :id");
    $stmtItems->execute([':id' => $id]);
    $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

    // CONFIGURACIÓN: Obtener credenciales desde BD
    $stmtConfig = $conn->prepare("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
    $stmtConfig->execute();
    $empresaConfig = $stmtConfig->fetch(PDO::FETCH_ASSOC);
    
    $sunatConfig = isset($empresaConfig['configuracion_sunat']) ? json_decode($empresaConfig['configuracion_sunat'], true) : [];
    
    $ruta = $sunatConfig['nubefact_ruta'] ?? '';
    $token = $sunatConfig['nubefact_token'] ?? '';

    if (empty($ruta) || empty($token)) {
        return ['success' => false, 'message' => "Nubefact no configurado. Vaya a Configuración General -> SUNAT."];
    }

    // Mapeo de datos para Nubefact
    $condicion_pago = $comp['condicion_pago'];
    
    // Normalizar condición para detección robusta de Crédito (tildes, mayúsculas)
    // Usamos regex para no depender de iconv que puede fallar en algunos servidores
    $es_credito = (preg_match('/credito|crédito|cred/i', $condicion_pago) === 1) || (strcasecmp($condicion_pago, 'Contado') !== 0);
    $forma_pago = $es_credito ? 'Credito' : 'Contado';
    
    $numero_cuotas = isset($comp['numero_cuotas']) ? (int)$comp['numero_cuotas'] : 1;
    
    $ref_serie = null;
    $ref_numero = null;
    
    // Priorizar columnas explícitas ref_serie/ref_numero si existen
    if (!empty($comp['ref_serie']) && !empty($comp['ref_numero'])) {
        $ref_serie = $comp['ref_serie'];
        $ref_numero = (int)$comp['ref_numero'];
    } elseif (isset($comp['doc_referencia_numero']) && strpos($comp['doc_referencia_numero'], '-') !== false) {
        // Fallback: intentar parsear de string concatenado
        list($ref_serie, $ref_numero) = explode('-', $comp['doc_referencia_numero']);
        $ref_numero = (int)$ref_numero;
    } else {
        $ref_numero = isset($comp['doc_referencia_numero']) ? (int)$comp['doc_referencia_numero'] : null;
    }

    // Validar si tiene detracción
    $tieneDetraccion = !empty($comp['tiene_detraccion']);
    $porcentajeDetraccion = isset($comp['porcentaje_detraccion']) ? (float)$comp['porcentaje_detraccion'] : 0;
    $codigoBienDetraccion = $comp['codigo_bien_detraccion'] ?? '';
    $montoDetraccion = isset($comp['monto_detraccion']) ? (float)$comp['monto_detraccion'] : 0;

    // Get Detraction Account
    $detraccionCuenta = "";
    try {
        $stmtBanco = $conn->query("SELECT numero_cuenta FROM bancos_cuentas WHERE tipo_cuenta = 'Detracciones' OR nombre_banco LIKE '%Nacion%' OR nombre_banco LIKE '%Nación%' LIMIT 1");
        if ($row = $stmtBanco->fetch(PDO::FETCH_ASSOC)) {
            $detraccionCuenta = $row['numero_cuenta']; // Mantener formato original (con guiones si existen)
        }
    } catch (Exception $e) {
        // Ignore error if table doesn't exist or other issue
    }

    // Inicializar observaciones
    $observaciones = "";
    
    // Si hay detracción, agregar la información obligatoria a observaciones
    if ($tieneDetraccion) {
        $detInfo = "Operación sujeta a detracción: Cód. " . $codigoBienDetraccion . " | Tasa: " . number_format($porcentajeDetraccion, 2) . "% | Monto: " . number_format($montoDetraccion, 0);
        if (!empty($detraccionCuenta)) {
            $detInfo .= " | Cta. BN: " . $detraccionCuenta;
        }
        $observaciones = $detInfo;
    }

    $nubefactData = [
        "operacion" => "generar_comprobante",
        "tipo_de_comprobante" => $comp['tipo_comprobante'] == '01' ? 1 : ($comp['tipo_comprobante'] == '03' ? 2 : ($comp['tipo_comprobante'] == '07' ? 3 : 4)),
        "serie" => $comp['serie'],
        "numero" => (int)$comp['correlativo'],
        "sunat_transaction" => $tieneDetraccion ? 30 : 1,
        "cliente_tipo_de_documento" => $comp['cliente_tipo_doc'],
        "cliente_numero_de_documento" => $comp['cliente_num_doc'],
        "cliente_denominacion" => $comp['cliente_razon_social'],
        "cliente_direccion" => $comp['cli_direccion'] ?? '',
        "cliente_email" => $comp['cli_email'] ?? '',
        "fecha_de_emision" => date('d-m-Y', strtotime($comp['fecha_emision'] ?? date('Y-m-d'))),
        "fecha_de_vencimiento" => date('d-m-Y', strtotime($comp['fecha_vencimiento'] ?? $comp['fecha_emision'] ?? date('Y-m-d'))),
        "moneda" => $comp['moneda'] == 'PEN' ? 1 : 2,
        "porcentaje_de_igv" => 18.00,
        "total_gravada" => $comp['total_gravada'],
        "total_igv" => $comp['total_igv'],
        "total" => $comp['total_importe'],
        "enviar_automaticamente_a_la_sunat" => true,
        "enviar_automaticamente_al_cliente" => true,
        "formato_de_pdf" => "A4",
        "condiciones_de_pago" => function_exists('mb_strtoupper') ? mb_strtoupper($condicion_pago, 'UTF-8') : strtoupper($condicion_pago),
        "medio_de_pago" => $es_credito ? "venta_al_credito" : "",
        "forma_de_pago" => $es_credito ? "Credito" : "Contado",
        "observaciones" => $observaciones,
        "documento_que_se_modifica_tipo" => isset($comp['doc_referencia_tipo']) ? ($comp['doc_referencia_tipo'] == '01' ? 1 : ($comp['doc_referencia_tipo'] == '03' ? 2 : null)) : null,
        "documento_que_se_modifica_serie" => $ref_serie,
        "documento_que_se_modifica_numero" => $ref_numero,
        "tipo_de_nota_de_credito" => ($comp['tipo_comprobante'] == '07' && isset($comp['motivo_emision'])) ? (int)$comp['motivo_emision'] : null,
        "tipo_de_nota_de_debito" => ($comp['tipo_comprobante'] == '08' && isset($comp['motivo_emision'])) ? (int)$comp['motivo_emision'] : null,
        "items" => []
    ];
    
    file_put_contents(__DIR__ . '/../debug_nubefact.log', date('Y-m-d H:i:s') . " Cuenta Detraccion Found: " . $detraccionCuenta . "\n", FILE_APPEND);
    file_put_contents(__DIR__ . '/../debug_nubefact.log', date('Y-m-d H:i:s') . " Payload: " . json_encode($nubefactData, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);

    if ($tieneDetraccion && $porcentajeDetraccion > 0 && $montoDetraccion > 0 && $codigoBienDetraccion !== '') {
        $nubefactData['detraccion'] = true;
        $nubefactData['operacion_sujeta_a_detraccion'] = true;
        $nubefactData['porcentaje_de_detraccion'] = $porcentajeDetraccion;
        $nubefactData['monto_de_detraccion'] = round($montoDetraccion, 0);
        $nubefactData['codigo_detraccion'] = $codigoBienDetraccion;
        $nubefactData['codigo_bien_detra'] = $codigoBienDetraccion; // Mantener por compatibilidad
        $nubefactData['medio_de_pago_detraccion'] = "001";
        if (!empty($detraccionCuenta)) {
            // Nubefact espera solo dígitos para la cuenta de detracción en este campo
            $nubefactData['detraccion_cuenta_bancaria'] = preg_replace('/[^0-9]/', '', $detraccionCuenta);
        }
        
        // Fix for standard Nubefact keys
        $nubefactData['detraccion_porcentaje'] = $porcentajeDetraccion;
        $nubefactData['detraccion_total'] = round($montoDetraccion, 0);

        // Mapping SUNAT Code to Nubefact ID
        $sunatToNubefact = [
            '001' => 1, '002' => 2, '003' => 3, '004' => 4, '005' => 5,
            '007' => 7, '008' => 8, '009' => 9, '010' => 10, '011' => 11,
            '012' => 12, '014' => 13, '016' => 14, '017' => 15, '019' => 17,
            '020' => 18, '021' => 19, '022' => 20, '023' => 21, '024' => 22,
            '025' => 23, '026' => 24, '027' => 25, '028' => 26, '030' => 28,
            '031' => 29, '032' => 30, '034' => 32, '035' => 33, '036' => 34,
            '037' => 35, '039' => 37, '040' => 38, '041' => 39, '013' => 40,
            '015' => 41, '099' => 42, '044' => 43, '045' => 44
        ];
        
        if (isset($sunatToNubefact[$codigoBienDetraccion])) {
            $nubefactData['detraccion_tipo'] = $sunatToNubefact[$codigoBienDetraccion];
        } else {
             // Fallback: try to use the code as is or integer
             $nubefactData['detraccion_tipo'] = (int)$codigoBienDetraccion;
        }
    }

    if ($forma_pago === 'Credito') {
        $cuotas = [];
        
        // Intentar obtener cuotas desde la base de datos (prioridad)
        // Verificamos primero si existe la tabla (o simplemente hacemos query y catch)
        try {
            $stmtCuotas = $conn->prepare("SELECT * FROM comprobantes_cuotas WHERE comprobante_id = :id ORDER BY cuota_nro ASC");
            $stmtCuotas->execute([':id' => $id]);
            $dbCuotas = $stmtCuotas->fetchAll(PDO::FETCH_ASSOC);
            
            if (count($dbCuotas) > 0) {
                foreach ($dbCuotas as $c) {
                    $cuotas[] = [
                        "cuota" => (int)$c['cuota_nro'],
                        "fecha_de_pago" => date('d-m-Y', strtotime($c['fecha_pago'])),
                        "importe" => (float)$c['monto']
                    ];
                }
            }
        } catch (Exception $e) {
            // Tabla no existe o error, usar fallback
            $dbCuotas = [];
        }

        if (empty($cuotas)) {
            // Fallback: Autocalcular si no hay cuotas guardadas
            $fechaBase = $comp['fecha_vencimiento'] ?? $comp['fecha_emision'] ?? date('Y-m-d');
            $numero_cuotas = max(1, $numero_cuotas); // Ensure at least 1
            
            // Fix: If Detraction, Cuotas sum must be Net Amount (Total - Detraction)
            $montoBaseCuotas = $comp['total_importe'];
            if ($tieneDetraccion) {
                 $montoBaseCuotas = $comp['total_importe'] - $montoDetraccion;
            }
    
            $importePorCuota = $montoBaseCuotas / $numero_cuotas;
            
            for ($i = 1; $i <= $numero_cuotas; $i++) {
                if ($i == 1) {
                    $fechaPago = date('d-m-Y', strtotime($fechaBase));
                } else {
                    $fechaPago = date('d-m-Y', strtotime($fechaBase . " + " . (($i - 1) * 30) . " days"));
                }
                
                // Ajuste de redondeo en la última cuota
                if ($i == $numero_cuotas) {
                    $importeActual = round($montoBaseCuotas - (round($importePorCuota, 2) * ($numero_cuotas - 1)), 2);
                } else {
                    $importeActual = round($importePorCuota, 2);
                }
    
                $cuotas[] = [
                    "cuota" => $i,
                    "fecha_de_pago" => $fechaPago,
                    "importe" => $importeActual
                ];
            }
        }
        $nubefactData['venta_al_credito'] = $cuotas;
    }

    foreach ($items as $item) {
        $tipo_igv = ($item['igv'] > 0) ? 1 : 8;
        $nubefactData['items'][] = [
            "unidad_de_medida" => $item['unidad_medida'],
            "codigo" => $item['item_codigo'],
            "descripcion" => $item['descripcion'],
            "cantidad" => $item['cantidad'],
            "valor_unitario" => $item['valor_unitario'],
            "precio_unitario" => $item['precio_unitario'],
            "subtotal" => $item['valor_venta'],
            "tipo_de_igv" => $tipo_igv,
            "igv" => $item['igv'],
            "total" => round($item['valor_venta'] + $item['igv'], 2),
            "anticipo_regularizacion" => false
        ];
    }

    if ($simulate) {
        return ['success' => true, 'message' => 'Simulacion', 'nubefact_payload' => $nubefactData];
    }

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $ruta);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($nubefactData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Content-Type: application/json",
        "Authorization: Token token=" . $token
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    $respuesta = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($ch);
    curl_close($ch);

    $res = json_decode($respuesta, true);
    file_put_contents(__DIR__ . '/../debug_nubefact.log', date('Y-m-d H:i:s') . " HTTP: " . $http_code . " Resp: " . ($respuesta ?: $curl_error) . "\n", FILE_APPEND);

    if ($http_code != 200) {
        if (isset($res['errors'])) {
            return ['success' => false, 'message' => "Nubefact: " . $res['errors']];
        } else {
            return ['success' => false, 'message' => "Error al conectar con Nubefact: " . ($curl_error ?: $respuesta)];
        }
    }

    $stmt = $conn->prepare("UPDATE comprobantes_electronicos SET 
        estado = 'Aceptado', 
        cdr_path = :cdr, 
        xml_path = :xml, 
        hash_cpe = :hash,
        enlace_pdf = :pdf,
        sunat_description = :desc
        WHERE id = :id");
    
    $stmt->execute([
        ':cdr' => !empty($res['enlace_del_cdr']) ? $res['enlace_del_cdr'] : $comp['cdr_path'],
        ':xml' => !empty($res['enlace_del_xml']) ? $res['enlace_del_xml'] : $comp['xml_path'],
        ':hash' => !empty($res['codigo_hash']) ? $res['codigo_hash'] : ($comp['hash_cpe'] ?? ''),
        ':pdf' => !empty($res['enlace_del_pdf']) ? $res['enlace_del_pdf'] : $comp['enlace_pdf'],
        ':desc' => !empty($res['sunat_description']) ? $res['sunat_description'] : ($comp['sunat_description'] ?? ''),
        ':id' => $id
    ]);

    return ['success' => true, 'message' => "Enviado a SUNAT y Aceptado", "estado" => "Aceptado", "nubefact" => $res];
}

function enviarRetencionNubefact($conn, $id) {
    // Obtener datos de retención
    $stmt = $conn->prepare("SELECT * FROM comprobantes_retenciones WHERE id = :id");
    $stmt->execute([':id' => $id]);
    $ret = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$ret) return ['success' => false, 'message' => "Retención no encontrada"];

    // Items (Documentos relacionados)
    $stmtItems = $conn->prepare("SELECT * FROM comprobantes_retenciones_detalle WHERE retencion_id = :id");
    $stmtItems->execute([':id' => $id]);
    $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

    // Configuración
    $stmtConfig = $conn->prepare("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
    $stmtConfig->execute();
    $empresaConfig = $stmtConfig->fetch(PDO::FETCH_ASSOC);
    $sunatConfig = isset($empresaConfig['configuracion_sunat']) ? json_decode($empresaConfig['configuracion_sunat'], true) : [];
    
    $ruta = $sunatConfig['nubefact_ruta'] ?? '';
    $token = $sunatConfig['nubefact_token'] ?? '';

    if (empty($ruta) || empty($token)) {
        return ['success' => false, 'message' => "Nubefact no configurado"];
    }

    // Construir JSON
    $data = [
        "operacion" => "generar_retencion",
        "serie" => $ret['serie'],
        "numero" => (int)$ret['correlativo'],
        "cliente_tipo_de_documento" => (strlen($ret['cliente_num_doc']) == 11) ? 6 : 1,
        "cliente_numero_de_documento" => $ret['cliente_num_doc'],
        "cliente_denominacion" => $ret['cliente_razon_social'],
        "cliente_direccion" => $ret['cliente_direccion'] ?? '',
        "cliente_email" => $ret['cliente_email'] ?? '',
        "fecha_de_emision" => date('d-m-Y', strtotime($ret['fecha_emision'])),
        "moneda" => "1", // Soles (String)
        "tipo_de_tasa_de_retencion" => ((int)$ret['tasa_retencion'] === 3) ? "1" : (((int)$ret['tasa_retencion'] === 6) ? "2" : "1"),
        "total_retenido" => $ret['total_retenido'],
        "total_pagado" => $ret['total_pagado'],
        "observaciones" => $ret['observaciones'] ?? '',
        "enviar_automaticamente_a_la_sunat" => true,
        "enviar_automaticamente_al_cliente" => true,
        "items" => []
    ];

    foreach ($items as $item) {
        $data['items'][] = [
            "documento_relacionado_tipo" => $item['doc_relacionado_tipo'],
            "documento_relacionado_serie" => $item['doc_relacionado_serie'],
            "documento_relacionado_numero" => (int)$item['doc_relacionado_numero'],
            "documento_relacionado_fecha_de_emision" => date('d-m-Y', strtotime($item['doc_relacionado_fecha'])),
            "documento_relacionado_moneda" => $item['doc_relacionado_moneda'] == 'PEN' ? 1 : 2,
            "documento_relacionado_total" => $item['doc_relacionado_total'],
            "pago_fecha" => date('d-m-Y', strtotime($item['pago_fecha'])),
            "pago_numero" => (int)$item['pago_numero'],
            "pago_total_sin_retencion" => $item['pago_total_sin_retencion'],
            "tipo_de_cambio" => $item['tipo_cambio'] ?? null,
            "tipo_de_cambio_fecha" => !empty($item['tipo_cambio_fecha']) ? date('d-m-Y', strtotime($item['tipo_cambio_fecha'])) : null,
            "importe_retenido" => $item['importe_retenido'],
            "importe_retenido_fecha" => date('d-m-Y', strtotime($item['importe_retenido_fecha'] ?? $item['pago_fecha'])),
            "importe_pagado_con_retencion" => $item['importe_pagado_con_retencion']
        ];
    }

    // Enviar a Nubefact
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $ruta);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Content-Type: application/json",
        "Authorization: Token token=" . $token
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $respuesta = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $res = json_decode($respuesta, true);

    if ($http_code != 200) {
        $errorMsg = $res['errors'] ?? $respuesta;
        $stmtError = $conn->prepare("UPDATE comprobantes_retenciones SET nubefact_error = :err WHERE id = :id");
        $stmtError->execute([':err' => $errorMsg, ':id' => $id]);
        return ['success' => false, 'message' => "Error Nubefact: " . $errorMsg];
    }

    // Actualizar DB
    $stmtUpd = $conn->prepare("UPDATE comprobantes_retenciones SET 
        estado = 'Aceptado',
        enlace_pdf = :pdf,
        enlace_xml = :xml,
        enlace_cdr = :cdr,
        sunat_description = :desc
        WHERE id = :id");
    
    $stmtUpd->execute([
        ':pdf' => $res['enlace_del_pdf'] ?? '',
        ':xml' => $res['enlace_del_xml'] ?? '',
        ':cdr' => $res['enlace_del_cdr'] ?? '',
        ':desc' => $res['sunat_description'] ?? '',
        ':id' => $id
    ]);

    return ['success' => true, 'message' => "Retención generada y aceptada", 'nubefact' => $res];
}

function enviarAnulacionNubefact($conn, $id, $motivo) {
    $stmt = $conn->prepare("SELECT * FROM comprobantes_electronicos WHERE id = :id");
    $stmt->execute([':id' => $id]);
    $comp = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$comp) return ['success' => false, 'message' => "Comprobante no encontrado"];

    // Configuración
    $stmtConfig = $conn->prepare("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
    $stmtConfig->execute();
    $empresaConfig = $stmtConfig->fetch(PDO::FETCH_ASSOC);
    $sunatConfig = isset($empresaConfig['configuracion_sunat']) ? json_decode($empresaConfig['configuracion_sunat'], true) : [];
    
    $ruta = $sunatConfig['nubefact_ruta'] ?? '';
    $token = $sunatConfig['nubefact_token'] ?? '';

    if (empty($ruta) || empty($token)) {
        return ['success' => false, 'message' => "Nubefact no configurado"];
    }

    $tipo_comprobante = match($comp['tipo_comprobante']) {
        '01' => 1,
        '03' => 2,
        '07' => 3,
        '08' => 4,
        default => 1
    };

    $data = [
        "operacion" => "generar_anulacion",
        "tipo_de_comprobante" => $tipo_comprobante,
        "serie" => $comp['serie'],
        "numero" => (int)$comp['correlativo'],
        "motivo" => $motivo,
        "codigo_unico" => "" 
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $ruta);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Content-Type: application/json",
        "Authorization: Token token=" . $token
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $respuesta = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $res = json_decode($respuesta, true);

    if ($http_code != 200) {
        return ['success' => false, 'message' => "Error Nubefact Anulación: " . ($res['errors'] ?? $respuesta)];
    }

    // Actualizar estado
    $stmtUpd = $conn->prepare("UPDATE comprobantes_electronicos SET 
        estado = 'Anulado',
        sunat_description = :desc
        WHERE id = :id");
    
    $desc = "ANULADO: " . ($res['sunat_description'] ?? 'Solicitud aceptada');
    $stmtUpd->execute([
        ':desc' => $desc,
        ':id' => $id
    ]);

    return ['success' => true, 'message' => "Comprobante Anulado", 'nubefact' => $res];
}


function generarHtmlFactura($comp, $detalles, $empresa, $bancos = []) {
    $logo = $empresa['logo'] ?? ''; 
    $logoHtml = '';
    // Ajuste de ruta: __DIR__ es backend/api/includes, el logo suele estar en uploads/logos/ (relativo a backend)
    // Así que subimos dos niveles: ../../
    if (!empty($logo) && file_exists(__DIR__ . '/../../' . $logo)) {
        $path = __DIR__ . '/../../' . $logo;
        $type = pathinfo($path, PATHINFO_EXTENSION);
        $data = file_get_contents($path);
        $base64 = 'data:image/' . $type . ';base64,' . base64_encode($data);
        $logoHtml = "<img src='$base64' style='max-width: 150px; max-height: 80px;'>";
    }

    $tipoNombre = match($comp['tipo_comprobante']) {
        '01' => 'FACTURA ELECTRÓNICA',
        '03' => 'BOLETA DE VENTA ELECTRÓNICA',
        '07' => 'NOTA DE CRÉDITO ELECTRÓNICA',
        '08' => 'NOTA DE DÉBITO ELECTRÓNICA',
        default => 'COMPROBANTE ELECTRÓNICO'
    };

    $itemsHtml = '';
    foreach ($detalles as $item) {
        $descripcionHtml = nl2br(htmlspecialchars($item['descripcion']));
        $itemsHtml .= "
        <tr>
            <td style='text-align: center;'>{$item['cantidad']}</td>
            <td style='text-align: center;'>{$item['unidad_medida']}</td>
            <td>{$descripcionHtml}</td>
            <td style='text-align: right;'>{$item['precio_unitario']}</td>
            <td style='text-align: right;'>{$item['valor_venta']}</td>
        </tr>";
    }

    $total_letras = "SON: " . $comp['total_importe'] . " " . ($comp['moneda'] == 'PEN' ? 'SOLES' : 'DÓLARES'); 
    
    $bancosHtml = '';
    if (!empty($bancos)) {
        $bancosHtml = "<div style='margin-top: 15px; border: 1px solid #ccc; padding: 10px; border-radius: 5px; background-color: #fff;'>
            <div style='font-weight: bold; margin-bottom: 5px; font-size: 11px;'>CUENTAS BANCARIAS</div>
            <table style='width: 100%; font-size: 10px;'>";
        foreach ($bancos as $banco) {
            $titular = !empty($banco['titular']) ? " - Titular: {$banco['titular']}" : "";
            $cci = !empty($banco['cci']) ? " - CCI: {$banco['cci']}" : "";
            
            $isDetraccion = ((isset($banco['tipo_cuenta']) && $banco['tipo_cuenta'] === 'Detracciones') || stripos($banco['nombre_banco'], 'Naci') !== false);
            $labelDetraccion = $isDetraccion ? " <span style='font-weight:bold;'>(Cuenta de Detracciones)</span>" : "";

            $bancosHtml .= "<tr>
                <td style='border: none; padding: 2px;'><strong>{$banco['nombre_banco']} ({$banco['moneda']}){$labelDetraccion}:</strong> {$banco['numero_cuenta']}{$titular}{$cci}</td>
            </tr>";
        }
        $bancosHtml .= "</table></div>";
    }

    $cuentaDetraccion = '';
    foreach ($bancos as $b) {
        // Buscar por tipo de cuenta "Detracciones" o por nombre del banco (Nación)
        if ((isset($b['tipo_cuenta']) && $b['tipo_cuenta'] === 'Detracciones') || 
            stripos($b['nombre_banco'], 'Naci') !== false) {
            $cuentaDetraccion = $b['numero_cuenta'];
            break;
        }
    }

    $cuotasHtml = '';
    if ($comp['condicion_pago'] !== 'Contado') {
        $cuotasHtml = '<div style="margin-top: 10px; border: 1px solid #ccc; padding: 10px; border-radius: 5px;">
            <div style="font-weight: bold; margin-bottom: 5px; font-size: 11px;">CRONOGRAMA DE PAGOS</div>
            <table style="width: 100%; font-size: 10px; border-collapse: collapse;">
                <tr>
                    <th style="border-bottom: 1px solid #ccc; text-align: left;">Cuota</th>
                    <th style="border-bottom: 1px solid #ccc; text-align: center;">Fecha Vencimiento</th>
                    <th style="border-bottom: 1px solid #ccc; text-align: right;">Importe</th>
                </tr>';
        
        $numero_cuotas = isset($comp['numero_cuotas']) && $comp['numero_cuotas'] > 0 ? (int)$comp['numero_cuotas'] : 1;
        $fechaBase = $comp['fecha_vencimiento'] ?? $comp['fecha_emision'] ?? date('Y-m-d');
        $importePorCuota = $comp['total_importe'] / $numero_cuotas;
        
        for ($i = 1; $i <= $numero_cuotas; $i++) {
            // Si es la última cuota, ajustar el importe para evitar errores de redondeo
            if ($i == $numero_cuotas) {
                $importeActual = $comp['total_importe'] - (round($importePorCuota, 2) * ($numero_cuotas - 1));
            } else {
                $importeActual = round($importePorCuota, 2);
            }
            
            // Calcular fecha de cada cuota (asumiendo 30 días entre cuotas si no se tiene fecha exacta por cuota)
            // Nota: En un sistema real, las fechas exactas de cada cuota deberían guardarse en BD.
            // Aquí usamos la lógica de proyección simple usada en enviarComprobanteNubefact
            // Pero ajustada: si hay fecha_vencimiento global, esa suele ser la de la última cuota o única cuota.
            // Si es "Credito X dias", la fecha base ya tiene los días sumados.
            
            // Lógica simplificada: 
            // Si es 1 cuota, vence en fecha_vencimiento.
            // Si son N cuotas, distribuimos (esto es una aproximación visual ya que no guardamos detalle de cuotas en BD aún)
            
            $fechaPago = $fechaBase; // Por defecto usar la fecha de vencimiento global para la visualización simple
            
            // Si queremos ser más precisos con lo que hace Nubefact:
            // Nubefact genera: fechaBase + (i-1)*30 days.
            // Usemos esa misma lógica para consistencia si no hay datos mejores.
             $fechaPago = date('d-m-Y', strtotime(($comp['fecha_emision'] ?? date('Y-m-d')) . " + " . ($i * 30) . " days"));
             
             // Pero espera, el usuario seleccionó "Credito 15 dias" -> fecha_vencimiento ya es +15 dias.
             // Si es 1 cuota, usamos fecha_vencimiento.
             if ($numero_cuotas == 1) {
                 $fechaPago = date('d-m-Y', strtotime($comp['fecha_vencimiento']));
             } else {
                 // Si son varias cuotas, no tenemos las fechas exactas en BD (solo fecha_vencimiento final o inicial).
                 // Mostraremos la fecha_vencimiento para la primera y sucesivas +30 días como fallback,
                 // O mejor, mostramos solo la fecha de vencimiento final en el header y aquí listamos 
                 // "Cuota X - Importe X" sin fecha específica si no estamos seguros, para no confundir.
                 // Sin embargo, el usuario pide "Forma de pago al credito".
                 // Vamos a mostrar la fecha de vencimiento global para la cuota única si N=1.
                 // Si N > 1, asumiremos mensual.
                 
                 // CORRECCIÓN: Usar fecha_vencimiento real del registro.
                 // Si condicion_pago es "Credito X dias", la fecha_vencimiento guardada es la fecha final de pago.
                 // Si es cuota única, esa es la fecha.
                 
                 if ($i == 1 && $numero_cuotas == 1) {
                      $fechaPago = date('d-m-Y', strtotime($comp['fecha_vencimiento']));
                 } else {
                      // Proyección simple
                      $fechaPago = date('d-m-Y', strtotime($comp['fecha_emision'] . " + " . ($i * 30) . " days"));
                 }
             }

            $cuotasHtml .= '<tr>
                <td style="padding: 3px;">Cuota ' . $i . '</td>
                <td style="padding: 3px; text-align: center;">' . $fechaPago . '</td>
                <td style="padding: 3px; text-align: right;">' . number_format($importeActual, 2) . '</td>
            </tr>';
        }
        $cuotasHtml .= '</table></div>';
    }

    $html = "
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset='UTF-8'>
        <style>
            body { font-family: Arial, sans-serif; font-size: 12px; color: #333; }
            .header { width: 100%; margin-bottom: 20px; }
            .company-info { width: 60%; float: left; }
            .invoice-box { width: 35%; float: right; border: 1px solid #000; padding: 10px; text-align: center; border-radius: 8px; }
            .invoice-title { font-weight: bold; font-size: 16px; margin-bottom: 5px; }
            .invoice-number { font-size: 14px; }
            .client-info { clear: both; margin-top: 120px; border: 1px solid #ccc; padding: 10px; border-radius: 5px; }
            .items-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .items-table th { background-color: #f5f5f5; border: 1px solid #ccc; padding: 8px; text-align: center; }
            .items-table td { border: 1px solid #ccc; padding: 8px; }
            .totals { width: 40%; float: right; margin-top: 20px; }
            .totals table { width: 100%; border-collapse: collapse; }
            .totals td { padding: 5px; text-align: right; }
            .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ccc; padding-top: 10px; }
            .qr-code { float: left; margin-top: 20px; width: 100px; height: 100px; border: 1px solid #eee; }
        </style>
    </head>
    <body>
        <div class='header'>
            <div class='company-info'>
                $logoHtml
                <h2 style='margin: 5px 0;'>{$empresa['razon_social']}</h2>
                <p style='margin: 2px 0;'>{$empresa['direccion']}</p>
                <p style='margin: 2px 0;'>RUC: {$empresa['ruc']}</p>
                <p style='margin: 2px 0;'>Email: {$empresa['email']} | Tel: {$empresa['telefono']}</p>
            </div>
            <div class='invoice-box'>
                <div class='invoice-title'>RUC: {$empresa['ruc']}</div>
                <div class='invoice-title'>$tipoNombre</div>
                <div class='invoice-number'>{$comp['serie']} - {$comp['correlativo']}</div>
            </div>
        </div>

        <div class='client-info'>
            <table width='100%'>
                <tr>
                    <td><strong>Cliente:</strong> {$comp['cliente_razon_social']}</td>
                    <td><strong>Fecha Emisión:</strong> " . date('d/m/Y', strtotime($comp['fecha_emision'])) . "</td>
                </tr>
                <tr>
                    <td><strong>{$comp['cliente_tipo_doc']}:</strong> {$comp['cliente_num_doc']}</td>
                    <td><strong>Fecha Vencimiento:</strong> " . date('d/m/Y', strtotime($comp['fecha_vencimiento'])) . "</td>
                </tr>
                <tr>
                    <td><strong>Dirección:</strong> {$comp['cli_direccion']}</td>
                    <td><strong>Moneda:</strong> {$comp['moneda']}</td>
                </tr>
                <tr>
                    <td colspan='2'><strong>Forma de Pago:</strong> {$comp['condicion_pago']}</td>
                </tr>
            </table>
        </div>

        <table class='items-table'>
            <thead>
                <tr>
                    <th width='10%'>Cant.</th>
                    <th width='10%'>U.M.</th>
                    <th width='50%'>Descripción</th>
                    <th width='15%'>P. Unit</th>
                    <th width='15%'>Total</th>
                </tr>
            </thead>
            <tbody>
                $itemsHtml
            </tbody>
        </table>

        <div style='margin-top: 20px;'>
            <div style='float: left; width: 60%;'>
                <p><strong>Importe en letras:</strong><br>$total_letras</p>
                " . ($comp['sunat_description'] ? "<p><strong>Estado SUNAT:</strong> {$comp['sunat_description']}</p>" : "") . "
                " . ($comp['hash_cpe'] ? "<p><strong>Hash CPE:</strong> {$comp['hash_cpe']}</p>" : "") . "
                
                $cuotasHtml
                
                " . ((!empty($comp['tiene_detraccion']) && $comp['tiene_detraccion']) ? "
                <div style='margin-top: 15px; border: 1px solid #ccc; padding: 10px; border-radius: 5px; background-color: #f9f9f9;'>
                    <div style='font-weight: bold; margin-bottom: 5px;'>Información de Detracción</div>
                    <div style='font-size: 11px;'>
                        Operación sujeta al Sistema de Pago de Obligaciones Tributarias<br>
                        " . ($cuentaDetraccion ? "<strong>Banco de la Nación N°: $cuentaDetraccion</strong><br>" : "") . "
                        <table style='width: 100%; margin-top: 5px;'>
                            <tr>
                                <td style='border: none; padding: 2px;'><strong>Código Bien/Servicio:</strong> {$comp['codigo_bien_detraccion']}</td>
                                <td style='border: none; padding: 2px;'><strong>Porcentaje:</strong> " . (float)$comp['porcentaje_detraccion'] . "%</td>
                                <td style='border: none; padding: 2px;'><strong>Monto Detracción:</strong> {$comp['moneda']} " . number_format($comp['monto_detraccion'], 2) . "</td>
                            </tr>
                        </table>
                    </div>
                </div>" : "") . "
                
                $bancosHtml
            </div>
            <div class='totals'>
                <table>
                    <tr>
                        <td><strong>Op. Gravada:</strong></td>
                        <td>{$comp['total_gravada']}</td>
                    </tr>
                    <tr>
                        <td><strong>IGV (18%):</strong></td>
                        <td>{$comp['total_igv']}</td>
                    </tr>
                    <tr>
                        <td style='font-size: 14px; font-weight: bold;'><strong>TOTAL:</strong></td>
                        <td style='font-size: 14px; font-weight: bold;'>{$comp['total_importe']}</td>
                    </tr>
                </table>
            </div>
            <div style='clear: both;'></div>
        </div>

        <div class='footer'>
            <p>Representación impresa del Comprobante Electrónico. Consulte su documento en {$empresa['web_url']}</p>
        </div>
    </body>
    </html>
    ";


    return $html;
}

function crearComprobanteElectronico($conn, $data, $userData) {
    // Validar NC/ND
    if (in_array($data['tipo_comprobante'], ['07', '08'])) {
        $hasRef = (!empty($data['doc_referencia_numero'])) || 
                  (!empty($data['doc_referencia_serie']) && !empty($data['doc_referencia_correlativo']));
        
        if (!$hasRef || empty($data['motivo_emision'])) {
            throw new Exception("Debe especificar documento de referencia (Serie y Correlativo) y motivo para NC/ND");
        }
    }

    // 1. Obtener correlativo
    $stmt = $conn->prepare("SELECT MAX(correlativo) as max_corr FROM comprobantes_electronicos WHERE tipo_comprobante = :tipo AND serie = :serie");
    $stmt->execute([':tipo' => $data['tipo_comprobante'], ':serie' => $data['serie']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $correlativo = ($row['max_corr'] ?? 0) + 1;

    // 2. Insertar Cabecera
    $condicion = isset($data['condicion_pago']) && $data['condicion_pago'] !== '' ? $data['condicion_pago'] : 'Contado';
    $numero_cuotas = isset($data['numero_cuotas']) ? (int)$data['numero_cuotas'] : 1;
    $fecha_emision = $data['fecha_emision'] ?? date('Y-m-d');
    $fecha_venc = $data['fecha_vencimiento'] ?? $fecha_emision;
    $saldo_pendiente = $data['total_importe'];
    $estado_cobro = 'Pendiente';
    $estado = $data['estado'] ?? 'Generado'; // Support Borrador status
    $tipo_cambio = $data['tipo_cambio'] ?? 1.000;
    $generar_asiento = $data['generar_asiento'] ?? true; // Default true

    // Extract Reference Data for Notes and PLE
    $doc_ref_tipo = $data['doc_referencia_tipo'] ?? null;
    $doc_ref_serie = $data['doc_referencia_serie'] ?? null;
    $doc_ref_numero = $data['doc_referencia_correlativo'] ?? null;
    $doc_ref_fecha = $data['doc_referencia_fecha'] ?? null;
    
    // Construct full reference number for DB (legacy) and XML
    $full_ref_number = ($doc_ref_serie && $doc_ref_numero) ? "$doc_ref_serie-$doc_ref_numero" : ($data['doc_referencia_numero'] ?? null);
    
    // Update data for XML generation
    $data['doc_referencia_numero'] = $full_ref_number;

    $tipo_nota = $data['motivo_emision'] ?? null;
    $tiene_detraccion = !empty($data['tiene_detraccion']) ? 1 : 0;
    $codigo_bien_detraccion = $data['codigo_bien_detraccion'] ?? null;
    $porcentaje_detraccion = $data['porcentaje_detraccion'] ?? 0;
    $constancia_detraccion = !empty($data['constancia_detraccion']) ? $data['constancia_detraccion'] : null;
    $fecha_detraccion = !empty($data['fecha_detraccion']) ? $data['fecha_detraccion'] : null;
    $monto_detraccion = $data['monto_detraccion'] ?? 0;

    // Safeguard: Recalculate amount if missing but required
    if ($tiene_detraccion && $monto_detraccion == 0 && $porcentaje_detraccion > 0 && $data['total_importe'] > 0) {
        $monto_detraccion = round(($data['total_importe'] * $porcentaje_detraccion) / 100, 2);
    }

    $sql = "INSERT INTO comprobantes_electronicos (
        tipo_comprobante, serie, correlativo, cliente_tipo_doc, cliente_num_doc, cliente_razon_social,
        moneda, tipo_cambio, total_gravada, total_exonerada, total_inafecta, total_igv, total_importe, estado,
        doc_referencia_tipo, doc_referencia_numero, motivo_emision, motivo_descripcion,
        ref_fecha_emision, ref_tipo_comprobante, ref_serie, ref_numero,
        fecha_emision, fecha_vencimiento, condicion_pago, saldo_pendiente, estado_cobro, usuario_id,
        tiene_detraccion, constancia_detraccion, fecha_detraccion, monto_detraccion, codigo_bien_detraccion, porcentaje_detraccion,
        numero_cuotas
    ) VALUES (
        :tipo, :serie, :corr, :ctipo, :cnum, :crazon,
        :moneda, :tc, :gravada, :exonerada, :inafecta, :igv, :importe, :estado,
        :ref_tipo, :ref_num, :motivo, :motivo_desc,
        :ple_ref_fecha, :ple_ref_tipo, :ple_ref_serie, :ple_ref_num,
        :fec_emision, :fec_venc, :cond, :saldo, :est_cobro, :usuario_id,
        :tiene_det, :const_det, :fecha_det, :monto_det, :cod_det, :porc_det,
        :numero_cuotas
    )";
    
    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':tipo' => $data['tipo_comprobante'],
        ':serie' => $data['serie'],
        ':corr' => $correlativo,
        ':ctipo' => $data['cliente_tipo_doc'],
        ':cnum' => $data['cliente_num_doc'],
        ':crazon' => $data['cliente_razon_social'],
        ':moneda' => $data['moneda'],
        ':tc' => $tipo_cambio,
        ':gravada' => $data['total_gravada'],
        ':exonerada' => $data['total_exonerada'] ?? 0.00,
        ':inafecta' => $data['total_inafecta'] ?? 0.00,
        ':igv' => $data['total_igv'],
        ':importe' => $data['total_importe'],
        ':estado' => $estado,
        ':ref_tipo' => $doc_ref_tipo, 
        ':ref_num' => $full_ref_number, 
        ':motivo' => $tipo_nota,
        ':motivo_desc' => $data['motivo_descripcion'] ?? null,
        ':ple_ref_fecha' => $doc_ref_fecha,
        ':ple_ref_tipo' => $doc_ref_tipo,
        ':ple_ref_serie' => $doc_ref_serie,
        ':ple_ref_num' => $doc_ref_numero,
        ':fec_emision' => $fecha_emision,
        ':fec_venc' => $fecha_venc,
        ':cond' => $condicion,
        ':saldo' => $saldo_pendiente,
        ':est_cobro' => $estado_cobro,
        ':usuario_id' => $userData['id'] ?? null,
        ':tiene_det' => $tiene_detraccion,
        ':const_det' => $constancia_detraccion,
        ':fecha_det' => $fecha_detraccion,
        ':monto_det' => $monto_detraccion,
        ':cod_det' => $codigo_bien_detraccion,
        ':porc_det' => $porcentaje_detraccion,
        ':numero_cuotas' => $numero_cuotas
    ]);
    
    $comprobante_id = $conn->lastInsertId();

    // 3. Insertar Detalle
    $sqlDetalle = "INSERT INTO comprobantes_electronicos_detalle (
        comprobante_id, item_codigo, descripcion, unidad_medida, cantidad, valor_unitario, precio_unitario, valor_venta, igv
    ) VALUES (
        :cid, :code, :desc, :um, :cant, :vu, :pu, :vv, :igv
    )";
    $stmtDetalle = $conn->prepare($sqlDetalle);

    foreach ($data['items'] as $item) {
        $stmtDetalle->execute([
            ':cid' => $comprobante_id,
            ':code' => $item['codigo'] ?? '',
            ':desc' => $item['descripcion'],
            ':um' => $item['unidad_medida'] ?? 'NIU',
            ':cant' => $item['cantidad'],
            ':vu' => $item['valor_unitario'],
            ':pu' => $item['precio_unitario'],
            ':vv' => $item['valor_venta'],
            ':igv' => $item['igv']
        ]);
    }

    // 4. Generar XML (Simulado UBL 2.1)
    $stmtEmp = $conn->query("SELECT * FROM empresa_datos LIMIT 1");
    $empresa = $stmtEmp->fetch(PDO::FETCH_ASSOC);
    $emp_ruc = $empresa['ruc'] ?? '20000000001';
    $emp_razon = $empresa['razon_social'] ?? 'EMPRESA DEMO';

    if ($estado != 'Borrador') {
        $filename = "{$emp_ruc}-{$data['tipo_comprobante']}-{$data['serie']}-{$correlativo}";
        
        $rootTag = "Invoice";
        if ($data['tipo_comprobante'] == '07') $rootTag = "CreditNote";
        if ($data['tipo_comprobante'] == '08') $rootTag = "DebitNote";

        $xmlContent = "<{$rootTag} xmlns='urn:oasis:names:specification:ubl:schema:xsd:{$rootTag}-2'>
            <UBLVersionID>2.1</UBLVersionID>
            <CustomizationID>2.0</CustomizationID>
            <ID>{$data['serie']}-{$correlativo}</ID>
            <IssueDate>{$fecha_emision}</IssueDate>
            <IssueTime>" . date('H:i:s') . "</IssueTime>
            <Note languageLocaleID='1000'>{$data['total_importe']}</Note>
            <DocumentCurrencyCode>{$data['moneda']}</DocumentCurrencyCode>";
        
        if (in_array($data['tipo_comprobante'], ['07', '08'])) {
            $xmlContent .= "
            <DiscrepancyResponse>
                <ReferenceID>{$full_ref_number}</ReferenceID>
                <ResponseCode>{$data['motivo_emision']}</ResponseCode>
                <Description>{$data['motivo_descripcion']}</Description>
            </DiscrepancyResponse>
            <BillingReference>
                <InvoiceDocumentReference>
                    <ID>{$full_ref_number}</ID>
                    <DocumentTypeCode>{$doc_ref_tipo}</DocumentTypeCode>
                </InvoiceDocumentReference>
            </BillingReference>";
        }

        $xmlContent .= "
            <Signature>
                <ID>IDSignKG</ID>
                <SignatoryParty>
                    <PartyIdentification>
                        <ID>{$emp_ruc}</ID>
                    </PartyIdentification>
                    <PartyName>
                        <Name>{$emp_razon}</Name>
                    </PartyName>
                </SignatoryParty>
                <DigitalSignatureAttachment>
                    <ExternalReference>
                        <URI>#SignatureKG</URI>
                    </ExternalReference>
                </DigitalSignatureAttachment>
            </Signature>
            <AccountingSupplierParty>
                <Party>
                    <PartyIdentification>
                        <ID schemeID='6'>{$emp_ruc}</ID>
                    </PartyIdentification>
                    <PartyLegalEntity>
                        <RegistrationName>{$emp_razon}</RegistrationName>
                    </PartyLegalEntity>
                </Party>
            </AccountingSupplierParty>
            <AccountingCustomerParty>
                <Party>
                    <PartyIdentification>
                        <ID schemeID='{$data['cliente_tipo_doc']}'>{$data['cliente_num_doc']}</ID>
                    </PartyIdentification>
                    <PartyLegalEntity>
                        <RegistrationName>{$data['cliente_razon_social']}</RegistrationName>
                    </PartyLegalEntity>
                </Party>
            </AccountingCustomerParty>
            <TaxTotal>
                <TaxAmount currencyID='{$data['moneda']}'>{$data['total_igv']}</TaxAmount>
                <TaxSubtotal>
                    <TaxableAmount currencyID='{$data['moneda']}'>{$data['total_gravada']}</TaxableAmount>
                    <TaxAmount currencyID='{$data['moneda']}'>{$data['total_igv']}</TaxAmount>
                    <TaxCategory>
                        <TaxScheme>
                            <ID>1000</ID>
                            <Name>IGV</Name>
                            <TaxTypeCode>VAT</TaxTypeCode>
                        </TaxScheme>
                    </TaxCategory>
                </TaxSubtotal>
            </TaxTotal>
            <LegalMonetaryTotal>
                <PayableAmount currencyID='{$data['moneda']}'>{$data['total_importe']}</PayableAmount>
            </LegalMonetaryTotal>
        </{$rootTag}>";
        
        $xmlPath = __DIR__ . '/../../xml/' . $filename . '.xml';
        file_put_contents($xmlPath, $xmlContent);
        
        $dbXmlPath = "xml/{$filename}.xml";
        $conn->prepare("UPDATE comprobantes_electronicos SET xml_path = :path WHERE id = :id")
             ->execute([':path' => $dbXmlPath, ':id' => $comprobante_id]);
    } else {
        $conn->prepare("UPDATE comprobantes_electronicos SET xml_path = NULL WHERE id = :id")
             ->execute([':id' => $comprobante_id]);
    }

    // 5. Integración Contable Automática
    if ($generar_asiento && $estado != 'Borrador') {
        $es_nota_credito = $data['tipo_comprobante'] == '07';
        
        $glosa = ($es_nota_credito ? "Nota Crédito " : "Venta ") . "{$data['serie']}-{$correlativo} {$data['cliente_razon_social']}";
        $sqlAsiento = "INSERT INTO asientos (fecha, glosa, tipo_asiento, moneda, tipo_cambio, estado, usuario_id) VALUES (:fecha, :glosa, 'Venta', :moneda, :tc, 'Finalizado', :user)";
        $conn->prepare($sqlAsiento)->execute([
            ':fecha' => $fecha_emision,
            ':glosa' => $glosa, 
            ':moneda' => $data['moneda'], 
            ':tc' => $tipo_cambio,
            ':user' => $userData['id'] ?? 1
        ]);
        $asiento_id = $conn->lastInsertId();

        $debe_cliente = $es_nota_credito ? 0 : $data['total_importe'];
        $haber_cliente = $es_nota_credito ? $data['total_importe'] : 0;
        
        $debe_igv = $es_nota_credito ? $data['total_igv'] : 0;
        $haber_igv = $es_nota_credito ? 0 : $data['total_igv'];

        $debe_ventas = $es_nota_credito ? $data['total_gravada'] : 0;
        $haber_ventas = $es_nota_credito ? 0 : $data['total_gravada'];

        // 12 Cuentas por Cobrar
        $conn->prepare("INSERT INTO asientos_detalle (asiento_id, cuenta_codigo, debe, haber) VALUES (:aid, '121', :debe, :haber)")
             ->execute([':aid' => $asiento_id, ':debe' => $debe_cliente, ':haber' => $haber_cliente]);
        
        // 40 IGV
        $conn->prepare("INSERT INTO asientos_detalle (asiento_id, cuenta_codigo, debe, haber) VALUES (:aid, '4011', :debe, :haber)")
             ->execute([':aid' => $asiento_id, ':debe' => $debe_igv, ':haber' => $haber_igv]);

        // 70 Ventas
        $conn->prepare("INSERT INTO asientos_detalle (asiento_id, cuenta_codigo, debe, haber) VALUES (:aid, '701', :debe, :haber)")
             ->execute([':aid' => $asiento_id, ':debe' => $debe_ventas, ':haber' => $haber_ventas]);
        
        $conn->prepare("UPDATE comprobantes_electronicos SET asiento_id = :aid WHERE id = :cid")
             ->execute([':aid' => $asiento_id, ':cid' => $comprobante_id]);
    }
    
    return $comprobante_id;
}
?>
