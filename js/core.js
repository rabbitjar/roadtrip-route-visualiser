"use strict";
/* Czyste funkcje (bez DOM i sieci): parsery i matematyka trasy.
   Ładowane w przeglądarce jako zwykły skrypt, w Node (testy) przez module.exports. */

/* ---------- 1) Parser linku Google Maps ---------- */
const TRAVEL_MODE_MAP = { 0: "driving", 1: "walking", 2: "bicycling", 3: "transit" };

function parseGoogleMapsLink(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("To nie wygląda na poprawny link. Wklej pełny adres zaczynający się od https://");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("Obsługuję tylko linki http(s) do Google Maps.");
  }
  const { pathname } = parsedUrl;

  const pathMatch = pathname.match(/\/maps\/dir\/(.+?)\/data=/);
  const names = pathMatch
    ? pathMatch[1]
        .split("/")
        .filter((seg) => !seg.startsWith("@"))
        .map((seg) => safeDecodeURIComponent(seg).replace(/\+/g, " "))
        .map((seg) => seg.split(",")[0].trim().slice(0, 80))
    : [];

  const coords = [];
  const reA = /!8m2!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g;
  let m;
  while ((m = reA.exec(url)) !== null) {
    coords.push({ lat: parseFloat(m[1]), lng: parseFloat(m[2]) });
  }
  if (coords.length === 0) {
    const reB = /!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g;
    while ((m = reB.exec(url)) !== null) {
      coords.push({ lat: parseFloat(m[2]), lng: parseFloat(m[1]) });
    }
  }
  if (coords.length === 0) {
    throw new Error(
      "Nie znalazłem żadnych współrzędnych w tym linku.\n" +
      "- jeśli to krótki link (maps.app.goo.gl), otwórz go najpierw w przeglądarce i wklej pełny URL,\n" +
      "- to może być link do pojedynczego miejsca, a nie do trasy."
    );
  }

  const waypoints = coords.map((c, i) => ({
    name: names[i] ?? `Punkt ${i + 1}`,
    lat: c.lat,
    lng: c.lng,
  }));

  const modeMatch = url.match(/!3e(\d)/);
  const travelMode = modeMatch ? (TRAVEL_MODE_MAP[modeMatch[1]] ?? "unknown") : "unknown";
  return { travelMode, waypoints };
}

/* ---------- 3) Matematyka animacji: dystans, interpolacja, heading ---------- */
function haversineMeters([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildCumulativeDistances(coords) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(coords[i - 1], coords[i]));
  }
  return cum;
}

// binary search: indeks pierwszego punktu, którego dystans skumulowany >= dist
function indexAtDistance(cum, dist) {
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < dist) lo = mid + 1; else hi = mid;
  }
  return Math.max(1, lo);
}

// pozycja po przebyciu `dist` metrów wzdłuż trasy — liniowa interpolacja
// między dwoma najbliższymi punktami geometrii drogowej
function positionAtDistance(coords, cum, dist) {
  const total = cum[cum.length - 1];
  dist = Math.max(0, Math.min(dist, total));
  const i = indexAtDistance(cum, dist);
  const segStart = cum[i - 1], segEnd = cum[i];
  const t = segEnd === segStart ? 0 : (dist - segStart) / (segEnd - segStart);
  const [lng1, lat1] = coords[i - 1];
  const [lng2, lat2] = coords[i];
  return [lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t];
}

