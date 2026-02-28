<?php
require_once __DIR__ . '/../config/db.php';

function addIndex($conn, $table, $column, $indexName) {
    try {
        // Check if index exists
        $check = $conn->prepare("SHOW INDEX FROM $table WHERE Key_name = :key");
        $check->execute([':key' => $indexName]);
        if ($check->rowCount() > 0) {
            echo "Index '$indexName' on table '$table' already exists.\n";
            return;
        }

        $sql = "CREATE INDEX $indexName ON $table ($column)";
        $conn->exec($sql);
        echo "Index '$indexName' created on table '$table' for column '$column'.\n";
    } catch (Exception $e) {
        echo "Error creating index '$indexName' on '$table': " . $e->getMessage() . "\n";
    }
}

try {
    echo "Starting DB optimization (Indexes)...\n";

    // Clientes
    addIndex($conn, 'clientes', 'razon_social', 'idx_clientes_razon_social');
    addIndex($conn, 'clientes', 'num_doc', 'idx_clientes_num_doc'); // Usually unique, but ensuring
    addIndex($conn, 'clientes', 'contacto_nombre', 'idx_clientes_contacto'); // For search
    addIndex($conn, 'clientes', 'estado, razon_social', 'idx_clientes_estado_razon'); // Composite for filtering by status and sorting

    // Proveedores
    addIndex($conn, 'proveedores', 'razon_social', 'idx_proveedores_razon_social');
    addIndex($conn, 'proveedores', 'estado, razon_social', 'idx_proveedores_estado_razon'); // Composite
    
    // Comprobantes Electronicos
    addIndex($conn, 'comprobantes_electronicos', 'cliente_num_doc', 'idx_ce_cliente_doc');
    addIndex($conn, 'comprobantes_electronicos', 'fecha_emision', 'idx_ce_fecha');
    addIndex($conn, 'comprobantes_electronicos', 'serie, correlativo', 'idx_ce_serie_corr');

    // Comprobantes Compra
    addIndex($conn, 'comprobantes_compra', 'proveedor_num_doc', 'idx_cc_prov_doc');
    addIndex($conn, 'comprobantes_compra', 'fecha_emision', 'idx_cc_fecha');

    // Dashboard Optimizations
    addIndex($conn, 'clientes', 'created_at', 'idx_clientes_created_at');
    
    // Check if comprobantes_detalle exists before indexing
    try {
        $checkTable = $conn->query("SHOW TABLES LIKE 'comprobantes_detalle'");
        if ($checkTable->rowCount() > 0) {
            addIndex($conn, 'comprobantes_detalle', 'comprobante_id', 'idx_cd_comprobante_id');
            // Index for grouping/sorting if needed, though description might be text (long)
            // Better to index product_id if available, but query uses description. 
            // We'll skip description index if it's TEXT type, but usually it's VARCHAR.
            // Let's assume safe to skip description to avoid key length issues.
        }
    } catch (Exception $e) {
        // Ignore
    }

    echo "Optimization completed.\n";

} catch (Exception $e) {
    echo "Fatal Error: " . $e->getMessage() . "\n";
}
