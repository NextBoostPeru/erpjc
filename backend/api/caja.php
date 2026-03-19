<?php
include_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../config/rbac.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET, PUT, DELETE, OPTIONS");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    if (isset($conn)) $conn = null;
    exit;
}

$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$user_data = $jwt->validateToken($token);

if (!$user_data) {
    if (isset($conn)) $conn = null;
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    exit;
}

$user_data = (object)$user_data;
$usuario_id = $user_data->id;
$target_user_id = isset($_GET['user_id']) && !empty($_GET['user_id']) ? $_GET['user_id'] : $usuario_id;
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if (!($method === 'GET' && $action === 'get_pcge')) {
    rbac_require($conn, $user_data, 'caja', $method);
}

try {
    // Auto-setup: Verificar y crear tablas necesarias si no existen
    $conn->exec("CREATE TABLE IF NOT EXISTS caja_sesiones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        fecha_apertura DATETIME NOT NULL,
        fecha_cierre DATETIME,
        monto_inicial DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        monto_final DECIMAL(12,2),
        monto_sistema DECIMAL(12,2),
        diferencia DECIMAL(12,2),
        estado ENUM('Abierta', 'Cerrada') DEFAULT 'Abierta',
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    $conn->exec("CREATE TABLE IF NOT EXISTS caja_movimientos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sesion_id INT NOT NULL,
        tipo ENUM('Ingreso', 'Egreso') NOT NULL,
        monto DECIMAL(12,2) NOT NULL,
        concepto VARCHAR(255) NOT NULL,
        referencia VARCHAR(100),
        usuario_id INT NOT NULL,
        receptor VARCHAR(255),
        cuenta_contable VARCHAR(50),
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sesion_id) REFERENCES caja_sesiones(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    // Auto-update: Asegurar columnas nuevas en caja_movimientos
    try {
        $conn->query("SELECT receptor FROM caja_movimientos LIMIT 1");
    } catch (Exception $e) {
        $conn->exec("ALTER TABLE caja_movimientos ADD COLUMN receptor VARCHAR(255) NULL AFTER usuario_id");
    }
    try {
        $conn->query("SELECT cuenta_contable FROM caja_movimientos LIMIT 1");
    } catch (Exception $e) {
        $conn->exec("ALTER TABLE caja_movimientos ADD COLUMN cuenta_contable VARCHAR(50) NULL AFTER receptor");
    }

    if ($method === 'GET') {
        switch ($action) {
            case 'get_pcge':
                // Verificar si la tabla existe y crearla si no
                try {
                    $check = $conn->query("SELECT 1 FROM pcge LIMIT 1");
                } catch (Exception $e) {
                    // Crear tabla si no existe
                    $conn->exec("CREATE TABLE IF NOT EXISTS pcge (
                        codigo VARCHAR(10) PRIMARY KEY,
                        nombre VARCHAR(255) NOT NULL,
                        nivel INT NOT NULL,
                        tipo VARCHAR(50),
                        padre_codigo VARCHAR(10),
                        permite_movimiento TINYINT(1) DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

                    // Insertar datos básicos
                    $conn->exec("INSERT IGNORE INTO pcge (codigo, nombre, nivel, tipo, padre_codigo, permite_movimiento) VALUES 
                        ('10', 'EFECTIVO Y EQUIVALENTES DE EFECTIVO', 2, 'Activo', null, 0),
                        ('101', 'Caja', 3, 'Activo', '10', 1),
                        ('104', 'Cuentas Corrientes', 3, 'Activo', '10', 1),
                        ('12', 'CUENTAS POR COBRAR', 2, 'Activo', null, 0),
                        ('121', 'Facturas por Cobrar', 3, 'Activo', '12', 1),
                        ('42', 'CUENTAS POR PAGAR', 2, 'Pasivo', null, 0),
                        ('421', 'Facturas por Pagar', 3, 'Pasivo', '42', 1),
                        ('60', 'COMPRAS', 2, 'Gasto', null, 0),
                        ('70', 'VENTAS', 2, 'Ingreso', null, 0);");
                }

                // Listar cuentas contables para ingresos/egresos (solo nivel > 2 para detalle)
                $sql = "SELECT codigo, nombre FROM pcge WHERE LENGTH(codigo) > 2 ORDER BY codigo";
                $stmt = $conn->prepare($sql);
                $stmt->execute();
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
                break;

            case 'estado':
                if ($target_user_id === 'all') {
                    // Estado global (hoy)
                    $sql = "SELECT 
                        SUM(CASE WHEN tipo = 'Ingreso' THEN monto ELSE 0 END) as ingresos,
                        SUM(CASE WHEN tipo = 'Egreso' THEN monto ELSE 0 END) as egresos
                        FROM caja_movimientos 
                        WHERE DATE(fecha) = CURDATE()";
                    $stmt = $conn->prepare($sql);
                    $stmt->execute();
                    $totales = $stmt->fetch(PDO::FETCH_ASSOC);

                    $ingresos = floatval($totales['ingresos'] ?? 0);
                    $egresos = floatval($totales['egresos'] ?? 0);
                    // Saldo no aplicable globalmente de forma sencilla, retornamos 0 o diferencia del día
                    $saldo_actual = $ingresos - $egresos;

                    echo json_encode([
                        "estado" => "Abierta", // Simulado para mostrar datos
                        "sesion" => [
                            "id" => "all",
                            "fecha_apertura" => date('Y-m-d 00:00:00'),
                            "monto_inicial" => 0
                        ],
                        "totales" => ["ingresos" => $ingresos, "egresos" => $egresos],
                        "saldo_actual" => $saldo_actual
                    ]);
                } else {
                    // Buscar sesión abierta del usuario
                    $sql = "SELECT * FROM caja_sesiones WHERE usuario_id = :uid AND estado = 'Abierta' LIMIT 1";
                    $stmt = $conn->prepare($sql);
                    $stmt->execute([':uid' => $target_user_id]);
                    $sesion = $stmt->fetch(PDO::FETCH_ASSOC);
    
                    if ($sesion) {
                        // Calcular totales
                        $sqlTotales = "SELECT 
                            SUM(CASE WHEN tipo = 'Ingreso' THEN monto ELSE 0 END) as ingresos,
                            SUM(CASE WHEN tipo = 'Egreso' THEN monto ELSE 0 END) as egresos
                            FROM caja_movimientos WHERE sesion_id = :sid";
                        $stmtTotales = $conn->prepare($sqlTotales);
                        $stmtTotales->execute([':sid' => $sesion['id']]);
                        $totales = $stmtTotales->fetch(PDO::FETCH_ASSOC);
                        
                        $ingresos = floatval($totales['ingresos'] ?? 0);
                        $egresos = floatval($totales['egresos'] ?? 0);
                        $saldo_actual = floatval($sesion['monto_inicial']) + $ingresos - $egresos;
    
                        echo json_encode([
                            "estado" => "Abierta",
                            "sesion" => $sesion,
                            "totales" => ["ingresos" => $ingresos, "egresos" => $egresos],
                            "saldo_actual" => $saldo_actual
                        ]);
                    } else {
                        echo json_encode(["estado" => "Cerrada"]);
                    }
                }
                break;

            case 'listar_movimientos':
                if ($target_user_id === 'all') {
                    // Listar movimientos de todos los usuarios (últimos 100)
                    $sqlMov = "SELECT cm.*, u.usuario as usuario_nombre, u.nombre_real 
                               FROM caja_movimientos cm 
                               LEFT JOIN usuarios u ON cm.usuario_id = u.id 
                               ORDER BY cm.fecha DESC 
                               LIMIT 100";
                    $stmtMov = $conn->prepare($sqlMov);
                    $stmtMov->execute();
                    echo json_encode($stmtMov->fetchAll(PDO::FETCH_ASSOC));
                } else {
                    // Buscar sesión abierta o última cerrada
                    $sql = "SELECT id FROM caja_sesiones WHERE usuario_id = :uid ORDER BY fecha_apertura DESC LIMIT 1";
                    $stmt = $conn->prepare($sql);
                    $stmt->execute([':uid' => $target_user_id]);
                    $sesion = $stmt->fetch(PDO::FETCH_ASSOC);
    
                    if ($sesion) {
                        $sqlMov = "SELECT cm.*, u.usuario as usuario_nombre, u.nombre_real 
                                   FROM caja_movimientos cm 
                                   LEFT JOIN usuarios u ON cm.usuario_id = u.id 
                                   WHERE cm.sesion_id = :sid 
                                   ORDER BY cm.fecha DESC";
                        $stmtMov = $conn->prepare($sqlMov);
                        $stmtMov->execute([':sid' => $sesion['id']]);
                        echo json_encode($stmtMov->fetchAll(PDO::FETCH_ASSOC));
                    } else {
                        echo json_encode([]);
                    }
                }
                break;

            case 'historial_sesiones':
                $sql = "SELECT * FROM caja_sesiones WHERE usuario_id = :uid ORDER BY fecha_apertura DESC LIMIT 20";
                $stmt = $conn->prepare($sql);
                $stmt->execute([':uid' => $target_user_id]);
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
                break;

            default:
                 http_response_code(400);
                 echo json_encode(["message" => "Acción GET no válida"]);
                 break;
        }
    } elseif ($method === 'POST') {
        $input = file_get_contents("php://input");
        $data = json_decode($input, true);
        
        if (json_last_error() !== JSON_ERROR_NONE && !empty($input)) {
            throw new Exception("JSON inválido: " . json_last_error_msg());
        }

        switch ($action) {
            case 'abrir':
                $monto_inicial = isset($data['monto_inicial']) && $data['monto_inicial'] !== '' ? floatval($data['monto_inicial']) : 0;

                if ($monto_inicial < 0) {
                    http_response_code(400);
                    echo json_encode(["message" => "El monto inicial no puede ser negativo"]);
                    exit;
                }

                try {
                    $conn->beginTransaction();

                    // Bloquear usuario para evitar doble apertura simultánea
                    $stmtLock = $conn->prepare("SELECT id FROM usuarios WHERE id = ? FOR UPDATE");
                    $stmtLock->execute([$usuario_id]);

                    // Verificar si ya tiene sesión abierta
                    $sqlCheck = "SELECT id FROM caja_sesiones WHERE usuario_id = :uid AND estado = 'Abierta' LIMIT 1";
                    $stmtCheck = $conn->prepare($sqlCheck);
                    $stmtCheck->execute([':uid' => $usuario_id]);
                    
                    if ($stmtCheck->fetch()) {
                        $conn->rollBack();
                        http_response_code(400);
                        echo json_encode(["message" => "Ya tienes una sesión de caja abierta"]);
                        exit;
                    }

                    $sql = "INSERT INTO caja_sesiones (usuario_id, fecha_apertura, monto_inicial, estado) VALUES (:uid, NOW(), :monto, 'Abierta')";
                    $stmt = $conn->prepare($sql);
                    $stmt->execute([':uid' => $usuario_id, ':monto' => $monto_inicial]);
                    $id = $conn->lastInsertId();

                    $conn->commit();

                    // Retornar la nueva sesión
                    $sqlGet = "SELECT * FROM caja_sesiones WHERE id = :id";
                    $stmtGet = $conn->prepare($sqlGet);
                    $stmtGet->execute([':id' => $id]);
                    $sesion = $stmtGet->fetch(PDO::FETCH_ASSOC);

                    echo json_encode(["success" => true, "sesion" => $sesion]);

                } catch (Exception $e) {
                    if ($conn->inTransaction()) $conn->rollBack();
                    http_response_code(500);
                    echo json_encode(["message" => "Error al abrir caja: " . $e->getMessage()]);
                }
                break;

            case 'movimiento':
                try {
                    $conn->beginTransaction();

                    // 1. Bloquear sesión para asegurar consistencia y estado
                    $sqlSesion = "SELECT id, estado FROM caja_sesiones WHERE usuario_id = :uid AND estado = 'Abierta' LIMIT 1 FOR UPDATE";
                    $stmtSesion = $conn->prepare($sqlSesion);
                    $stmtSesion->execute([':uid' => $usuario_id]);
                    $sesion = $stmtSesion->fetch(PDO::FETCH_ASSOC);

                    if (!$sesion) {
                        $conn->rollBack();
                        http_response_code(400);
                        echo json_encode(["message" => "No hay caja abierta"]);
                        exit;
                    }

                    $tipo = $data['tipo'] ?? null;
                    $monto = isset($data['monto']) && $data['monto'] !== '' ? floatval($data['monto']) : 0;
                    $concepto = $data['concepto'] ?? null;
                    $referencia = $data['referencia'] ?? '';
                    $receptor = $data['receptor'] ?? '';
                    $cuenta_contable = $data['cuenta_contable'] ?? '';
                    $fecha_input = $data['fecha'] ?? null;
                    $fecha_mov = date('Y-m-d H:i:s');
                    if (!empty($fecha_input) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_input)) {
                        $fecha_mov = $fecha_input . ' ' . date('H:i:s');
                    }

                    if ($monto <= 0 || !$concepto || !$tipo) {
                        $conn->rollBack();
                        http_response_code(400);
                        echo json_encode(["message" => "Datos incompletos o monto inválido"]);
                        exit;
                    }

                    // 2. Insertar Movimiento
                    $sql = "INSERT INTO caja_movimientos (sesion_id, tipo, monto, concepto, referencia, usuario_id, receptor, cuenta_contable, fecha) 
                            VALUES (:sid, :tipo, :monto, :concepto, :ref, :uid, :rec, :cta, :fecha)";
                    $stmt = $conn->prepare($sql);
                    $stmt->execute([
                        ':sid' => $sesion['id'],
                        ':tipo' => $tipo,
                        ':monto' => $monto,
                        ':concepto' => $concepto,
                        ':ref' => $referencia,
                        ':uid' => $usuario_id,
                        ':rec' => $receptor,
                        ':cta' => $cuenta_contable,
                        ':fecha' => $fecha_mov
                    ]);

                    // 3. Integración Contable (Si hay cuenta contable)
                    if (!empty($cuenta_contable)) {
                        // Glosa del asiento
                        $glosa = "Caja " . $tipo . ": " . $concepto;
                        
                        // Cabecera Asiento
                        $sqlHead = "INSERT INTO asientos (fecha, glosa, tipo_asiento, moneda, estado, usuario_id) 
                                    VALUES (:fecha, :glosa, 'Diario', 'PEN', 'Finalizado', :uid)";
                        $conn->prepare($sqlHead)->execute([':fecha' => $fecha_mov, ':glosa' => $glosa, ':uid' => $usuario_id]);
                        $asiento_id = $conn->lastInsertId();

                        // Cuentas
                        $cta_caja = '101'; // Caja General (Según PCGE insertado)
                        $cta_contra = $cuenta_contable;

                        $sqlDet = "INSERT INTO asientos_detalle (asiento_id, cuenta_codigo, debe, haber) VALUES (:aid, :cta, :debe, :haber)";
                        $stmtDet = $conn->prepare($sqlDet);

                        if ($tipo === 'Ingreso') {
                            // Debe: Caja (101), Haber: Ingreso/Venta (70...)
                            $stmtDet->execute([':aid' => $asiento_id, ':cta' => $cta_caja, ':debe' => $monto, ':haber' => 0]);
                            $stmtDet->execute([':aid' => $asiento_id, ':cta' => $cta_contra, ':debe' => 0, ':haber' => $monto]);
                        } else {
                            // Egreso
                            // Debe: Gasto/Compra (60...), Haber: Caja (101)
                            $stmtDet->execute([':aid' => $asiento_id, ':cta' => $cta_contra, ':debe' => $monto, ':haber' => 0]);
                            $stmtDet->execute([':aid' => $asiento_id, ':cta' => $cta_caja, ':debe' => 0, ':haber' => $monto]);
                        }
                    }

                    $conn->commit();
                    echo json_encode(["success" => true, "message" => "Movimiento registrado"]);

                } catch (Exception $e) {
                    if ($conn->inTransaction()) $conn->rollBack();
                    http_response_code(500);
                    echo json_encode(["message" => "Error: " . $e->getMessage()]);
                }
                break;

            case 'editar_movimiento':
                $id = $data['id'] ?? null;
                $tipo = $data['tipo'] ?? null;
                $monto = isset($data['monto']) && $data['monto'] !== '' ? floatval($data['monto']) : 0;
                $concepto = $data['concepto'] ?? null;
                $referencia = $data['referencia'] ?? '';
                $receptor = $data['receptor'] ?? '';
                $cuenta_contable = $data['cuenta_contable'] ?? '';
                $fecha_input = $data['fecha'] ?? null;
                $fecha_mov = null;
                if (!empty($fecha_input) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_input)) {
                    $fecha_mov = $fecha_input . ' ' . date('H:i:s');
                }

                if (!$id || $monto <= 0 || !$concepto || !$tipo) {
                    http_response_code(400);
                    echo json_encode(["message" => "Datos incompletos"]);
                    exit;
                }

                try {
                    $conn->beginTransaction();

                    // Verificar que el movimiento existe y pertenece a una sesión abierta del usuario (o admin)
                    // Permitimos editar si la sesión está abierta.
                    $sqlCheck = "SELECT cm.id, cm.sesion_id 
                                 FROM caja_movimientos cm 
                                 JOIN caja_sesiones cs ON cm.sesion_id = cs.id 
                                 WHERE cm.id = :id AND cs.estado = 'Abierta'";
                    $stmtCheck = $conn->prepare($sqlCheck);
                    $stmtCheck->execute([':id' => $id]);
                    $mov = $stmtCheck->fetch(PDO::FETCH_ASSOC);

                    if (!$mov) {
                        $conn->rollBack();
                        http_response_code(403);
                        echo json_encode(["message" => "No se puede editar: movimiento no encontrado o sesión cerrada"]);
                        exit;
                    }

                    // Actualizar movimiento
                    $sql = "UPDATE caja_movimientos 
                            SET tipo = :tipo, monto = :monto, concepto = :concepto, 
                                referencia = :ref, receptor = :rec, cuenta_contable = :cta" . ($fecha_mov ? ", fecha = :fecha" : "") . "
                            WHERE id = :id";
                    $stmt = $conn->prepare($sql);
                    $params = [
                        ':tipo' => $tipo,
                        ':monto' => $monto,
                        ':concepto' => $concepto,
                        ':ref' => $referencia,
                        ':rec' => $receptor,
                        ':cta' => $cuenta_contable,
                        ':id' => $id
                    ];
                    if ($fecha_mov) $params[':fecha'] = $fecha_mov;
                    $stmt->execute($params);

                    $conn->commit();
                    echo json_encode(["success" => true, "message" => "Movimiento actualizado"]);

                } catch (Exception $e) {
                    if ($conn->inTransaction()) $conn->rollBack();
                    http_response_code(500);
                    echo json_encode(["message" => "Error al actualizar: " . $e->getMessage()]);
                }
                break;

            case 'eliminar_movimiento':
                $id = $data['id'] ?? null;

                if (!$id) {
                    http_response_code(400);
                    echo json_encode(["message" => "ID requerido"]);
                    exit;
                }

                try {
                    $conn->beginTransaction();

                    // Verificar que el movimiento existe y pertenece a una sesión abierta
                    $sqlCheck = "SELECT cm.id 
                                 FROM caja_movimientos cm 
                                 JOIN caja_sesiones cs ON cm.sesion_id = cs.id 
                                 WHERE cm.id = :id AND cs.estado = 'Abierta'";
                    $stmtCheck = $conn->prepare($sqlCheck);
                    $stmtCheck->execute([':id' => $id]);
                    
                    if (!$stmtCheck->fetch()) {
                        $conn->rollBack();
                        http_response_code(403);
                        echo json_encode(["message" => "No se puede eliminar: movimiento no encontrado o sesión cerrada"]);
                        exit;
                    }

                    // Eliminar movimiento
                    $sql = "DELETE FROM caja_movimientos WHERE id = :id";
                    $stmt = $conn->prepare($sql);
                    $stmt->execute([':id' => $id]);

                    $conn->commit();
                    echo json_encode(["success" => true, "message" => "Movimiento eliminado"]);

                } catch (Exception $e) {
                    if ($conn->inTransaction()) $conn->rollBack();
                    http_response_code(500);
                    echo json_encode(["message" => "Error al eliminar: " . $e->getMessage()]);
                }
                break;

            case 'cerrar':
                $sesion_id = $data['sesion_id'] ?? null;
                $monto_final = isset($data['monto_final']) && $data['monto_final'] !== '' ? floatval($data['monto_final']) : 0; // Arqueo físico
                $observaciones = $data['observaciones'] ?? '';

                if (!$sesion_id) {
                    http_response_code(400);
                    echo json_encode(["message" => "ID de sesión requerido"]);
                    exit;
                }

                try {
                    $conn->beginTransaction();

                    // 1. Bloquear sesión
                    $sqlCheck = "SELECT * FROM caja_sesiones WHERE id = :id AND usuario_id = :uid AND estado = 'Abierta' FOR UPDATE";
                    $stmtCheck = $conn->prepare($sqlCheck);
                    $stmtCheck->execute([':id' => $sesion_id, ':uid' => $usuario_id]);
                    $sesion = $stmtCheck->fetch(PDO::FETCH_ASSOC);

                    if (!$sesion) {
                        $conn->rollBack();
                        http_response_code(400);
                        echo json_encode(["message" => "Sesión no válida o ya cerrada"]);
                        exit;
                    }

                    // 2. Calcular sistema
                    $sqlTotales = "SELECT 
                        SUM(CASE WHEN tipo = 'Ingreso' THEN monto ELSE 0 END) as ingresos,
                        SUM(CASE WHEN tipo = 'Egreso' THEN monto ELSE 0 END) as egresos
                        FROM caja_movimientos WHERE sesion_id = :sid";
                    $stmtTotales = $conn->prepare($sqlTotales);
                    $stmtTotales->execute([':sid' => $sesion_id]);
                    $totales = $stmtTotales->fetch(PDO::FETCH_ASSOC);

                    $monto_sistema = floatval($sesion['monto_inicial']) + floatval($totales['ingresos'] ?? 0) - floatval($totales['egresos'] ?? 0);
                    $diferencia = $monto_final - $monto_sistema;

                    // 3. Actualizar cierre
                    $sqlUpdate = "UPDATE caja_sesiones SET 
                        fecha_cierre = NOW(), 
                        monto_final = :mf, 
                        monto_sistema = :ms, 
                        diferencia = :diff, 
                        observaciones = :obs, 
                        estado = 'Cerrada' 
                        WHERE id = :id";
                    
                    $stmtUpdate = $conn->prepare($sqlUpdate);
                    $stmtUpdate->execute([
                        ':mf' => $monto_final,
                        ':ms' => $monto_sistema,
                        ':diff' => $diferencia,
                        ':obs' => $observaciones,
                        ':id' => $sesion_id
                    ]);

                    $conn->commit();
                    echo json_encode(["success" => true, "diferencia" => $diferencia]);

                } catch (Exception $e) {
                    if ($conn->inTransaction()) $conn->rollBack();
                    http_response_code(500);
                    echo json_encode(["message" => "Error al cerrar caja: " . $e->getMessage()]);
                }
                break;

            default:
                http_response_code(400);
                echo json_encode(["message" => "Acción POST no válida"]);
                break;
        }
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error del servidor: " . $e->getMessage()]);
}

if (isset($conn)) $conn = null;
