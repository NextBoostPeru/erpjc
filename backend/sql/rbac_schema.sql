-- 1. Tabla de Roles
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Módulos (Recursos del sistema)
CREATE TABLE IF NOT EXISTS modulos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    codigo VARCHAR(50) NOT NULL UNIQUE, -- Identificador único para uso en frontend/backend (ej: 'contabilidad', 'usuarios')
    ruta VARCHAR(100), -- Ruta del frontend (ej: '/contabilidad')
    icono VARCHAR(50), -- Nombre de icono para el menú
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla Intermedia Roles-Módulos (Permisos)
CREATE TABLE IF NOT EXISTS roles_modulos (
    rol_id INT NOT NULL,
    modulo_id INT NOT NULL,
    permiso_lectura BOOLEAN DEFAULT TRUE,
    permiso_escritura BOOLEAN DEFAULT FALSE,
    permiso_eliminacion BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (rol_id, modulo_id),
    FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (modulo_id) REFERENCES modulos(id) ON DELETE CASCADE
);

-- 4. Modificar tabla usuarios para vincular con roles
-- Nota: Esto se maneja mejor con ALTER TABLE en el script de migración si la tabla ya existe
-- pero aquí definimos la estructura ideal.
-- ALTER TABLE usuarios ADD COLUMN rol_id INT;
-- ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_rol FOREIGN KEY (rol_id) REFERENCES roles(id);

-- Datos Semilla: Roles
INSERT IGNORE INTO roles (nombre, descripcion) VALUES 
('admin', 'Administrador Total del Sistema'),
('contador', 'Acceso a módulos contables y financieros'),
('rrhh', 'Acceso a gestión de personal'),
('user', 'Usuario básico');

-- Datos Semilla: Módulos
INSERT IGNORE INTO modulos (nombre, codigo, ruta, descripcion) VALUES 
('Dashboard', 'dashboard', '/dashboard', 'Vista principal con métricas'),
('Usuarios', 'usuarios', '/usuarios', 'Gestión de usuarios y roles'),
('Contabilidad', 'contabilidad', '/contabilidad', 'Libros diarios, mayor, balances'),
('Facturación', 'facturacion', '/facturacion', 'Emisión y recepción de facturas'),
('Reportes', 'reportes', '/reportes', 'Reportes generales del sistema');

-- Asignación de Permisos Iniciales

-- Admin: Todo
INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion)
SELECT r.id, m.id, 1, 1, 1
FROM roles r, modulos m
WHERE r.nombre = 'admin';

-- Contador: Dashboard, Contabilidad, Facturación, Reportes (Lectura/Escritura, sin eliminar en reportes)
INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion)
SELECT r.id, m.id, 1, 1, 0
FROM roles r JOIN modulos m ON m.codigo IN ('dashboard', 'contabilidad', 'facturacion', 'reportes')
WHERE r.nombre = 'contador';

-- Ajuste específico: Contador puede eliminar en contabilidad
UPDATE roles_modulos rm
JOIN roles r ON rm.rol_id = r.id
JOIN modulos m ON rm.modulo_id = m.id
SET rm.permiso_eliminacion = 1
WHERE r.nombre = 'contador' AND m.codigo = 'contabilidad';