function bearingDegrees([lng1, lat1], [lng2, lat2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// heading liczony na trasie INTERPOLOWANEJ (nie z surowych punktów GPX/OSRM),
// żeby gęste/nierówne punkty nie powodowały "drgania" ikony
function headingAtDistance(coords, cum, dist, lookaheadM = 50) {
  const total = cum[cum.length - 1];
  const p1 = positionAtDistance(coords, cum, dist);
  const p2 = positionAtDistance(coords, cum, Math.min(dist + lookaheadM, total));
  if (p1[0] === p2[0] && p1[1] === p2[1]) return null;
  return bearingDegrees(p1, p2);
}

// trasa "narysowana dotąd" — pełne punkty do bieżącej pozycji + dokładny punkt bieżący
function trailUpToDistance(coords, cum, dist) {
  const i = indexAtDistance(cum, dist);
  const trail = coords.slice(0, i);
  trail.push(positionAtDistance(coords, cum, dist));
  return trail;
}

// przepróbkowanie trasy do stałej liczby RÓWNOMIERNIE rozłożonych (wg dystansu) punktów.
// Kluczowe dla wydajności animacji: OSRM potrafi zwrócić kilka tysięcy punktów na długiej
// trasie, a przeliczanie/rysowanie śladu z takiej liczby punktów co klatkę powoduje
// zacinanie się animacji na telefonie. 300 punktów wystarcza na płynną krzywiznę
// w 5-10s filmie, a każda klatka animacji robi się dużo tańsza.
function resampleByDistance(coords, cum, numPoints) {
  const total = cum[cum.length - 1];
  const result = [];
  for (let i = 0; i < numPoints; i++) {
    const d = (i / (numPoints - 1)) * total;
    result.push(positionAtDistance(coords, cum, d));
  }
  return result;
}

// dla każdego przystanku znajdź najbliższy punkt na trasie i jego dystans-wzdłuż-trasy
// (waypointy pochodzą z linku Google, trasa z OSRM — mogą się nieznacznie różnić,
// więc szukamy najbliższego dopasowania zamiast zakładać identyczne współrzędne)
function distanceAlongForWaypoint(coords, cum, waypointLngLat) {
  let bestDist = Infinity;
  let bestCum = 0;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineMeters(coords[i], waypointLngLat);
    if (d < bestDist) {
      bestDist = d;
      bestCum = cum[i];
    }
  }
  return bestCum;
}

function isValidLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// Odporne rozpoznawanie lokalizacji wklejonej z różnych źródeł:
// 1) link Google Maps do miejsca (.../@lat,lng,zoom/...)
// 2) link Google Maps do trasy (oba znane formaty !8m2!3d..!4d.. i !1d..!2d..)
// 3) zwykła para współrzędnych — obsługuje ZARÓWNO kropkę, jak i przecinek jako
//    separator dziesiętny (telefon użytkownika w polskiej lokalizacji zapisuje
//    to jako "52,2287693, 21,0176869" — cztery liczby rozdzielone przecinkami,
//    nie dwie, więc proste split(",") tu zawodzi). Wyszukujemy każdą liczbę jako
//    samodzielny token wzorcem, nie dzielimy całego stringa po przecinku.
function parseLatLngPaste(str) {
  const s = String(str).trim();

  const atMatch = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]), lng = parseFloat(atMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  const m8 = s.match(/!8m2!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m8) {
    const lat = parseFloat(m8[1]), lng = parseFloat(m8[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }
  const m1 = s.match(/!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/);
  if (m1) {
    const lng = parseFloat(m1[1]), lat = parseFloat(m1[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  const numMatches = s.match(/-?\d+[.,]\d+/g);
  if (numMatches && numMatches.length === 2) {
    const lat = parseFloat(numMatches[0].replace(",", "."));
    const lng = parseFloat(numMatches[1].replace(",", "."));
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  return null;
}

function formatPlaceLabel(props) {
  const parts = [props.name];
  const locality = props.city || props.district || props.county;
  if (locality && locality !== props.name) parts.push(locality);
  if (props.state && !parts.includes(props.state)) parts.push(props.state);
  if (props.country && !parts.includes(props.country)) parts.push(props.country);
  return parts.filter(Boolean).join(", ");
}

function parseDecimalInput(str, fallback) {
  const n = parseFloat(String(str).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function formatNum(v) {
  return (Math.round(v * 100) / 100).toString();
}

// Zamienia znaki specjalne HTML na encje. Każda wartość spoza naszego kodu
// (nazwy z wklejonego linku, nazwy plików, odpowiedzi zewnętrznych API), która
// trafia do szablonu wstawianego przez innerHTML, MUSI przejść przez tę funkcję.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"'`]/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;",
  })[ch]);
}

// decodeURIComponent rzuca wyjątek na niepoprawnych sekwencjach (np. "%E0%A4%A");
// nazwa punktu to tylko etykieta, więc w takim wypadku zostawiamy surowy tekst
function safeDecodeURIComponent(str) {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseGoogleMapsLink, haversineMeters, buildCumulativeDistances, indexAtDistance,
    positionAtDistance, bearingDegrees, headingAtDistance, trailUpToDistance,
    resampleByDistance, distanceAlongForWaypoint, isValidLatLng, parseLatLngPaste,
    formatPlaceLabel, parseDecimalInput, formatNum, escapeHtml, safeDecodeURIComponent,
  };
}
