<?php
include_once '../config/db.php';

try {
    $sql = "CREATE TABLE IF NOT EXISTS system_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(50) NOT NULL UNIQUE,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )";
    $conn->exec($sql);
    echo "Table system_settings created or already exists.\n";

    // Insert default WP API Key if not exists
    $stmt = $conn->prepare("SELECT COUNT(*) FROM system_settings WHERE setting_key = 'crm_wp_api_key'");
    $stmt->execute();
    if ($stmt->fetchColumn() == 0) {
        $defaultKey = 'wp_erp_' . bin2hex(random_bytes(16));
        $stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES ('crm_wp_api_key', ?)");
        $stmt->execute([$defaultKey]);
        echo "Default API Key inserted: $defaultKey\n";
    } else {
        echo "API Key already exists.\n";
    }

} catch(PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>