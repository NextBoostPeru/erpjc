<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../config/rbac.php';
require_once __DIR__ . '/helpers/StockHelper.php';
require_once __DIR__ . '/Nubefact.php';

$method = $_SERVER['REQUEST_METHOD'];

// Authentication
$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$user_data = $jwt->validateToken($token);

if (!$user_data) {
    header("HTTP/1.1 401 Unauthorized");
    $conn = null;
    exit;
}
$user_id = is_object($user_data) ? $user_data->id : $user_data['id'];

rbac_require($conn, $user_data, 'guias_remision', $method);


// Helpers
function getJsonInput() {
    return json_decode(file_get_contents("php://input"), true);
}

function isPdfBytes($bytes) {
    if (!is_string($bytes) || strlen($bytes) < 4) return false;
    return substr($bytes, 0, 4) === '%PDF';
}

function decodePdfZipBase64ToPdfBytes($base64Zip) {
    if (empty($base64Zip)) return null;
    $zipBytes = base64_decode($base64Zip, true);
    if ($zipBytes === false) return null;

    if (!class_exists('ZipArchive')) {
        throw new Exception('ZipArchive no disponible en el servidor');
    }

    $tmpDir = sys_get_temp_dir();
    $zipPath = tempnam($tmpDir, 'nubefact_pdf_');
    if ($zipPath === false) {
        throw new Exception('No se pudo crear archivo temporal');
    }

    file_put_contents($zipPath, $zipBytes);

    $zip = new ZipArchive();
    $openRes = $zip->open($zipPath);
    if ($openRes !== true) {
        @unlink($zipPath);
        return null;
    }

    $pdfBytes = null;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $name = $stat['name'] ?? '';
        if ($name && preg_match('/\\.pdf$/i', $name)) {
            $content = $zip->getFromIndex($i);
            if ($content !== false && isPdfBytes($content)) {
                $pdfBytes = $content;
                break;
            }
        }
    }
    $zip->close();
    @unlink($zipPath);

    return $pdfBytes;
}

