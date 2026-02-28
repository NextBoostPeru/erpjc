<?php
class StockHelper {
    private $conn;

    public function __construct($db) {
        $this->conn = $db;
    }

    public function registrarMovimiento($datos) {
        // datos: almacen_id, usuario_id, motivo, tipo (entrada/salida), items, documento_referencia
        
        $almacenOrigen = null;
        $almacenDestino = null;
        
        if ($datos['tipo'] === 'entrada') {
            $almacenDestino = $datos['almacen_id'];
        } else {
            $almacenOrigen = $datos['almacen_id'];
        }

        // Validate Motivo Enum
        $validMotivos = ['compra','devolucion','ajuste','venta','consumo_interno','merma','traslado','inicial'];
        $motivoEnum = 'traslado'; // Default
        $observacion = $datos['motivo']; // Original string as observation

        // Simple mapping attempt
        foreach ($validMotivos as $vm) {
            if (stripos($datos['motivo'], $vm) !== false) {
                $motivoEnum = $vm;
                break;
            }
        }

        // 1. Cabecera
        $sql = "INSERT INTO movimientos_inventario (almacen_origen_id, almacen_destino_id, usuario_id, tipo, motivo, documento_referencia, observacion, fecha, estado) 
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'confirmado')";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([
            $almacenOrigen,
            $almacenDestino,
            $datos['usuario_id'],
            $datos['tipo'],
            $motivoEnum,
            $datos['documento_referencia'],
            $observacion
        ]);
        $movimientoId = $this->conn->lastInsertId();

        foreach ($datos['items'] as $item) {
            $productoId = $item['producto_id'];
            $cantidad = $item['cantidad'];
            $costo = $item['costo_unitario'] ?? 0;

            // 2. Detalle
            $stmtDet = $this->conn->prepare("INSERT INTO movimientos_detalles (movimiento_id, producto_id, cantidad, costo_unitario) VALUES (?, ?, ?, ?)");
            $stmtDet->execute([$movimientoId, $productoId, $cantidad, $costo]);
            $detalleId = $this->conn->lastInsertId();

            // 3. Actualizar Stock Almacen (Optimized)
            $this->updateStockAlmacen($datos['almacen_id'], $productoId, $datos['tipo'], $cantidad);

            // 4 & 5. Actualizar Stock Global y Kardex (Combined)
            $this->processProductAndKardex($productoId, $datos['almacen_id'], $detalleId, $datos['tipo'], $cantidad, $costo, $datos['documento_referencia']);
        }
        
        return $movimientoId;
    }

    private function updateStockAlmacen($almacenId, $productoId, $tipo, $cantidad) {
        $operador = $tipo === 'entrada' ? '+' : '-';
        // Optimized with INSERT ... ON DUPLICATE KEY UPDATE
        // Removed ubicacion as it is not present/required (using ubicacion_id which is nullable)
        $sql = "INSERT INTO stock_almacen (almacen_id, producto_id, cantidad) 
                VALUES (?, ?, " . ($tipo === 'entrada' ? '?' : '-?') . ") 
                ON DUPLICATE KEY UPDATE cantidad = cantidad $operador ?";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([$almacenId, $productoId, $cantidad, $cantidad]);
    }

    private function processProductAndKardex($productoId, $almacenId, $detalleId, $tipo, $cantidad, $costoUnitario, $documento) {
        // 1. Lock and Fetch Product
        $stmt = $this->conn->prepare("SELECT stock, costo_promedio FROM productos WHERE id = ? FOR UPDATE");
        $stmt->execute([$productoId]);
        $prod = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$prod) return; // Should not happen if foreign key integrity exists

        $stockActual = (float)$prod['stock'];
        $costoPromedio = (float)$prod['costo_promedio'];
        
        $nuevoStock = $tipo === 'entrada' ? $stockActual + $cantidad : $stockActual - $cantidad;
        $nuevoCosto = $costoPromedio;

        // Use current average cost if outgoing cost is not provided or 0 (standard practice for exits)
        if ($tipo !== 'entrada' && $costoUnitario == 0) {
            $costoUnitario = $costoPromedio;
        }

        // 2. Calculate New Cost (Only for entries)
        if ($tipo === 'entrada') {
            if ($nuevoStock > 0) {
                $valorTotalAnterior = $stockActual * $costoPromedio;
                $valorTotalNuevo = $valorTotalAnterior + ($cantidad * $costoUnitario);
                $nuevoCosto = $valorTotalNuevo / $nuevoStock;
            } else {
                $nuevoCosto = $costoUnitario;
            }
        }

        // 3. Update Product
        $stmtUpd = $this->conn->prepare("UPDATE productos SET stock = ?, costo_promedio = ? WHERE id = ?");
        $stmtUpd->execute([$nuevoStock, $nuevoCosto, $productoId]);

        // 4. Insert Kardex
        $sql = "INSERT INTO kardex (
            producto_id, almacen_id, movimiento_detalle_id, tipo_movimiento, documento_referencia,
            cantidad, costo_unitario,
            saldo_cantidad, saldo_costo_unitario, saldo_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

        $stmt = $this->conn->prepare($sql);
        $stmt->execute([
            $productoId, 
            $almacenId, 
            $detalleId, 
            $tipo, 
            $documento,
            $cantidad, 
            $costoUnitario,
            $nuevoStock,
            $nuevoCosto, 
            $nuevoStock * $nuevoCosto
        ]);
    }
}
?>
