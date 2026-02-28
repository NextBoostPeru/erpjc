CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    rol VARCHAR(50) NOT NULL DEFAULT 'user',
    status ENUM('activo', 'inactivo', 'bloqueado') DEFAULT 'activo',
    ultimo_acceso DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insertar usuario contador (Password: contador123) si no existe
INSERT IGNORE INTO usuarios (usuario, password, email, rol, status) VALUES 
('contador', '$2y$10$fdxBu7p.8BdBih4C.xLDremI28QGkvcCh1rCQhFKK98/TBtDDqeuq', 'contador@empresa.com', 'contador', 'activo');
