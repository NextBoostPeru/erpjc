<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

header('Content-Type: application/json');

try {
    $jwtHandler = new JWTHandler();
    $token = $jwtHandler->getBearerToken();
    $userData = $jwtHandler->validateToken($token);

    if (!$userData) {
        http_response_code(401);
        echo json_encode(["message" => "Acceso no autorizado"]);
        exit;
    }

    $method = $_SERVER['REQUEST_METHOD'];
    rbac_require($conn, $userData, 'reportes_financieros', $method);

    $action = $_GET['action'] ?? '';
    $anio = $_GET['anio'] ?? date('Y');
    $mes = $_GET['mes'] ?? date('m');
    $sede_id = $_GET['sede_id'] ?? null;

    // Helpers
    if (!function_exists('getSaldoCuenta')) {
        function getSaldoCuenta($conn, $codigo_prefix, $anio, $mes_fin) {
            // Calcula saldo acumulado del AÑO hasta el mes fin
            // Filtramos por año para evitar duplicidad con asientos de apertura de años anteriores
            // y para asegurar que las cuentas de resultados solo muestren el ejercicio actual.
            
            $fecha_inicio = "$anio-01-01";
            $fecha_limite = date("Y-m-t", strtotime("$anio-$mes_fin-01"));
            
            $sql = "SELECT SUM(ad.debe) as debe, SUM(ad.haber) as haber 
                    FROM asientos_detalle ad
                    JOIN asientos a ON ad.asiento_id = a.id
                    WHERE ad.cuenta_codigo LIKE :prefix 
                    AND a.fecha BETWEEN :inicio AND :fin
                    AND a.estado = 'Finalizado'";
                    
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':prefix' => "$codigo_prefix%", 
                ':inicio' => $fecha_inicio,
                ':fin' => $fecha_limite
            ]);
            $res = $stmt->fetch(PDO::FETCH_ASSOC);
            
            return [
                'debe' => floatval($res['debe'] ?? 0), 
                'haber' => floatval($res['haber'] ?? 0)
            ];
        }
    }

    switch ($action) {
        case 'balance_general':
            // Activos (1, 2, 3)
            // Pasivos (4)
            // Patrimonio (5)
            
            // Optimization: Pre-fetch balances
            $fecha_inicio = "$anio-01-01";
            $fecha_limite = date("Y-m-t", strtotime("$anio-$mes-01"));
            
            $sqlBatch = "SELECT LEFT(ad.cuenta_codigo, 2) as codigo_grupo, SUM(ad.debe) as debe, SUM(ad.haber) as haber 
                    FROM asientos_detalle ad
                    JOIN asientos a ON ad.asiento_id = a.id
                    WHERE a.fecha BETWEEN :inicio AND :fin
                    AND a.estado = 'Finalizado'
                    GROUP BY LEFT(ad.cuenta_codigo, 2)";
            
            $stmtBatch = $conn->prepare($sqlBatch);
            $stmtBatch->execute([
                ':inicio' => $fecha_inicio,
                ':fin' => $fecha_limite
            ]);
            $saldosRaw = $stmtBatch->fetchAll(PDO::FETCH_ASSOC);
            $saldosMap = [];
            foreach($saldosRaw as $r) {
                $saldosMap[$r['codigo_grupo']] = [
                    'debe' => floatval($r['debe']),
                    'haber' => floatval($r['haber'])
                ];
            }
            
            $activos = [];
            $pasivos = [];
            $patrimonio = [];
            
            // Fetch groups lvl 2
            $stmt = $conn->query("SELECT codigo, nombre FROM pcge WHERE LENGTH(codigo) = 2 ORDER BY codigo");
            $cuentas = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $total_activo = 0;
            $total_pasivo = 0;
            $total_patrimonio = 0;
            
            foreach ($cuentas as $cta) {
                $prefix = $cta['codigo'];
                $firstChar = substr($prefix, 0, 1);
                
                if (!in_array($firstChar, ['1', '2', '3', '4', '5'])) continue;
                
                $saldoData = $saldosMap[$prefix] ?? ['debe' => 0, 'haber' => 0];
                $saldo = $saldoData['debe'] - $saldoData['haber'];
                
                if ($saldo == 0) continue;
                
                $item = [
                    'codigo' => $cta['codigo'],
                    'nombre' => $cta['nombre'],
                    'saldo' => abs($saldo)
                ];
                
                if (in_array($firstChar, ['1', '2', '3'])) {
                    // Activo: Naturaleza Deudora (Debe > Haber) -> Positivo
                    // Si saldo < 0 es raro para activo, pero lo mostramos
                    $activos[] = $item;
                    $total_activo += $saldo;
                } elseif ($firstChar == '4') {
                    // Pasivo: Naturaleza Acreedora (Haber > Debe) -> Saldo negativo aqui
                    // Mostramos positivo en reporte
                    $pasivos[] = $item;
                    $total_pasivo += ($saldoData['haber'] - $saldoData['debe']);
                } elseif ($firstChar == '5') {
                    // Patrimonio
                    $patrimonio[] = $item;
                    $total_patrimonio += ($saldoData['haber'] - $saldoData['debe']);
                }
            }
            
            // Calcular Resultado del Ejercicio (Ingresos - Gastos) para cuadrar
            // Use map for 6 and 7 if possible, but 6 and 7 are single digits.
            // Map keys are 2 digits (e.g. 60, 61, 70).
            // So we need to sum up all keys starting with 6 and 7.
            
            $ingresosHaber = 0; $ingresosDebe = 0;
            $gastosDebe = 0; $gastosHaber = 0;
            
            foreach ($saldosMap as $k => $v) {
                if (substr($k, 0, 1) == '7') {
                    $ingresosHaber += $v['haber'];
                    $ingresosDebe += $v['debe'];
                } elseif (substr($k, 0, 1) == '6') {
                    $gastosDebe += $v['debe'];
                    $gastosHaber += $v['haber'];
                }
            }
            
            $total_ingresos = $ingresosHaber - $ingresosDebe;
            $total_gastos = $gastosDebe - $gastosHaber;
            $resultado_ejercicio = $total_ingresos - $total_gastos;
            
            $patrimonio[] = [
                'codigo' => 'RES',
                'nombre' => 'Resultado del Ejercicio',
                'saldo' => $resultado_ejercicio
            ];
            $total_patrimonio += $resultado_ejercicio;

            echo json_encode([
                'activos' => $activos,
                'pasivos' => $pasivos,
                'patrimonio' => $patrimonio,
                'totales' => [
                    'activo' => $total_activo,
                    'pasivo' => $total_pasivo,
                    'patrimonio' => $total_patrimonio,
                    'pasivo_patrimonio' => $total_pasivo + $total_patrimonio
                ]
            ]);
            break;

        case 'estado_resultados':
            // Ingresos (7) vs Gastos (6)
            
            // Optimization: Pre-fetch balances
            $fecha_inicio = "$anio-01-01";
            $fecha_limite = date("Y-m-t", strtotime("$anio-$mes-01"));
            
            $sqlBatch = "SELECT LEFT(ad.cuenta_codigo, 2) as codigo_grupo, SUM(ad.debe) as debe, SUM(ad.haber) as haber 
                    FROM asientos_detalle ad
                    JOIN asientos a ON ad.asiento_id = a.id
                    WHERE a.fecha BETWEEN :inicio AND :fin
                    AND a.estado = 'Finalizado'
                    AND (ad.cuenta_codigo LIKE '6%' OR ad.cuenta_codigo LIKE '7%')
                    GROUP BY LEFT(ad.cuenta_codigo, 2)";
            
            $stmtBatch = $conn->prepare($sqlBatch);
            $stmtBatch->execute([
                ':inicio' => $fecha_inicio,
                ':fin' => $fecha_limite
            ]);
            $saldosRaw = $stmtBatch->fetchAll(PDO::FETCH_ASSOC);
            $saldosMap = [];
            foreach($saldosRaw as $r) {
                $saldosMap[$r['codigo_grupo']] = [
                    'debe' => floatval($r['debe']),
                    'haber' => floatval($r['haber'])
                ];
            }
            
            $ingresos = [];
            $gastos = [];
            
            $stmt = $conn->query("SELECT codigo, nombre FROM pcge WHERE LENGTH(codigo) = 2 AND (codigo LIKE '6%' OR codigo LIKE '7%') ORDER BY codigo");
            $cuentas = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $total_ingresos = 0;
            $total_gastos = 0;
            
            foreach ($cuentas as $cta) {
                $saldoData = $saldosMap[$cta['codigo']] ?? ['debe' => 0, 'haber' => 0];
                
                if (substr($cta['codigo'], 0, 1) == '7') {
                    $val = $saldoData['haber'] - $saldoData['debe'];
                    if ($val != 0) {
                        $ingresos[] = ['codigo' => $cta['codigo'], 'nombre' => $cta['nombre'], 'monto' => $val];
                        $total_ingresos += $val;
                    }
                } else {
                    $val = $saldoData['debe'] - $saldoData['haber'];
                    if ($val != 0) {
                        $gastos[] = ['codigo' => $cta['codigo'], 'nombre' => $cta['nombre'], 'monto' => $val];
                        $total_gastos += $val;
                    }
                }
            }
            
            echo json_encode([
                'ingresos' => $ingresos,
                'gastos' => $gastos,
                'totales' => [
                    'ingresos' => $total_ingresos,
                    'gastos' => $total_gastos,
                    'utilidad_neta' => $total_ingresos - $total_gastos
                ]
            ]);
            break;

        case 'flujo_caja':
            // Movimientos de Caja y Bancos
            // Entradas vs Salidas agrupadas por mes
            
            $flujo = [];
            // Optimize: Group by month in SQL
            // Caja
            $sqlCaja = "SELECT MONTH(fecha) as mes, tipo, SUM(monto) as total FROM caja_movimientos WHERE YEAR(fecha) = :anio GROUP BY MONTH(fecha), tipo";
            $stmt = $conn->prepare($sqlCaja);
            $stmt->execute([':anio' => $anio]);
            $rawCaja = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Bancos
            $sqlBancos = "SELECT MONTH(fecha) as mes, tipo, SUM(monto) as total FROM bancos_movimientos WHERE YEAR(fecha) = :anio GROUP BY MONTH(fecha), tipo";
            $stmt = $conn->prepare($sqlBancos);
            $stmt->execute([':anio' => $anio]);
            $rawBancos = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Process into array
            $dataMap = [];
            for($m=1; $m<=12; $m++) $dataMap[$m] = ['ingresos'=>0, 'egresos'=>0];
            
            foreach($rawCaja as $r) {
                $m = intval($r['mes']);
                if ($r['tipo'] == 'Ingreso') $dataMap[$m]['ingresos'] += $r['total'];
                else $dataMap[$m]['egresos'] += $r['total'];
            }
            foreach($rawBancos as $r) {
                $m = intval($r['mes']);
                if ($r['tipo'] == 'Ingreso') $dataMap[$m]['ingresos'] += $r['total'];
                else $dataMap[$m]['egresos'] += $r['total'];
            }
            
            for ($m = 1; $m <= 12; $m++) {
                $flujo[] = [
                    'mes' => str_pad($m, 2, '0', STR_PAD_LEFT),
                    'ingresos' => $dataMap[$m]['ingresos'],
                    'egresos' => $dataMap[$m]['egresos'],
                    'neto' => $dataMap[$m]['ingresos'] - $dataMap[$m]['egresos']
                ];
            }
            echo json_encode($flujo);
            break;
            
        case 'analisis_ingresos_gastos':
            // Comparativo Ingresos vs Gastos por mes (basado en contabilidad)
            // Optimize: Group by month in SQL
            // Ingresos (Clase 7)
            $sqlInc = "SELECT MONTH(a.fecha) as mes, SUM(ad.haber) - SUM(ad.debe) as total 
                    FROM asientos_detalle ad
                    JOIN asientos a ON ad.asiento_id = a.id
                    WHERE ad.cuenta_codigo LIKE '7%' AND YEAR(a.fecha) = :anio AND a.estado='Finalizado'
                    GROUP BY MONTH(a.fecha)";
            $stmt = $conn->prepare($sqlInc);
            $stmt->execute([':anio' => $anio]);
            $rawInc = $stmt->fetchAll(PDO::FETCH_KEY_PAIR); // mes => total
            
            // Gastos (Clase 6)
            $sqlExp = "SELECT MONTH(a.fecha) as mes, SUM(ad.debe) - SUM(ad.haber) as total 
                    FROM asientos_detalle ad
                    JOIN asientos a ON ad.asiento_id = a.id
                    WHERE ad.cuenta_codigo LIKE '6%' AND YEAR(a.fecha) = :anio AND a.estado='Finalizado'
                    GROUP BY MONTH(a.fecha)";
            $stmt = $conn->prepare($sqlExp);
            $stmt->execute([':anio' => $anio]);
            $rawExp = $stmt->fetchAll(PDO::FETCH_KEY_PAIR); // mes => total
            
            $data = [];
            for ($m = 1; $m <= 12; $m++) {
                $ing = floatval($rawInc[$m] ?? 0);
                $exp = floatval($rawExp[$m] ?? 0);
                $data[] = [
                    'mes' => str_pad($m, 2, '0', STR_PAD_LEFT),
                    'ingresos' => $ing,
                    'gastos' => $exp,
                    'utilidad' => $ing - $exp
                ];
            }
            echo json_encode($data);
            break;

        default:
            http_response_code(400);
            echo json_encode(["message" => "Acción no válida"]);
            break;
    }

    $conn = null;

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error interno: " . $e->getMessage()]);
}
?>