function fetchRemoteBinary($url, &$contentType = null) {
    if (!function_exists('curl_init')) {
        $context = stream_context_create([
            "http" => [
                "follow_location" => 1,
                "timeout" => 60
            ]
        ]);
        $data = @file_get_contents($url, false, $context);
        if ($data === false) {
            throw new Exception("No se pudo descargar el archivo");
        }
        $contentType = null;
        if (isset($http_response_header) && is_array($http_response_header)) {
            foreach ($http_response_header as $h) {
                if (stripos($h, 'content-type:') === 0) {
                    $contentType = trim(substr($h, strlen('content-type:')));
                    break;
                }
            }
        }
        return $data;
    }

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    curl_setopt($ch, CURLOPT_HEADER, true);
    $resp = curl_exec($ch);
    if ($resp === false) {
        $err = curl_error($ch);
        curl_close($ch);
        $ch2 = curl_init($url);
        curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch2, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch2, CURLOPT_MAXREDIRS, 5);
        curl_setopt($ch2, CURLOPT_CONNECTTIMEOUT, 15);
        curl_setopt($ch2, CURLOPT_TIMEOUT, 60);
        curl_setopt($ch2, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch2, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch2, CURLOPT_HEADER, true);
        $resp2 = curl_exec($ch2);
        if ($resp2 === false) {
            $err2 = curl_error($ch2);
            curl_close($ch2);
            throw new Exception("No se pudo descargar el archivo: $err | $err2");
        }
        $resp = $resp2;
        curl_close($ch2);
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $headersRaw = substr($resp, 0, $headerSize);
    $body = substr($resp, $headerSize);
    curl_close($ch);

    $contentType = null;
    foreach (preg_split("/\r\n|\n|\r/", $headersRaw) as $h) {
        if (stripos($h, 'content-type:') === 0) {
            $contentType = trim(substr($h, strlen('content-type:')));
            break;
        }
    }
    if ($status < 200 || $status >= 300) {
        throw new Exception("No se pudo descargar el archivo (HTTP $status)");
    }
    return $body;
}

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    $action = $_GET['action'] ?? null;

    if ($action === 'download_pdf') {
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'ID requerido']);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            $stmt = $conn->prepare("SELECT id, serie, numero, estado, enlace_pdf FROM guias_remision WHERE id = ?");
            $stmt->execute([$id]);
            $guia = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$guia) {
                http_response_code(404);
                echo json_encode(['error' => 'Guía no encontrada']);
                if (isset($conn)) $conn = null;
                exit;
            }

            $linkPdf = $guia['enlace_pdf'] ?? '';
            $estado = $guia['estado'] ?? '';
            $serie = $guia['serie'] ?? '';
            $numero = $guia['numero'] ?? '';

            $pdfBytes = null;
            $lastDownloadError = null;

            if (!empty($linkPdf)) {
                try {
                    $contentType = null;
                    $downloaded = fetchRemoteBinary($linkPdf, $contentType);
                    if (isPdfBytes($downloaded)) {
                        $pdfBytes = $downloaded;
                    } else {
                        $lastDownloadError = 'El enlace no devolvió un PDF válido';
                    }
                } catch (Exception $e) {
                    $lastDownloadError = $e->getMessage();
                }
            }

            if (!$pdfBytes) {
                if ($estado === 'Emitida') {
                    http_response_code(409);
                    echo json_encode(['error' => 'La guía aún no fue enviada a SUNAT']);
                    if (isset($conn)) $conn = null;
                    exit;
                }

                $stmtConfig = $conn->prepare("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
                $stmtConfig->execute();
                $empresaConfig = $stmtConfig->fetch(PDO::FETCH_ASSOC);
                $sunatConfig = isset($empresaConfig['configuracion_sunat']) ? json_decode($empresaConfig['configuracion_sunat'], true) : [];

                $ruta = $sunatConfig['nubefact_ruta'] ?? '';
                $token = $sunatConfig['nubefact_token'] ?? '';

                if (empty($ruta) || empty($token)) {
                    http_response_code(500);
                    echo json_encode(['error' => 'Nubefact no configurado']);
                    if (isset($conn)) $conn = null;
                    exit;
                }

                $nubefactData = [
                    "operacion" => "consultar_guia",
                    "tipo_de_comprobante" => 7,
                    "serie" => $serie,
                    "numero" => (int)$numero
                ];

                $nubefact = new Nubefact($ruta, $token);
                $res = $nubefact->enviarGuia($nubefactData);

                if (!$res['success']) {
                    $errorMsg = is_array($res['error']) ? json_encode($res['error']) : $res['error'];
                    http_response_code(502);
                    echo json_encode(['error' => $errorMsg]);
                    if (isset($conn)) $conn = null;
                    exit;
                }

                $respData = $res['data'];
                $aceptada = $respData['aceptada_por_sunat'] ?? false;

                $newLinkPdf = $respData['enlace_del_pdf'] ?? $respData['enlace_pdf'] ?? $respData['enlace'] ?? '';
                $linkXml = $respData['enlace_del_xml'] ?? $respData['enlace_xml'] ?? '';
                $linkCdr = $respData['enlace_del_cdr'] ?? $respData['enlace_cdr'] ?? '';

                $nuevoEstado = $aceptada ? 'Aceptada' : 'Enviada';

                $stmtUpdate = $conn->prepare("
                    UPDATE guias_remision SET 
                        estado = ?,
                        enlace_pdf = ?,
                        enlace_xml = ?,
                        enlace_cdr = ?,
                        sunat_description = ?,
                        sunat_response_code = ?
                    WHERE id = ?
                ");
                $stmtUpdate->execute([
                    $nuevoEstado,
                    $newLinkPdf,
                    $linkXml,
                    $linkCdr,
                    $respData['sunat_description'] ?? ($aceptada ? 'Aceptada' : 'Consultada'),
                    $respData['sunat_responsecode'] ?? '0',
                    $id
                ]);

                $pdfBytes = decodePdfZipBase64ToPdfBytes($respData['pdf_zip_base64'] ?? '');

                if (!$pdfBytes && !empty($newLinkPdf)) {
                    $contentType = null;
                    $downloaded = fetchRemoteBinary($newLinkPdf, $contentType);
                    if (isPdfBytes($downloaded)) {
                        $pdfBytes = $downloaded;
                    }
                }

                if (!$pdfBytes) {
                    http_response_code(409);
                    $msg = 'SUNAT aún no generó el PDF de la guía';
                    if ($lastDownloadError) {
                        $msg = $msg . '. ' . $lastDownloadError;
                    }
                    echo json_encode(['error' => $msg]);
                    if (isset($conn)) $conn = null;
                    exit;
                }
            }

            while (ob_get_level()) {
                ob_end_clean();
            }

            header('Content-Type: application/pdf');
            $filename = 'GUIA_' . $serie . '-' . $numero . '.pdf';
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Content-Length: ' . strlen($pdfBytes));
            echo $pdfBytes;
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        if (isset($conn)) $conn = null;
        exit;
    }

    if ($id) {
        // Get single guide details
        try {
            $stmt = $conn->prepare("
                SELECT g.*, c.razon_social as cliente_nombre, c.num_doc as cliente_doc 
                FROM guias_remision g
                LEFT JOIN clientes c ON g.cliente_id = c.id
                WHERE g.id = ?
            ");
            $stmt->execute([$id]);
            $guia = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$guia) {
                http_response_code(404);
                echo json_encode(['error' => 'Guía no encontrada']);
                if (isset($conn)) $conn = null;
                exit;
            }

            // Get details
            $stmtDetails = $conn->prepare("
                SELECT d.*, p.nombre as producto_nombre 
                FROM guias_remision_detalles d
                LEFT JOIN productos p ON d.producto_id = p.id
                WHERE d.guia_id = ?
            ");
            $stmtDetails->execute([$id]);
            $guia['detalles'] = $stmtDetails->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode($guia);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
    } elseif ($action === 'next_number') {
        // Get next number for series
        $serie = $_GET['serie'] ?? 'T001';
        try {
            $stmt = $conn->prepare("SELECT MAX(numero) as max_num FROM guias_remision WHERE serie = ?");
            $stmt->execute([$serie]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $next = $row['max_num'] ? intval($row['max_num']) + 1 : 1;
            echo json_encode(['serie' => $serie, 'numero' => str_pad($next, 8, '0', STR_PAD_LEFT)]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
    } else {
        // List guides with pagination
        $fecha_inicio = $_GET['fecha_inicio'] ?? date('Y-m-01');
        $fecha_fin = $_GET['fecha_fin'] ?? date('Y-m-t');
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $offset = ($page - 1) * $limit;
        
        try {
            // Count total
            $countSql = "SELECT COUNT(*) FROM guias_remision WHERE fecha_emision BETWEEN ? AND ?";
            $countStmt = $conn->prepare($countSql);
            $countStmt->execute([$fecha_inicio, $fecha_fin]);
            $total = $countStmt->fetchColumn();
            $pages = ceil($total / $limit);

            // Fetch data
            $sql = "
                SELECT g.*, c.razon_social as cliente_nombre 
                FROM guias_remision g
                LEFT JOIN clientes c ON g.cliente_id = c.id
                WHERE g.fecha_emision BETWEEN ? AND ?
                ORDER BY g.id DESC
                LIMIT $limit OFFSET $offset
            ";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$fecha_inicio, $fecha_fin]);
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                'data' => $results,
                'total' => $total,
                'pages' => $pages,
                'current_page' => $page
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

} elseif ($method === 'POST') {
    $data = getJsonInput();

    // ACTION: SEND TO SUNAT
    if (isset($_GET['action']) && $_GET['action'] === 'send_sunat') {
        if (!isset($data['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'ID requerido']);
            if (isset($conn)) $conn = null;
            exit;
        }

        $id = $data['id'];

        try {
            // 1. Fetch Guide Data
            $stmt = $conn->prepare("SELECT * FROM guias_remision WHERE id = ?");
            $stmt->execute([$id]);
            $guia = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$guia) {
                http_response_code(404);
                echo json_encode(['error' => 'Guía no encontrada']);
                if (isset($conn)) $conn = null;
                exit;
            }

            if ($guia['estado'] === 'Aceptada') {
                echo json_encode(['message' => 'La guía ya fue aceptada previamente']);
                if (isset($conn)) $conn = null;
                exit;
            }

            // 2. Fetch Details
            $stmtDetails = $conn->prepare("
                SELECT d.*, p.nombre as producto_nombre, p.codigo_interno 
                FROM guias_remision_detalles d
                LEFT JOIN productos p ON d.producto_id = p.id
                WHERE d.guia_id = ?
            ");
            $stmtDetails->execute([$id]);
            $detalles = $stmtDetails->fetchAll(PDO::FETCH_ASSOC);

            // 3. Get Credentials from Company Data
            $stmtConfig = $conn->prepare("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
            $stmtConfig->execute();
            $empresaConfig = $stmtConfig->fetch(PDO::FETCH_ASSOC);
            $sunatConfig = isset($empresaConfig['configuracion_sunat']) ? json_decode($empresaConfig['configuracion_sunat'], true) : [];

            $ruta = $sunatConfig['nubefact_ruta'] ?? '';
            $token = $sunatConfig['nubefact_token'] ?? '';

            if (empty($ruta) || empty($token)) {
                http_response_code(500);
                echo json_encode(['error' => 'Nubefact no configurado en Empresa -> Datos']);
                if (isset($conn)) $conn = null;
                exit;
            }

            // 4. Map Data for Nubefact
            // Helper for Motivo
            $motivosMap = [
                'Venta' => '01',
                'Compra' => '02',
                'Transformación' => '04', 
                'Traslado entre almacenes' => '04',
                'Consignación' => '13',
                'Devolución' => '06',
                'Importación' => '08',
                'Exportación' => '09',
                'Otros' => '13'
            ];
            $motivoCode = $motivosMap[$guia['motivo_traslado']] ?? '13';
            if ($motivoCode === '13' && preg_match('/^\d+$/', $guia['motivo_traslado'])) {
                 $motivoCode = str_pad($guia['motivo_traslado'], 2, '0', STR_PAD_LEFT);
            }

            // Helper for Doc Type
            $clienteDocLen = strlen($guia['destinatario_doc']);
            $clienteTipoDoc = ($clienteDocLen === 11) ? 6 : (($clienteDocLen === 8) ? 1 : 0);

            // Determine Transport Type
            // If transportista_doc is present, we assume '01' (Público) which REQUIRES RUC (6).
            // If transportista_doc is empty, we assume '02' (Privado).
            
            $tipoTransporte = '02'; // Default Private
            $transDocTipo = null;
            $transDocNum = null;
            $transDenominacion = null;
            $transPlaca = null;

            if (!empty($guia['transportista_doc'])) {
                $tipoTransporte = '01'; // Public
                
                // VALIDATION: Public transport requires RUC (11 digits)
                if (strlen($guia['transportista_doc']) !== 11) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Para transporte público, el documento del transportista debe ser un RUC (11 dígitos).']);
                    if (isset($conn)) $conn = null;
                    exit;
                }
                
                $transDocTipo = 6; // RUC
                $transDocNum = $guia['transportista_doc'];
                $transDenominacion = $guia['transportista_nombre'];
                // For public transport, vehicle and driver might not be strictly required by SUNAT in the same way, 
                // but usually the transport company handles it. However, if we have them, we send them?
                // Nubefact/SUNAT rules for Public:
                // transportista_documento_tipo (Mandatory)
                // transportista_documento_numero (Mandatory)
                // transportista_denominacion (Mandatory)
                
                // For Public transport, the vehicle/driver fields below might be ignored or optional.
            } else {
                $tipoTransporte = '02'; // Private
                // For Private transport, transportista fields must be null/empty
                // And Vehicle/Driver fields are Mandatory.
            }

            // Helper for Conductor Name (Splitting logic if necessary, or defaults)
            $conductorNombre = $guia['conductor_nombre'] ?? '.';
            $conductorApellidos = '.';
            
            // Attempt to split name if present
            if (!empty($conductorNombre) && $conductorNombre !== '.') {
                $parts = explode(' ', trim($conductorNombre));
                if (count($parts) >= 2) {
                    $conductorApellidos = array_pop($parts); // Last part as surname
                    // Check if second to last is also surname (heuristic)
                    if (count($parts) >= 2) {
                         $last = end($parts);
                         $conductorApellidos = $last . ' ' . $conductorApellidos;
                         array_pop($parts);
                    }
                    $conductorNombre = implode(' ', $parts);
                }
            }
            // Fallbacks if empty
            if (empty(trim($conductorNombre))) $conductorNombre = '.';
            if (empty(trim($conductorApellidos))) $conductorApellidos = '.';

            // Items
            $items = [];
            foreach ($detalles as $d) {
                $items[] = [
                    "unidad_de_medida" => $d['unidad_medida'] ?: 'NIU',
                    "codigo" => $d['codigo_producto'] ?: 'GEN-001',
                    "descripcion" => $d['descripcion'],
                    "cantidad" => $d['cantidad']
                ];
            }

            // Default Ubigeo (Lima) if unknown - Nubefact requires valid Ubigeo
            $defaultUbigeo = "150101"; 

            $nubefactData = [
                "operacion" => "generar_guia",
                "tipo_de_comprobante" => 7,
                "serie" => $guia['serie'],
                "numero" => (int)$guia['numero'],
                "cliente_tipo_de_documento" => $clienteTipoDoc,
                "cliente_numero_de_documento" => $guia['destinatario_doc'],
                "cliente_denominacion" => $guia['destinatario_nombre'],
                "cliente_direccion" => $guia['punto_llegada'],
                "cliente_email" => "", 
                "fecha_de_emision" => date('d-m-Y', strtotime($guia['fecha_emision'])),
                "observaciones" => $guia['observaciones'] ?: '-',
                "motivo_de_traslado" => $motivoCode,
                "peso_bruto_total" => $guia['peso_bruto_total'],
                "peso_bruto_unidad_de_medida" => "KGM",
                "numero_de_bultos" => $guia['numero_bultos'],
                "tipo_de_transporte" => $tipoTransporte,
                "fecha_de_inicio_de_traslado" => date('d-m-Y', strtotime($guia['fecha_traslado'])),
                
                "punto_de_partida_ubigeo" => $defaultUbigeo,
                "punto_de_partida_direccion" => $guia['punto_partida'],
                "punto_de_partida_codigo_establecimiento_sunat" => "0000",
                
                "punto_de_llegada_ubigeo" => $defaultUbigeo,
                "punto_de_llegada_direccion" => $guia['punto_llegada'],
                "punto_de_llegada_codigo_establecimiento_sunat" => "0000",
                
                "enviar_automaticamente_al_cliente" => false,
                "formato_de_pdf" => "A4",
                "items" => $items
            ];
            
            // Add Transportista fields only if Public
            if ($tipoTransporte === '01') {
                $nubefactData["transportista_documento_tipo"] = $transDocTipo;
                $nubefactData["transportista_documento_numero"] = $transDocNum;
                $nubefactData["transportista_denominacion"] = $transDenominacion;
                // If Placa is provided for Public transport (sometimes used), send it?
                // Nubefact might complain if transportista_placa_numero is missing?
                // Docs say: transportista_placa_numero: ABC444
                if (!empty($guia['vehiculo_placa'])) {
                     $nubefactData["transportista_placa_numero"] = $guia['vehiculo_placa'];
                }
            } else {
                // Private Transport: Driver and Vehicle are mandatory
                // But wait, where do we put them?
                // In GRE Remitente (Private), usually we send:
                // conductor_... fields
                // vehiculo_... fields (but in Nubefact JSON, is it 'transportista_placa_numero' or something else?)
                // Looking at docs:
                // 30->transportista_placa_numero: ABC444
                // 31->conductor_documento_tipo: 1
                
                // It seems Nubefact uses the same fields?
                // If Private, transportista_... fields should be empty/null, but 'transportista_placa_numero' might be the vehicle?
                // Actually, for Private, there is no "Transportista" entity.
                // But there is a vehicle and driver.
                // Docs line 65: VEHICULOS SECUNDARIOS
                
                // Let's assume for Private, we send driver info and vehicle info.
                // But where does vehicle info go if not in transportista_placa_numero?
                // Nubefact documentation usually says for Private Transport:
                // transportista_documento_tipo: null
                // transportista_documento_numero: null
                // transportista_denominacion: null
                // transportista_placa_numero: (Main vehicle plate) ??
                
                // Let's try sending conductor info always.
                // And for vehicle?
                // If I omit transportista_placa_numero for private, where is the vehicle?
                // Maybe Nubefact maps transportista_placa_numero to the vehicle even for private?
                // Let's keep transportista_placa_numero if available.
                
                if (!empty($guia['vehiculo_placa'])) {
                     $nubefactData["transportista_placa_numero"] = $guia['vehiculo_placa'];
                }
            }

            // Always add conductor info? 
            // For Public transport, driver info is sometimes optional or belongs to transport company.
            // For Private, it is mandatory.
            // We will send it if available.
            $nubefactData["conductor_documento_tipo"] = 1;
            
            // Sanitize License for DNI (Extract first sequence of 8 digits, or strip non-digits)
            $licencia = $guia['conductor_licencia'];
            if (preg_match('/(\d{8})/', $licencia, $matches)) {
                $nubefactData["conductor_documento_numero"] = $matches[1];
            } else {
                // Fallback: strip non-digits and take first 8 (or all if less)
                $digits = preg_replace('/[^0-9]/', '', $licencia);
                $nubefactData["conductor_documento_numero"] = substr($digits, 0, 8);
            }

            $nubefactData["conductor_nombre"] = $conductorNombre;
            $nubefactData["conductor_apellidos"] = $conductorApellidos;
            $nubefactData["conductor_numero_licencia"] = $guia['conductor_licencia'];

            // 5. Send
            $nubefact = new Nubefact($ruta, $token);
            $res = $nubefact->enviarGuia($nubefactData);

            if ($res['success']) {
                $respData = $res['data'];

                // VALIDATION: According to docs, PDF is only available if accepted by SUNAT
                $aceptada = $respData['aceptada_por_sunat'] ?? false;
                
                // Robust link extraction
                $linkPdf = $respData['enlace_del_pdf'] ?? $respData['enlace_pdf'] ?? $respData['enlace'] ?? '';
                $linkXml = $respData['enlace_del_xml'] ?? $respData['enlace_xml'] ?? '';
                $linkCdr = $respData['enlace_del_cdr'] ?? $respData['enlace_cdr'] ?? '';

                if ($aceptada) {
                    $nuevoEstado = 'Aceptada';
                    $msg = 'Guía aceptada por SUNAT correctamente';
                } else {
                    // If not accepted (e.g. pending or rejected but with success=true from Nubefact)
                    // We keep it as 'Emitida' or 'Enviada' but do NOT mark as Aceptada
                    // We store the description to know why
                    $nuevoEstado = 'Enviada'; // Or 'Emitida' with updated description
                    $msg = 'Guía enviada a SUNAT. Estado: ' . ($respData['sunat_description'] ?? 'Pendiente/Observada');
                    
                    // If not accepted, links might be empty, so we don't force them if they are empty
                    // But if Nubefact returns a link (e.g. public view), we save it.
                }

                $stmtUpdate = $conn->prepare("
                    UPDATE guias_remision SET 
                        estado = ?,
                        enlace_pdf = ?,
                        enlace_xml = ?,
                        enlace_cdr = ?,
                        sunat_description = ?,
                        sunat_response_code = ?
                    WHERE id = ?
                ");
                $stmtUpdate->execute([
                    $nuevoEstado,
                    $linkPdf,
                    $linkXml,
                    $linkCdr,
                    $respData['sunat_description'] ?? ($aceptada ? 'Aceptada' : 'Enviada a SUNAT'),
                    $respData['sunat_responsecode'] ?? '0',
                    $id
                ]);
                echo json_encode(['message' => $msg, 'data' => $respData]);
            } else {
                 $errorMsg = is_array($res['error']) ? json_encode($res['error']) : $res['error'];
                 $stmtErr = $conn->prepare("UPDATE guias_remision SET nubefact_error = ? WHERE id = ?");
                 $stmtErr->execute([$errorMsg, $id]);
                 
                 http_response_code(500);
                 echo json_encode(['error' => $errorMsg]);
            }

        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        
        if (isset($conn)) $conn = null;
        exit;
    }

    // ACTION: CONSULT STATUS (New)
    if (isset($_GET['action']) && $_GET['action'] === 'consultar_status') {
        if (!isset($data['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'ID requerido']);
            if (isset($conn)) $conn = null;
            exit;
        }

        $id = $data['id'];

        try {
            // 1. Fetch Guide Data
            $stmt = $conn->prepare("SELECT * FROM guias_remision WHERE id = ?");
            $stmt->execute([$id]);
            $guia = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$guia) {
                http_response_code(404);
                echo json_encode(['error' => 'Guía no encontrada']);
                exit;
            }

            // 2. Get Credentials
            $stmtConfig = $conn->prepare("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
            $stmtConfig->execute();
            $empresaConfig = $stmtConfig->fetch(PDO::FETCH_ASSOC);
            $sunatConfig = isset($empresaConfig['configuracion_sunat']) ? json_decode($empresaConfig['configuracion_sunat'], true) : [];

            $ruta = $sunatConfig['nubefact_ruta'] ?? '';
            $token = $sunatConfig['nubefact_token'] ?? '';

            if (empty($ruta) || empty($token)) {
                http_response_code(500);
                echo json_encode(['error' => 'Nubefact no configurado']);
                exit;
            }

            // 3. Prepare Payload
            $nubefactData = [
                "operacion" => "consultar_guia",
                "tipo_de_comprobante" => 7, // 7 for Guia Remitente
                "serie" => $guia['serie'],
                "numero" => (int)$guia['numero']
            ];

            // 4. Send
            $nubefact = new Nubefact($ruta, $token);
            $res = $nubefact->enviarGuia($nubefactData);

            if ($res['success']) {
                $respData = $res['data'];
                
                $aceptada = $respData['aceptada_por_sunat'] ?? false;
                
                // Links extraction
                $linkPdf = $respData['enlace_del_pdf'] ?? $respData['enlace_pdf'] ?? $respData['enlace'] ?? '';
                $linkXml = $respData['enlace_del_xml'] ?? $respData['enlace_xml'] ?? '';
                $linkCdr = $respData['enlace_del_cdr'] ?? $respData['enlace_cdr'] ?? '';

                if ($aceptada) {
                    $nuevoEstado = 'Aceptada';
                    $msg = 'Guía aceptada por SUNAT.';
                } else {
                    $nuevoEstado = 'Enviada';
                    $msg = 'Estado SUNAT: ' . ($respData['sunat_description'] ?? 'Pendiente');
                }

                $stmtUpdate = $conn->prepare("
                    UPDATE guias_remision SET 
                        estado = ?,
                        enlace_pdf = ?,
                        enlace_xml = ?,
                        enlace_cdr = ?,
                        sunat_description = ?,
                        sunat_response_code = ?
                    WHERE id = ?
                ");
                $stmtUpdate->execute([
                    $nuevoEstado,
                    $linkPdf,
                    $linkXml,
                    $linkCdr,
                    $respData['sunat_description'] ?? ($aceptada ? 'Aceptada' : 'Consultada'),
                    $respData['sunat_responsecode'] ?? '0',
                    $id
                ]);

                echo json_encode(['message' => $msg, 'data' => $respData]);
            } else {
                 $errorMsg = is_array($res['error']) ? json_encode($res['error']) : $res['error'];
                 http_response_code(500);
                 echo json_encode(['error' => $errorMsg]);
            }

        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        
        if (isset($conn)) $conn = null;
        exit;
    }

    // ACTION: EDITAR (Update existing guide)
    // Also handle case where action param is missing but ID is provided in body (fallback)
    if ((isset($_GET['action']) && $_GET['action'] === 'editar') || (isset($data['id']) && !empty($data['id']))) {
        if (!isset($data['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'ID requerido']);
            if (isset($conn)) $conn = null;
            exit;
        }

        $id = $data['id'];

        try {
            $conn->beginTransaction();

            // Check if exists and state
            $stmtCheck = $conn->prepare("SELECT estado FROM guias_remision WHERE id = ?");
            $stmtCheck->execute([$id]);
            $currentGuia = $stmtCheck->fetch(PDO::FETCH_ASSOC);

            if (!$currentGuia) {
                throw new Exception("Guía no encontrada");
            }
            if ($currentGuia['estado'] === 'Aceptada' || $currentGuia['estado'] === 'Anulada') {
                throw new Exception("No se puede editar una guía en estado " . $currentGuia['estado']);
            }

            // Update Header
            $stmt = $conn->prepare("
                UPDATE guias_remision SET 
                    fecha_emision = ?, fecha_traslado = ?, 
                    punto_partida = ?, almacen_id = ?, punto_llegada = ?, 
                    cliente_id = ?, destinatario_nombre = ?, destinatario_doc = ?,
                    transportista_nombre = ?, transportista_doc = ?, vehiculo_placa = ?, conductor_licencia = ?, conductor_nombre = ?,
                    motivo_traslado = ?, peso_bruto_total = ?, numero_bultos = ?,
                    observaciones = ?
                WHERE id = ?
            ");

            $stmt->execute([
                $data['fecha_emision'], $data['fecha_traslado'],
                $data['punto_partida'], $data['almacen_id'] ?? null, $data['punto_llegada'],
                $data['cliente_id'] ?: null, $data['destinatario_nombre'], $data['destinatario_doc'],
                $data['transportista_nombre'], $data['transportista_doc'], $data['vehiculo_placa'], $data['conductor_licencia'], $data['conductor_nombre'] ?? null,
                $data['motivo_traslado'], $data['peso_bruto_total'] ?? 0, $data['numero_bultos'] ?? 0,
                $data['observaciones'] ?? '',
                $id
            ]);

            // Update Details: Delete and Re-insert
            $stmtDel = $conn->prepare("DELETE FROM guias_remision_detalles WHERE guia_id = ?");
            $stmtDel->execute([$id]);

            $stmtDetalle = $conn->prepare("
                INSERT INTO guias_remision_detalles (
                    guia_id, producto_id, codigo_producto, descripcion, unidad_medida, cantidad, peso
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            
            foreach ($data['detalles'] as $item) {
                $stmtDetalle->execute([
                    $id,
                    $item['producto_id'] ?: null,
                    $item['codigo_producto'] ?? '',
                    $item['descripcion'],
                    $item['unidad_medida'],
                    $item['cantidad'],
                    $item['peso'] ?? 0
                ]);
            }

            $conn->commit();
            echo json_encode(['message' => 'Guía actualizada correctamente']);

        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        
        if (isset($conn)) $conn = null;
        exit;
    }

    if (!isset($data['fecha_emision'], $data['fecha_traslado'], $data['serie'], $data['numero'], $data['detalles'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Datos incompletos']);
        if (isset($conn)) $conn = null;
        exit;
    }

    try {
        $conn->beginTransaction();

        $stmt = $conn->prepare("
            INSERT INTO guias_remision (
                serie, numero, fecha_emision, fecha_traslado, 
                punto_partida, almacen_id, punto_llegada, 
                cliente_id, destinatario_nombre, destinatario_doc,
                transportista_nombre, transportista_doc, vehiculo_placa, conductor_licencia, conductor_nombre,
                motivo_traslado, peso_bruto_total, numero_bultos,
                observaciones, usuario_id, estado
            ) VALUES (
                ?, ?, ?, ?, 
                ?, ?, ?, 
                ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, 'Emitida'
            )
        ");

        $stmt->execute([
            $data['serie'], $data['numero'], $data['fecha_emision'], $data['fecha_traslado'],
            $data['punto_partida'], $data['almacen_id'] ?? null, $data['punto_llegada'],
            $data['cliente_id'] ?: null, $data['destinatario_nombre'], $data['destinatario_doc'],
            $data['transportista_nombre'], $data['transportista_doc'], $data['vehiculo_placa'], $data['conductor_licencia'], $data['conductor_nombre'] ?? null,
            $data['motivo_traslado'], $data['peso_bruto_total'] ?? 0, $data['numero_bultos'] ?? 0,
            $data['observaciones'] ?? '', $user_id
        ]);

        $guia_id = $conn->lastInsertId();

        $stmtDetalle = $conn->prepare("
            INSERT INTO guias_remision_detalles (
                guia_id, producto_id, codigo_producto, descripcion, unidad_medida, cantidad, peso
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        
        $kardexItems = [];

        foreach ($data['detalles'] as $item) {
            $stmtDetalle->execute([
                $guia_id,
                $item['producto_id'] ?: null,
                $item['codigo_producto'] ?? '',
                $item['descripcion'],
                $item['unidad_medida'],
                $item['cantidad'],
                $item['peso'] ?? 0
            ]);
            
            if (!empty($item['producto_id'])) {
                // No need to fetch cost here; StockHelper will handle it using current avg cost for 'salida'
                $kardexItems[] = [
                    'producto_id' => $item['producto_id'],
                    'cantidad' => $item['cantidad'],
                    'costo_unitario' => 0 // 0 triggers automatic fetch in StockHelper
                ];
            }
        }

        // Registrar movimiento en Kardex
        if (!empty($data['almacen_id']) && !empty($kardexItems)) {
            $stockHelper = new StockHelper($conn);
            $stockHelper->registrarMovimiento([
                'almacen_id' => $data['almacen_id'],
                'usuario_id' => $user_id,
                'tipo' => 'salida',
                'motivo' => 'Guía de Remisión: ' . ($data['motivo_traslado'] ?? ''),
                'documento_referencia' => $data['serie'] . '-' . $data['numero'],
                'items' => $kardexItems
            ]);
        }

        $conn->commit();
        echo json_encode(['message' => 'Guía de remisión creada', 'id' => $guia_id]);

    } catch (Exception $e) {
        $conn->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }

} elseif ($method === 'PUT') {
    $data = getJsonInput();
    $id = $_GET['id'] ?? null;

    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'ID requerido']);
        $conn = null;
        exit;
    }

    if (isset($data['action']) && $data['action'] === 'anular') {
        try {
            $stmt = $conn->prepare("UPDATE guias_remision SET estado = 'Anulada' WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(['message' => 'Guía anulada correctamente']);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Acción no válida']);
    }

} elseif ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;

    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'ID requerido']);
        if (isset($conn)) $conn = null;
        exit;
    }

    try {
        $conn->beginTransaction();

        // Delete details first
        $stmtDetails = $conn->prepare("DELETE FROM guias_remision_detalles WHERE guia_id = ?");
        $stmtDetails->execute([$id]);

        // Delete guide
        $stmt = $conn->prepare("DELETE FROM guias_remision WHERE id = ?");
        $stmt->execute([$id]);

        $conn->commit();
        echo json_encode(['message' => 'Guía eliminada correctamente']);
    } catch (PDOException $e) {
        $conn->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}
$conn = null;
?>
