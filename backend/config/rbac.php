<?php
if (basename(__FILE__) === basename($_SERVER['PHP_SELF'] ?? '')) {
    http_response_code(403);
    die("Forbidden");
}

function rbac_column_exists(PDO $conn, string $table, string $column): bool {
    $stmt = $conn->prepare("
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = :t
          AND COLUMN_NAME = :c
        LIMIT 1
    ");
    $stmt->execute([':t' => $table, ':c' => $column]);
    return (bool)$stmt->fetchColumn();
}

function rbac_ensure_roles_modulos_schema(PDO $conn): void {
    try {
        if (!rbac_column_exists($conn, 'roles_modulos', 'permiso_crear')) {
            $conn->exec("ALTER TABLE roles_modulos ADD COLUMN permiso_crear TINYINT(1) NOT NULL DEFAULT 0");
            try { $conn->exec("UPDATE roles_modulos SET permiso_crear = COALESCE(permiso_escritura, 0)"); } catch (Throwable $e) {}
        }
        if (!rbac_column_exists($conn, 'roles_modulos', 'permiso_editar')) {
            $conn->exec("ALTER TABLE roles_modulos ADD COLUMN permiso_editar TINYINT(1) NOT NULL DEFAULT 0");
            try { $conn->exec("UPDATE roles_modulos SET permiso_editar = COALESCE(permiso_escritura, 0)"); } catch (Throwable $e) {}
        }
    } catch (Throwable $e) {
    }
}

function rbac_get_user_role(PDO $conn, $userData): array {
    $u = (array)$userData;
    $userId = isset($u['id']) ? (int)$u['id'] : 0;
    $rolId = isset($u['rol_id']) ? (int)$u['rol_id'] : 0;
    $rolNombre = '';

    if ($userId) {
        try {
            $stmt = $conn->prepare("SELECT u.rol_id, r.nombre as rol_nombre FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id WHERE u.id = ? LIMIT 1");
            $stmt->execute([$userId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                $rolId = (int)($row['rol_id'] ?? 0);
                $rolNombre = strtolower((string)($row['rol_nombre'] ?? ''));
            }
        } catch (Throwable $e) {
        }
    }

    if (!$rolNombre) {
        $rolNombre = strtolower((string)($u['rol'] ?? ($u['rol_nombre'] ?? '')));
    }

    return [$userId, $rolId, $rolNombre];
}

function rbac_is_admin_or_manager(int $rolId, string $rolNombre): bool {
    if ($rolId === 1 || $rolId === 7) return true;
    return $rolNombre !== '' && (str_contains($rolNombre, 'admin') || str_contains($rolNombre, 'administrador') || str_contains($rolNombre, 'gerente') || str_contains($rolNombre, 'gerencia'));
}

function rbac_can(PDO $conn, int $rolId, string $rolNombre, string $moduleCode, string $perm): bool {
    if ($moduleCode === 'permisos' && rbac_is_admin_or_manager($rolId, $rolNombre)) return true;

    if ($moduleCode !== 'dashboard' && str_starts_with($moduleCode, 'dashboard_')) {
        return rbac_can($conn, $rolId, $rolNombre, 'dashboard', $perm);
    }

    if ($moduleCode === 'dashboard') {
        if ($perm === 'escritura') {
            $stmt = $conn->prepare("
                SELECT 1
                FROM roles_modulos rm
                JOIN modulos m ON rm.modulo_id = m.id
                WHERE rm.rol_id = ?
                  AND m.codigo LIKE 'dashboard\\_%'
                  AND (
                    COALESCE(rm.permiso_crear, 0) = 1
                    OR COALESCE(rm.permiso_editar, 0) = 1
                    OR COALESCE(rm.permiso_escritura, 0) = 1
                  )
                LIMIT 1
            ");
            $stmt->execute([$rolId]);
            return (bool)$stmt->fetchColumn();
        }

        $col = "permiso_" . $perm;
        if ($perm === 'crear' || $perm === 'editar') {
            $stmt = $conn->prepare("
                SELECT 1
                FROM roles_modulos rm
                JOIN modulos m ON rm.modulo_id = m.id
                WHERE rm.rol_id = ?
                  AND m.codigo LIKE 'dashboard\\_%'
                  AND (
                    COALESCE(rm.$col, 0) = 1
                    OR COALESCE(rm.permiso_escritura, 0) = 1
                  )
                LIMIT 1
            ");
            $stmt->execute([$rolId]);
            return (bool)$stmt->fetchColumn();
        }

        $stmt = $conn->prepare("
            SELECT 1
            FROM roles_modulos rm
            JOIN modulos m ON rm.modulo_id = m.id
            WHERE rm.rol_id = ?
              AND m.codigo LIKE 'dashboard\\_%'
              AND COALESCE(rm.$col, 0) = 1
            LIMIT 1
        ");
        $stmt->execute([$rolId]);
        return (bool)$stmt->fetchColumn();
    }

    $stmt = $conn->prepare("
        SELECT
            MAX(COALESCE(rm.permiso_lectura, 0)) as lectura,
            MAX(COALESCE(rm.permiso_crear, 0)) as crear,
            MAX(COALESCE(rm.permiso_editar, 0)) as editar,
            MAX(COALESCE(rm.permiso_eliminacion, 0)) as eliminacion,
            MAX(COALESCE(rm.permiso_escritura, 0)) as escritura
        FROM roles_modulos rm
        JOIN modulos m ON rm.modulo_id = m.id
        WHERE rm.rol_id = ?
          AND m.codigo = ?
        LIMIT 1
    ");
    $stmt->execute([$rolId, $moduleCode]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return false;

    $lectura = (int)($row['lectura'] ?? 0) === 1;
    $crear = (int)($row['crear'] ?? 0) === 1;
    $editar = (int)($row['editar'] ?? 0) === 1;
    $eliminacion = (int)($row['eliminacion'] ?? 0) === 1;
    $escritura = (int)($row['escritura'] ?? 0) === 1;

    if ($perm === 'escritura') return $crear || $editar || $escritura;
    if ($perm === 'crear') return $crear || $escritura;
    if ($perm === 'editar') return $editar || $escritura;
    if ($perm === 'lectura') return $lectura;
    if ($perm === 'eliminacion') return $eliminacion;
    return false;
}

function rbac_required_perm_for_method(string $method): string {
    return match (strtoupper($method)) {
        'GET' => 'lectura',
        'POST' => 'crear',
        'PUT' => 'editar',
        'DELETE' => 'eliminacion',
        default => 'lectura'
    };
}

function rbac_required_perm_for_request(string $method): string {
    $action = '';
    try {
        if (isset($_REQUEST['action'])) $action = (string)$_REQUEST['action'];
    } catch (Throwable $e) {
    }
    $action = strtolower(trim($action));

    if ($action !== '') {
        if (
            str_contains($action, 'elimin')
            || str_contains($action, 'delete')
            || str_contains($action, 'borrar')
        ) {
            return 'eliminacion';
        }

        if (
            str_contains($action, 'edit')
            || str_contains($action, 'update')
            || str_contains($action, 'actualiz')
            || str_contains($action, 'modific')
            || str_contains($action, 'cambiar')
            || str_contains($action, 'change')
            || str_contains($action, 'estado')
            || str_contains($action, 'aproba')
            || str_contains($action, 'approve')
            || str_contains($action, 'approval')
            || str_contains($action, 'rechaz')
            || str_contains($action, 'reject')
            || str_contains($action, 'anul')
            || str_contains($action, 'cancel')
            || str_contains($action, 'comunicar')
            || str_contains($action, 'baja')
            || str_contains($action, 'cerrar')
            || str_contains($action, 'abrir')
            || str_contains($action, 'reset')
            || str_contains($action, 'regenerate')
            || str_contains($action, 'habilit')
            || str_contains($action, 'inhabilit')
            || str_contains($action, 'activ')
            || str_contains($action, 'desactiv')
            || str_contains($action, 'asign')
            || str_contains($action, 'unassign')
            || str_contains($action, 'manage')
            || str_contains($action, 'send')
            || str_contains($action, 'enviar')
        ) {
            return 'editar';
        }

        if (
            str_contains($action, 'guardar')
            || str_contains($action, 'save')
            || str_contains($action, 'store')
            || str_contains($action, 'upsert')
            || str_contains($action, 'import')
            || str_contains($action, 'sincron')
            || str_contains($action, 'sync')
            || str_contains($action, 'upload')
            || str_contains($action, 'subir')
            || str_contains($action, 'adjunt')
            || str_contains($action, 'attachment')
        ) {
            return 'escritura';
        }

        if (
            str_contains($action, 'crea')
            || str_contains($action, 'agreg')
            || str_contains($action, 'registr')
            || str_contains($action, 'add')
            || str_contains($action, 'create')
            || str_contains($action, 'duplic')
            || str_contains($action, 'clone')
            || str_contains($action, 'clon')
            || str_contains($action, 'convert')
        ) {
            return 'crear';
        }

        if (
            str_contains($action, 'list')
            || str_contains($action, 'listar')
            || str_contains($action, 'get')
            || str_contains($action, 'buscar')
            || str_contains($action, 'search')
            || str_contains($action, 'consulta')
            || str_contains($action, 'obtener')
            || str_contains($action, 'resumen')
            || str_contains($action, 'ver')
            || str_contains($action, 'detalle')
            || str_contains($action, 'dashboard')
            || str_contains($action, 'totales')
            || str_contains($action, 'reporte')
        ) {
            return 'lectura';
        }
    }

    return rbac_required_perm_for_method($method);
}

function rbac_require(PDO $conn, $userData, string $moduleCode, string $method, ?string $perm = null): array {
    rbac_ensure_roles_modulos_schema($conn);
    [$userId, $rolId, $rolNombre] = rbac_get_user_role($conn, $userData);
    $required = $perm ?? rbac_required_perm_for_request($method);

    if (!rbac_can($conn, $rolId, $rolNombre, $moduleCode, $required)) {
        http_response_code(403);
        echo json_encode([
            "message" => "No tienes permiso para esta acción",
            "forbidden" => true,
            "modulo" => $moduleCode,
            "permiso" => $required
        ]);
        if (isset($conn)) $conn = null;
        exit;
    }

    return [$userId, $rolId, $rolNombre, $required];
}
