<?php
require_once __DIR__ . '/../config/db.php';

try {
    echo "Syncing users to collaborators...\n";

    // Find users without collaborator record
    $sql = "SELECT u.id, u.usuario, u.email 
            FROM usuarios u 
            LEFT JOIN colaboradores c ON u.id = c.usuario_id 
            WHERE c.id IS NULL";
    $stmt = $conn->prepare($sql);
    $stmt->execute();
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo "Found " . count($users) . " users to sync.\n";

    foreach ($users as $user) {
        $nombres = $user['usuario'];
        $apellidos = '(Usuario Sistema)';
        $email = $user['email'];
        $usuario_id = $user['id'];
        
        // Generate a unique dummy document number
        $documento_numero = 'SYS-' . str_pad($usuario_id, 6, '0', STR_PAD_LEFT);

        echo "Syncing user: $nombres ($email) -> Doc: $documento_numero\n";

        $insert = $conn->prepare("INSERT INTO colaboradores (
            usuario_id, nombres, apellidos, email, documento_numero, documento_tipo, estado, created_at
        ) VALUES (
            :uid, :nom, :ape, :email, :doc, 'DNI', 'Activo', NOW()
        )");

        try {
            $insert->execute([
                ':uid' => $usuario_id,
                ':nom' => $nombres,
                ':ape' => $apellidos,
                ':email' => $email,
                ':doc' => $documento_numero
            ]);
        } catch (PDOException $e) {
            echo "Failed to insert user $usuario_id: " . $e->getMessage() . "\n";
        }
    }

    echo "Sync completed.\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
