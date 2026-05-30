-- Planilla Secundaria - Pago Semanal con Asistencia (sin PLE/SUNAT)
-- No emite PLAME ni archivos para SUNAT

CREATE TABLE IF NOT EXISTS planillas_secundarias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    anio INT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    concepto VARCHAR(100) NOT NULL DEFAULT 'Pago Semanal',
    estado ENUM('Borrador','Cerrado','Enviado') NOT NULL DEFAULT 'Borrador',
    total_ingresos DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_neto DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_semana (fecha_inicio, concepto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS planilla_secundaria_detalles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    planilla_secundaria_id INT NOT NULL,
    colaborador_id INT NOT NULL,
    sueldo_secundario DECIMAL(10,2) NOT NULL DEFAULT 0,
    dias_trabajados INT NOT NULL DEFAULT 0,
    total_bruto DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_descuentos DECIMAL(10,2) NOT NULL DEFAULT 0,
    neto_pagar DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_planilla_secundaria (planilla_secundaria_id),
    INDEX idx_colaborador (colaborador_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pagos_planilla_secundaria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    planilla_secundaria_detalle_id INT NOT NULL,
    planilla_secundaria_id INT NOT NULL,
    colaborador_id INT NOT NULL,
    periodo VARCHAR(7) NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    medio_pago VARCHAR(30) DEFAULT NULL,
    referencia VARCHAR(100) DEFAULT NULL,
    origen_id INT DEFAULT NULL,
    observaciones TEXT DEFAULT NULL,
    usuario_id INT NOT NULL,
    archivo_constancia VARCHAR(255) DEFAULT NULL,
    fecha DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_planilla_sec_detalle_id (planilla_secundaria_detalle_id),
    INDEX idx_planilla_secundaria_id (planilla_secundaria_id),
    INDEX idx_colaborador_id (colaborador_id),
    INDEX idx_periodo (periodo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migracion: agregar columnas faltantes si la tabla ya existia con esquema viejo (semanal > mensual)
SET @has_fecha_inicio = 0;
SELECT COUNT(*) INTO @has_fecha_inicio FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planillas_secundarias' AND COLUMN_NAME = 'fecha_inicio';
SET @sql_alt = IF(@has_fecha_inicio = 0,
    'ALTER TABLE planillas_secundarias ADD COLUMN fecha_inicio DATE NOT NULL AFTER anio',
    'SELECT 1');
PREPARE stmt FROM @sql_alt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fecha_fin = 0;
SELECT COUNT(*) INTO @has_fecha_fin FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planillas_secundarias' AND COLUMN_NAME = 'fecha_fin';
SET @sql_alt2 = IF(@has_fecha_fin = 0,
    'ALTER TABLE planillas_secundarias ADD COLUMN fecha_fin DATE NOT NULL AFTER fecha_inicio',
    'SELECT 1');
PREPARE stmt FROM @sql_alt2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_dias = 0;
SELECT COUNT(*) INTO @has_dias FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planilla_secundaria_detalles' AND COLUMN_NAME = 'dias_trabajados';
SET @sql_alt3 = IF(@has_dias = 0,
    'ALTER TABLE planilla_secundaria_detalles ADD COLUMN dias_trabajados INT NOT NULL DEFAULT 0 AFTER sueldo_secundario',
    'SELECT 1');
PREPARE stmt FROM @sql_alt3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Agregar columna sueldo_secundario a colaboradores si no existe
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'colaboradores' AND COLUMN_NAME = 'sueldo_secundario';
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE colaboradores ADD COLUMN sueldo_secundario DECIMAL(10,2) DEFAULT 0 AFTER sueldo_base',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Insertar modulo en la tabla modulos si no existe
INSERT IGNORE INTO modulos (nombre, codigo, ruta, icono, descripcion)
VALUES ('Planilla Secundaria', 'planillas_secundarias', '/planillas-secundarias', 'DollarSign', 'Gestion de pago semanal con asistencia (sin PLE/SUNAT)');

-- Asignar permisos completos al rol admin (id=1) si no existen
SET @mod_id = (SELECT id FROM modulos WHERE codigo = 'planillas_secundarias' LIMIT 1);
INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_crear, permiso_editar, permiso_escritura, permiso_eliminacion)
SELECT 1, @mod_id, 1, 1, 1, 1, 1
WHERE @mod_id IS NOT NULL;
