<?php
/**
 * Rozwijanie krótkich linków Google Maps (maps.app.goo.gl/…, goo.gl/maps/…).
 *
 * Aplikacja działa w przeglądarce, a przeglądarka nie pozwala stronie odczytać,
 * dokąd prowadzi przekierowanie z obcej domeny. Ten skrypt robi to po stronie
 * serwera: dostaje krótki link, podąża za przekierowaniami i zwraca pełny adres.
 *
 * Wywołanie:  resolve.php?url=https://maps.app.goo.gl/XXXX
 * Odpowiedź:  {"url":"https://www.google.com/maps/dir/…"}   albo   {"error":"…"}
 *
 * Zabezpieczenia:
 *  - skrypt łączy się WYŁĄCZNIE z hostami Google z listy poniżej (nie da się go
 *    użyć do odpytywania innych stron ani sieci wewnętrznej serwera),
 *  - odpowiada tylko stronom z listy $ALLOWED_ORIGINS,
 *  - ma prosty limit zapytań na adres IP.
 */

// ====== KONFIGURACJA — uzupełnij przy wdrożeniu ==============================
// Adresy (origin), pod którymi działa aplikacja. Bez ukośnika na końcu.
// Gdy aplikacja stoi na tej samej domenie co ten skrypt, przeglądarka nie wysyła
// nagłówka Origin dla zwykłych zapytań GET — takie zapytania są przyjmowane.
$ALLOWED_ORIGINS = [
    // 'https://twoja-domena.pl',
    // 'https://rabbitjar.github.io',
];
const RATE_LIMIT_PER_MINUTE = 30;
// =============================================================================

const SHORT_LINK_HOSTS = ['maps.app.goo.gl', 'goo.gl'];
const FINAL_HOSTS = ['www.google.com', 'google.com', 'maps.google.com', 'www.google.pl', 'google.pl'];
const MAX_REDIRECTS = 6;

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Vary: Origin');

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/** Rozkłada adres i sprawdza, że to https bez portu, loginu itp. Zwraca [host, ścieżka] albo null. */
function parse_https_url(string $url): ?array
{
    if (strlen($url) > 4000 || preg_match('/[\x00-\x20]/', $url)) return null;
    $parts = parse_url($url);
    if ($parts === false || ($parts['scheme'] ?? '') !== 'https') return null;
    if (isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) return null;
    $host = strtolower($parts['host'] ?? '');
    if ($host === '') return null;
    return [$host, $parts['path'] ?? '/'];
}

function is_short_link(string $host, string $path): bool
{
    if ($host === 'maps.app.goo.gl') return (bool) preg_match('#^/[A-Za-z0-9_-]{4,64}$#', $path);
    if ($host === 'goo.gl') return (bool) preg_match('#^/maps/[A-Za-z0-9_-]{4,64}$#', $path);
    return false;
}

function is_final_maps_url(string $host, string $path): bool
{
    return in_array($host, FINAL_HOSTS, true) && str_starts_with($path, '/maps');
}

/** Jedno zapytanie bez podążania za przekierowaniem. Zwraca [kod HTTP, nagłówek Location albo null]. */
function fetch_location(string $url): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_NOBODY => false,
        CURLOPT_FOLLOWLOCATION => false, // każdy krok sprawdzamy sami
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_RANGE => '0-0', // treść strony nie jest potrzebna, tylko nagłówki
        CURLOPT_USERAGENT => 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        CURLOPT_HTTPHEADER => ['Accept-Language: pl,en;q=0.8'],
    ]);
    $response = curl_exec($ch);
    if ($response === false) {
        curl_close($ch);
        return [0, null];
    }
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    $location = null;
    if (preg_match('/^location:\s*(\S+)\s*$/mi', substr($response, 0, $headerSize), $m)) $location = $m[1];
    return [$status, $location];
}

