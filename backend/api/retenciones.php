<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
error_reporting(E_ALL);
ini_set('display_errors', 1);

header("Content-Type: application/json; charset=UTF-8");

require_once '../config/jwt.php';
require_once '../config/rbac.php';
require_once __DIR__ . '/includes/facturacion_functions.php';

$action = $_GET['action'] ?? '';

// Auth check
$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);
if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    exit;
}
$method = $_SERVER['REQUEST_METHOD'];
rbac_require($conn, $userData, 'retenciones', $method);

switch ($action) {
    case 'listar':
        try {
            $stmt = $conn->query("SELECT * FROM comprobantes_retenciones ORDER BY created_at DESC");
            $retenciones = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($retenciones);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error al listar: " . $e->getMessage()]);
        }
        break;

    case 'buscar_facturas_pendientes':
        $ruc = $_GET['ruc'] ?? '';
        if (empty($ruc)) {
            echo json_encode([]);
            exit;
        }
        
        try {
            // Buscamos facturas (01) a CREDITO que no estén anuladas
            // Nota: Idealmente se verificaría saldo pendiente, pero por ahora listamos todas las aptas
            $stmt = $conn->prepare("
                SELECT id, serie, correlativo, fecha_emision, total_importe as total, moneda 
                FROM comprobantes_electronicos 
                WHERE cliente_num_doc = :ruc 
                  AND tipo_comprobante = '01' 
                  AND UPPER(condicion_pago) = 'CREDITO'
                  AND estado != 'Anulado'
                ORDER BY fecha_emision DESC
            ");
            $stmt->execute([':ruc' => $ruc]);
            $facturas = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($facturas);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'crear':
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['cliente_num_doc']) || empty($data['items'])) {
            http_response_code(400);
            echo json_encode(["message" => "Datos incompletos"]);
            exit;
        }

        try {
            $conn->beginTransaction();

            // 1. Obtener correlativo
            $serie = $data['serie'] ?? 'P001';
            $stmtCorr = $conn->prepare("SELECT MAX(correlativo) as max_c FROM comprobantes_retenciones WHERE serie = :serie");
            $stmtCorr->execute([':serie' => $serie]);
            $rowCorr = $stmtCorr->fetch(PDO::FETCH_ASSOC);
            $correlativo = ($rowCorr['max_c'] ?? 0) + 1;

            // 2. Insertar Cabecera
            $sql = "INSERT INTO comprobantes_retenciones (
                serie, correlativo, fecha_emision, cliente_num_doc, cliente_razon_social,
                cliente_direccion, cliente_email, moneda, tasa_retencion,
                total_retenido, total_pagado, observaciones, estado
            ) VALUES (
                :serie, :correlativo, :fecha, :cli_doc, :cli_nom,
                :cli_dir, :cli_email, :moneda, :tasa,
                :tot_ret, :tot_pag, :obs, 'Pendiente'
            )";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':serie' => $serie,
                ':correlativo' => $correlativo,
                ':fecha' => $data['fecha_emision'] ?? date('Y-m-d'),
                ':cli_doc' => $data['cliente_num_doc'],
                ':cli_nom' => $data['cliente_razon_social'],
                ':cli_dir' => $data['cliente_direccion'] ?? '',
                ':cli_email' => $data['cliente_email'] ?? '',
                ':moneda' => 'PEN', // Retenciones son en Soles
                ':tasa' => $data['tasa_retencion'],
                ':tot_ret' => $data['total_retenido'],
                ':tot_pag' => $data['total_pagado'],
                ':obs' => $data['observaciones'] ?? ''
            ]);
            
            $retencion_id = $conn->lastInsertId();

            // 3. Insertar Items
            $sqlDet = "INSERT INTO comprobantes_retenciones_detalle (
                retencion_id, doc_relacionado_tipo, doc_relacionado_serie, doc_relacionado_numero,
                doc_relacionado_fecha, doc_relacionado_moneda, doc_relacionado_total,
                pago_fecha, pago_numero, pago_total_sin_retencion,
                tipo_cambio, tipo_cambio_fecha, importe_retenido, importe_retenido_fecha, importe_pagado_con_retencion
            ) VALUES (
                :rid, :d_tipo, :d_serie, :d_num,
                :d_fecha, :d_moneda, :d_total,
                :p_fecha, :p_num, :p_sin_ret,
                :tc, :tc_fecha, :imp_ret, :imp_ret_fecha, :imp_pag
            )";
            
            $stmtDet = $conn->prepare($sqlDet);

            foreach ($data['items'] as $item) {
                $stmtDet->execute([
                    ':rid' => $retencion_id,
                    ':d_tipo' => $item['documento_relacionado_tipo'],
                    ':d_serie' => $item['documento_relacionado_serie'],
                    ':d_num' => $item['documento_relacionado_numero'],
                    ':d_fecha' => $item['documento_relacionado_fecha_emision'],
                    ':d_moneda' => $item['documento_relacionado_moneda'],
                    ':d_total' => $item['documento_relacionado_total'],
                    ':p_fecha' => $item['pago_fecha'],
                    ':p_num' => $item['pago_numero'],
                    ':p_sin_ret' => $item['pago_total_sin_retencion'],
                    ':tc' => $item['tipo_cambio'] ?? null,
                    ':tc_fecha' => $item['tipo_cambio_fecha'] ?? null,
                    ':imp_ret' => $item['importe_retenido'],
                    ':imp_ret_fecha' => $item['importe_retenido_fecha'] ?? $item['pago_fecha'],
                    ':imp_pag' => $item['importe_pagado_con_retencion']
                ]);
            }

            $conn->commit();

            // 4. Enviar a Nubefact
            $result = enviarRetencionNubefact($conn, $retencion_id);
            
            echo json_encode([
                "message" => "Retención creada", 
                "id" => $retencion_id,
                "correlativo" => "$serie-$correlativo",
                "nubefact" => $result
            ]);

        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'anular':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? null;
        $motivo = $data['motivo'] ?? 'ERROR EN EMISION';

        if (!$id) {
            http_response_code(400);
            echo json_encode(["message" => "ID requerido"]);
            exit;
        }

        $stmt = $conn->prepare("SELECT * FROM comprobantes_retenciones WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $ret = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$ret) {
            http_response_code(404);
            echo json_encode(["message" => "Retención no encontrada"]);
            exit;
        }

        // Configuración Nubefact
        $stmtConfig = $conn->prepare("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
        $stmtConfig->execute();
        $empresaConfig = $stmtConfig->fetch(PDO::FETCH_ASSOC);
        $sunatConfig = isset($empresaConfig['configuracion_sunat']) ? json_decode($empresaConfig['configuracion_sunat'], true) : [];
        $ruta = $sunatConfig['nubefact_ruta'] ?? '';
        $token = $sunatConfig['nubefact_token'] ?? '';

        if (empty($ruta) || empty($token)) {
             echo json_encode(['success' => false, 'message' => "Nubefact no configurado"]);
             exit;
        }

        $payload = [
            "operacion" => "generar_reversion_retencion",
            "serie" => $ret['serie'],
            "numero" => (int)$ret['correlativo'],
            "motivo" => $motivo
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $ruta);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Content-Type: application/json",
            "Authorization: Token token=" . $token
        ]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        $respuesta = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $res = json_decode($respuesta, true);

        if ($http_code == 200 && !isset($res['errors'])) {
            $stmtUpd = $conn->prepare("UPDATE comprobantes_retenciones SET estado = 'Anulado', motivo_anulacion = :motivo WHERE id = :id");
            $stmtUpd->execute([':motivo' => $motivo, ':id' => $id]);
            echo json_encode(["success" => true, "message" => "Retención Anulada", "nubefact" => $res]);
        } else {
            echo json_encode(["success" => false, "message" => "Error Nubefact: " . ($res['errors'] ?? $respuesta)]);
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(["message" => "Acción no válida"]);
        break;
}
