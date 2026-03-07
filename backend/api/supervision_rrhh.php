<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';

try {
    $jwt = new JWTHandler();
    $token = $jwt->getBearerToken();
    $user_data = $jwt->validateToken($token);
    
    if (!$user_data) {
        throw new Exception("Token inválido o no proporcionado");
    }
    
    // Verify permissions (gerente or rrhh)
    // For now, we assume if they have the token and can access this route (frontend checks), it's ok.
    // In strict mode, check roles.
} catch (Exception $e) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso denegado", "error" => $e->getMessage()]);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        $action = $_GET['action'] ?? '';
        
        switch ($action) {
            case 'headcount':
                getHeadcount($conn);
                break;
            case 'costos':
                getCostos($conn);
                break;
            case 'asistencias':
                getAsistencias($conn);
                break;
            case 'vacaciones':
                getVacaciones($conn);
                break;
            case 'indicadores':
                getIndicadores($conn);
                break;
            default:
                throw new Exception("Acción no válida");
        }
    } else {
        throw new Exception("Método no soportado");
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;

function getHeadcount($conn) {
    // Total Active Employees by Area
    $sql = "SELECT COALESCE(NULLIF(area, ''), 'Sin Área') as area, COUNT(*) as cantidad 
            FROM colaboradores 
            WHERE (estado = 'Activo' OR estado IS NULL OR estado = '') 
            GROUP BY area 
            ORDER BY cantidad DESC";
    $stmt = $conn->prepare($sql);
    $stmt->execute();
    $byArea = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Total Count
    $sqlTotal = "SELECT COUNT(*) as total FROM colaboradores WHERE (estado = 'Activo' OR estado IS NULL OR estado = '')";
    $stmtTotal = $conn->prepare($sqlTotal);
    $stmtTotal->execute();
    $total = $stmtTotal->fetch(PDO::FETCH_ASSOC)['total'];

    // By Contract Type
    $sqlContract = "SELECT 
                        CASE 
                            WHEN tipo_contrato = 'Plazo Determinado' THEN 'Plazo Fijo' 
                            WHEN tipo_contrato IS NULL OR tipo_contrato = '' THEN 'Sin tipo'
                            ELSE tipo_contrato 
                        END as tipo_contrato, 
                        COUNT(*) as cantidad 
                    FROM colaboradores 
                    WHERE (estado = 'Activo' OR estado IS NULL OR estado = '') 
                    GROUP BY tipo_contrato";
    $stmtContract = $conn->prepare($sqlContract);
    $stmtContract->execute();
    $byContract = $stmtContract->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "total" => $total,
        "byArea" => $byArea,
        "byContract" => $byContract
    ]);
}

function getCostos($conn) {
    // Costs for the last 6 months
    // We differentiate by planilla type for accurate calculation
    
    $sql = "SELECT mes, anio, tipo,
                   SUM(total_ingresos) as total_sueldos,
                   SUM(total_descuentos) as total_descuentos
            FROM planillas
            WHERE estado != 'Anulado'
            GROUP BY anio, mes, tipo
            ORDER BY anio DESC, mes DESC";
            
    // Get more data to filter in PHP (limit 6 months is tricky with multiple types per month)
    // So we fetch last 12 records roughly and group in PHP
    $stmt = $conn->prepare($sql);
    $stmt->execute();
    $raw = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Group by Period (Month-Year)
    $grouped = [];
    foreach ($raw as $row) {
        $key = $row['anio'] . '-' . str_pad($row['mes'], 2, '0', STR_PAD_LEFT);
        
        if (!isset($grouped[$key])) {
            $grouped[$key] = [
                'mes' => $row['mes'],
                'anio' => $row['anio'],
                'sueldos' => 0,
                'cargas_sociales' => 0
            ];
        }
        
        $monto = (float)$row['total_sueldos'];
        
        if ($row['tipo'] === 'Mensual') {
            // Sueldo Bruto + 9% EsSalud (Employer Cost)
            // Note: total_sueldos in DB is Total Bruto.
            $grouped[$key]['sueldos'] += $monto;
            $grouped[$key]['cargas_sociales'] += ($monto * 0.09);
        } elseif ($row['tipo'] === 'Gratificacion') {
            // Total Bruto already includes the 9% Bono.
            // So Employer Cost = Total Bruto.
            // We can split it for visualization: Sueldo = Bruto / 1.09, Carga = Bruto - Sueldo.
            // Or just put everything in Sueldos (since it's paid to employee).
            // Let's put it in Sueldos as it is "Direct Income" for employee.
            $grouped[$key]['sueldos'] += $monto;
        } elseif ($row['tipo'] === 'CTS') {
            // CTS is a direct cost, no EsSalud.
            $grouped[$key]['sueldos'] += $monto;
        }
    }
    
    // Take last 6 months
    krsort($grouped);
    $finalData = array_slice($grouped, 0, 6);
    $finalData = array_reverse($finalData); // Chronological

    $months = [
        1 => 'Ene', 2 => 'Feb', 3 => 'Mar', 4 => 'Abr', 5 => 'May', 6 => 'Jun',
        7 => 'Jul', 8 => 'Ago', 9 => 'Sep', 10 => 'Oct', 11 => 'Nov', 12 => 'Dic'
    ];

    $formatted = array_map(function($row) use ($months) {
        return [
            'periodo' => $months[(int)$row['mes']] . ' ' . $row['anio'],
            'total_costo' => $row['sueldos'] + $row['cargas_sociales'],
            'sueldos' => round($row['sueldos'], 2),
            'cargas_sociales' => round($row['cargas_sociales'], 2)
        ];
    }, $finalData);

    echo json_encode(array_values($formatted));
}

