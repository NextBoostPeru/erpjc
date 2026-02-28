<?php
class SunatService {
    private $token;
    private $apiUrl;

    public function __construct($token = '', $url = 'https://apiperu.dev/api/') {
        $this->token = $token;
        $this->apiUrl = $url;
    }

    private function isNubefactToken($token) {
        // Nubefact tokens are typically 64 characters hex
        return preg_match('/^[a-f0-9]{64}$/i', $token);
    }

    public function consultarRUC($ruc) {
        // If the URL is explicitly ApiPeruDev, we trust the token is correct for it.
        
        $result = $this->makeRequest($ruc, 'ruc');
        
        // If primary API failed, try fallbacks
        if (!$result['success']) {
             $fallback = $this->tryFreeEndpoints($ruc, 'ruc');
             if ($fallback['success']) {
                 return $fallback;
             }
             
             // If fallback also failed and token looked like Nubefact, give hint
             if ($this->isNubefactToken($this->token)) {
                 return [
                     'success' => false,
                     'message' => "El token configurado parece ser de Nubefact y no funciona para consultas. Por favor configure el token de ApiPeruDev."
                 ];
             }
        }

        return $result;
    }

    public function consultarDNI($dni) {
        $result = $this->makeRequest($dni, 'dni');

        if (!$result['success']) {
             $fallback = $this->tryFreeEndpoints($dni, 'dni');
             if ($fallback['success']) {
                 return $fallback;
             }
        }
        
        return $result;
    }

    private function makeRequest($doc, $type) {
        $curl = curl_init();
        
        $url = rtrim($this->apiUrl, '/') . "/$type/" . $doc;

        curl_setopt_array($curl, array(
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => 'GET',
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_HTTPHEADER => array(
                'Authorization: Bearer ' . $this->token,
                'Content-Type: application/json',
                'Accept: application/json'
            ),
        ));

        $response = curl_exec($curl);
        $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $err = curl_error($curl);
        curl_close($curl);

        if ($err) {
            return ['success' => false, 'message' => "Error de conexión: " . $err];
        }

        if ($httpCode !== 200) {
            return ['success' => false, 'message' => "Error API ($httpCode)"];
        }

        $data = json_decode($response, true);
        
        if ($type === 'ruc') {
            return $this->parseRucResponse($data);
        } else {
            return $this->parseDniResponse($data);
        }
    }

    private function tryFreeEndpoints($doc, $type) {
        // List of potential free endpoints (some might require different parsing)
        // Note: These are unstable and might break. Best effort fallback.
        $endpoints = [];
        
        if ($type === 'ruc') {
             $endpoints = [
                 "https://api.sunat.dev/ruc/$doc",
                 "https://api.peruonline.com/v1/ruc/$doc",
                 "https://consultaruc.win/api/ruc/$doc"
             ];
        } else {
             $endpoints = [
                 "https://api.sunat.dev/dni/$doc",
                 "https://api.peruonline.com/v1/dni/$doc"
             ];
        }

        foreach ($endpoints as $url) {
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_TIMEOUT, 5);
            $res = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($code === 200 && $res) {
                $data = json_decode($res, true);
                if ($data) {
                    if ($type === 'ruc') {
                        // Normalize various free API formats
                        return [
                            'success' => true,
                            'razon_social' => $data['razon_social'] ?? $data['nombre'] ?? '',
                            'direccion' => $data['direccion'] ?? $data['domicilio_fiscal'] ?? '',
                            'estado' => $data['estado'] ?? 'ACTIVO',
                            'condicion' => $data['condicion'] ?? 'HABIDO',
                            'ubigeo' => $data['ubigeo'] ?? '',
                            'departamento' => $data['departamento'] ?? '',
                            'provincia' => $data['provincia'] ?? '',
                            'distrito' => $data['distrito'] ?? ''
                        ];
                    } else {
                        return [
                            'success' => true,
                            'razon_social' => $data['nombre_completo'] ?? ($data['nombres'] . ' ' . $data['apellido_paterno'] . ' ' . $data['apellido_materno']),
                            'nombres' => $data['nombres'] ?? '',
                            'apellido_paterno' => $data['apellido_paterno'] ?? '',
                            'apellido_materno' => $data['apellido_materno'] ?? '',
                            'direccion' => '',
                            'estado' => 'ACTIVO',
                            'condicion' => 'HABIDO'
                        ];
                    }
                }
            }
        }

        return ['success' => false, 'message' => 'No se pudo consultar en servicios gratuitos'];
    }

    private function parseRucResponse($data) {
        if (isset($data['success']) && $data['success']) {
            $apiData = $data['data'];
            return [
                'success' => true,
                'razon_social' => $apiData['nombre_o_razon_social'] ?? $apiData['razon_social'] ?? '',
                'direccion' => $apiData['direccion_completa'] ?? '',
                'estado' => $apiData['estado'] ?? '',
                'condicion' => $apiData['condicion'] ?? '',
                'ubigeo' => $apiData['ubigeo'] ?? [],
                'departamento' => $apiData['departamento'] ?? '',
                'provincia' => $apiData['provincia'] ?? '',
                'distrito' => $apiData['distrito'] ?? '',
                'anexos' => $apiData['anexos'] ?? []
            ];
        } else {
             // Fallback for flat structure
             if (isset($data['nombre_o_razon_social'])) {
                return [
                    'success' => true,
                    'razon_social' => $data['nombre_o_razon_social'],
                    'direccion' => $data['direccion_completa'] ?? '',
                    'estado' => $data['estado'] ?? '',
                    'condicion' => $data['condicion'] ?? '',
                    'anexos' => $data['anexos'] ?? []
                ];
             }
             return ['success' => false, 'message' => $data['message'] ?? 'No se encontraron datos'];
        }
    }

    private function parseDniResponse($data) {
        if (isset($data['success']) && $data['success']) {
            $apiData = $data['data'];
            return [
                'success' => true,
                'razon_social' => $apiData['nombre_completo'] ?? ($apiData['nombres'] . ' ' . $apiData['apellido_paterno'] . ' ' . $apiData['apellido_materno']),
                'nombres' => $apiData['nombres'] ?? '',
                'apellido_paterno' => $apiData['apellido_paterno'] ?? '',
                'apellido_materno' => $apiData['apellido_materno'] ?? '',
                'direccion' => $apiData['direccion'] ?? '',
                'estado' => 'ACTIVO',
                'condicion' => 'HABIDO'
            ];
        }
        return ['success' => false, 'message' => $data['message'] ?? 'No se encontraron datos'];
    }

    public function consultarTipoCambio($fecha) {
        // Keep existing logic or improve
        $curl = curl_init();
        curl_setopt_array($curl, array(
            CURLOPT_URL => "https://apiperu.dev/api/tipo_de_cambio",
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => 'POST',
            CURLOPT_POSTFIELDS => json_encode(['fecha' => $fecha]),
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_HTTPHEADER => array(
                'Authorization: Bearer ' . $this->token,
                'Content-Type: application/json',
                'Accept: application/json'
            ),
        ));
        $response = curl_exec($curl);
        $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        
        if ($httpCode !== 200) return ['success' => false, 'message' => 'Error API'];
        
        $data = json_decode($response, true);
        if (isset($data['success']) && $data['success']) {
            $apiData = $data['data'];
            return [
                'success' => true,
                'compra' => $apiData['compra'],
                'venta' => $apiData['venta'],
                'fecha' => $apiData['fecha_busqueda'],
                'moneda' => $apiData['moneda']
            ];
        }
        return ['success' => false, 'message' => 'No encontrado'];
    }
}

