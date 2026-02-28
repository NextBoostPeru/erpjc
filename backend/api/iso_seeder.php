<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/../config/db.php';

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Helper function to insert items
    function insertItems($conn, $normaName, $items) {
        $stmt = $conn->prepare("SELECT id FROM iso_normas WHERE nombre = ?");
        $stmt->execute([$normaName]);
        $normaId = $stmt->fetchColumn();

        if (!$normaId) {
            echo "Norma $normaName not found.\n";
            return;
        }

        // Check if items already exist
        $stmtCount = $conn->prepare("SELECT COUNT(*) FROM iso_checklist_items WHERE norma_id = ?");
        $stmtCount->execute([$normaId]);
        if ($stmtCount->fetchColumn() > 0) {
            echo "Items for $normaName already exist. Skipping.\n";
            return;
        }

        $stmtInsert = $conn->prepare("INSERT INTO iso_checklist_items (norma_id, numeral, requisito, categoria, orden) VALUES (?, ?, ?, ?, ?)");
        
        foreach ($items as $index => $item) {
            $stmtInsert->execute([
                $normaId, 
                $item['numeral'], 
                $item['requisito'], 
                $item['categoria'], 
                $index + 1
            ]);
        }
        echo "Inserted " . count($items) . " items for $normaName.\n";
    }

    // ISO 9001 Items (Calidad)
    $iso9001 = [
        ['numeral' => '4.1', 'requisito' => 'Comprensión de la organización y de su contexto', 'categoria' => 'Contexto'],
        ['numeral' => '4.2', 'requisito' => 'Comprensión de las necesidades y expectativas de las partes interesadas', 'categoria' => 'Contexto'],
        ['numeral' => '5.1', 'requisito' => 'Liderazgo y compromiso', 'categoria' => 'Liderazgo'],
        ['numeral' => '5.2', 'requisito' => 'Política de la calidad', 'categoria' => 'Liderazgo'],
        ['numeral' => '6.1', 'requisito' => 'Acciones para abordar riesgos y oportunidades', 'categoria' => 'Planificación'],
        ['numeral' => '7.1', 'requisito' => 'Recursos (personas, infraestructura, ambiente)', 'categoria' => 'Apoyo'],
        ['numeral' => '7.5', 'requisito' => 'Información documentada', 'categoria' => 'Apoyo'],
        ['numeral' => '8.1', 'requisito' => 'Planificación y control operacional', 'categoria' => 'Operación'],
        ['numeral' => '9.1', 'requisito' => 'Seguimiento, medición, análisis y evaluación', 'categoria' => 'Evaluación del desempeño'],
        ['numeral' => '10.1', 'requisito' => 'Generalidades (Mejora)', 'categoria' => 'Mejora']
    ];

    // ISO 14001 Items (Ambiental)
    $iso14001 = [
        ['numeral' => '4.1', 'requisito' => 'Comprensión de la organización y de su contexto ambiental', 'categoria' => 'Contexto'],
        ['numeral' => '6.1.2', 'requisito' => 'Aspectos ambientales', 'categoria' => 'Planificación'],
        ['numeral' => '6.1.3', 'requisito' => 'Requisitos legales y otros requisitos', 'categoria' => 'Planificación'],
        ['numeral' => '8.1', 'requisito' => 'Planificación y control operacional ambiental', 'categoria' => 'Operación'],
        ['numeral' => '8.2', 'requisito' => 'Preparación y respuesta ante emergencias', 'categoria' => 'Operación'],
        ['numeral' => '9.1.2', 'requisito' => 'Evaluación del cumplimiento', 'categoria' => 'Evaluación del desempeño']
    ];

    // ISO 45001 Items (Seguridad y Salud)
    $iso45001 = [
        ['numeral' => '4.1', 'requisito' => 'Comprensión de la organización y de su contexto SST', 'categoria' => 'Contexto'],
        ['numeral' => '5.4', 'requisito' => 'Consulta y participación de los trabajadores', 'categoria' => 'Liderazgo'],
        ['numeral' => '6.1.2', 'requisito' => 'Identificación de peligros y evaluación de riesgos y oportunidades', 'categoria' => 'Planificación'],
        ['numeral' => '8.1.2', 'requisito' => 'Eliminar peligros y reducir riesgos para la SST', 'categoria' => 'Operación'],
        ['numeral' => '9.3', 'requisito' => 'Revisión por la dirección', 'categoria' => 'Evaluación del desempeño'],
        ['numeral' => '10.2', 'requisito' => 'Incidentes, no conformidades y acciones correctivas', 'categoria' => 'Mejora']
    ];

    // ISO 37001 Items (Antisoborno)
    $iso37001 = [
        ['numeral' => '4.5', 'requisito' => 'Evaluación del riesgo de soborno', 'categoria' => 'Contexto'],
        ['numeral' => '5.1.1', 'requisito' => 'Órgano de gobierno y alta dirección', 'categoria' => 'Liderazgo'],
        ['numeral' => '7.2.2', 'requisito' => 'Proceso de contratación', 'categoria' => 'Apoyo'],
        ['numeral' => '8.2', 'requisito' => 'Debida diligencia', 'categoria' => 'Operación'],
        ['numeral' => '8.3', 'requisito' => 'Controles financieros', 'categoria' => 'Operación'],
        ['numeral' => '8.4', 'requisito' => 'Controles no financieros', 'categoria' => 'Operación'],
        ['numeral' => '8.7', 'requisito' => 'Regalos, hospitalidad, donaciones y beneficios similares', 'categoria' => 'Operación']
    ];

    insertItems($conn, 'ISO 9001', $iso9001);
    insertItems($conn, 'ISO 14001', $iso14001);
    insertItems($conn, 'ISO 45001', $iso45001);
    insertItems($conn, 'ISO 37001', $iso37001);

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
