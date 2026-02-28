<?php
class Nubefact {
    private $ruta;
    private $token;

    // Demo credentials by default
    const DEMO_URL = "https://api.nubefact.com/api/v1/YOUR_UUID_HERE";
    const DEMO_TOKEN = "YOUR_TOKEN_HERE";

    public function __construct($ruta = null, $token = null) {
        $this->ruta = $ruta ?: self::DEMO_URL;
        $this->token = $token ?: self::DEMO_TOKEN;
    }

    public function enviarGuia($data) {
        $json_data = json_encode($data);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->ruta);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array(
            'Content-Type: application/json',
            'Authorization: Token token="' . $this->token . '"'
        ));
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json_data);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

        $respuesta = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error_msg = curl_error($ch);
        curl_close($ch);

        if ($error_msg) {
            return [
                'success' => false,
                'error' => "Curl Error: $error_msg"
            ];
        }

        $response = json_decode($respuesta, true);

        if ($http_code >= 200 && $http_code < 300) {
            return [
                'success' => true,
                'data' => $response
            ];
        } else {
            return [
                'success' => false,
                'error' => $response['errors'] ?? $respuesta,
                'code' => $http_code
            ];
        }
    }
}
?>
