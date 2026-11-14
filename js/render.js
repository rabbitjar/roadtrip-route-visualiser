"use strict";

/* ---------- 4) Biblioteka ikon aktywności ---------- */
// Źródło: Tabler Icons (MIT, https://tabler.io/icons) — same ścieżki co w oryginalnych
// plikach SVG tej biblioteki. Wyjątek: "kitesurfing" nie istnieje w Tabler ani w
// Material Symbols (sprawdzone), więc dorysowałem własną ikonę w tym samym stylu
// (viewBox 24x24, stroke 2, zaokrąglone końce), żeby całość wyglądała spójnie.
const ICON_LIBRARY = {
  walk: {
    label: "Pieszo",
    paths: [
      "M12 4a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
      "M7 21l3 -4",
      "M16 21l-2 -4l-3 -3l1 -6",
      "M6 12l2 -3l4 -1l3 3l3 1",
    ],
    sideView: false,
  },
  bike: {
    label: "Rower",
    paths: [
      "M2 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0",
      "M16 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0",
      "M12 19v-4l-3 -3l5 -4l2 3h3",
      "M13.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    ],
    sideView: true,
  },
  "roller-skating": {
    label: "Rolki",
    paths: [
      "M5.905 5h3.418a1 1 0 0 1 .928 .629l1.143 2.856a3 3 0 0 0 2.207 1.83l4.717 .926a2.084 2.084 0 0 1 1.682 2.045v.714a1 1 0 0 1 -1 1h-13.895a1 1 0 0 1 -1 -1.1l.8 -8a1 1 0 0 1 1 -.9",
      "M6 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
      "M14 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    ],
    sideView: true,
  },
  kayak: {
    label: "Kajak / kanu",
    paths: [
      "M6.414 6.414a2 2 0 0 0 0 -2.828l-1.414 -1.414l-2.828 2.828l1.414 1.414a2 2 0 0 0 2.828 0",
      "M17.586 17.586a2 2 0 0 0 0 2.828l1.414 1.414l2.828 -2.828l-1.414 -1.414a2 2 0 0 0 -2.828 0",
      "M6.5 6.5l11 11",
      "M22 2.5c-9.983 2.601 -17.627 7.952 -20 19.5c9.983 -2.601 17.627 -7.952 20 -19.5",
      "M6.5 12.5l5 5",
      "M12.5 6.5l5 5",
    ],
    sideView: false,
  },
  kitesurfing: {
    label: "Kitesurfing",
    paths: [
      "M4 5c4 -3.2 12 -3.2 16 0c-2.5 3.6 -5.7 5.2 -8 5.2c-2.3 0 -5.5 -1.6 -8 -5.2z",
      "M8.5 6.3l3.5 4",
      "M15.5 6.3l-3.5 4",
      "M12 10.3v6.2",
      "M8.5 19.5h7",
      "M3.5 21.5c1.3 -1.2 2.6 -1.2 4 0c1.3 1.2 2.6 1.2 4 0c1.3 -1.2 2.6 -1.2 4 0c1.3 1.2 2.6 1.2 4 0",
    ],
    sideView: false,
    custom: true,
  },
  motorbike: {
    label: "Motocykl",
    paths: [
      "M2 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
      "M16 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
      "M7.5 14h5l4 -4h-10.5m1.5 4l4 -4",
      "M13 6h2l1.5 3l2 4",
    ],
    sideView: true,
  },
  car: {
    label: "Samochód",
    paths: [
      "M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
      "M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
      "M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5",
    ],
    sideView: true,
  },
  "car-off-road": {
    label: "Terenowy",
    paths: [
      "M9 17h6",
      "M9 17a2 2 0 1 1 -4 0a2 2 0 0 1 4 0",
      "M19 17a2 2 0 1 1 -4 0a2 2 0 0 1 4 0",
      "M17 10l-2 -3",
      "M19 17h2v-5a2 2 0 0 0 -2 -2h-5v2h-2.586a1 1 0 0 1 -.707 -.293l-1.121 -1.121a2 2 0 0 0 -1.414 -.586h-4.172a1 1 0 0 0 -1 1v6h2",
    ],
    sideView: true,
  },
  plane: {
    label: "Samolot",
    paths: [
      "M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3l4 7",
    ],
    sideView: true,
  },
  horse: {
    label: "Koń",
    paths: [
      "M7 10l-.85 8.507a1.357 1.357 0 0 0 1.35 1.493h.146a2 2 0 0 0 1.857 -1.257l.994 -2.486a2 2 0 0 1 1.857 -1.257h1.292a2 2 0 0 1 1.857 1.257l.994 2.486a2 2 0 0 0 1.857 1.257h.146a1.37 1.37 0 0 0 1.364 -1.494l-.864 -9.506h-8c0 -3 -3 -5 -6 -5l-3 6l2 2l3 -2",
      "M22 14v-2a3 3 0 0 0 -3 -3",
    ],
    sideView: true,
  },
};

let selectedIconKey = "motorbike";
let iconScale = 0.4; // sterowane suwakiem w UI

function buildIconSvg(paths, flip) {
  const inner = paths.map((d) => `<path d="${d}"/>`).join("");
  const transform = flip ? ' transform="translate(24,0) scale(-1,1)"' : "";
  // odznaka: białe kółko z cienką obwódką + ciemna ikonka wyśrodkowana w środku
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="16" cy="16" r="14.5" fill="#ffffff" stroke="#d7d7d7" stroke-width="1.2"/>
    <g transform="translate(7,7) scale(0.75)">
      <g${transform}>
        <g stroke="#1b1f23" stroke-width="2.3">${inner}</g>
      </g>
    </g>
  </svg>`;
}

function svgToImage(svgString) {
  return new Promise((resolve, reject) => {
    const img = new Image(96, 96);
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// znacznik jazdy (motocykl/samochód/etc.) jest rysowany BEZPOŚREDNIO na
// stageCanvas (patrz drawMotoMarker), tak jak przystanki — NIE jako natywna
// warstwa symboli MapLibre. Wcześniej był warstwą "moto-marker" ze źródłem
// GeoJSON podmienianym co klatkę animacji (setData()); to zmuszało MapLibre
// do przebudowy kafla/bucketu i przeliczenia kolizji symboli 60x/s, co przy
// realnym obciążeniu potrafiło losowo wyrenderować znacznik jako maleńką
// ikonkę zamiast pełnego kółka (albo w ogóle go pominąć) — zarówno w
// podglądzie live, jak i w nagranym wideo. Rysowanie własnoręcznie na
// canvasie omija cały ten mechanizm i jest deterministyczne.
const iconImages = {}; // key / key+"-flip" -> gotowy <img> (z białym kółkiem w tle)

let iconsLoadingPromise = null;
async function loadAllActivityIcons() {
  if (iconsLoadingPromise) return iconsLoadingPromise;
  iconsLoadingPromise = (async () => {
    for (const [key, def] of Object.entries(ICON_LIBRARY)) {
      if (!iconImages[key]) {
        iconImages[key] = await svgToImage(buildIconSvg(def.paths, false));
      }
      if (!iconImages[key + "-flip"]) {
        iconImages[key + "-flip"] = await svgToImage(buildIconSvg(def.paths, true));
      }
    }
  })();
  return iconsLoadingPromise;
}

// bearing (0-360, busola) -> { flip, rotate } tak, by ikona widziana z boku
// NIGDY nie wyświetlała się do góry nogami — zamiast pełnej rotacji odbijamy
// ją lustrzanie lewo/prawo i tylko przechylamy w pionie
function iconOrientation(bearingDeg) {
  const b = ((bearingDeg % 360) + 360) % 360;
  const flip = b > 180;
  const rotate = flip ? b - 270 : b - 90;
  return { flip, rotate };
}

function buildIconPickerUI() {
  const container = document.getElementById("iconPicker");
  container.innerHTML = "";
  Object.entries(ICON_LIBRARY).forEach(([key, def]) => {
    const btn = document.createElement("div");
    btn.className = "icon-choice" + (key === selectedIconKey ? " active" : "");
    btn.title = def.label;
    btn.innerHTML = buildIconSvg(def.paths, false);
    btn.addEventListener("click", () => {
      selectedIconKey = key;
      document.querySelectorAll(".icon-choice").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      saveSettings();
    });
    container.appendChild(btn);
  });
}


/* ---------- 5) Mapa (MapLibre + OpenFreeMap, bez klucza) ---------- */
// Mapa jest WYŁĄCZNIE tłem. Wszystko, co do niej dokładamy — linia trasy, ślad,
// znacznik pojazdu, przystanki, licznik, atrybucja — rysujemy sami na stageCanvas.
// Dzięki temu jedna klatka zależy tylko od (kamery mapy, czasu t), a nie od
// asynchronicznych przerysowań warstw MapLibre: podgląd, nagranie i ich
// przerwanie są przewidywalne.
let map = null;
let mapReadyPromise = null;
let currentRoute = null; // patrz prepareRoute()
let animationRunning = false;
let activePlayback = null; // { cancel() } — trwająca animacja/nagrywanie
let stageMode = "static"; // "static" (podgląd trasy) | "anim" | "final" (ostatnia klatka po animacji)
let lastTimeline = null;
let routeColor = "#ff4d1f";
let speedMultiplier = 1; // suwak "prędkość"; 1 = 7 s jazdy
let selectedDuration = 7; // czas samej jazdy w sekundach (bez pokazów zdjęć)

// "nerwowość" ruchu: częstotliwość stała, amplituda z suwaka 0-10
const WOBBLE_FREQUENCY = 5;
let wobbleAmplitude = 0;

let waypointFeatures = []; // { lng, lat, name, kind, frac, media, thumbnailCanvas, tReveal, tSettle }

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const MAP_LOAD_TIMEOUT_MS = 25000;
const MAX_ANIM_POINTS = 1500;
const END_HOLD_MS = 700; // ostatnia klatka (cała trasa, bez pojazdu) zostaje chwilę na ekranie

// Przygotowuje trasę do rysowania: przepróbkowanie do ograniczonej liczby
// równomiernie rozłożonych punktów (OSRM potrafi zwrócić dziesiątki tysięcy)
// i dystanse skumulowane liczone raz, a nie w każdej klatce.
function prepareRoute({ coordinates, distanceMeters, durationSeconds, waypointFractions }) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error("Trasa jest pusta — potrzebne są co najmniej dwa różne punkty.");
  }
  const fullCum = buildCumulativeDistances(coordinates);
  const n = Math.max(2, Math.min(coordinates.length, MAX_ANIM_POINTS));
  const animCoords = resampleByDistance(coordinates, fullCum, n);
  const animCum = buildCumulativeDistances(animCoords);
  return {
    coordinates,
    distanceMeters,
    durationSeconds,
    waypointFractions,
    animCoords,
    animCum,
    animTotal: animCum[animCum.length - 1],
    version: ++routeVersionCounter,
  };
}
let routeVersionCounter = 0;

function rebuildWaypointMarkers(waypoints) {
  const fractions = currentRoute.waypointFractions;
  waypointFeatures = waypoints.map((w, i) => ({
    lng: w.lng,
    lat: w.lat,
    name: w.name,
    kind: w.kind ?? null,
    frac: fractions[i] ?? (waypoints.length > 1 ? i / (waypoints.length - 1) : 0),
    media: waypointPhotos[i] ?? null,
    thumbnailCanvas: null,
    tReveal: 0,
    tSettle: 0,
  }));
}

function setWaypointMedia(index, entry) {
  const w = waypointFeatures[index];
  if (!w) return;
  w.media = entry;
  w.thumbnailCanvas = null;
}

// buduje małą flagę (start = zielona, meta = szachownica) jako gotowy canvas,
// w tym samym stylu co reszta znaczników (białe kółko, ciemna kreska)
function buildStartFinishIcon(kind, sizePx) {
  const c = document.createElement("canvas");
  c.width = sizePx;
  c.height = sizePx;
  const ctx = c.getContext("2d");
  const s = sizePx / 24;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sizePx, sizePx);

  ctx.strokeStyle = "#1b1f23";
  ctx.lineWidth = 1.6 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(7 * s, 4 * s);
  ctx.lineTo(7 * s, 20 * s);
  ctx.stroke();

  const fx = 7 * s, fy = 4 * s, fw = 11 * s, fh = 7 * s;
  if (kind === "finish") {
    const cols = 3, rows = 2;
    const cw = fw / cols, ch = fh / rows;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? "#1b1f23" : "#ffffff";
        ctx.fillRect(fx + col * cw, fy + row * ch, cw, ch);
      }
    }
  } else {
    ctx.fillStyle = "#2d6a4f";
    ctx.fillRect(fx, fy, fw, fh);
  }
  ctx.strokeStyle = "#1b1f23";
  ctx.lineWidth = 1 * s;
  ctx.strokeRect(fx, fy, fw, fh);

  return c;
}
let startIcon = null, finishIcon = null, flagIconSize = 0;

/* ---------- Stage canvas: stała rozdzielczość (np. 1080x1920), to on jest nagrywany ---------- */
let STAGE_W = 1080, STAGE_H = 1920;
let stageCanvas = null, stageCtx = null;

function ensureStageCanvas() {
  if (stageCanvas) return;
  stageCanvas = document.getElementById("stageCanvas");
  stageCanvas.width = STAGE_W;
  stageCanvas.height = STAGE_H;
  stageCtx = stageCanvas.getContext("2d");
}

// rozmiar obszaru mapy w px CSS — w tym samym układzie, w którym map.project() zwraca współrzędne
function mapRect() {
  const el = map.getContainer();
  return { width: el.clientWidth, height: el.clientHeight };
}

// ile pikseli sceny przypada na 1 px CSS kontenera mapy
function stageScale() {
  const w = mapRect().width;
  return w > 0 ? STAGE_W / w : 1;
}

// Mapa renderuje się w rozdzielczości SCENY, a nie ekranu: bez tego na
// komputerze (devicePixelRatio = 1) canvas mapy miał ~420 px szerokości i był
// rozciągany do 1080 px — eksport wychodził rozmyty.
function syncMapPixelRatio() {
  if (!map) return;
  const w = mapRect().width;
  if (w <= 0) return;
  const ratio = Math.min(STAGE_W / w, 6);
  // setPixelRatio samo wywołuje resize mapy — ustawiamy tylko przy realnej zmianie
  if (Math.abs(map.getPixelRatio() - ratio) > 0.001) map.setPixelRatio(ratio);
}

// Kopia ostatnio wyrenderowanej mapy na zwykłym canvasie 2D. Odświeżana tylko
// wtedy, gdy mapa faktycznie się przerysuje (zdarzenie "render"). Kiedy kamera
// stoi, każda klatka animacji bierze tło stąd, zamiast za każdym razem odczytywać
// piksele z canvasu WebGL — to najdroższa operacja całej klatki na telefonie.
let mapSnapshot = null, mapSnapshotCtx = null;

function updateMapSnapshot() {
  if (!mapSnapshot) {
    mapSnapshot = document.createElement("canvas");
    mapSnapshotCtx = mapSnapshot.getContext("2d", { alpha: false });
  }
  if (mapSnapshot.width !== STAGE_W || mapSnapshot.height !== STAGE_H) {
    mapSnapshot.width = STAGE_W;
    mapSnapshot.height = STAGE_H;
  }
  mapSnapshotCtx.drawImage(map.getCanvas(), 0, 0, STAGE_W, STAGE_H);
}

function compositeMapToStage() {
  if (!mapSnapshot) updateMapSnapshot();
  stageCtx.drawImage(mapSnapshot, 0, 0);
}

function projectToStage(lng, lat) {
  const p = map.project([lng, lat]); // CSS px względem kontenera mapy
  const rect = mapRect();
  return [(p.x / rect.width) * STAGE_W, (p.y / rect.height) * STAGE_H];
}

function ensureMap(center) {
  if (mapReadyPromise) return mapReadyPromise;
  mapReadyPromise = new Promise((resolve, reject) => {
    document.getElementById("mapWrap").style.display = "block";
    let m, loaded = false, settled = false;
    const fail = (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { m?.remove(); } catch { /* mapa mogła się nie zdążyć utworzyć */ }
      map = null;
      mapReadyPromise = null; // następna próba zacznie od zera
      document.getElementById("mapWrap").style.display = "none";
      reject(new Error(message));
    };
    const timer = setTimeout(
      () => fail("Mapa nie wczytała się w rozsądnym czasie. Sprawdź połączenie z internetem i spróbuj ponownie."),
      MAP_LOAD_TIMEOUT_MS
    );
    try {
      m = new maplibregl.Map({
        container: "map",
        style: MAP_STYLE_URL,
        center,
        zoom: 5,
        canvasContextAttributes: { preserveDrawingBuffer: true }, // kopiujemy canvas mapy na scenę (drawImage)
        attributionControl: false, // atrybucję rysujemy sami na scenie (drawAttribution)
        // ramka zablokowana: bez tego przewijanie strony palcem po mapie przesuwało ją przypadkiem
        dragPan: false,
        dragRotate: false,
        scrollZoom: false,
        touchZoomRotate: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        pitchWithRotate: false,
      });
    } catch (e) {
      fail("Nie udało się uruchomić mapy — ta przeglądarka prawdopodobnie nie obsługuje WebGL.");
      return;
    }
    m.on("error", (e) => {
      // błąd pojedynczego kafelka nie jest krytyczny; brak stylu mapy — tak
      if (!loaded && !e.sourceId && !e.tile) {
        fail("Nie udało się wczytać mapy (serwer map jest niedostępny). Spróbuj ponownie za chwilę.");
      } else {
        console.warn("MapLibre:", e.error?.message ?? e);
      }
    });
    m.on("load", () => {
      if (settled) return;
      settled = true;
      loaded = true;
      clearTimeout(timer);
      map = m;
      ensureStageCanvas();
      syncMapPixelRatio();
      m.on("render", onMapRender);
      resolve(m);
    });
  });
  return mapReadyPromise;
}

// Mapa przerysowuje się sama, gdy doczyta kafelki albo zmieni rozmiar — wtedy
// odświeżamy to, co aktualnie pokazuje scena. W trakcie animacji scenę maluje
// pętla animacji, więc tu nic nie robimy.
function onMapRender() {
  updateMapSnapshot();
  if (stageMode === "static") renderStatic();
  else if (stageMode === "final" && lastTimeline) renderFrame(lastTimeline, lastTimeline.totalMs);
}

async function showRouteOnMap(route, waypoints) {
  currentRoute = route;
  await ensureMap(route.coordinates[0]);
  rebuildWaypointMarkers(waypoints);
  stageMode = "static";
  document.getElementById("mapWrap").style.display = "block";
  document.getElementById("stageCanvas").style.display = "block";
  map.resize();
  syncMapPixelRatio();
  fitToRoute();
  renderStatic();
}

function fitToRoute() {
  if (!map || !currentRoute) return;
  const coordinates = currentRoute.coordinates;
  const bounds = coordinates.reduce(
    (b, c) => b.extend(c),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
  );
  // dodatkowy padding od góry (licznik km) i od dołu (pasek atrybucji)
  const rect = mapRect();
  const topPadding = 40 + (COUNTER_AREA_H / STAGE_H) * rect.height;
  const bottomPadding = 40 + (ATTRIB_AREA_H / STAGE_H) * rect.height;
  map.fitBounds(bounds, {
    padding: { top: topPadding, bottom: bottomPadding, left: 40, right: 40 },
    duration: 0,
  });
}

/* ---------- Rysowanie na scenie ---------- */

// Punkty trasy przeliczone na piksele sceny. Liczone ponownie tylko wtedy, gdy
// zmieni się kamera, rozmiar albo sama trasa — w trybie "cała trasa" kamera stoi,
// więc w trakcie animacji to jedno przeliczenie na cały film.
let projectionCache = { key: "", points: null };
function projectedRoutePoints() {
  const c = map.getCenter();
  const rect = mapRect();
  const key = [c.lng, c.lat, map.getZoom(), map.getBearing(), rect.width, rect.height, STAGE_W, STAGE_H, currentRoute.version].join("|");
  if (projectionCache.key !== key) {
    const coords = currentRoute.animCoords;
    const points = new Float64Array(coords.length * 2);
    const sx = STAGE_W / rect.width, sy = STAGE_H / rect.height;
    for (let i = 0; i < coords.length; i++) {
      const p = map.project(coords[i]);
      points[i * 2] = p.x * sx;
      points[i * 2 + 1] = p.y * sy;
    }
    projectionCache = { key, points };
  }
  return projectionCache.points;
}

// linia trasy: cała (dist === null) albo tylko odcinek przejechany do `dist`
function strokeRoute(dist) {
  const pts = projectedRoutePoints();
  const n = pts.length / 2;
  let lastIndex = n - 1;
  let tail = null;
  if (dist !== null) {
    const i = indexAtDistance(currentRoute.animCum, dist);
    lastIndex = i - 1;
    const [lng, lat] = positionAtDistance(currentRoute.animCoords, currentRoute.animCum, dist);
    tail = projectToStage(lng, lat);
  }
  stageCtx.save();
  stageCtx.beginPath();
  stageCtx.moveTo(pts[0], pts[1]);
  for (let k = 1; k <= lastIndex; k++) stageCtx.lineTo(pts[k * 2], pts[k * 2 + 1]);
  if (tail) stageCtx.lineTo(tail[0], tail[1]);
  stageCtx.lineWidth = 4 * stageScale();
  stageCtx.lineJoin = "round";
  stageCtx.lineCap = "round";
  stageCtx.strokeStyle = routeColor;
  stageCtx.stroke();
  stageCtx.restore();
}

// Rysuje znaczniki przystanków — zwykłe kropki, flagi start/meta i miniaturki
// zdjęć. t === null: podgląd statyczny (wszystkie widoczne, z numerami);
// t = czas animacji: widoczne tylko te już "odwiedzone".
function drawWaypointMarkers(t) {
  const scale = stageScale();
  const r = 12 * scale;
  const thumbSize = Math.round(r * 2);
  if (flagIconSize !== thumbSize) {
    startIcon = buildStartFinishIcon("start", thumbSize);
    finishIcon = buildStartFinishIcon("finish", thumbSize);
    flagIconSize = thumbSize;
  }
  // start/meta to pierwszy i ostatni WIDOCZNY punkt ("puste" punkty nie liczą się)
  const visible = waypointFeatures.map((w, i) => (w.kind === "empty" ? -1 : i)).filter((i) => i >= 0);
  const startIndex = visible[0];
  const finishIndex = visible.length > 1 ? visible[visible.length - 1] : -1;

  waypointFeatures.forEach((w, i) => {
    // punkty "puste" istnieją tylko po to, żeby korygować przebieg trasy — nic dla nich nie rysujemy
    if (w.kind === "empty") return;
    if (t !== null && t < w.tReveal) return;
    const settled = t !== null && w.media && t >= w.tSettle;
    const isStart = i === startIndex;
    const isFinish = i === finishIndex;
    const [x, y] = projectToStage(w.lng, w.lat);
    stageCtx.save();
    stageCtx.beginPath();
    stageCtx.arc(x, y, r, 0, Math.PI * 2);
    stageCtx.clip();
    if (settled && w.thumbnailCanvas) {
      stageCtx.drawImage(w.thumbnailCanvas, x - r, y - r, r * 2, r * 2);
    } else if (isStart) {
      stageCtx.drawImage(startIcon, x - r, y - r, r * 2, r * 2);
    } else if (isFinish) {
      stageCtx.drawImage(finishIcon, x - r, y - r, r * 2, r * 2);
    } else {
      stageCtx.fillStyle = "#ffffff";
      stageCtx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    stageCtx.restore();
    stageCtx.lineWidth = 2 * scale;
    stageCtx.strokeStyle = "#1b1f23";
    stageCtx.beginPath();
    stageCtx.arc(x, y, r, 0, Math.PI * 2);
    stageCtx.stroke();

    // numery TYLKO na statycznym podglądzie (do dopasowania zdjęć), nigdy w animacji/eksporcie
    if (t === null && !isStart && !isFinish) {
      stageCtx.fillStyle = "#1b1f23";
      stageCtx.font = `700 ${Math.round(r * 1.15)}px -apple-system, Roboto, sans-serif`;
      stageCtx.textAlign = "center";
      stageCtx.textBaseline = "middle";
      stageCtx.fillText(String(i + 1), x, y + r * 0.05);
    }
  });
}

function drawMotoMarker(lng, lat, headingDeg) {
  const { flip, rotate } = iconOrientation(headingDeg);
  const img = iconImages[selectedIconKey + (flip ? "-flip" : "")];
  if (!img) return;
  const size = 96 * iconScale * stageScale();
  const [x, y] = projectToStage(lng, lat);
  stageCtx.save();
  stageCtx.translate(x, y);
  stageCtx.rotate((rotate * Math.PI) / 180);
  stageCtx.drawImage(img, -size / 2, -size / 2, size, size);
  stageCtx.restore();
}

// kierunek jazdy w punkcie `dist`; na samym końcu trasy (brak "przodu") patrzymy wstecz
function headingForDistance(dist) {
  const { animCoords, animCum, animTotal } = currentRoute;
  const ahead = headingAtDistance(animCoords, animCum, dist);
  if (ahead !== null) return ahead;
  const back = Math.max(0, animTotal - 50);
  return headingAtDistance(animCoords, animCum, back, animTotal - back) ?? 0;
}

// kwadratowa miniaturka zdjęcia (cover-fit) do znacznika po zakończeniu pokazu
function buildSquareThumbnail(media, sizePx) {
  const c = document.createElement("canvas");
  c.width = sizePx;
  c.height = sizePx;
  drawImageCover(c.getContext("2d"), media, sizePx / 2, sizePx / 2, sizePx, sizePx);
  return c;
}

// zarezerwowany obszar u góry pod licznik km — fitToRoute dodaje go do paddingu
const COUNTER_AREA_H = 150;
// pasek atrybucji mapy rysowany na dole kadru (patrz drawAttribution)
const ATTRIB_AREA_H = 60;

function drawDistanceCounter(km) {
  const text = `${km.toFixed(1)} km`;
  stageCtx.save();
  stageCtx.font = "600 40px -apple-system, Roboto, sans-serif";
  stageCtx.textAlign = "left";
  stageCtx.textBaseline = "alphabetic";
  const pad = 28;
  const textW = stageCtx.measureText(text).width;
  const boxW = textW + 36, boxH = 60;
  const x = pad, y = pad + boxH;

  stageCtx.fillStyle = "rgba(27,31,35,0.7)";
  if (stageCtx.roundRect) {
    stageCtx.beginPath();
    stageCtx.roundRect(x, y - boxH, boxW, boxH, 12);
    stageCtx.fill();
  } else {
    stageCtx.fillRect(x, y - boxH, boxW, boxH);
  }

  stageCtx.fillStyle = "#ffffff";
  stageCtx.fillText(text, x + 18, y - 16);
  stageCtx.restore();
}

// Atrybucja danych mapy — wymagana licencją OpenStreetMap (ODbL) i OpenFreeMap.
// Rysowana na scenie, więc jest widoczna i w podglądzie, i w każdej klatce wideo.
const MAP_ATTRIBUTION_TEXT = "© OpenStreetMap · OpenMapTiles · OpenFreeMap";

function drawAttribution() {
  stageCtx.save();
  stageCtx.font = "500 22px -apple-system, Roboto, sans-serif";
  stageCtx.textAlign = "right";
  stageCtx.textBaseline = "alphabetic";
  const padX = 10, boxH = 34;
  const textW = stageCtx.measureText(MAP_ATTRIBUTION_TEXT).width;
  stageCtx.fillStyle = "rgba(255,255,255,0.72)";
  stageCtx.fillRect(STAGE_W - textW - padX * 2, STAGE_H - boxH, textW + padX * 2, boxH);
  stageCtx.fillStyle = "#1b1f23";
  stageCtx.fillText(MAP_ATTRIBUTION_TEXT, STAGE_W - padX, STAGE_H - 10);
  stageCtx.restore();
}

function getMediaSize(el) {
  return {
    w: el.videoWidth || el.naturalWidth || el.width,
    h: el.videoHeight || el.naturalHeight || el.height,
  };
}

function drawImageCover(ctx, media, cx, cy, boxW, boxH) {
  const { w: mw, h: mh } = getMediaSize(media);
  if (!mw || !mh) return;
  const imgRatio = mw / mh;
  const boxRatio = boxW / boxH;
  let sw, sh, sx, sy;
  if (imgRatio > boxRatio) {
    sh = mh;
    sw = sh * boxRatio;
    sx = (mw - sw) / 2;
    sy = 0;
  } else {
    sw = mw;
    sh = sw / boxRatio;
    sx = 0;
    sy = (mh - sh) / 2;
  }
  ctx.drawImage(media, sx, sy, sw, sh, cx - boxW / 2, cy - boxH / 2, boxW, boxH);
}

// choreografia zdjęcia: powiększanie, trzymanie w pełnym kadrze, szybkie znikanie
let REVEAL_GROW_MS = 1500;
const REVEAL_SHRINK_MS = 400;
let REVEAL_HOLD_MS = 1000;
function revealTotalMs() {
  return REVEAL_GROW_MS + REVEAL_HOLD_MS + REVEAL_SHRINK_MS;
}

// Rysuje pokaz zdjęcia NA WIERZCHU bieżącej klatki mapy (koło rosnące od
// znacznika do pełnego kadru i wracające na znacznik).
function drawPhotoReveal(waypoint, elapsedMs) {
  const [px0, py0] = projectToStage(waypoint.lng, waypoint.lat);
  const cx = STAGE_W / 2, cy = STAGE_H / 2;
  const maxR = Math.hypot(STAGE_W, STAGE_H) / 2 * 1.05;
  const badgeR = STAGE_W * 0.02;

  // środek koła płynnie dojeżdża do środka kadru — inaczej przy punkcie blisko
  // brzegu koło nigdy nie pokryłoby całego ekranu
  let r, ox, oy;
  if (elapsedMs < REVEAL_GROW_MS) {
    const eased = 1 - Math.pow(1 - elapsedMs / REVEAL_GROW_MS, 3); // ease-out
    r = badgeR + (maxR - badgeR) * eased;
    ox = px0 + (cx - px0) * eased;
    oy = py0 + (cy - py0) * eased;
  } else if (elapsedMs < REVEAL_GROW_MS + REVEAL_HOLD_MS) {
    r = maxR; ox = cx; oy = cy;
  } else {
    const t = Math.min((elapsedMs - REVEAL_GROW_MS - REVEAL_HOLD_MS) / REVEAL_SHRINK_MS, 1);
    const eased = t * t;
    r = maxR - (maxR - badgeR) * eased;
    ox = cx + (px0 - cx) * eased;
    oy = cy + (py0 - cy) * eased;
  }

  stageCtx.save();
  stageCtx.beginPath();
  stageCtx.arc(ox, oy, r, 0, Math.PI * 2);
  stageCtx.clip();
  // obraz rysowany zawsze tak, jakby już wypełniał cały kadr (cover-fit do
  // prostokąta sceny) — animuje się tylko okrągła maska, nigdy sam obraz
  stageCtx.fillStyle = "#1b1f23";
  stageCtx.fillRect(0, 0, STAGE_W, STAGE_H);
  if (waypoint.media) {
    drawImageCover(stageCtx, waypoint.media.mediaEl, STAGE_W / 2, STAGE_H / 2, STAGE_W, STAGE_H);
  }
  stageCtx.restore();
  stageCtx.save();
  stageCtx.beginPath();
  stageCtx.arc(ox, oy, r, 0, Math.PI * 2);
  stageCtx.lineWidth = Math.max(3, r * 0.015);
  stageCtx.strokeStyle = "#ffffff";
  stageCtx.stroke();
  stageCtx.restore();
}

// podgląd statyczny (krok 2): cała trasa + wszystkie przystanki z numerami
function renderStatic() {
  if (!map || !currentRoute || !stageCtx) return;
  compositeMapToStage();
  strokeRoute(null);
  drawWaypointMarkers(null);
  drawAttribution();
}

/* ---------- Animacja: oś czasu + rysowanie klatki dla dowolnego t ---------- */

function buildAnimationPlan() {
  const route = currentRoute;
  const stops = waypointFeatures.map((w, i) => ({
    index: i,
    dist: w.frac * route.animTotal,
    hasMedia: !!w.media && w.kind !== "empty",
  }));
  const timeline = buildTimeline({
    total: route.animTotal,
    travelMs: selectedDuration * 1000,
    stops,
    revealMs: revealTotalMs(),
    endHoldMs: END_HOLD_MS,
  });
  waypointFeatures.forEach((w, i) => {
    w.tReveal = timeline.marks[i].tReveal;
    w.tSettle = timeline.marks[i].tSettle;
    if (w.media && !w.thumbnailCanvas) w.thumbnailCanvas = buildSquareThumbnail(w.media.mediaEl, 96);
  });
  return timeline;
}

// Rysuje kompletną klatkę filmu dla czasu t. Funkcja nie ma własnego stanu:
// ta sama trasa, ustawienia i t dają zawsze ten sam obraz.
function renderFrame(timeline, t) {
  const state = timelineStateAt(timeline, t);
  const route = currentRoute;
  compositeMapToStage();
  strokeRoute(state.dist);
  if (state.type !== "end") {
    const [lng, lat] = positionAtDistance(route.animCoords, route.animCum, state.dist);
    const wobble = Math.sin((t / 1000) * WOBBLE_FREQUENCY) * wobbleAmplitude;
    drawMotoMarker(lng, lat, headingForDistance(state.dist) + wobble);
  }
  drawWaypointMarkers(t);
  // licznik pokazuje realny dystans drogowy z routera, nie długość uproszczonej geometrii
  const fraction = route.animTotal > 0 ? state.dist / route.animTotal : 1;
  drawDistanceCounter((fraction * route.distanceMeters) / 1000);
  drawAttribution();
  if (state.type === "reveal") drawPhotoReveal(waypointFeatures[state.stopIndex], state.elapsed);
  return state;
}

function cancelPlayback() {
  activePlayback?.cancel();
}

// Odtwarza animację w czasie rzeczywistym. Zwraca "done" albo "cancelled".
function playTimeline({ onProgress } = {}) {
  if (animationRunning) return Promise.resolve("busy");
  if (!map || !currentRoute) return Promise.reject(new Error("Najpierw zbuduj trasę."));
  animationRunning = true;
  stageMode = "anim";
  ensureStageCanvas();
  document.getElementById("stageCanvas").style.display = "block";

  return loadAllActivityIcons().then(() => new Promise((resolve, reject) => {
    let timeline;
    try {
      timeline = buildAnimationPlan();
    } catch (e) {
      animationRunning = false;
      stageMode = "static";
      reject(e);
      return;
    }
    lastTimeline = timeline;
    let finished = false;
    let startTime = null;
    let activeVideo = null;

    const finish = (result, error) => {
      if (finished) return;
      finished = true;
      if (activeVideo) activeVideo.pause();
      animationRunning = false;
      activePlayback = null;
      if (result === "done") {
        stageMode = "final";
      } else {
        stageMode = "static";
        renderStatic();
      }
      if (error) reject(error); else resolve(result);
    };

    // przerwanie działa natychmiast, a nie dopiero przy następnej klatce — przeglądarka
    // potrafi wstrzymać klatki na dłuższą chwilę (np. przy starcie kodera wideo)
    activePlayback = { cancel: () => finish("cancelled") };

    function frame(now) {
      if (finished) return;
      try {
        if (startTime === null) startTime = now;
        const t = Math.min(now - startTime, timeline.totalMs);
        const state = renderFrame(timeline, t);

        // film na przystanku gra tylko przez czas pokazu, od początku klipu
        const wp = state.type === "reveal" ? waypointFeatures[state.stopIndex] : null;
        const video = wp?.media?.type === "video" ? wp.media.mediaEl : null;
        if (video !== activeVideo) {
          if (activeVideo) activeVideo.pause();
          if (video) {
            video.currentTime = 0;
            video.play().catch(() => {}); // rzadkie odrzucenie autoplay (mimo muted) — zostaje nieruchoma klatka
          }
          activeVideo = video;
        }

        if (onProgress) onProgress(state.progress);
        if (t >= timeline.totalMs) return finish("done");
        requestAnimationFrame(frame);
      } catch (e) {
        console.error("Błąd w pętli animacji:", e);
        finish("error", new Error(`Animacja przerwana błędem: ${e.message}`));
      }
    }
    requestAnimationFrame(frame);
  }));
}

/* ---------- 6) Eksport wideo (Canvas.captureStream + MediaRecorder, bez backendu) ---------- */
function pickSupportedMimeType() {
  // Safari/iOS nagrywa natywnie MP4, Chrome/Android — MP4 (nowsze wersje) albo WebM
  const candidates = [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const type of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

// Nagrywa animację do pliku. Zwraca { cancelled: true } albo { blob, mimeType, ext }.
async function recordVideo(onProgress) {
  if (!map || !currentRoute) throw new Error("Najpierw zbuduj trasę.");
  if (animationRunning) throw new Error("Poczekaj, aż skończy się bieżąca animacja.");
  if (!window.MediaRecorder) {
    throw new Error("Ta przeglądarka nie obsługuje nagrywania wideo (MediaRecorder API).");
  }
  const mimeType = pickSupportedMimeType();
  if (!mimeType) throw new Error("Nie znalazłem obsługiwanego formatu wideo na tym urządzeniu.");

  ensureStageCanvas();
  const stream = stageCanvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

  // Nagrywanie idzie w czasie rzeczywistym, a przeglądarka wstrzymuje animację
  // w karcie w tle (zablokowany ekran, inna karta) — wyszedłby film z zamrożonym
  // obrazem. Zamiast tego przerywamy i mówimy wprost, co się stało.
  let interruptedByHiding = false;
  const onVisibility = () => {
    if (document.hidden) {
      interruptedByHiding = true;
      cancelPlayback();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  let result;
  recorder.start();
  try {
    result = await playTimeline({ onProgress });
  } finally {
    document.removeEventListener("visibilitychange", onVisibility);
    if (recorder.state !== "inactive") recorder.stop();
    // przy udanym nagraniu czekamy na komplet danych; przy przerwanym i tak je
    // wyrzucamy, więc nie pozwalamy, by ociągający się koder blokował interfejs
    await (result === "done" ? stopped : Promise.race([stopped, new Promise((r) => setTimeout(r, 1500))]));
    stream.getTracks().forEach((track) => track.stop());
  }

  if (result !== "done") {
    if (interruptedByHiding) {
      throw new Error(
        "Nagrywanie zostało przerwane, bo karta albo ekran przestały być aktywne.\n" +
        "Zostaw tę kartę na wierzchu (i nie blokuj ekranu) do końca nagrywania, a potem spróbuj ponownie."
      );
    }
    return { cancelled: true };
  }

  const blob = new Blob(chunks, { type: mimeType });
  if (blob.size === 0) throw new Error("Nagranie jest puste — przeglądarka nie zapisała żadnych danych wideo.");
  return { blob, mimeType, ext: mimeType.includes("mp4") ? "mp4" : "webm", cancelled: false };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
