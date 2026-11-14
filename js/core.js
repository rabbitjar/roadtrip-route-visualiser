"use strict";
/* Czyste funkcje (bez DOM i sieci): parsery i matematyka trasy.
   Ładowane w przeglądarce jako zwykły skrypt, w Node (testy) przez module.exports. */

/* ---------- 1) Parser linku Google Maps ---------- */
const TRAVEL_MODE_MAP = { 0: "driving", 1: "cycling", 2: "walking", 3: "transit" };

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
  // Krótkie linki nie zawierają współrzędnych — trzeba je najpierw rozwinąć.
  // Strona nie może zrobić tego sama (przeglądarka blokuje odczyt przekierowania
  // z obcej domeny), więc zamiast ogólnego "nie znalazłem współrzędnych"
  // mówimy dokładnie, co zrobić.
  if (/(^|\.)goo\.gl$/i.test(parsedUrl.hostname)) {
    throw new Error(
      "To krótki link (" + parsedUrl.hostname + "), który nie zawiera punktów trasy.\n" +
      "Otwórz go w przeglądarce, poczekaj, aż mapa się załaduje, i skopiuj pełny adres z paska adresu " +
      "(zaczyna się od https://www.google.com/maps/dir/…)."
    );
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

/* ---------- Oś czasu animacji (czyste funkcje — bez zegara, bez DOM) ---------- */

// Pozycje punktów trasy jako ułamek całej trasy (0..1), liczone z odcinków
// ("legs") zwróconych przez router: punkt i leży dokładnie na końcu odcinka i-1.
// To jedyny pewny sposób przy pętlach (start = meta) i trasach, które dwa razy
// przechodzą przez to samo miejsce — szukanie "najbliższego punktu geometrii"
// zwracało wtedy pierwsze trafienie, czyli np. metę na samym starcie.
function waypointFractionsFromLegs(legs) {
  const lengths = (legs || []).map((l) => Math.max(0, Number(l?.distance) || 0));
  const total = lengths.reduce((a, b) => a + b, 0);
  const fractions = [0];
  let acc = 0;
  lengths.forEach((len, i) => {
    acc += len;
    // gdy cała trasa ma długość 0, rozkładamy punkty równomiernie zamiast dzielić przez zero
    fractions.push(total > 0 ? Math.min(acc / total, 1) : (i + 1) / lengths.length);
  });
  return fractions;
}

// Zapasowy wariant bez "legs" (np. ślad GPX): dopasowuje punkty do geometrii
// PO KOLEI — każdy kolejny punkt szukany jest dopiero od miejsca poprzedniego,
// dzięki czemu pętla też dostaje rosnące pozycje.
function monotonicWaypointFractions(coords, cum, waypoints) {
  const total = cum[cum.length - 1];
  let from = 0;
  return waypoints.map((w, wi) => {
    if (wi === 0) return 0;
    if (wi === waypoints.length - 1) return 1;
    let best = from, bestDist = Infinity;
    for (let i = from; i < coords.length; i++) {
      const d = haversineMeters(coords[i], [w.lng, w.lat]);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    from = best;
    return total > 0 ? cum[best] / total : 0;
  });
}

// Buduje oś czasu animacji: odcinki jazdy przeplatane pokazami zdjęć.
// stops: [{ index, dist, hasMedia }] — dist w tych samych jednostkach co total.
// Każdy przystanek ze zdjęciem dostaje WŁASNY odcinek "reveal", więc dwa zdjęcia
// w tym samym miejscu pokazują się jedno po drugim (wcześniej drugie przepadało).
function buildTimeline({ total, travelMs, stops, revealMs = 0, startHoldMs = 0, endHoldMs = 0 }) {
  const sorted = stops
    .map((s) => ({ ...s, dist: Math.max(0, Math.min(Number(s.dist) || 0, total)) }))
    .sort((a, b) => a.dist - b.dist || a.index - b.index);
  const segments = [];
  const marks = {};
  let t = 0, d = 0;
  if (startHoldMs > 0) {
    segments.push({ type: "start", t0: 0, t1: startHoldMs, d0: 0, d1: 0 });
    t = startHoldMs;
  }
  const travelTo = (dist) => {
    if (dist <= d) return;
    const dt = total > 0 ? ((dist - d) / total) * travelMs : 0;
    segments.push({ type: "travel", t0: t, t1: t + dt, d0: d, d1: dist });
    t += dt;
    d = dist;
  };
  for (const s of sorted) {
    travelTo(s.dist);
    marks[s.index] = { tReveal: t, tSettle: t };
    if (s.hasMedia && revealMs > 0) {
      segments.push({ type: "reveal", t0: t, t1: t + revealMs, d0: d, d1: d, stopIndex: s.index });
      t += revealMs;
      marks[s.index].tSettle = t;
    }
  }
  travelTo(total);
  segments.push({ type: "end", t0: t, t1: t + endHoldMs, d0: total, d1: total });
  return { segments, marks, total, totalMs: t + endHoldMs };
}

// Stan animacji w chwili t (ms): rodzaj odcinka, przebyty dystans, czas od początku odcinka.
function timelineStateAt(timeline, t) {
  const segs = timeline.segments;
  const time = Math.max(0, Math.min(t, timeline.totalMs));
  let seg = segs[segs.length - 1];
  for (const s of segs) {
    if (time < s.t1) { seg = s; break; }
  }
  const span = seg.t1 - seg.t0;
  const local = span > 0 ? Math.min(Math.max((time - seg.t0) / span, 0), 1) : 1;
  return {
    type: seg.type,
    dist: seg.d0 + (seg.d1 - seg.d0) * local,
    elapsed: time - seg.t0,
    local,
    stopIndex: seg.stopIndex ?? null,
    progress: timeline.totalMs > 0 ? time / timeline.totalMs : 1,
  };
}

// "5 h 20 min" zamiast "5.3 h"
function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return "—";
  const totalMin = Math.max(0, Math.round((Number(seconds) || 0) / 60));
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function clampNumber(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

// liczba po polsku: przecinek dziesiętny, bez zbędnych zer ("12,4", "7")
function formatDecimalPl(v, digits = 1) {
  return (Math.round(v * 10 ** digits) / 10 ** digits).toString().replace(".", ",");
}

/* ---------- Trasa w linii prostej (samolot, kajak, prom) ---------- */

// Punkty na ortodromie (najkrótszej drodze po kuli) między a i b.
function greatCirclePath([lng1, lat1], [lng2, lat2], segments) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const p1 = toRad(lat1), l1 = toRad(lng1), p2 = toRad(lat2), l2 = toRad(lng2);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2
  ));
  if (!(d > 0) || segments < 1) return [[lng1, lat1], [lng2, lat2]];
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    points.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.hypot(x, y)))]);
  }
  points[0] = [lng1, lat1];
  points[points.length - 1] = [lng2, lat2];
  return points;
}

