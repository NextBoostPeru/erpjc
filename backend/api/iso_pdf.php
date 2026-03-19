<?php
require_once '../vendor/autoload.php';
require_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

use Dompdf\Dompdf;
use Dompdf\Options;

$type = $_GET['type'] ?? 'audit';

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$token = $token ?: ($_REQUEST['token'] ?? '');
$userData = $jwtHandler->validateToken($token);
if (!$userData) {
    http_response_code(401);
    header("Content-Type: application/json; charset=UTF-8");
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

try {
    $html = '';
    $filename = 'document.pdf';
    $options = new Options();
    $options->set('isHtml5ParserEnabled', true);
    $options->set('isRemoteEnabled', true);
    $dompdf = new Dompdf($options);

    // Fetch Company Data for Logo (Common)
    $stmtEmpresa = $conn->query("SELECT * FROM empresa_datos LIMIT 1");
    $empresa = $stmtEmpresa->fetch(PDO::FETCH_ASSOC);
    $logoBase64 = '';
    if ($empresa && !empty($empresa['logo'])) {
        $logoPath = __DIR__ . '/' . $empresa['logo'];
        if (file_exists($logoPath)) {
            $ext = pathinfo($logoPath, PATHINFO_EXTENSION);
            $data = file_get_contents($logoPath);
            $logoBase64 = 'data:image/' . $ext . ';base64,' . base64_encode($data);
        }
    }
    
    // CSS Styles (Common)
    $styles = '
        <style>
            body { font-family: Arial, sans-serif; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
            th, td { border: 1px solid #000; padding: 4px; text-align: left; vertical-align: top; }
            th { background-color: #f0f0f0; font-weight: bold; text-align: center; }
            .header-table td { border: 1px solid #000; padding: 5px; }
            .no-border td { border: none; }
            .title { text-align: center; font-weight: bold; font-size: 14px; margin: 0; }
            .section-title { background-color: #e0e0e0; font-weight: bold; font-size: 11px; }
            .center { text-align: center; }
            .logo-cell { width: 120px; text-align: center; vertical-align: middle; }
            .logo-img { max-width: 100px; max-height: 60px; }
            .status-ejecutado { color: green; font-weight: bold; }
            .status-retrasado { color: red; font-weight: bold; }
            .status-en-proceso { color: blue; }
        </style>
    ';

    if ($type === 'daily') {
        $empresa_id = $_REQUEST['empresa_id'] ?? 0;
        $norma_id = $_REQUEST['norma_id'] ?? 0;
        $date = $_REQUEST['date'] ?? date('Y-m-d');
        
        if (!$empresa_id || !$norma_id) die("Empresa and Norma IDs required");

        // Fetch Info
        $stmtEmp = $conn->prepare("SELECT * FROM iso_empresas WHERE id = ?");
        $stmtEmp->execute([$empresa_id]);
        $empInfo = $stmtEmp->fetch(PDO::FETCH_ASSOC);
        
        $stmtNorma = $conn->prepare("SELECT * FROM iso_normas WHERE id = ?");
        $stmtNorma->execute([$norma_id]);
        $normaInfo = $stmtNorma->fetch(PDO::FETCH_ASSOC);

        // Fetch Items (Main Requirements) that have activity on this date
        // Activity: Scheduled, Deadline, or Executed
        $stmtItems = $conn->prepare("
            SELECT i.numeral, i.requisito, i.descripcion_requisito, 
                   t.id as tracking_id, t.estado, t.fecha_programada, t.fecha_limite, t.fecha_ejecucion, t.observaciones_internas
            FROM iso_checklist_items i
            JOIN iso_tracking t ON i.id = t.item_id AND t.empresa_id = ?
            WHERE i.norma_id = ?
            AND (
                t.fecha_programada = ? 
                OR t.fecha_limite = ? 
                OR t.fecha_ejecucion = ?
            )
            ORDER BY i.orden
        ");
        $stmtItems->execute([$empresa_id, $norma_id, $date, $date, $date]);
        $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

        $filename = "Reporte_Diario_ISO_" . ($normaInfo['codigo'] ?? 'ISO') . "_" . str_replace('-', '', $date) . ".pdf";

        $html = '<html><head>' . $styles . '
            <style>
                @page { margin: 15mm; }
                .report-header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; }
                .report-title { font-size: 18px; font-weight: bold; color: #333; text-transform: uppercase; }
                .report-subtitle { font-size: 12px; color: #666; margin-top: 5px; }
                .report-meta { margin-top: 15px; font-size: 11px; display: flex; justify-content: space-between; }
                .meta-item { margin-bottom: 4px; }
                
                .daily-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 20px; }
                .daily-table th, .daily-table td { border: 1px solid #ddd; padding: 6px; vertical-align: middle; }
                .daily-table th { background-color: #f5f5f5; font-weight: bold; color: #333; text-align: center; }
                
                .status-badge { padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 9px; display: inline-block; }
                .badge-Ejecutado { background-color: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
                .badge-Retrasado { background-color: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
                .badge-En_Proceso { background-color: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
                .badge-Pendiente { background-color: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
                
                .empty-state { text-align: center; color: #666; margin-top: 50px; padding: 20px; background-color: #f9f9f9; border-radius: 8px; }
            </style>
        </head><body>';
        
        // --- HEADER ---
        $html .= '<div class="report-header">';
        if ($logoBase64) {
            $html .= '<div style="margin-bottom:10px;"><img src="' . $logoBase64 . '" style="max-height: 50px;"></div>';
        }
        $html .= '<div class="report-title">Reporte Diario de Actividades</div>';
        $html .= '<div class="report-subtitle">' . htmlspecialchars($empInfo['nombre']) . '</div>';
        $html .= '</div>';
        
        $html .= '<table style="width:100%; margin-bottom:20px; border:none;"><tr>';
        $html .= '<td style="border:none; width:50%; vertical-align:top;">';
        $html .= '<div class="meta-item"><strong>Norma:</strong> ' . htmlspecialchars($normaInfo['codigo'] . ' - ' . $normaInfo['nombre']) . '</div>';
        $html .= '<div class="meta-item"><strong>Fecha de Reporte:</strong> ' . date('d/m/Y', strtotime($date)) . '</div>';
        $html .= '</td>';
        $html .= '<td style="border:none; width:50%; vertical-align:top; text-align:right;">';
        $html .= '<div class="meta-item"><strong>Generado el:</strong> ' . date('d/m/Y H:i') . '</div>';
        $html .= '</td>';
        $html .= '</tr></table>';

        // --- CONTENT ---
        if (count($items) > 0) {
            $html .= '<table class="daily-table">';
            $html .= '<thead><tr>
                <th width="8%">Numeral</th>
                <th width="25%">Requisito / Descripción</th>
                <th width="10%">Estado</th>
                <th width="10%">Programado</th>
                <th width="10%">Límite</th>
                <th width="10%">Ejecutado</th>
                <th width="27%">Observaciones / Evidencia</th>
            </tr></thead><tbody>';
            
            $docsTotal = 0;
            $subsSet = [];
            foreach ($items as $item) {
                $status = $item['estado'] ?: 'Pendiente';
                $badgeClass = 'badge-' . str_replace(' ', '_', $status);
                
                $html .= '<tr>';
                $html .= '<td align="center">' . htmlspecialchars($item['numeral']) . '</td>';
                $html .= '<td><strong>' . htmlspecialchars($item['requisito']) . '</strong><br><span style="color:#555; font-size:9px;">' . nl2br(htmlspecialchars($item['descripcion_requisito'])) . '</span></td>';
                $html .= '<td align="center"><span class="status-badge ' . $badgeClass . '">' . $status . '</span></td>';
                $html .= '<td align="center">' . ($item['fecha_programada'] ? date('d/m/Y', strtotime($item['fecha_programada'])) : '-') . '</td>';
                $html .= '<td align="center">' . ($item['fecha_limite'] ? date('d/m/Y', strtotime($item['fecha_limite'])) : '-') . '</td>';
                $html .= '<td align="center">' . ($item['fecha_ejecucion'] ? date('d/m/Y', strtotime($item['fecha_ejecucion'])) : '-') . '</td>';
                $docsStmt = $conn->prepare("SELECT nombre_archivo, ruta_archivo, subitem_id FROM iso_documentos WHERE tracking_id = ? AND DATE(created_at) = ?");
                $docsStmt->execute([$item['tracking_id'], $date]);
                $docs = $docsStmt->fetchAll(PDO::FETCH_ASSOC);
                $docsTotal += count($docs);
                $subIds = array_values(array_unique(array_filter(array_map(function($d){ return $d['subitem_id']; }, $docs))));
                $subsInfo = [];
                if (count($subIds) > 0) {
                    $in = implode(',', array_fill(0, count($subIds), '?'));
                    $q = $conn->prepare("SELECT id, literal, descripcion FROM iso_checklist_subitems WHERE id IN ($in)");
                    $q->execute($subIds);
                    $subsInfo = $q->fetchAll(PDO::FETCH_ASSOC);
                    foreach ($subsInfo as $s) { $subsSet[$s['id']] = true; }
                }
                $evid = nl2br(htmlspecialchars($item['observaciones_internas'] ?? ''));
                if (count($docs) > 0) {
                    $names = implode(', ', array_map(function($d){ return htmlspecialchars($d['nombre_archivo']); }, $docs));
                    $evid .= ($evid ? '<br>' : '') . '<span style="font-size:9px;color:#333;"><strong>Documentos del día:</strong> ' . $names . '</span>';
                    if (count($subsInfo) > 0) {
                        $subsTxt = implode(', ', array_map(function($s){
                            $lit = $s['literal'] ? $s['literal'] . ' - ' : '';
                            return htmlspecialchars($lit . $s['descripcion']);
                        }, $subsInfo));
                        $evid .= '<br><span style="font-size:9px;color:#333;"><strong>Subpuntos con evidencia hoy:</strong> ' . $subsTxt . '</span>';
                    }
                }
                $html .= '<td>' . $evid . '</td>';
                $html .= '</tr>';
            }
            
            $html .= '</tbody></table>';
            
            // Summary
            $total = count($items);
            $ejecutados = count(array_filter($items, fn($i) => $i['estado'] === 'Ejecutado'));
            $pendientes = count(array_filter($items, fn($i) => $i['estado'] !== 'Ejecutado'));
            
            $html .= '<div style="margin-top:20px; font-size:11px;">';
            $html .= '<strong>Resumen del Día:</strong> ' . $total . ' Actividades registradas (' . $ejecutados . ' Ejecutadas, ' . $pendientes . ' Pendientes/En Proceso)';
            $html .= '<br><strong>Evidencias del Día:</strong> ' . $docsTotal . ' documentos, ' . count($subsSet) . ' subpuntos con evidencia';
            $html .= '</div>';
            
        } else {
            $html .= '<div class="empty-state">';
            $html .= '<h3>Sin Actividades</h3>';
            $html .= '<p>No se encontraron actividades programadas, con fecha límite o ejecutadas para el día ' . date('d/m/Y', strtotime($date)) . '.</p>';
            $html .= '</div>';
        }

        $html .= '</body></html>';
        
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'landscape'); // Landscape to fit columns
        $dompdf->render();
        $dompdf->stream($filename, ["Attachment" => false]);
        exit;
    }

    if ($type === 'report_builder') {
        $date_from = $_REQUEST['date_from'] ?? null;
        $date_to = $_REQUEST['date_to'] ?? null;
        $empresa_ids = !empty($_REQUEST['empresa_ids']) ? array_filter(array_map('intval', explode(',', $_REQUEST['empresa_ids']))) : [];
        $norma_ids = !empty($_REQUEST['norma_ids']) ? array_filter(array_map('intval', explode(',', $_REQUEST['norma_ids']))) : [];
        $usuario_ids = !empty($_REQUEST['usuario_ids']) ? array_filter(array_map('intval', explode(',', $_REQUEST['usuario_ids']))) : [];
        
        $sql = "
            SELECT 
                t.id as tracking_id,
                t.empresa_id,
                t.norma_id,
                i.id as item_id,
                e.nombre as empresa,
                e.ruc as empresa_ruc,
                n.codigo as norma_codigo,
                n.nombre as norma_nombre,
                i.categoria, i.numeral, i.requisito, i.descripcion_requisito,
                t.estado, t.fecha_programada, t.fecha_limite, t.fecha_ejecucion
            FROM iso_tracking t
            JOIN iso_empresas e ON t.empresa_id = e.id
            JOIN iso_normas n ON t.norma_id = n.id
            JOIN iso_checklist_items i ON t.item_id = i.id
            WHERE 1=1
        ";
        $params = [];
        if (!empty($empresa_ids)) {
            $in = implode(',', array_fill(0, count($empresa_ids), '?'));
            $sql .= " AND t.empresa_id IN ($in)";
            $params = array_merge($params, $empresa_ids);
        }
        if (!empty($norma_ids)) {
            $in = implode(',', array_fill(0, count($norma_ids), '?'));
            $sql .= " AND t.norma_id IN ($in)";
            $params = array_merge($params, $norma_ids);
        }
        if ($date_from && $date_to) {
            $sql .= " AND ( 
                (t.fecha_programada BETWEEN ? AND ?) OR 
                (t.fecha_ejecucion BETWEEN ? AND ?) OR 
                (t.fecha_limite BETWEEN ? AND ?) OR
                EXISTS(SELECT 1 FROM iso_documentos d WHERE d.tracking_id=t.id AND DATE(d.created_at) BETWEEN ? AND ?) OR
                EXISTS(SELECT 1 FROM iso_historial h WHERE h.tracking_id=t.id AND DATE(h.created_at) BETWEEN ? AND ?)
            )";
            $params = array_merge($params, [$date_from, $date_to, $date_from, $date_to, $date_from, $date_to, $date_from, $date_to, $date_from, $date_to]);
        }
        if (!empty($usuario_ids)) {
            $in = implode(',', array_fill(0, count($usuario_ids), '?'));
            $sql .= " AND ( 
                EXISTS(SELECT 1 FROM iso_documentos d WHERE d.tracking_id=t.id AND d.usuario_id IN ($in)) OR
                EXISTS(SELECT 1 FROM iso_historial h WHERE h.tracking_id=t.id AND h.usuario_id IN ($in))
            )";
            $params = array_merge($params, $usuario_ids, $usuario_ids);
        }
        $sql .= " ORDER BY e.nombre, n.codigo, i.orden";
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $filename = "Reporte_ISO_Personalizado_" . date('Ymd_His') . ".pdf";
        
        $html = '<html><head>' . $styles . '
            <style>
                @page { margin: 12mm; }
                .rb-header { text-align: center; margin-bottom: 16px; }
                .rb-title { font-size: 16px; font-weight: bold; color: #333; }
                .rb-sub { font-size: 11px; color: #666; }
                .meta { margin-top: 10px; font-size: 10px; }
                .group-title { background-color: #f5f5f5; padding: 6px; font-weight: bold; margin-top: 10px; border: 1px solid #ddd; }
                .rb-table { width: 100%; border-collapse: collapse; font-size: 9px; }
                .rb-table th, .rb-table td { border: 1px solid #ddd; padding: 5px; vertical-align: middle; }
                .rb-table th { background-color: #eee; }
                .badge { padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 9px; display: inline-block; }
                .badge-Ejecutado { background-color: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
                .badge-Retrasado { background-color: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
                .badge-En_Proceso { background-color: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
                .badge-Pendiente { background-color: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
            </style>
        </head><body>';
        
        $html .= '<div class="rb-header">';
        if ($logoBase64) {
            $html .= '<div style="margin-bottom:8px;"><img src="' . $logoBase64 . '" style="max-height: 50px;"></div>';
        }
        $html .= '<div class="rb-title">Reporte ISO Personalizado</div>';
        $html .= '<div class="rb-sub">Generado el ' . date('d/m/Y H:i') . '</div>';
        $html .= '</div>';
        
        $html .= '<table style="width:100%; border:none; margin-bottom:10px;"><tr>';
        $html .= '<td style="border:none; width:50%; vertical-align:top;">';
        if ($date_from && $date_to) {
            $html .= '<div class="meta"><strong>Rango de Fechas:</strong> ' . date('d/m/Y', strtotime($date_from)) . ' - ' . date('d/m/Y', strtotime($date_to)) . '</div>';
        }
        $html .= '</td>';
        $html .= '<td style="border:none; width:50%; vertical-align:top; text-align:right;">';
        $html .= '<div class="meta"><strong>Total Registros:</strong> ' . count($rows) . '</div>';
        $html .= '</td>';
        $html .= '</tr></table>';
        
        if (count($rows) === 0) {
            $html .= '<div class="empty-state"><h3>Sin resultados</h3><p>No se encontraron registros con los filtros seleccionados.</p></div>';
        } else {
            $groups = [];
            foreach ($rows as $r) {
                $key = ($r['empresa'] ?? 'Empresa') . '|' . ($r['norma_codigo'] ?? '') . ' ' . ($r['norma_nombre'] ?? '');
                if (!isset($groups[$key])) $groups[$key] = [];
                $groups[$key][] = $r;
            }
            foreach ($groups as $gkey => $items) {
                $parts = explode('|', $gkey);
                $empresaTxt = $parts[0];
                $normaTxt = $parts[1] ?? '';
                $html .= '<div class="group-title">' . htmlspecialchars($empresaTxt) . ' — ' . htmlspecialchars($normaTxt) . '</div>';
                $html .= '<table class="rb-table"><thead><tr>
                    <th width="8%">Numeral</th>
                    <th width="25%">Requisito / Descripción</th>
                    <th width="9%">Estado</th>
                    <th width="9%">Programado</th>
                    <th width="9%">Límite</th>
                    <th width="9%">Ejecutado</th>
                    <th width="9%">Actualización</th>
                    <th width="12%">Docs</th>
                    <th width="11%">Acciones</th>
                </tr></thead><tbody>';
                $countEstados = ['Ejecutado'=>0,'En proceso'=>0,'Retrasado'=>0,'Pendiente'=>0,'No aplica'=>0];
                foreach ($items as $it) {
                    $status = $it['estado'] ?: 'Pendiente';
                    $badgeClass = 'badge-' . str_replace(' ', '_', $status);
                    if (isset($countEstados[$status])) { $countEstados[$status]++; } else { $countEstados['Pendiente']++; }
                    if ($date_from && $date_to) {
                        $docsStmt = $conn->prepare("SELECT d.nombre_archivo, u.usuario FROM iso_documentos d LEFT JOIN usuarios u ON d.usuario_id = u.id WHERE d.tracking_id = ? AND DATE(d.created_at) BETWEEN ? AND ? ORDER BY d.created_at DESC");
                        $docsStmt->execute([$it['tracking_id'], $date_from, $date_to]);
                    } else {
                        $docsStmt = $conn->prepare("SELECT d.nombre_archivo, u.usuario FROM iso_documentos d LEFT JOIN usuarios u ON d.usuario_id = u.id WHERE d.tracking_id = ? ORDER BY d.created_at DESC");
                        $docsStmt->execute([$it['tracking_id']]);
                    }
                    $docs = $docsStmt->fetchAll(PDO::FETCH_ASSOC);
                    $docTxt = '-';
                    $lastDocDate = null;
                    if (count($docs) > 0) {
                        $names = array_map(function($d){ return htmlspecialchars($d['nombre_archivo']); }, $docs);
                        $uploaders = array_values(array_unique(array_map(function($d){ return $d['usuario'] ?: 'N/A'; }, $docs)));
                        $docTxt = '<strong>'.count($docs).'</strong> ' . implode(', ', array_slice($names, 0, 4));
                        if (count($names) > 4) $docTxt .= '…';
                        $docTxt .= '<br><span style="font-size:8px;color:#555;">por: ' . htmlspecialchars(implode(', ', array_slice($uploaders, 0, 3))) . (count($uploaders) > 3 ? '…' : '') . '</span>';
                        $lastDocDate = $_date = $date_from && $date_to ? null : null; // placeholder
                        $lastDocDate = isset($docs[0]['created_at']) ? $docs[0]['created_at'] : null;
                    }
                    if ($date_from && $date_to) {
                        $hStmt = $conn->prepare("SELECT h.accion, h.detalle, h.created_at, u.usuario FROM iso_historial h LEFT JOIN usuarios u ON h.usuario_id = u.id WHERE h.tracking_id = ? AND DATE(h.created_at) BETWEEN ? AND ? ORDER BY h.created_at DESC");
                        $hStmt->execute([$it['tracking_id'], $date_from, $date_to]);
                    } else {
                        $hStmt = $conn->prepare("SELECT h.accion, h.detalle, h.created_at, u.usuario FROM iso_historial h LEFT JOIN usuarios u ON h.usuario_id = u.id WHERE h.tracking_id = ? ORDER BY h.created_at DESC");
                        $hStmt->execute([$it['tracking_id']]);
                    }
                    $hist = $hStmt->fetchAll(PDO::FETCH_ASSOC);
                    $actTxt = '-';
                    $lastHistDate = null;
                    if (count($hist) > 0) {
                        $last = $hist[0];
                        $actTxt = '<span style="font-size:8px;">' . htmlspecialchars($last['accion']) . ' por ' . htmlspecialchars($last['usuario']) . ' el ' . date('d/m/Y', strtotime($last['created_at'])) . '</span>';
                        $lastHistDate = $last['created_at'];
                    }
                    $lastUpdate = $it['fecha_ejecucion'] ?: ($lastHistDate ?: $lastDocDate);
                    $lastUpdateTxt = $lastUpdate ? date('d/m/Y', strtotime($lastUpdate)) : '-';
                    $diasLimite = '-';
                    if (!empty($it['fecha_limite'])) {
                        $diff = (new DateTime())->diff(new DateTime($it['fecha_limite']));
                        $diasLimite = ($diff->invert ? '-' : '') . $diff->days . ' días';
                    }
                    $anioCalc = $date_to ? date('Y', strtotime($date_to)) : date('Y');
                    $stmtSub = $conn->prepare("
                        SELECT s.id, s.literal, s.descripcion, e.estado as estado_anual
                        FROM iso_checklist_subitems s
                        LEFT JOIN iso_subitem_evaluaciones e ON s.id = e.subitem_id AND e.empresa_id = ? AND e.anio = ?
                        WHERE s.item_id = ?
                    ");
                    $stmtSub->execute([$it['empresa_id'], $anioCalc, $it['item_id']]);
                    $subs = $stmtSub->fetchAll(PDO::FETCH_ASSOC);
                    $subCount = ['Ejecutado'=>0,'En Proceso'=>0,'Retrasado'=>0,'Pendiente'=>0];
                    foreach ($subs as $s) {
                        $st = $s['estado_anual'] ?? 'Pendiente';
                        if (isset($subCount[$st])) $subCount[$st]++; else $subCount['Pendiente']++;
                    }
                    $subsTxt = '';
                    if (count($subs) > 0) {
                        $subsTxt = 'Subpuntos E: '.$subCount['Ejecutado'].' / P: '.$subCount['Pendiente'].' / EP: '.$subCount['En Proceso'].' / R: '.$subCount['Retrasado'];
                    }
                    $html .= '<tr>';
                    $html .= '<td align="center">' . htmlspecialchars($it['numeral']) . '</td>';
                    $html .= '<td><strong>' . htmlspecialchars($it['requisito']) . '</strong><br><span style="color:#555; font-size:9px;">' . nl2br(htmlspecialchars($it['descripcion_requisito'])) . '</span></td>';
                    $html .= '<td align="center"><span class="badge ' . $badgeClass . '">' . $status . '</span></td>';
                    $html .= '<td align="center">' . ($it['fecha_programada'] ? date('d/m/Y', strtotime($it['fecha_programada'])) : '-') . '</td>';
                    $html .= '<td align="center">' . ($it['fecha_limite'] ? date('d/m/Y', strtotime($it['fecha_limite'])) : '-') . '</td>';
                    $html .= '<td align="center">' . ($it['fecha_ejecucion'] ? date('d/m/Y', strtotime($it['fecha_ejecucion'])) : '-') . '</td>';
                    $html .= '<td align="center">' . $lastUpdateTxt . '<br><span style="font-size:8px;color:#555;">hasta límite: ' . $diasLimite . '</span></td>';
                    $html .= '<td>' . $docTxt . '</td>';
                    $html .= '<td>' . $actTxt . ($subsTxt ? '<br><span style="font-size:8px;color:#555;">' . htmlspecialchars($subsTxt) . '</span>' : '') . '</td>';
                    $html .= '</tr>';
                }
                $html .= '</tbody></table>';
                $html .= '<table style="width:40%; border-collapse: collapse; font-size:9px; margin-top:6px;"><thead><tr><th style="border:1px solid #ddd; padding:4px;">Estado</th><th style="border:1px solid #ddd; padding:4px;">Total</th></tr></thead><tbody>';
                foreach (['Ejecutado','En proceso','Retrasado','Pendiente','No aplica'] as $k) {
                    $html .= '<tr><td style="border:1px solid #ddd; padding:4px;">' . $k . '</td><td style="border:1px solid #ddd; padding:4px;">' . ($countEstados[$k] ?? 0) . '</td></tr>';
                }
                $html .= '</tbody></table>';
                
                $empresaId = $items[0]['empresa_id'] ?? null;
                $coordParams = [];
                $coordSql = "
                    SELECT c.fecha, c.tipo, c.detalle, c.estado, u.usuario
                    FROM iso_coordinaciones c
                    LEFT JOIN usuarios u ON u.id = c.usuario_id
                    WHERE 1=1
                ";
                $conn->exec("CREATE TABLE IF NOT EXISTS iso_coordinaciones (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    empresa_id INT NOT NULL,
                    usuario_id INT NOT NULL,
                    fecha DATETIME NOT NULL,
                    tipo VARCHAR(50) NOT NULL,
                    detalle TEXT,
                    estado VARCHAR(20) DEFAULT 'Completado',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_empresa (empresa_id),
                    INDEX idx_usuario (usuario_id),
                    INDEX idx_fecha (fecha),
                    FOREIGN KEY (empresa_id) REFERENCES iso_empresas(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

                if ($empresaId) {
                    $coordSql .= " AND c.empresa_id = ? ";
                    $coordParams[] = (int)$empresaId;
                } else {
                    $coordSql .= " AND 1=0 ";
                }
                if ($date_from && $date_to) {
                    $coordSql .= " AND DATE(c.fecha) BETWEEN ? AND ? ";
                    $coordParams[] = $date_from;
                    $coordParams[] = $date_to;
                }
                $coordSql .= " ORDER BY c.fecha DESC";
                $stmtCoord = $conn->prepare($coordSql);
                $stmtCoord->execute($coordParams);
                $coordinaciones = $stmtCoord->fetchAll(PDO::FETCH_ASSOC);
                
                if (count($coordinaciones) > 0) {
                    $html .= '<div style="margin-top:10px; font-weight:bold;">Coordinaciones (Gestión ISO)</div>';
                    $html .= '<table class="rb-table" style="margin-top:4px;"><thead><tr>
                        <th width="12%">Fecha</th>
                        <th width="14%">Usuario</th>
                        <th width="14%">Tipo</th>
                        <th>Detalle</th>
                        <th width="12%">Estado</th>
                    </tr></thead><tbody>';
                    foreach ($coordinaciones as $c) {
                        $html .= '<tr>';
                        $html .= '<td>' . date('d/m/Y H:i', strtotime($c['fecha'])) . '</td>';
                        $html .= '<td>' . htmlspecialchars($c['usuario'] ?? '-') . '</td>';
                        $html .= '<td>' . htmlspecialchars($c['tipo'] ?? '-') . '</td>';
                        $html .= '<td>' . nl2br(htmlspecialchars($c['detalle'] ?? '')) . '</td>';
                        $html .= '<td>' . htmlspecialchars($c['estado'] ?? '-') . '</td>';
                        $html .= '</tr>';
                    }
                    $html .= '</tbody></table>';
                } else {
                    $html .= '<div style="margin-top:8px; font-size:9px; color:#666;">No hay coordinaciones registradas en el periodo para esta empresa.</div>';
                }
            }
        }
        
        $html .= '</body></html>';
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'landscape');
        $dompdf->render();
        $dompdf->stream($filename, ["Attachment" => false]);
        exit;
    }

    if ($type === 'tracking') {
        $empresa_id = $_REQUEST['empresa_id'] ?? 0;
        $norma_id = $_REQUEST['norma_id'] ?? 0;
        $anio = $_REQUEST['anio'] ?? date('Y');
        
        // Form Data from POST
        $introduccion = $_POST['introduccion'] ?? '';
        $objetivos = $_POST['objetivos'] ?? '';
        $observaciones = $_POST['observaciones'] ?? '';
        $recomendaciones = $_POST['recomendaciones'] ?? '';
        $conclusiones = $_POST['conclusiones'] ?? '';
        $codigo_reporte = $_POST['codigo_reporte'] ?? '';
        $responsable = $_POST['responsable'] ?? '';
        
        if (!$empresa_id || !$norma_id) die("Empresa and Norma IDs required");

        // Fetch Info
        $stmtEmp = $conn->prepare("SELECT * FROM iso_empresas WHERE id = ?");
        $stmtEmp->execute([$empresa_id]);
        $empInfo = $stmtEmp->fetch(PDO::FETCH_ASSOC);
        
        $stmtNorma = $conn->prepare("SELECT * FROM iso_normas WHERE id = ?");
        $stmtNorma->execute([$norma_id]);
        $normaInfo = $stmtNorma->fetch(PDO::FETCH_ASSOC);

        // Fetch Items (Main Requirements)
        $stmtItems = $conn->prepare("
            SELECT i.id, i.numeral, i.requisito, i.categoria
            FROM iso_checklist_items i
            WHERE i.norma_id = ?
            ORDER BY i.orden
        ");
        $stmtItems->execute([$norma_id]);
        $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

        // Fetch Subitems and Evaluations for all items to calculate stats
        $total_subitems = 0;
        $ejecutados = 0;
        $en_proceso = 0;
        $retrasados = 0;
        $pendientes = 0;

        // Prepare statement for subitems
        $stmtSub = $conn->prepare("
            SELECT s.*, 
                   e.estado as estado_anual, e.hallazgos,
                   e.ene_p, e.ene_e, e.feb_p, e.feb_e, e.mar_p, e.mar_e,
                   e.abr_p, e.abr_e, e.may_p, e.may_e, e.jun_p, e.jun_e,
                   e.jul_p, e.jul_e, e.ago_p, e.ago_e, e.sep_p, e.sep_e,
                   e.oct_p, e.oct_e, e.nov_p, e.nov_e, e.dic_p, e.dic_e
            FROM iso_checklist_subitems s
            LEFT JOIN iso_subitem_evaluaciones e ON s.id = e.subitem_id AND e.empresa_id = ? AND e.anio = ?
            WHERE s.item_id = ?
            ORDER BY s.id
        ");

        // Pre-fetch subitems to attach to items and calc stats
        foreach ($items as &$item) {
            $stmtSub->execute([$empresa_id, $anio, $item['id']]);
            $item['subitems'] = $stmtSub->fetchAll(PDO::FETCH_ASSOC);
            
            foreach ($item['subitems'] as $sub) {
                $total_subitems++;
                $estado = $sub['estado_anual'] ?? 'Pendiente';
                if ($estado == 'Ejecutado') $ejecutados++;
                elseif ($estado == 'En Proceso') $en_proceso++;
                elseif ($estado == 'Retrasado') $retrasados++;
                else $pendientes++;
            }
        }
        unset($item); // Break reference

        // Calculate Stats
        $total = $total_subitems;
        $no_aplica = 0;
        $programados = $pendientes;
        
        // Calculate Percentage
        $avance = $total > 0 ? round(($ejecutados / $total) * 100, 2) : 0;

        // Spanish Date Helper
        $meses = array("Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre");
        $mes = $meses[date('n')-1];
        $fecha_reporte = "$mes $anio";
        $fecha_emision = date('d') . " de " . $mes . " de " . $anio;

        $filename = "Reporte_ISO_{$normaInfo['codigo']}_" . date('Ymd') . ".pdf";

        // Updated Styles for Landscape & Grid
        $html = '<html><head>' . $styles . '
            <style>
                @page { margin: 10mm; } /* Minimal margins for landscape */
                body { font-family: Arial, sans-serif; font-size: 10px; }
                .cover-page { text-align: center; margin-top: 50px; page-break-after: always; }
                .cover-title { font-size: 24px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; }
                .cover-subtitle { font-size: 18px; margin-bottom: 30px; font-weight: bold; }
                .cover-logo { margin-bottom: 20px; }
                .cover-company { font-size: 20px; font-weight: bold; margin-bottom: 40px; color: #333; }
                .cover-info { font-size: 14px; margin-bottom: 12px; }
                .cover-footer { margin-top: 80px; }
                .text-section { margin-bottom: 20px; }
                .text-section h3 { background-color: #f0f0f0; padding: 5px; border-bottom: 2px solid #ccc; font-size: 12px; text-transform: uppercase; }
                
                /* Grid Table Styles */
                .grid-table { width: 100%; border-collapse: collapse; font-size: 8px; table-layout: fixed; }
                .grid-table th, .grid-table td { border: 1px solid #666; padding: 2px; vertical-align: middle; }
                .grid-table th { background-color: #e0e0e0; text-align: center; font-weight: bold; }
                .col-literal { width: 40px; text-align: center; }
                .col-desc { width: auto; } /* Fluid */
                .col-hallazgos { width: 15%; }
                .col-month { width: 14px; text-align: center; padding: 0 !important; }
                .col-estado { width: 50px; text-align: center; }
                
                .check-true { color: green; font-weight: bold; font-size: 9px; }
                .check-false { color: #ccc; font-size: 8px; }
                
                .status-ejecutado { background-color: #d1fae5; color: #065f46; }
                .status-retrasado { background-color: #fee2e2; color: #991b1b; }
                .status-en-proceso { background-color: #dbeafe; color: #1e40af; }
                .status-pendiente { background-color: #f3f4f6; color: #374151; }
                
                .month-header { font-size: 7px; writing-mode: vertical-rl; text-orientation: mixed; }
            </style>
        </head><body>';
        
        // --- PORTADA ---
        $html .= '<div class="cover-page">';
        
        $html .= '<div class="cover-title">REPORTE MENSUAL</div>';
        
        if ($logoBase64) {
            $html .= '<div class="cover-logo"><img src="' . $logoBase64 . '" style="max-height: 80px;"></div>';
        }
        
        // Nombre de la empresa (JC / Consultora)
        if (!empty($empresa['nombre_empresa'])) { // Ajustar campo según tabla empresa_datos
             $html .= '<div class="cover-company">' . htmlspecialchars($empresa['nombre_empresa']) . '</div>';
        } elseif (!empty($empresa['razon_social'])) {
             $html .= '<div class="cover-company">' . htmlspecialchars($empresa['razon_social']) . '</div>';
        }
        
        $html .= '<div class="cover-subtitle">Norma: ' . htmlspecialchars($normaInfo['codigo'] . ' - ' . $normaInfo['nombre']) . '</div>';
        
        $html .= '<div style="margin: 40px 0;">';
            $html .= '<div class="cover-info"><strong>Empresa Evaluada:</strong> ' . htmlspecialchars($empInfo['nombre']) . '</div>';
            $html .= '<div class="cover-info"><strong>Mes y Año del Reporte:</strong> ' . $fecha_reporte . '</div>';
            
            if ($codigo_reporte) {
                $html .= '<div class="cover-info"><strong>Código de Reporte:</strong> ' . htmlspecialchars($codigo_reporte) . '</div>';
            }
            
            $html .= '<div class="cover-info"><strong>Fecha de Emisión:</strong> ' . $fecha_emision . '</div>';
        $html .= '</div>';
        
        $html .= '<div class="cover-footer">';
            if ($responsable) {
                 $html .= '<div class="cover-info"><strong>Responsable del Reporte:</strong><br><br>' . htmlspecialchars($responsable) . '</div>';
            } else {
                 $html .= '<div class="cover-info"><strong>Responsable del Reporte:</strong><br><br>__________________________</div>';
            }
        $html .= '</div>';

        $html .= '</div>'; // End Cover Page

        // --- CONTENIDO ---
        // Header in pages
        $html .= '<div class="header" style="border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-bottom: 20px; color: #666; font-size: 10px; text-align: right;">';
        $html .= 'Reporte Mensual - ' . htmlspecialchars($normaInfo['codigo']) . ' - ' . $fecha_reporte;
        $html .= '</div>';

        if ($introduccion) {
            $html .= '<div class="text-section"><h3>Introducción</h3><div>' . nl2br(htmlspecialchars($introduccion)) . '</div></div>';
        }
        if ($objetivos) {
            $html .= '<div class="text-section"><h3>Objetivos</h3><div>' . nl2br(htmlspecialchars($objetivos)) . '</div></div>';
        }

        // --- ESTADÍSTICAS ---
        $html .= '<div class="text-section"><h3>Porcentaje de Avance del Checklist</h3>';
        $html .= '<table class="stats-table" style="width: 60%; margin: 10px auto;">';
        $html .= '<tr><th colspan="2">Estado de Cumplimiento</th></tr>';
        $html .= '<tr><td>Total Items</td><td>' . $total . '</td></tr>';
        $html .= '<tr><td class="status-ejecutado">Ejecutados</td><td>' . $ejecutados . '</td></tr>';
        $html .= '<tr><td class="status-en-proceso">En Proceso</td><td>' . $en_proceso . '</td></tr>';
        $html .= '<tr><td class="status-retrasado">Retrasados</td><td>' . $retrasados . '</td></tr>';
        $html .= '<tr><td>No Aplica</td><td>' . $no_aplica . '</td></tr>';
        $html .= '<tr><td>Pendientes/Programados</td><td>' . $programados . '</td></tr>';
        $html .= '<tr style="background-color: #e0f7fa;"><td style="font-weight: bold;">Avance Global</td><td style="font-weight: bold; font-size: 14px;">' . $avance . '%</td></tr>';
        $html .= '</table>';

        // --- GRAPHICS (HTML/CSS) ---
        $pct_ejecutado = $total > 0 ? ($ejecutados / $total) * 100 : 0;
        $pct_proceso = $total > 0 ? ($en_proceso / $total) * 100 : 0;
        $pct_retrasado = $total > 0 ? ($retrasados / $total) * 100 : 0;
        $pct_programado = $total > 0 ? ($programados / $total) * 100 : 0;
        $pct_no_aplica = $total > 0 ? ($no_aplica / $total) * 100 : 0;

        $html .= '<div style="margin-top: 30px; margin-bottom: 20px;">';
        $html .= '<h4 style="text-align: center; margin-bottom: 10px;">Gráficos de Avance</h4>';
        $html .= '<div style="width: 80%; margin: 0 auto; border: 1px solid #ccc; height: 25px; background-color: #f9f9f9;">';
        
        // Dompdf floats need careful handling, inline-block is safer sometimes or floats with width
        if ($pct_ejecutado > 0) $html .= '<div style="float: left; height: 100%; width: '.$pct_ejecutado.'%; background-color: #10B981;"></div>';
        if ($pct_proceso > 0) $html .= '<div style="float: left; height: 100%; width: '.$pct_proceso.'%; background-color: #3B82F6;"></div>';
        if ($pct_retrasado > 0) $html .= '<div style="float: left; height: 100%; width: '.$pct_retrasado.'%; background-color: #EF4444;"></div>';
        if ($pct_programado > 0) $html .= '<div style="float: left; height: 100%; width: '.$pct_programado.'%; background-color: #F59E0B;"></div>';
        if ($pct_no_aplica > 0) $html .= '<div style="float: left; height: 100%; width: '.$pct_no_aplica.'%; background-color: #9CA3AF;"></div>';
        
        $html .= '<div style="clear: both;"></div></div>';
        
        $html .= '<div style="text-align: center; margin-top: 10px; font-size: 10px;">';
        $html .= '<span style="color: #10B981;">&#9632;</span> Ejecutado ('.number_format($pct_ejecutado,1).'%) &nbsp;&nbsp;';
        $html .= '<span style="color: #3B82F6;">&#9632;</span> En Proceso ('.number_format($pct_proceso,1).'%) &nbsp;&nbsp;';
        $html .= '<span style="color: #EF4444;">&#9632;</span> Retrasado ('.number_format($pct_retrasado,1).'%) &nbsp;&nbsp;';
        $html .= '<span style="color: #F59E0B;">&#9632;</span> Programado ('.number_format($pct_programado,1).'%)';
        $html .= '</div></div>';

        $html .= '</div>'; // End Stats Section

        if ($observaciones) {
            $html .= '<div class="text-section"><h3>Observaciones</h3><div>' . nl2br(htmlspecialchars($observaciones)) . '</div></div>';
        }

        $html .= '<div class="text-section"><h3>Detalle del Checklist - Cronograma Anual ' . $anio . '</h3>';
        
        $months_short = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        $months_labels = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

        $html .= '
            <table class="grid-table">
                <thead>
                    <tr>
                        <th rowspan="2" class="col-literal">Item</th>
                        <th rowspan="2" class="col-desc">Descripción / Requisito</th>
                        ';
                        foreach ($months_labels as $m) {
                            $html .= '<th colspan="2" style="font-size: 8px;">' . $m . '</th>';
                        }
        $html .= '
                        <th rowspan="2" class="col-hallazgos">Hallazgos</th>
                        <th rowspan="2" class="col-estado">Estado</th>
                    </tr>
                    <tr>
                        ';
                        for ($i=0; $i<12; $i++) {
                            $html .= '<th class="col-month">P</th><th class="col-month">E</th>';
                        }
        $html .= '
                    </tr>
                </thead>
                <tbody>
        ';
        
        $currentCat = '';
        foreach ($items as $item) {
            // Category Header
            if ($item['categoria'] !== $currentCat) {
                $currentCat = $item['categoria'];
                $html .= '<tr><td colspan="28" class="section-title" style="background-color: #ddd;">' . htmlspecialchars($currentCat) . '</td></tr>';
            }
            
            // Main Item Row
            $html .= '<tr>
                <td class="col-literal" style="font-weight:bold; background-color: #f9f9f9;">' . htmlspecialchars($item['numeral']) . '</td>
                <td colspan="27" style="font-weight:bold; background-color: #f9f9f9;">' . nl2br(htmlspecialchars($item['requisito'])) . '</td>
            </tr>';
            
            if (empty($item['subitems'])) {
                $html .= '<tr><td colspan="28" style="text-align:center; color: #999;">No hay subpuntos definidos</td></tr>';
            } else {
                foreach ($item['subitems'] as $sub) {
                    $statusClass = '';
                    $st = $sub['estado_anual'] ?? 'Pendiente';
                    if ($st == 'Ejecutado') $statusClass = 'status-ejecutado';
                    elseif ($st == 'Retrasado') $statusClass = 'status-retrasado';
                    elseif ($st == 'En Proceso') $statusClass = 'status-en-proceso';
                    else $statusClass = 'status-pendiente'; // Default for PDF visibility
                    
                    $html .= '<tr>';
                    $html .= '<td class="col-literal">' . htmlspecialchars($sub['literal']) . '</td>';
                    $html .= '<td class="col-desc">' . nl2br(htmlspecialchars($sub['descripcion'])) . '</td>';
                    
                    // Grid Cells
                    foreach ($months_short as $m) {
                        $p = !empty($sub[$m.'_p']);
                        $e = !empty($sub[$m.'_e']);
                        
                        // Checkmark symbol: &#10003; (✓) or X
                        // Use class for color
                        $p_mark = $p ? '<span class="check-true">X</span>' : '<span class="check-false">-</span>';
                        $e_mark = $e ? '<span class="check-true">X</span>' : '<span class="check-false">-</span>';
                        
                        $html .= '<td class="col-month" style="text-align: center; background-color: #fff;">' . $p_mark . '</td>';
                        $html .= '<td class="col-month" style="text-align: center; background-color: #fdfdfd;">' . $e_mark . '</td>';
                    }
                    
                    $html .= '<td class="col-hallazgos" style="font-size: 8px;">' . nl2br(htmlspecialchars($sub['hallazgos'] ?? '')) . '</td>';
                    $html .= '<td class="col-estado ' . $statusClass . '" style="font-size: 8px; font-weight: bold;">' . $st . '</td>';
                    $html .= '</tr>';
                }
            }
        }
        
        $html .= '</tbody></table></div>'; // End Table & Section


        if ($recomendaciones) {
            $html .= '<div class="text-section"><h3>Recomendaciones</h3><div>' . nl2br(htmlspecialchars($recomendaciones)) . '</div></div>';
        }
        if ($conclusiones) {
            $html .= '<div class="text-section"><h3>Conclusiones</h3><div>' . nl2br(htmlspecialchars($conclusiones)) . '</div></div>';
        }
        
        $html .= '</body></html>';

    } else {
        // ... Original Audit Logic ...
        $id = (int)($_REQUEST['id'] ?? 0);
        if (!$id) die("Audit ID required");
        
        $stmt = $conn->prepare("SELECT a.*, c.nombre as checklist_nombre, c.codigo FROM iso_audits a JOIN iso_checklists c ON a.checklist_id = c.id WHERE a.id = ?");
        $stmt->execute([$id]);
        $audit = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$audit) die("Audit not found");

        $stmtDetails = $conn->prepare("SELECT d.*, i.requisito, i.categoria FROM iso_audit_details d JOIN iso_checklist_items i ON d.item_id = i.id WHERE d.audit_id = ? ORDER BY i.orden");
        $stmtDetails->execute([$id]);
        $details = $stmtDetails->fetchAll(PDO::FETCH_ASSOC);
        
        $groupedDetails = [];
        foreach ($details as $d) {
            $cat = $d['categoria'] ?: 'General';
            $groupedDetails[$cat][] = $d;
        }

        $filename = "Audit_" . $audit['codigo'] . ".pdf";
        
        $html = '<html><head>' . $styles . '</head><body>';
        
        $html .= '
        <table class="header-table">
            <tr>
                <td rowspan="3" class="logo-cell">' . ($logoBase64 ? '<img src="' . $logoBase64 . '" class="logo-img">' : 'LOGO') . '</td>
                <td colspan="2" class="center"><div class="title">' . htmlspecialchars($audit['checklist_nombre']) . '</div></td>
                <td width="100">
                    <div><strong>Código:</strong> ' . htmlspecialchars($audit['codigo']) . '</div>
                    <div><strong>Fecha:</strong> ' . htmlspecialchars($audit['fecha_auditoria']) . '</div>
                </td>
            </tr>
            <tr><td colspan="3"><strong>Cliente:</strong> ' . htmlspecialchars($audit['cliente_nombre']) . '</td></tr>
            <tr>
                <td><strong>Contrato:</strong> ' . htmlspecialchars($audit['n_contrato']) . '</td>
                <td colspan="2"><strong>Dirección:</strong> ' . htmlspecialchars($audit['direccion']) . '</td>
            </tr>
        </table>
        
        <table class="header-table">
            <tr><td><strong>Representante Dirección:</strong> ' . htmlspecialchars($audit['representante_direccion']) . '</td></tr>
            ' . (!empty($audit['alcance']) ? '<tr><td><strong>Alcance:</strong> ' . nl2br(htmlspecialchars($audit['alcance'])) . '</td></tr>' : '') . '
            ' . (!empty($audit['objetivo']) ? '<tr><td><strong>Objetivo:</strong> ' . nl2br(htmlspecialchars($audit['objetivo'])) . '</td></tr>' : '') . '
        </table>

        <table>
            <thead>
                <tr>
                    <th width="35%">Requisito</th>
                    <th width="35%">Hallazgos / Evidencias</th>
                    <th width="10%" class="center">NC</th>
                    <th width="10%" class="center">OBS</th>
                    <th width="10%" class="center">Verif.</th>
                </tr>
            </thead>
            <tbody>';
            
        foreach ($groupedDetails as $category => $items) {
            $html .= '<tr><td colspan="5" class="section-title">' . htmlspecialchars($category) . '</td></tr>';
            foreach ($items as $item) {
                $nc = $item['es_nc'] ? 'X' : '';
                $obs = $item['es_obs'] ? 'X' : '';
                $verif = $item['verificado'] ? 'Sí' : 'No';
                $html .= '<tr>
                    <td>' . htmlspecialchars($item['requisito']) . '</td>
                    <td>' . htmlspecialchars($item['hallazgos']) . '</td>
                    <td class="center">' . $nc . '</td>
                    <td class="center">' . $obs . '</td>
                    <td class="center">' . $verif . '</td>
                </tr>';
            }
        }
        $html .= '</tbody></table>';
        
        $html .= '<div style="margin-top: 20px;"><strong>Observaciones Finales:</strong><br><div style="border: 1px solid #000; padding: 10px;">' . nl2br(htmlspecialchars($audit['observaciones_finales'])) . '</div></div>';
        $html .= '<div style="margin-top: 20px;"><strong>Juicio Final (Cumple):</strong> ' . htmlspecialchars($audit['juicio_final'] ?: '-') . '</div>';
        $html .= '<br><br><br><table style="border: none;"><tr><td style="border: none; text-align: center;">_______________________<br>Firma Auditor</td><td style="border: none; text-align: center;">_______________________<br>Firma Cliente</td></tr></table></body></html>';
    }

    $dompdf->loadHtml($html);
    $orientation = ($type === 'tracking') ? 'landscape' : 'portrait';
    $dompdf->setPaper('A4', $orientation);
    $dompdf->render();
    $dompdf->stream($filename, ["Attachment" => false]);

} catch (Exception $e) {
    die("Error generating PDF: " . $e->getMessage());
}
?>
