<?php

class SimpleCache {
    private $cacheDir;
    private $defaultTtl;

    public function __construct($cacheDir = null, $defaultTtl = 300) {
        $this->cacheDir = $cacheDir ?: __DIR__ . '/../../cache_store';
        $this->defaultTtl = $defaultTtl;

        if (!is_dir($this->cacheDir)) {
            mkdir($this->cacheDir, 0755, true);
        }
    }

    public function get($key, $callback = null, $ttl = null) {
        $ttl = $ttl ?: $this->defaultTtl;
        $filename = $this->getFilename($key);

        if (file_exists($filename)) {
            $data = include $filename;
            if ($data['expires_at'] > time()) {
                return $data['content'];
            }
        }

        if (is_callable($callback)) {
             $content = $callback();
             $this->set($key, $content, $ttl);
             return $content;
        }

        return null;
    }

    public function delete($key) {
        $filename = $this->getFilename($key);
        if (file_exists($filename)) {
            unlink($filename);
        }
    }

    public function set($key, $content, $ttl = 300) {
        $filename = $this->getFilename($key);
        $data = [
            'expires_at' => time() + $ttl,
            'content' => $content
        ];
        
        $code = "<?php\nreturn " . var_export($data, true) . ";\n";
        file_put_contents($filename, $code);
    }

    private function getFilename($key) {
        return $this->cacheDir . '/' . md5($key) . '.php';
    }
}
?>