// Trasa łącząca punkty liniami prostymi — liczona lokalnie, bez serwera routingu.
function buildStraightRoute(waypoints) {
  const coordinates = [];
  const legs = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = [waypoints[i].lng, waypoints[i].lat];
    const b = [waypoints[i + 1].lng, waypoints[i + 1].lat];
    const distance = haversineMeters(a, b);
    const segments = Math.max(1, Math.min(Math.ceil(distance / 20000), 200)); // punkt co ~20 km
    const path = greatCirclePath(a, b, segments);
    coordinates.push(...(i === 0 ? path : path.slice(1)));
    legs.push({ distance });
  }
  // ciągłość długości geograficznej przy przekraczaniu 180° (bez skoku linii przez całą mapę)
  for (let k = 1; k < coordinates.length; k++) {
    while (coordinates[k][0] - coordinates[k - 1][0] > 180) coordinates[k][0] -= 360;
    while (coordinates[k][0] - coordinates[k - 1][0] < -180) coordinates[k][0] += 360;
  }
  return {
    coordinates,
    distanceMeters: legs.reduce((sum, l) => sum + l.distance, 0),
    durationSeconds: null, // nie zgadujemy czasu przelotu/przeprawy
    waypointFractions: waypointFractionsFromLegs(legs),
  };
}

/* ---------- Trasa ze śladu GPX ---------- */
const GPX_MAX_POINTS = 20000;