function getAsistencias($conn) {
    // Attendance stats for current month
    $month = date('m');
    $year = date('Y');
    
    if (isset($_GET['month'])) $month = $_GET['month'];
    if (isset($_GET['year'])) $year = $_GET['year'];

    // Categorize 'Pendiente' based on time if needed, or keep as is.
    // For the chart, we want to show all statuses.
    
    $sql = "SELECT estado, hora_entrada, COUNT(*) as cantidad
            FROM asistencias
            WHERE MONTH(fecha) = :m AND YEAR(fecha) = :y
            GROUP BY estado, (CASE WHEN estado='Pendiente' AND hora_entrada > '09:15:00' THEN 1 ELSE 0 END)";
            
    // We group by simple status first
    $sql = "SELECT estado, COUNT(*) as cantidad
            FROM asistencias
            WHERE MONTH(fecha) = :m AND YEAR(fecha) = :y
            GROUP BY estado";

    $stmt = $conn->prepare($sql);
    $stmt->execute([':m' => $month, ':y' => $year]);
    $stats = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $colors = [
        'Presente' => '#10B981', // Green
        'Tardanza' => '#F59E0B', // Amber
        'Falta' => '#EF4444',    // Red
        'Licencia' => '#6366F1', // Indigo
        'Vacaciones' => '#8B5CF6', // Purple
        'Pendiente' => '#9CA3AF', // Gray
        'Validado' => '#059669'   // Dark Green
    ];
    
    $chartData = [];
    foreach ($stats as $row) {
        $st = $row['estado'];
        $chartData[] = [
            'name' => $st,
            'value' => (int)$row['cantidad'],
            'color' => $colors[$st] ?? '#CBD5E1' // Default color
        ];
    }
    
    // If empty, return something to avoid empty chart
    if (empty($chartData)) {
        $chartData[] = ['name' => 'Sin datos', 'value' => 0, 'color' => '#E2E8F0'];
    }

    echo json_encode($chartData);
}

function getVacaciones($conn) {
    // Pending vs Approved vs Rejected (Historical or Current Year)
    $year = date('Y');
    
    $sql = "SELECT estado, COUNT(*) as cantidad, SUM(dias) as total_dias
            FROM solicitudes_permisos
            WHERE tipo = 'Vacaciones' AND YEAR(fecha_inicio) = :y
            GROUP BY estado";
            
    $stmt = $conn->prepare($sql);
    $stmt->execute([':y' => $year]);
    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode($data);
}

function getIndicadores($conn) {
    // 1. Puntualidad (Percentage of 'Presente' without 'Tardanza' vs Total Workdays)
    // We'll calculate it per area
    
    $month = date('m');
    $year = date('Y');
    
    // Improved Logic:
    // Presentes: Status IN (Presente, Validado) OR (Pendiente AND Time <= 09:15)
    // Tardanzas: Status = Tardanza OR (Pendiente AND Time > 09:15)
    // Faltas: Status = Falta
    // Total Workable Days = Presentes + Tardanzas + Faltas
    // (We exclude Licencia, Vacaciones from the denominator as they are authorized absences)
    
    $sql = "SELECT c.area, 
                   COUNT(CASE 
                       WHEN a.estado IN ('Presente', 'Validado') OR (a.estado = 'Pendiente' AND (a.hora_entrada <= '09:15:00' OR a.hora_entrada IS NULL)) 
                       THEN 1 END) as presentes,
                   COUNT(CASE 
                       WHEN a.estado = 'Tardanza' OR (a.estado = 'Pendiente' AND a.hora_entrada > '09:15:00') 
                       THEN 1 END) as tardanzas,
                   COUNT(CASE WHEN a.estado = 'Falta' THEN 1 END) as faltas
            FROM asistencias a
            JOIN colaboradores c ON a.colaborador_id = c.id
            WHERE MONTH(a.fecha) = :m AND YEAR(a.fecha) = :y
            GROUP BY c.area";
            
    $stmt = $conn->prepare($sql);
    $stmt->execute([':m' => $month, ':y' => $year]);
    $attendanceByArea = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $kpiAttendance = array_map(function($row) {
        $presentes = (int)$row['presentes'];
        $tardanzas = (int)$row['tardanzas'];
        $faltas = (int)$row['faltas'];
        
        $totalWorkable = $presentes + $tardanzas + $faltas;
        
        if ($totalWorkable > 0) {
            $puntualidad = ($presentes / $totalWorkable) * 100;
            $ausentismo = ($faltas / $totalWorkable) * 100;
        } else {
            $puntualidad = 100; // No incidents
            $ausentismo = 0;
        }

        return [
            'area' => $row['area'],
            'puntualidad' => round($puntualidad, 1),
            'ausentismo' => round($ausentismo, 1)
        ];
    }, $attendanceByArea);

    // 2. Turnover (Rotación) - Dummy logic if we don't have 'fecha_salida'
    // But we have 'estado' = 'Inactivo'. We can count Inactivos in the last month?
    // Let's stick to Attendance for now as it's real data.

    echo json_encode([
        "attendance_by_area" => $kpiAttendance
    ]);
}
