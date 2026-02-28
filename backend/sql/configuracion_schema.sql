-- 1. Tabla Datos Empresa
CREATE TABLE IF NOT EXISTS empresa_datos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ruc VARCHAR(11) NOT NULL,
    razon_social VARCHAR(200) NOT NULL,
    nombre_comercial VARCHAR(200),
    domicilio_fiscal TEXT,
    moneda_principal VARCHAR(3) DEFAULT 'PEN', -- PEN, USD
    anio_fiscal INT DEFAULT 2024,
    configuracion_sunat JSON, -- Para sol_user, sol_pass, certificado, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Tabla Sedes / Establecimientos
CREATE TABLE IF NOT EXISTS sedes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    codigo_sunat VARCHAR(4),
    nombre VARCHAR(100) NOT NULL,
    direccion TEXT,
    es_principal BOOLEAN DEFAULT FALSE,
    activo BOOLEAN DEFAULT TRUE
);

-- 3. Tabla Monedas (Catálogo simple)
CREATE TABLE IF NOT EXISTS monedas (
    codigo VARCHAR(3) PRIMARY KEY, -- PEN, USD, EUR
    nombre VARCHAR(50),
    simbolo VARCHAR(5),
    es_nacional BOOLEAN DEFAULT FALSE
);

INSERT IGNORE INTO monedas (codigo, nombre, simbolo, es_nacional) VALUES
('PEN', 'Soles', 'S/', 1),
('USD', 'Dólares Americanos', '$', 0),
('EUR', 'Euros', '€', 0);

-- 4. Tipo de Cambio
CREATE TABLE IF NOT EXISTS tipo_cambio (
    id INT PRIMARY KEY AUTO_INCREMENT,
    fecha DATE NOT NULL,
    moneda_origen VARCHAR(3) DEFAULT 'USD',
    moneda_destino VARCHAR(3) DEFAULT 'PEN',
    compra DECIMAL(10,3),
    venta DECIMAL(10,3),
    UNIQUE KEY unique_cambio (fecha, moneda_origen, moneda_destino)
);

-- 5. Periodos Contables
CREATE TABLE IF NOT EXISTS periodos_contables (
    id INT PRIMARY KEY AUTO_INCREMENT,
    anio INT NOT NULL,
    mes INT NOT NULL,
    nombre VARCHAR(20), -- Enero, Febrero...
    estado ENUM('abierto', 'cerrado') DEFAULT 'abierto',
    UNIQUE KEY unique_periodo (anio, mes)
);

-- 6. Centros de Costo
CREATE TABLE IF NOT EXISTS centros_costo (
    id INT PRIMARY KEY AUTO_INCREMENT,
    codigo VARCHAR(20) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    activo BOOLEAN DEFAULT TRUE
);

-- 7. Series y Numeración
CREATE TABLE IF NOT EXISTS series_comprobantes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tipo_comprobante VARCHAR(2), -- 01: Factura, 03: Boleta, etc.
    serie VARCHAR(4) NOT NULL,
    correlativo_actual INT DEFAULT 0,
    sede_id INT,
    FOREIGN KEY (sede_id) REFERENCES sedes(id),
    UNIQUE KEY unique_serie (tipo_comprobante, serie)
);

-- ---------------------------------------------------------
-- REGISTRO DE MÓDULO Y PERMISOS
-- ---------------------------------------------------------

-- Registrar nuevo módulo
INSERT IGNORE INTO modulos (nombre, codigo, ruta, icono, descripcion) VALUES 
('Configuración General', 'configuracion', '/configuracion', 'Settings', 'Datos empresa, sedes, monedas, periodos');

-- Asignar permiso al rol CONTADOR (id=2 asumido, buscamos por nombre)
INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion)
SELECT r.id, m.id, 1, 1, 1
FROM roles r, modulos m
WHERE r.nombre = 'contador' AND m.codigo = 'configuracion';

-- Asignar permiso al rol ADMIN también
INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion)
SELECT r.id, m.id, 1, 1, 1
FROM roles r, modulos m
WHERE r.nombre = 'admin' AND m.codigo = 'configuracion';