// trackPoints: [{ lat, lng, time? (ms) }], namedPoints: [{ lat, lng, name }]
function buildGpxRoute(trackPoints, namedPoints = [], maxStops = 20) {
  let pts = trackPoints.filter((p) => isValidLatLng(p.lat, p.lng));
  if (pts.length < 2) throw new Error("W pliku GPX nie ma śladu ani trasy (potrzebne są co najmniej 2 punkty).");
  const first = pts[0], last = pts[pts.length - 1];
  if (pts.length > GPX_MAX_POINTS) {
    const stride = Math.ceil(pts.length / GPX_MAX_POINTS);
    pts = pts.filter((_, i) => i % stride === 0 || i === pts.length - 1);
  }
  const coordinates = pts.map((p) => [p.lng, p.lat]);
  const cum = buildCumulativeDistances(coordinates);
  const total = cum[cum.length - 1];
  if (!(total > 0)) throw new Error("Ślad GPX ma zerową długość — wszystkie punkty są w tym samym miejscu.");

  const stops = namedPoints
    .filter((p) => isValidLatLng(p.lat, p.lng))
    .slice(0, maxStops)
    .map((p) => {
      let best = 0, bestDist = Infinity;
      for (let i = 0; i < coordinates.length; i++) {
        const d = haversineMeters(coordinates[i], [p.lng, p.lat]);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return { name: String(p.name || "Punkt").trim().slice(0, 80) || "Punkt", lat: p.lat, lng: p.lng, frac: cum[best] / total };
    })
    .sort((a, b) => a.frac - b.frac);

  const elapsed = Number.isFinite(first.time) && Number.isFinite(last.time) ? (last.time - first.time) / 1000 : null;
  return {
    route: {
      coordinates,
      distanceMeters: total,
      durationSeconds: elapsed > 0 ? elapsed : null,
      waypointFractions: [0, ...stops.map((s) => s.frac), 1],
    },
    waypoints: [
      { name: "Start", lat: first.lat, lng: first.lng },
      ...stops.map(({ name, lat, lng }) => ({ name, lat, lng })),
      { name: "Meta", lat: last.lat, lng: last.lng },
    ],
  };
}

/* ---------- Link do trasy (punkty zakodowane w adresie, po znaku #) ---------- */
const SHARED_ROUTE_MAX_WAYPOINTS = 60;
const TRAVEL_MODES = ["driving", "cycling", "walking", "straight"];
const WAYPOINT_KINDS = ["start", "finish", "empty"];

function base64UrlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(encoded) {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function encodeSharedRoute({ mode, waypoints, title }) {
  const round = (v) => Math.round(v * 1e5) / 1e5;
  const payload = {
    v: 1,
    m: mode,
    w: waypoints.map((w) => [round(w.lat), round(w.lng), String(w.name ?? "").slice(0, 80), w.kind ?? ""]),
  };
  if (title) payload.t = String(title).slice(0, 80);
  return base64UrlEncode(JSON.stringify(payload));
}

// Link może przyjść od kogokolwiek, więc każdą wartość sprawdzamy i przycinamy;
// nazwy są dalej traktowane wyłącznie jako tekst (nigdy HTML).
function decodeSharedRoute(encoded) {
  const bad = () => new Error("Link do trasy jest uszkodzony albo niekompletny.");
  let data;
  try {
    if (typeof encoded !== "string" || encoded.length > 20000) throw bad();
    data = JSON.parse(base64UrlDecode(encoded));
  } catch {
    throw bad();
  }
  if (!data || data.v !== 1 || !Array.isArray(data.w)) throw bad();
  if (data.w.length < 2 || data.w.length > SHARED_ROUTE_MAX_WAYPOINTS) throw bad();
  const waypoints = data.w.map((item, i) => {
    if (!Array.isArray(item)) throw bad();
    const [lat, lng, name, kind] = item;
    if (typeof lat !== "number" || typeof lng !== "number" || !isValidLatLng(lat, lng)) throw bad();
    return {
      lat,
      lng,
      name: (typeof name === "string" ? name : "").slice(0, 80) || `Punkt ${i + 1}`,
      kind: WAYPOINT_KINDS.includes(kind) ? kind : null,
    };
  });
  return {
    mode: TRAVEL_MODES.includes(data.m) ? data.m : "driving",
    waypoints,
    title: typeof data.t === "string" ? data.t.slice(0, 80) : "",
  };
}

/* ---------- Kamera podążająca za pojazdem ---------- */
function smoothstep(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

// 0 = kadr z całą trasą, 1 = kamera na pojeździe. Płynne wejście po starcie
// jazdy i płynny powrót do całej trasy tuż przed końcową klatką.
function followCameraBlend(timeline, t, rampMs = 1400) {
  const segs = timeline.segments;
  const firstMoving = segs.find((s) => s.type !== "start");
  const end = segs[segs.length - 1];
  const rampIn = smoothstep((t - firstMoving.t0) / rampMs);
  const rampOut = smoothstep((end.t0 - t) / rampMs);
  return Math.max(0, Math.min(rampIn, rampOut));
}

// dzieli tekst na wiersze mieszczące się w zadanej szerokości; measure(text) -> px
function wrapText(text, maxWidth, measure, maxLines = 3) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || measure(candidate) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/.{0,2}$/, "…");
    return kept;
  }
  return lines;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseGoogleMapsLink, haversineMeters, buildCumulativeDistances, indexAtDistance,
    positionAtDistance, bearingDegrees, headingAtDistance, trailUpToDistance,
    resampleByDistance, distanceAlongForWaypoint, isValidLatLng, parseLatLngPaste,
    formatPlaceLabel, parseDecimalInput, formatNum, escapeHtml, safeDecodeURIComponent,
    waypointFractionsFromLegs, monotonicWaypointFractions, buildTimeline, timelineStateAt,
    formatDuration, clampNumber, formatDecimalPl,
    greatCirclePath, buildStraightRoute, buildGpxRoute, encodeSharedRoute, decodeSharedRoute,
    smoothstep, followCameraBlend, wrapText, TRAVEL_MODES,
  };
}