/** Prosty limit zapytań na IP (plik w katalogu tymczasowym). */
function rate_limit_ok(string $ip): bool
{
    $file = sys_get_temp_dir() . '/moto-route-resolve-' . hash('sha256', $ip) . '.json';
    $now = time();
    $hits = [];
    $fh = @fopen($file, 'c+');
    if (!$fh) return true; // brak zapisu na dysku — nie blokujemy działania aplikacji
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $decoded = $raw ? json_decode($raw, true) : null;
    if (is_array($decoded)) $hits = array_values(array_filter($decoded, fn ($t) => is_int($t) && $t > $now - 60));
    $ok = count($hits) < RATE_LIMIT_PER_MINUTE;
    if ($ok) $hits[] = $now;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($hits));
    flock($fh, LOCK_UN);
    fclose($fh);
    return $ok;
}

// ---------- dostęp ----------
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $sameOrigin = $origin === $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? '');
    if (!$sameOrigin && !in_array($origin, $ALLOWED_ORIGINS, true)) {
        respond(403, ['error' => 'Ta strona nie ma dostępu do tego skryptu.']);
    }
    header('Access-Control-Allow-Origin: ' . $origin);
}
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET');
    http_response_code(204);
    exit;
}
if ($method !== 'GET') respond(405, ['error' => 'Dozwolone jest tylko zapytanie GET.']);
if (!function_exists('curl_init')) respond(500, ['error' => 'Na serwerze brakuje rozszerzenia PHP cURL.']);
if (!rate_limit_ok($_SERVER['REMOTE_ADDR'] ?? 'unknown')) {
    header('Retry-After: 60');
    respond(429, ['error' => 'Za dużo zapytań. Spróbuj ponownie za minutę.']);
}

// ---------- wejście ----------
$url = $_GET['url'] ?? '';
$parsed = is_string($url) ? parse_https_url($url) : null;
if ($parsed === null || !is_short_link($parsed[0], $parsed[1])) {
    respond(400, ['error' => 'To nie jest krótki link Google Maps (maps.app.goo.gl/… albo goo.gl/maps/…).']);
}

// ---------- podążanie za przekierowaniami, krok po kroku ----------
$current = $url;
for ($hop = 0; $hop < MAX_REDIRECTS; $hop++) {
    [$status, $location] = fetch_location($current);
    if ($status === 0) respond(502, ['error' => 'Nie udało się połączyć z Google. Spróbuj ponownie.']);
    if ($status === 404) respond(404, ['error' => 'Google nie zna tego linku — sprawdź, czy został skopiowany w całości.']);
    if ($status < 300 || $status >= 400 || $location === null) {
        respond(502, ['error' => 'Ten link nie prowadzi do trasy w Google Maps.']);
    }
    // adres względny -> bezwzględny na tym samym hoście
    if (str_starts_with($location, '/')) {
        [$host] = parse_https_url($current);
        $location = 'https://' . $host . $location;
    }
    $next = parse_https_url($location);
    if ($next === null) respond(502, ['error' => 'Google zwrócił nieoczekiwany adres.']);
    [$host, $path] = $next;

    // strona zgody na cookies (serwery w UE): właściwy adres jest w parametrze "continue"
    if ($host === 'consent.google.com') {
        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);
        $continue = is_string($query['continue'] ?? null) ? parse_https_url($query['continue']) : null;
        if ($continue === null) respond(502, ['error' => 'Google zwrócił nieoczekiwany adres.']);
        $location = $query['continue'];
        [$host, $path] = $continue;
    }

    if (is_final_maps_url($host, $path)) respond(200, ['url' => $location]);
    if (!in_array($host, SHORT_LINK_HOSTS, true) && !in_array($host, FINAL_HOSTS, true)) {
        respond(502, ['error' => 'Ten link nie prowadzi do Google Maps.']);
    }
    $current = $location;
}
respond(502, ['error' => 'Zbyt wiele przekierowań.']);
