"use strict";

/* ---------- 2) Realny routing (OSRM demo) ---------- */
const OSRM_DEMO_BASE = "https://router.project-osrm.org/route/v1/driving";

async function fetchRoadRoute(waypoints, attempt = 1) {
  // walidacja PRZED wysłaniem - łapie złe dane (np. NaN z błędnie wpisanych
  // ręcznie współrzędnych) wcześnie, ze wskazaniem, który punkt jest zły,
  // zamiast niejasnego HTTP 400 z serwera routingu
  waypoints.forEach((w, i) => {
    if (
      !Number.isFinite(w.lat) || !Number.isFinite(w.lng) ||
      w.lat < -90 || w.lat > 90 || w.lng < -180 || w.lng > 180
    ) {
      throw new Error(
        `Punkt ${i + 1} (${w.name ?? "bez nazwy"}) ma nieprawidłowe współrzędne ` +
        `(${w.lat}, ${w.lng}). Popraw go i spróbuj ponownie.`
      );
    }
  });

  const coordsParam = waypoints.map((w) => `${w.lng},${w.lat}`).join(";");
  const url = `${OSRM_DEMO_BASE}/${coordsParam}?overview=full&geometries=geojson&steps=false`;

  let res;
  try {
    res = await fetch(url, { referrerPolicy: "no-referrer", credentials: "omit" });
  } catch (networkErr) {
    // "Failed to fetch" — serwer demo OSRM jest darmowy, bez gwarancji dostępności
    // i bez SLA; przy częstym testowaniu bywa chwilowo nieosiągalny. Ponawiamy
    // automatycznie 2 razy z krótkim odstępem, zanim pokażemy błąd użytkownikowi.
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1200 * attempt));
      return fetchRoadRoute(waypoints, attempt + 1);
    }
    throw new Error(
      "Nie udało się połączyć z serwerem routingu (Failed to fetch) po 3 próbach.\n" +
      "To darmowy serwer demo OSRM bez gwarancji dostępności — przy częstym testowaniu " +
      "bywa chwilowo przeciążony. Sprawdź połączenie z internetem i spróbuj ponownie za chwilę."
    );
  }

  if (!res.ok) {
    // pokaż realną treść błędu z OSRM (zwykle konkretny powód), nie tylko goły kod HTTP
    let detail = "";
    try {
      const body = await res.json();
      if (body?.message) detail = `: ${body.message}`;
      else if (body?.code) detail = `: ${body.code}`;
    } catch {
      // odpowiedź nie była JSON-em - trudno, zostaje sam kod HTTP
    }
    throw new Error(`Serwer routingu zwrócił błąd HTTP ${res.status}${detail}.`);
  }
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error(`Nie udało się policzyć trasy (code: ${data.code}).`);
  }
  const route = data.routes[0];
  return {
    coordinates: route.geometry.coordinates, // [[lng,lat], ...]
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}

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

// WAŻNE: miniaturki NIE trafiają do atlasu obrazów MapLibre (map.addImage) w ogóle.
// Ten atlas jest pomyślany pod stały, niewielki zestaw sprite'ów, nie pod rosnącą
// w trakcie sesji liczbę zdjęć użytkownika — to najpewniej realna przyczyna
// powtarzającego się błędu WebGL "mismatched image size". Zamiast tego trzymamy
// gotowe, przycięte-do-koła miniaturki jako zwykłe canvasy w pamięci i rysujemy
// je bezpośrednio na stageCanvas (zwykłe drawImage, żadnego WebGL).
function preloadPhotoThumbnails() {
  for (const w of waypointFeatures) {
    if (w.photoImage && !w.thumbnailCanvas) {
      w.thumbnailCanvas = buildSquareThumbnail(w.photoImage, 64);
    }
  }
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
let map = null;
let lastRouteCoordinates = null;
let animationRunning = false;
let speedMultiplier = 1; // "1" = obecne domyślne tempo (7s na testowej trasie)
let selectedDuration = 7;
let routeColor = "#ff4d1f";

// "nerwowość" ruchu: częstotliwość stała, amplituda wybierana z selektora 1-10
// (docelowo ten parametr zniknie całkiem, jak tylko znajdziemy optymalną wartość)
const WOBBLE_FREQUENCY = 5;
let wobbleAmplitude = 0; // domyślnie wyłączone (selektor startuje na 0)

// znacznik jazdy — rysowany bezpośrednio na stageCanvas (patrz drawMotoMarker
// i komentarz przy iconImages), nie jako źródło/warstwa MapLibre
let motoMarkerVisible = false;
let motoMarkerState = { lng: 0, lat: 0, rotate: 0, flip: false };

let waypointFeatures = []; // { lng, lat, name, distanceAlong, revealed, photoImage }

function rebuildWaypointMarkers(coordinates, cum, waypoints) {
  waypointFeatures = waypoints.map((w, i) => ({
    lng: w.lng,
    lat: w.lat,
    name: w.name,
    kind: w.kind ?? null,
    photoKey: `wp-photo-${i}`,
    distanceAlong: distanceAlongForWaypoint(coordinates, cum, [w.lng, w.lat]),
    revealed: false,
    settled: false,
    photoImage: waypointPhotos[i]?.mediaEl ?? waypointPhotos[i]?.img ?? null,
    mediaType: waypointPhotos[i]?.type ?? "image",
  }));
  syncWaypointSource();
}

// KLUCZOWE dla eksportu wideo: przystanki żyją jako natywne źródło/warstwa mapy
// (nie jako DOM-owe maplibregl.Marker), więc trafiają do tego samego canvasu,
// który nagrywa MediaRecorder. DOM-owe markery byłyby niewidoczne w wyeksportowanym pliku.
function syncWaypointSource() {
  // no-op: znaczniki (zwykłe i ze zdjęciem) rysowane w całości na stageCanvas
  // przez drawWaypointMarkers() — patrz komentarz tam, dlaczego to jedno
  // wspólne źródło pozycji zamiast dwóch niezależnych systemów.
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
let startIcon = null, finishIcon = null;

// Rysuje WSZYSTKIE odsłonięte znaczniki przystanków — zwykłe kropki, flagi
// start/meta i miniaturki zdjęć — jedną funkcją, jednym przeliczeniem
// współrzędnych (projectToStage). Wcześniej zwykłe kropki żyły w natywnej
// warstwie MapLibre (WebGL), a miniaturki osobno na canvasie — dwa niezależne
// układy współrzędnych do zgrania piksel w piksel to źródło notorycznych
// drobnych niedopasowań ("białe rąbki"). Teraz jest tylko jeden system.
function drawWaypointMarkers(showNumbers = false) {
  const rect = map.getContainer().getBoundingClientRect();
  const scale = STAGE_W / rect.width;
  const r = 12 * scale;
  const thumbSize = Math.round(r * 2);
  if (!startIcon) startIcon = buildStartFinishIcon("start", thumbSize);
  if (!finishIcon) finishIcon = buildStartFinishIcon("finish", thumbSize);

  waypointFeatures.forEach((w, i) => {
    // punkty "puste" istnieją tylko po to, żeby korygować trasę drogową (via-point
    // dla OSRM) — celowo nigdy nic dla nich nie rysujemy: ani kropki, ani numeru,
    // ani flagi, niezależnie od pozycji w trasie (nawet gdyby wypadł na indeksie 0/ostatnim)
    if (w.kind === "empty") return;
    if (!w.revealed) return;
    const isStart = i === 0;
    const isFinish = i === waypointFeatures.length - 1;
    const [x, y] = projectToStage(w.lng, w.lat);
    stageCtx.save();
    stageCtx.beginPath();
    stageCtx.arc(x, y, r, 0, Math.PI * 2);
    stageCtx.clip();
    if (w.settled && w.thumbnailCanvas) {
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
    if (showNumbers && !w.settled && !isStart && !isFinish) {
      stageCtx.fillStyle = "#1b1f23";
      stageCtx.font = `700 ${Math.round(r * 1.15)}px -apple-system, Roboto, sans-serif`;
      stageCtx.textAlign = "center";
      stageCtx.textBaseline = "middle";
      stageCtx.fillText(String(i + 1), x, y + r * 0.05);
    }
  });
}

// znacznik jazdy — patrz komentarz przy iconImages, dlaczego to zwykły
// drawImage zamiast warstwy symboli MapLibre
function drawMotoMarker() {
  if (!motoMarkerVisible) return;
  const key = selectedIconKey + (motoMarkerState.flip ? "-flip" : "");
  const img = iconImages[key];
  if (!img) return;
  const rect = map.getContainer().getBoundingClientRect();
  const scale = STAGE_W / rect.width;
  const size = 96 * iconScale * scale; // te same proporcje co dawny icon-size 96px-owego sprite'a
  const [x, y] = projectToStage(motoMarkerState.lng, motoMarkerState.lat);
  stageCtx.save();
  stageCtx.translate(x, y);
  stageCtx.rotate((motoMarkerState.rotate * Math.PI) / 180);
  stageCtx.drawImage(img, -size / 2, -size / 2, size, size);
  stageCtx.restore();
}

// wywoływane, gdy sekwencja pełnoekranowego pokazania zdjęcia się zakończy —
// od tej pory mały znacznik na trasie pokazuje to zdjęcie jako miniaturkę
// (rysowaną na canvasie, patrz drawWaypointMarkers)
function settlePhotoBadge(waypoint) {
  if (!waypoint.photoImage || waypoint.settled) return;
  waypoint.settled = true;
}

function hideAllPhotoBadges() {
  waypointFeatures.forEach((w) => (w.settled = false));
}

function showAllWaypointMarkers() {
  waypointFeatures.forEach((w) => (w.revealed = true));
  syncWaypointSource();
}

function hideAllWaypointMarkers() {
  waypointFeatures.forEach((w) => (w.revealed = false));
  syncWaypointSource();
}

function revealWaypointMarkersUpTo(distanceAlong) {
  let changed = false;
  waypointFeatures.forEach((w) => {
    if (!w.revealed && distanceAlong >= w.distanceAlong) {
      w.revealed = true;
      changed = true;
    }
  });
  if (changed) syncWaypointSource();
}

function showRouteOnMap(coordinates, waypoints) {
  document.getElementById("mapWrap").style.display = "block";
  const cum = buildCumulativeDistances(coordinates);

  const geojson = {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
  };

  if (!map) {
    map = new maplibregl.Map({
      container: "map",
      style: "https://tiles.openfreemap.org/styles/positron",
      center: coordinates[0],
      zoom: 5,
      preserveDrawingBuffer: true, // wymagane, żeby canvas.captureStream() przy eksporcie wideo działał niezawodnie
      // ramka zablokowana: bez tego przewijanie strony palcem po mapie przesuwało ją przypadkiem
      dragPan: false,
      dragRotate: false,
      scrollZoom: false,
      touchZoomRotate: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });

    map.on("load", async () => {
      map.addSource("route", { type: "geojson", data: geojson });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": routeColor, "line-width": 4 },
      });

      // źródła pod animację: ślad (rysowany dotąd) + punkt motocykla
      map.addSource("trail", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "trail-line",
        type: "line",
        source: "trail",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": routeColor, "line-width": 4 },
      });

      await loadAllActivityIcons();
      motoMarkerVisible = false;
      setLayerVisible("trail-line", false);

      rebuildWaypointMarkers(coordinates, cum, waypoints);
      showAllWaypointMarkers();

      fitToRoute(coordinates);
      showStaticPreviewOnStage();
    });
  } else {
    map.getSource("route").setData(geojson);
    rebuildWaypointMarkers(coordinates, cum, waypoints);
    showAllWaypointMarkers();
    fitToRoute(coordinates);
    showStaticPreviewOnStage();
  }
}

// Statyczny podgląd (krok 2) idzie teraz też przez stageCanvas, bo znaczniki
// przystanków są rysowane wyłącznie na canvasie (patrz drawWaypointMarkers) —
// od usunięcia natywnej warstwy MapLibre "goła" mapa nie ma jak ich pokazać.
function showStaticPreviewOnStage() {
  ensureStageCanvas();
  const paint = () => {
    compositeMapToStage();
    drawWaypointMarkers(true); // numery widoczne tylko tutaj, do dopasowania zdjęć
    drawAttribution();
  };
  map.once("render", paint); // po przerysowaniu wywołanym przez fitBounds
  paint(); // i od razu, na wypadek gdyby mapa już była gotowa
  document.getElementById("stageCanvas").style.display = "block";
}

function fitToRoute(coordinates) {
  const bounds = coordinates.reduce(
    (b, c) => b.extend(c),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
  );
  // dodatkowy padding od góry (licznik km) i od dołu (pole atrybucji OSM —
  // wymagane licencją danych, nie da się go usunąć, ale trasa/znaczniki
  // powinny go tak samo omijać jak licznika u góry)
  const rect = map.getContainer().getBoundingClientRect();
  const topPadding = 40 + (COUNTER_AREA_H / STAGE_H) * rect.height;
  const bottomPadding = 40 + (ATTRIB_AREA_H / STAGE_H) * rect.height;
  // "Full route" tryb kamery: dopasuj kadr RAZ, przed animacją — bez zoomowania w trakcie jazdy
  map.fitBounds(bounds, {
    padding: { top: topPadding, bottom: bottomPadding, left: 40, right: 40 },
    duration: 0,
  });
}

function setLayerVisible(layerId, visible) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}

/* ---------- Stage canvas: stała rozdzielczość 1080x1920, to on jest nagrywany ---------- */
let STAGE_W = 1080, STAGE_H = 1920;
let stageCanvas = null, stageCtx = null, frozenCanvas = null, frozenCtx = null;

function ensureStageCanvas() {
  if (stageCanvas) return;
  stageCanvas = document.getElementById("stageCanvas");
  stageCanvas.width = STAGE_W;
  stageCanvas.height = STAGE_H;
  stageCtx = stageCanvas.getContext("2d");
  frozenCanvas = document.createElement("canvas");
  frozenCanvas.width = STAGE_W;
  frozenCanvas.height = STAGE_H;
  frozenCtx = frozenCanvas.getContext("2d");
}

function compositeMapToStage() {
  stageCtx.drawImage(map.getCanvas(), 0, 0, STAGE_W, STAGE_H);
}

function projectToStage(lng, lat) {
  const p = map.project([lng, lat]); // CSS px względem kontenera mapy
  const rect = map.getContainer().getBoundingClientRect();
  return [(p.x / rect.width) * STAGE_W, (p.y / rect.height) * STAGE_H];
}

// kwadratowa miniaturka zdjęcia (cover-fit) do znacznika po zakończeniu reveal.
// CELOWO bez własnego okrągłego przycięcia/obwódki — to robi wyłącznie
// drawWaypointMarkers(), żeby był tylko jeden układ maskowania, nie dwa do zgrania.
function buildSquareThumbnail(img, sizePx) {
  const c = document.createElement("canvas");
  c.width = sizePx;
  c.height = sizePx;
  const ctx = c.getContext("2d");
  drawImageCover(ctx, img, sizePx / 2, sizePx / 2, sizePx, sizePx);
  return c;
}

// narastający licznik przejechanych km w prawym dolnym rogu — rysowany
// bezpośrednio na stageCanvas (musi być na canvasie, żeby trafił do nagrania)
let currentDistanceKm = 0;
// zarezerwowany obszar w lewym górnym rogu pod licznik — używane też przez
// fitToRoute (dodatkowy padding od góry), żeby trasa w niego nie wchodziła
const COUNTER_AREA_H = 150;
// pasek atrybucji mapy rysowany na dole kadru (patrz drawAttribution) —
// rezerwujemy pod niego margines, żeby trasa i znaczniki w niego nie wchodziły
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
// Kontrolka MapLibre jest elementem DOM zasłoniętym przez stageCanvas i nie
// trafia do nagrania, dlatego rysujemy ją sami: jest widoczna i w podglądzie,
// i w każdej klatce wyeksportowanego wideo.
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

function drawImageCover(ctx, media, cx, cy, boxW, boxH) {
  const { w: mw, h: mh } = getMediaSize(media);
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

// choreografia zdjęcia: 1s powiększanie, 2s trzymanie, 0.4s znikanie (szybciej niż wejście)
let REVEAL_GROW_MS = 1500; // wydłużone o 50% (było 1000ms), edytowalne w Opcjach
const REVEAL_SHRINK_MS = 400;
let REVEAL_HOLD_MS = 1000; // sterowane polem tekstowym w UI, domyślnie 1s
function revealTotalMs() {
  return REVEAL_GROW_MS + REVEAL_HOLD_MS + REVEAL_SHRINK_MS;
}

function revealRadius(elapsedMs, badgeR, maxR) {
  if (elapsedMs < REVEAL_GROW_MS) {
    const t = elapsedMs / REVEAL_GROW_MS;
    return badgeR + (maxR - badgeR) * (1 - Math.pow(1 - t, 3)); // ease-out
  }
  if (elapsedMs < REVEAL_GROW_MS + REVEAL_HOLD_MS) return maxR;
  const t = Math.min((elapsedMs - REVEAL_GROW_MS - REVEAL_HOLD_MS) / REVEAL_SHRINK_MS, 1);
  return maxR - (maxR - badgeR) * (t * t);
}


function drawPhotoRevealFrame(waypoint, elapsedMs) {
  stageCtx.drawImage(frozenCanvas, 0, 0);
  const [px0, py0] = projectToStage(waypoint.lng, waypoint.lat);
  const cx = STAGE_W / 2, cy = STAGE_H / 2;
  const maxR = Math.hypot(STAGE_W, STAGE_H) / 2 * 1.05;
  const badgeR = STAGE_W * 0.02;

  // KLUCZOWE: środek koła musi płynnie dojechać do środka ekranu, inaczej przy
  // punkcie blisko brzegu kadru koło nigdy nie pokryje całego ekranu poprawnie
  // (zostawało "przyklejone" do pozycji znacznika) — stąd wrażenie braku animacji.
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
    ox = cx + (px0 - cx) * eased; // wraca do pozycji znacznika, jakby zdjęcie "odlatywało" z powrotem na mapę
    oy = cy + (py0 - cy) * eased;
  }

  stageCtx.save();
  stageCtx.beginPath();
  stageCtx.arc(ox, oy, r, 0, Math.PI * 2);
  stageCtx.clip();
  if (waypoint.photoImage) {
    // KLUCZOWE: obraz rysowany zawsze tak, jakby już wypełniał cały kadr —
    // cover-fit do RZECZYWISTEGO prostokąta 1080x1920 (nie do kwadratu opisanego
    // na kole!), wyśrodkowany na środku ekranu. Animuje się tylko kółko-maska,
    // nigdy sam obraz — dzięki temu zdjęcie 9:16 przy pełnym rozmiarze pasuje
    // idealnie, bez dodatkowego, zbędnego przycinania.
    drawImageCover(stageCtx, waypoint.photoImage, STAGE_W / 2, STAGE_H / 2, STAGE_W, STAGE_H);
  } else {
    stageCtx.fillStyle = "#1b1f23";
    stageCtx.fill();
  }
  stageCtx.lineWidth = Math.max(3, r * 0.015);
  stageCtx.strokeStyle = "#ffffff";
  stageCtx.stroke();
  stageCtx.restore();
}

async function animateRoute(coordinates, durationSeconds, onProgress) {
  if (animationRunning) return;
  animationRunning = true;

  ensureStageCanvas();
  document.getElementById("stageCanvas").style.display = "block";

  await loadAllActivityIcons();
  preloadPhotoThumbnails();

  // animuj po przepróbkowanej, "lekkiej" wersji trasy — patrz komentarz przy resampleByDistance
  const fullCum = buildCumulativeDistances(coordinates);
  const animCoords = resampleByDistance(coordinates, fullCum, 300);
  const cum = buildCumulativeDistances(animCoords);
  const total = cum[cum.length - 1];

  // KLUCZOWE: distanceAlong przystanków liczony był względem PEŁNEJ geometrii
  // (fullCum), a jazda odbywa się po przepróbkowanej wersji o nieznacznie innym
  // całkowitym dystansie — dla punktów blisko samego końca trasy ta drobna
  // różnica mogła sprawiać, że animacja formalnie nigdy ich nie "dogania" (dist
  // nigdy nie osiąga progu), więc reveal zdjęcia się nie odpalał. Przeliczamy
  // na skalę TEJ konkretnej animacji, żeby były gwarantowanie osiągalne.
  waypointFeatures.forEach((w) => {
    w.distanceAlong = distanceAlongForWaypoint(animCoords, cum, [w.lng, w.lat]);
  });

  // trasa i przystanki niewidoczne na starcie, motocykl w punkcie startowym
  setLayerVisible("route-line", false);
  setLayerVisible("trail-line", true);
  motoMarkerVisible = true;
  map.getSource("trail").setData({ type: "Feature", geometry: { type: "LineString", coordinates: [] } });
  hideAllWaypointMarkers();
  hideAllPhotoBadges();
  currentDistanceKm = 0;

  let lastHeading = headingAtDistance(animCoords, cum, 0) ?? 0;
  const startTime = performance.now();

  // stan maszyny: 'traveling' (jazda) <-> 'reveal' (pokaz zdjęcia, ruch wstrzymany)
  let mode = "traveling";
  let pausedAccumMs = 0;
  let revealStartTime = 0;
  let revealWaypoint = null;

  return new Promise((resolve, reject) => {
    // KLUCZOWE: MapLibre renderuje swój canvas we WŁASNEJ, wewnętrznej pętli
    // (też opartej o requestAnimationFrame). Kopiowanie do stageCanvas od razu
    // po setData() łapało klatkę o krok do tyłu, zanim mapa zdążyła się faktycznie
    // przerysować — stąd ruch znacznika był niewidoczny. Kopiujemy dopiero
    // w evencie 'render', czyli gdy mapa naprawdę skończy malować.
    function onMapRender() {
      if (mode === "traveling") {
        try {
          compositeMapToStage();
          drawMotoMarker();
          drawWaypointMarkers();
          drawDistanceCounter(currentDistanceKm);
          drawAttribution();
        } catch (e) {
          console.error("compositeMapToStage (render event):", e);
        }
      }
    }
    map.on("render", onMapRender);

    function cleanupAfterFailure() {
      map.off("render", onMapRender);
      setLayerVisible("route-line", true);
      setLayerVisible("trail-line", false);
      motoMarkerVisible = false;
      showStaticPreviewOnStage();
      animationRunning = false;
    }

    function frame(now) {
      try {
        frameInner(now);
      } catch (e) {
        console.error("Błąd w pętli animacji:", e);
        cleanupAfterFailure();
        reject(new Error(`Animacja przerwana błędem: ${e.message}`));
      }
    }

    function frameInner(now) {
      if (mode === "reveal") {
        const revealElapsed = now - revealStartTime;
        drawPhotoRevealFrame(revealWaypoint, revealElapsed);
        if (revealElapsed >= revealTotalMs()) {
          if (revealWaypoint.mediaType === "video" && revealWaypoint.photoImage) {
            revealWaypoint.photoImage.pause();
          }
          mode = "traveling";
          pausedAccumMs += revealTotalMs();
          settlePhotoBadge(revealWaypoint); // odtąd znacznik pokazuje miniaturkę tego zdjęcia
        }
        requestAnimationFrame(frame);
        return;
      }

      // KLUCZOWE: postęp liczony z czasu zegarowego (minus czas spędzony w pauzach na
      // zdjęcia), nie z liczby klatek — ta sama trasa trwa dokładnie `durationSeconds`
      // ruchu niezależnie od odświeżania ekranu; zdjęcia doliczają się jako dodatkowy czas.
      const elapsed = (now - startTime - pausedAccumMs) / 1000;
      const progress = Math.min(elapsed / durationSeconds, 1);
      const distAlong = progress * total;

      const pos = positionAtDistance(animCoords, cum, distAlong);
      const heading = headingAtDistance(animCoords, cum, distAlong);
      if (heading !== null) lastHeading = heading;

      const wobble = Math.sin((now - startTime) / 1000 * WOBBLE_FREQUENCY) * wobbleAmplitude;
      const { flip, rotate } = iconOrientation(lastHeading + wobble);

      motoMarkerState = { lng: pos[0], lat: pos[1], rotate, flip };
      map.getSource("trail").setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: trailUpToDistance(animCoords, cum, distAlong) },
      });
      currentDistanceKm = distAlong / 1000;

      // sprawdź, czy właśnie minęliśmy punkt ze zdjęciem — jeśli tak, wstrzymaj jazdę i pokaż je
      const justReached = waypointFeatures.find(
        (w) => !w.revealed && distAlong >= w.distanceAlong && w.photoImage
      );
      revealWaypointMarkersUpTo(distAlong);
      if (onProgress) onProgress(progress);

      if (justReached) {
        compositeMapToStage(); // upewnij się, że ostatnia klatka przed zamrożeniem jest aktualna
        drawMotoMarker();
        drawWaypointMarkers();
        drawDistanceCounter(currentDistanceKm);
          drawAttribution();
        frozenCtx.drawImage(stageCanvas, 0, 0);
        mode = "reveal";
        revealStartTime = now;
        revealWaypoint = justReached;
        // wideo gra tylko przez czas trwania reveal (grow+hold+shrink), nie cały klip —
        // start dokładnie w momencie wejścia w tryb reveal
        if (justReached.mediaType === "video" && justReached.photoImage) {
          justReached.photoImage.currentTime = 0;
          justReached.photoImage.play().catch(() => {}); // ignoruj rzadkie odrzucenie autoplay (mimo muted)
        }
        requestAnimationFrame(frame);
        return;
      }

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        showAllWaypointMarkers(); // zabezpieczenie na drobną rozbieżność dystansu resamplingu
        motoMarkerVisible = false; // na końcu znacznik dojazdu nie powinien nakładać się na znacznik celu
        map.off("render", onMapRender);

        const paintFinal = () => {
          compositeMapToStage();
          drawMotoMarker();
          drawWaypointMarkers();
          drawDistanceCounter(currentDistanceKm);
          drawAttribution();
        };
        paintFinal(); // natychmiastowy fallback, na wypadek gdyby render już się wykonał

        // UWAGA: ukrycie warstwy w MapLibre jest asynchroniczne (ten sam mechanizm
        // co wcześniej z ruchem znacznika) — czekamy na realne przemalowanie, zanim
        // złapiemy "czystą" ostatnią klatkę, plus mały bufor, żeby MediaRecorder
        // przy eksporcie na pewno zdążył ją nagrać zanim recorder.stop() się wykona.
        map.once("render", () => {
          paintFinal();
          setTimeout(() => {
            // UWAGA: stageCanvas celowo NIE chowa się tutaj — zostaje widoczny jako stan
            // spoczynkowy (ma miniaturki zdjęć i licznik km, których "goła" mapa nie ma).
            // Mapa i tak jest zablokowana, więc nic się nie traci. Chowamy go dopiero
            // przy wyjściu z ekranu animacji (patrz step3BackBtn / resetToStaticPreview).
            animationRunning = false;
            resolve();
          }, 100);
        });
      }
    }
    requestAnimationFrame(frame);
  });
}

/* ---------- 6) Eksport wideo (Canvas.captureStream + MediaRecorder, bez backendu) ---------- */
function pickSupportedMimeType() {
  // kolejność zgodna z tym, co realnie wspierają przeglądarki mobilne:
  // Safari/iOS nagrywa natywnie MP4, Chrome/Android — WebM
  const candidates = [
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

async function exportVideo(durationSeconds, onProgress) {
  if (!map) throw new Error("Najpierw pokaż trasę na mapie.");
  if (!window.MediaRecorder) {
    throw new Error("Ta przeglądarka nie obsługuje nagrywania wideo (MediaRecorder API).");
  }

  const mimeType = pickSupportedMimeType();
  if (!mimeType) {
    throw new Error("Nie znalazłem obsługiwanego formatu wideo na tym urządzeniu.");
  }

  ensureStageCanvas();
  const stream = stageCanvas.captureStream(30); // stały 30fps, niezależny od tego kiedy dokładnie mapa się przerysowuje
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  recorder.start();
  try {
    await animateRoute(lastRouteCoordinates, durationSeconds, onProgress);
  } finally {
    recorder.stop();
  }
  await stopped;

  const blob = new Blob(chunks, { type: mimeType });
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trasa.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  return { mimeType, ext, sizeBytes: blob.size };
}

/* ---------- 4) Podpięcie UI ---------- */
let lastWaypoints = null;
let waypointPhotos = []; // trwałe (nie resetowane przy ponownym pobraniu trasy), indeksowane jak waypoints

function showError(msg) {
  document.getElementById("errorBox").style.display = "block";
  document.getElementById("errorText").textContent = msg;
}
function hideError() {
  document.getElementById("errorBox").style.display = "none";
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = reject;
    img.src = url;
  });
}

// jak loadImageFromFile, ale obsługuje też pliki wideo — zwraca element
// <video> (wyciszony, playsInline, zapętlony) zamiast <img>, gotowy do
// rysowania klatek na canvasie tym samym mechanizmem co zdjęcia
function loadMediaFromFile(file) {
  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith("video/");
  if (!isVideo) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ type: "image", mediaEl: img, url });
      img.onerror = reject;
      img.src = url;
    });
  }
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = true;
    // KLUCZOWE: element MUSI być w DOM-ie (niewidoczny, ale nie display:none/
    // visibility:hidden — te wstrzymują dekodowanie). Chrome na Androidzie
    // przestaje odświeżać klatki elementu <video>, który nigdy nie trafił do
    // drzewa dokumentu — .play() "się udawał", ale rysowany na canvasie obraz
    // zostawał zamrożony na pierwszej klatce (nieruchome wideo podczas reveal).
    video.style.cssText = "position:fixed; width:2px; height:2px; opacity:0.01; pointer-events:none;";
    document.body.appendChild(video);
    video.onloadeddata = () => resolve({ type: "video", mediaEl: video, url });
    video.onerror = reject;
    video.src = url;
  });
}

// sprząta po podmienionym/usuniętym wideo — patrz komentarz w loadMediaFromFile,
// dlaczego <video> w ogóle trafia do DOM-u; bez tego zamieniane/usuwane pliki
// zostawiałyby po sobie osierocone, ukryte elementy <video> na stałe
function detachMediaEl(entry) {
  if (entry?.mediaEl instanceof HTMLVideoElement) {
    entry.mediaEl.pause();
    entry.mediaEl.remove();
  }
}

function getMediaSize(el) {
  return {
    w: el.videoWidth || el.naturalWidth || el.width,
    h: el.videoHeight || el.naturalHeight || el.height,
  };
}

/* ---------- Alternatywne źródło trasy: zbiór zdjęć z EXIF GPS + czas ---------- */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("sourceLink").style.display = btn.dataset.tab === "link" ? "block" : "none";
    document.getElementById("sourcePhotos").style.display = btn.dataset.tab === "photos" ? "block" : "none";
  });
});

const MAX_PHOTO_SET = 20;
let photoSetEntries = []; // { id, name, lat, lng, timestamp, img, url, status: 'ok'|'no-gps' }
let photoSetIdCounter = 0;
let manualOrderApplied = false; // po ręcznym przeciągnięciu przestajemy sortować po czasie

function getOrderedPhotoSetEntries() {
  const base = manualOrderApplied
    ? [...photoSetEntries]
    : [...photoSetEntries].sort((a, b) => a.timestamp - b.timestamp);
  // punkty start/meta bez zdjęcia zawsze trzymają swoją pozycję na krańcach trasy,
  // niezależnie od czasu zrobienia zdjęcia czy ręcznej kolejności reszty
  const start = base.filter((e) => e.kind === "start");
  const finish = base.filter((e) => e.kind === "finish");
  const middle = base.filter((e) => e.kind !== "start" && e.kind !== "finish");
  return [...start, ...middle, ...finish];
}

// jeśli którykolwiek świeżo dodany plik ma zapamiętaną pozycję (bo już kiedyś
// był w tej appce, np. przed przeładowaniem strony) - przywróć tę kolejność
// zamiast domyślnego sortowania po czasie zdjęcia
function applyRememberedOrder() {
  const mem = loadPhotoMemory();
  const hasRememberedOrder = photoSetEntries.some(
    (e) => e.fileKey && mem[e.fileKey] && typeof mem[e.fileKey].order === "number"
  );
  if (!hasRememberedOrder) return;
  photoSetEntries.sort((a, b) => {
    const oa = mem[a.fileKey]?.order ?? Infinity;
    const ob = mem[b.fileKey]?.order ?? Infinity;
    return oa - ob;
  });
  manualOrderApplied = true;
  renderPhotoSetList();
}

let replacingEntryId = null;


// Wyszukiwanie miejsc po nazwie (miasto, wieś, restauracja, atrakcja...) jako
// alternatywa dla wklejania współrzędnych — Photon (komoot.io), bo to darmowe,
// bez klucza API i celowo zaprojektowane pod podpowiedzi "na bieżąco" (w
// przeciwieństwie do Nominatim, którego regulamin zabrania używania go w ten
// sposób). Dane z OpenStreetMap: miasta/wsie/zabytki pokryte dobrze, mniejsze
// lokalne biznesy czasem brakują lub są nieaktualne — akceptowalny kompromis
// za brak klucza/limitów płatnego API.
const PLACE_SEARCH_MIN_CHARS = 3;
const PLACE_SEARCH_DEBOUNCE_MS = 300;


async function searchPlaces(query, signal) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`;
  const res = await fetch(url, { signal, referrerPolicy: "no-referrer", credentials: "omit" });
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
  const data = await res.json();
  return (data.features || [])
    .filter((f) => f.geometry?.coordinates?.length === 2)
    .map((f) => ({
      // etykieta to dane z zewnętrznego API (OSM może edytować każdy) — traktowana
      // wyłącznie jako tekst; współrzędne walidowane, zanim trafią do trasy
      label: String(formatPlaceLabel(f.properties || {})).slice(0, 200),
      lng: Number(f.geometry.coordinates[0]),
      lat: Number(f.geometry.coordinates[1]),
    }))
    .filter((item) => isValidLatLng(item.lat, item.lng));
}

const PHOTO_MEMORY_KEY = "routeVisualiserPhotoMemory_v1";

function photoMemoryKeyFor(file) {
  return `${file.name}__${file.size}`;
}

// Zapamiętane lokalizacje to dane wrażliwe (nazwy plików + miejsca), więc nie
// trzymamy ich bez końca: wpisy starsze niż 90 dni i nadmiarowe (ponad 300)
// są usuwane przy każdym zapisie. Użytkownik może też wyczyścić wszystko ręcznie.
const PHOTO_MEMORY_MAX_AGE_MS = 90 * 24 * 3600 * 1000;
const PHOTO_MEMORY_MAX_ENTRIES = 300;

function loadPhotoMemory() {
  try {
    const raw = localStorage.getItem(PHOTO_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean = Object.create(null);
    for (const [key, v] of Object.entries(parsed)) {
      if (!v || typeof v !== "object") continue;
      const ok = v.status === "ok" && isValidLatLng(v.lat, v.lng);
      clean[key] = {
        lat: ok ? v.lat : null,
        lng: ok ? v.lng : null,
        status: ok ? "ok" : "no-gps",
        order: Number.isFinite(v.order) ? v.order : undefined,
        savedAt: Number.isFinite(v.savedAt) ? v.savedAt : 0,
      };
    }
    return clean;
  } catch {
    return {};
  }
}

function prunePhotoMemory(mem, now = Date.now()) {
  const fresh = Object.entries(mem)
    // wpisy sprzed wprowadzenia savedAt (0) dostają datę "teraz" przy pierwszym zapisie
    .map(([k, v]) => [k, { ...v, savedAt: v.savedAt || now }])
    .filter(([, v]) => now - v.savedAt <= PHOTO_MEMORY_MAX_AGE_MS)
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, PHOTO_MEMORY_MAX_ENTRIES);
  return Object.fromEntries(fresh);
}

function clearStoredData() {
  try {
    localStorage.removeItem(PHOTO_MEMORY_KEY);
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // localStorage niedostępny - nie ma czego czyścić
  }
}

// Zapamiętuje ręcznie wpisane (lub odczytane z EXIF) współrzędne oraz kolejność
// KAŻDEGO pliku (po nazwie+rozmiarze), żeby po przeładowaniu strony i ponownym
// wybraniu TYCH SAMYCH plików nie trzeba było wpisywać współrzędnych od nowa.
// Samych plików (danych binarnych) nie da się sensownie trzymać w localStorage
// (limit ~5-10MB, a zdjęcia z telefonu to megabajty każde) - trzeba je wybrać
// ponownie, ale to żmudne wpisywanie współrzędnych już nie wróci.
function savePhotoMemory() {
  try {
    const mem = loadPhotoMemory();
    getOrderedPhotoSetEntries().forEach((e, i) => {
      if (!e.fileKey) return;
      mem[e.fileKey] = { lat: e.lat, lng: e.lng, status: e.status, order: i, savedAt: Date.now() };
    });
    localStorage.setItem(PHOTO_MEMORY_KEY, JSON.stringify(prunePhotoMemory(mem)));
  } catch {
    // localStorage niedostępny (np. tryb prywatny) - trudno, po prostu nie zapamiętujemy
  }
}

async function processPhotoFile(file) {
  const { type, mediaEl, url } = await loadMediaFromFile(file);
  let exif = null;
  try {
    exif = await exifr.parse(file);
  } catch {
    exif = null;
  }
  const hasGps = exif && Number.isFinite(exif.latitude) && Number.isFinite(exif.longitude);
  // DateTimeOriginal bywa nieobecne (filmy prawie zawsze, edytowane zdjęcia czasem)
  // - wtedy data modyfikacji pliku jako zapasowe źródło kolejności
  const timestamp = exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.getTime() : file.lastModified;

  let lat = hasGps ? exif.latitude : null;
  let lng = hasGps ? exif.longitude : null;
  let status = hasGps ? "ok" : "no-gps";

  const fileKey = photoMemoryKeyFor(file);
  if (!hasGps) {
    const remembered = loadPhotoMemory()[fileKey];
    if (remembered && remembered.status === "ok") {
      lat = remembered.lat;
      lng = remembered.lng;
      status = "ok";
    }
  }

  return {
    id: `p${photoSetIdCounter++}`,
    name: file.name,
    fileKey,
    type,
    mediaEl,
    url,
    timestamp,
    lat,
    lng,
    status,
  };
}

function updatePhotoSetNextBtn() {
  const allOk = photoSetEntries.length >= 2 && photoSetEntries.every((e) => e.status === "ok");
  document.getElementById("step1PhotosNextBtn").disabled = !allOk;
}

let dragCtx = null; // { entryId, pointerId, startY, row }

function setupDragHandles(container) {
  container.querySelectorAll(".drag-handle:not(.drag-handle-locked)").forEach((handle) => {
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const row = handle.closest(".photoset-row");
      dragCtx = { entryId: handle.dataset.id, pointerId: e.pointerId, startY: e.clientY, row };
      row.classList.add("dragging");
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener("pointermove", (e) => {
      if (!dragCtx || e.pointerId !== dragCtx.pointerId) return;
      const dy = e.clientY - dragCtx.startY;
      dragCtx.row.style.transform = `translateY(${dy}px)`;
    });

    handle.addEventListener("pointerup", (e) => {
      if (!dragCtx || e.pointerId !== dragCtx.pointerId) return;
      finishDrag(e.clientY);
    });

    handle.addEventListener("pointercancel", () => {
      if (!dragCtx) return;
      dragCtx.row.style.transform = "";
      dragCtx.row.classList.remove("dragging");
      dragCtx = null;
    });
  });
}

// Prosty, odporny model: podczas przeciągania rusza się TYLKO chwytany wiersz
// (wizualna informacja zwrotna), reszta listy nie przeskakuje na żywo — dopiero
// po puszczeniu palca/myszy liczymy docelową pozycję i przebudowujemy listę.
// Mniej "płynne" niż live-reflow, ale dużo mniej podatne na błędy bez możliwości
// przetestowania na żywym urządzeniu.
function finishDrag(dropClientY) {
  const { entryId, row } = dragCtx;
  const container = document.getElementById("photoSetList");
  const otherRows = Array.from(container.querySelectorAll(".photoset-row")).filter((r) => r !== row);

  const ordered = getOrderedPhotoSetEntries();
  let targetIndex = ordered.length - 1; // domyślnie: na koniec
  for (let i = 0; i < otherRows.length; i++) {
    const rect = otherRows[i].getBoundingClientRect();
    if (dropClientY < rect.top + rect.height / 2) {
      targetIndex = i;
      break;
    }
  }

  const fromIndex = ordered.findIndex((e) => e.id === entryId);
  if (fromIndex !== -1) {
    const newOrder = [...ordered];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(targetIndex, 0, moved);
    photoSetEntries = newOrder;
    manualOrderApplied = true;
    savePhotoMemory();
  }

  dragCtx = null;
  renderPhotoSetList();
}

function renderPhotoSetList() {
  const container = document.getElementById("photoSetList");
  container.innerHTML = "";
  const sorted = getOrderedPhotoSetEntries();

  sorted.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "photoset-row";
    const isPinned = entry.kind === "start" || entry.kind === "finish";
    const isEmpty = entry.kind === "empty";
    const noLocationLabel = isPinned || isEmpty
      ? "wpisz lokalizację"
      : entry.type === "video"
      ? "filmy nie mają GPS"
      : "brak GPS w zdjęciu";
    const statusHtml =
      entry.status === "ok"
        ? `<div class="photoset-status ok">✓ ${entry.lat.toFixed(4)}, ${entry.lng.toFixed(4)}</div>`
        : `<div class="photoset-status warn">⚠ brak lokalizacji (${noLocationLabel})</div>
           <div class="manual-coords-row">
             <input type="text" placeholder="Miasto, miejsce, restauracja… albo wklej współrzędne" class="manual-coords-input" autocomplete="off" data-id="${entry.id}">
             <button type="button" class="manual-coords-btn" data-id="${entry.id}">Ustaw</button>
             <div class="place-suggestions" data-id="${entry.id}" hidden></div>
           </div>
           <div class="manual-coords-error" data-id="${entry.id}"></div>`;

    let thumbTag;
    if (entry.kind === "start") {
      thumbTag = `<span class="thumb thumb-flag"><svg width="26" height="26" viewBox="0 0 24 24">
        <line x1="7" y1="4" x2="7" y2="20" stroke="#1b1f23" stroke-width="1.8"/>
        <rect x="7" y="4" width="11" height="7" fill="#2d6a4f" stroke="#1b1f23" stroke-width="1"/>
      </svg></span>`;
    } else if (entry.kind === "finish") {
      thumbTag = `<span class="thumb thumb-flag"><svg width="26" height="26" viewBox="0 0 24 24">
        <line x1="7" y1="4" x2="7" y2="20" stroke="#1b1f23" stroke-width="1.8"/>
        <rect x="7" y="4" width="5.5" height="3.5" fill="#1b1f23"/><rect x="12.5" y="4" width="5.5" height="3.5" fill="#fff" stroke="#1b1f23" stroke-width="0.4"/>
        <rect x="7" y="7.5" width="5.5" height="3.5" fill="#fff" stroke="#1b1f23" stroke-width="0.4"/><rect x="12.5" y="7.5" width="5.5" height="3.5" fill="#1b1f23"/>
      </svg></span>`;
    } else if (isEmpty) {
      thumbTag = `<span class="thumb thumb-flag" title="Pusty punkt — tylko koryguje trasę, niewidoczny w wideo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9a9a9a" stroke-width="1.8">
          <circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>
        </svg></span>`;
    } else if (entry.type === "video") {
      thumbTag = `<video class="thumb" src="${entry.url}" muted playsinline></video>`;
    } else {
      thumbTag = `<img class="thumb" src="${entry.url}">`;
    }

    const dragHandleHtml = isPinned
      ? `<span class="drag-handle drag-handle-locked" title="${entry.kind === "start" ? "Start" : "Meta"} — zawsze na ${entry.kind === "start" ? "początku" : "końcu"} trasy">📍</span>`
      : `<span class="drag-handle" data-id="${entry.id}" title="Przeciągnij, żeby zmienić kolejność">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="20" viewBox="0 0 16 20" fill="#5b5f63">
            <circle cx="4" cy="3" r="1.6"/><circle cx="12" cy="3" r="1.6"/>
            <circle cx="4" cy="10" r="1.6"/><circle cx="12" cy="10" r="1.6"/>
            <circle cx="4" cy="17" r="1.6"/><circle cx="12" cy="17" r="1.6"/>
          </svg>
        </span>`;
    const replaceBtnHtml = isPinned || isEmpty
      ? ""
      : `<button type="button" class="ps-replace-btn" data-id="${entry.id}" title="Podmień">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1b1f23" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
            <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
          </svg>
        </button>`;

    row.innerHTML = `
      ${dragHandleHtml}
      <span class="num">${i + 1}.</span>
      ${thumbTag}
      <div class="photoset-info">
        <div class="photoset-name">${escapeHtml(entry.name)}</div>
        ${statusHtml}
      </div>
      <div class="photoset-actions">
        ${replaceBtnHtml}
        <button type="button" class="ps-remove-btn" data-id="${entry.id}" title="Usuń">✕</button>
      </div>
    `;
    row.dataset.entryId = entry.id;
    container.appendChild(row);
  });

  setupDragHandles(container);

  container.querySelectorAll(".ps-remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      detachMediaEl(photoSetEntries.find((e) => e.id === btn.dataset.id));
      photoSetEntries = photoSetEntries.filter((e) => e.id !== btn.dataset.id);
      renderPhotoSetList();
      updatePhotoSetNextBtn();
      updatePinnedMarkerButtons();
    });
  });
  container.querySelectorAll(".ps-replace-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      replacingEntryId = btn.dataset.id;
      document.getElementById("photoSetReplaceInput").click();
    });
  });
  function applyCoords(entryId, lat, lng) {
    const entry = photoSetEntries.find((e) => e.id === entryId);
    if (!entry) return;
    entry.lat = lat;
    entry.lng = lng;
    entry.status = "ok";
    hideSuggestions(entryId);
    savePhotoMemory();
    renderPhotoSetList();
    updatePhotoSetNextBtn();
  }

  // stan podpowiedzi miejsc — jeden wpis na wiersz, żyje tylko do najbliższego
  // renderPhotoSetList() (dodanie/usunięcie/podmiana zdjęcia i tak przebudowuje
  // całą listę od zera, więc nie trzeba tego nigdzie trwale przechowywać)
  const placeSearchState = new Map(); // entryId -> { items, activeIndex, loading, controller, debounceTimer }

  function getSearchState(entryId) {
    let s = placeSearchState.get(entryId);
    if (!s) {
      s = { items: [], activeIndex: -1, loading: false, controller: null, debounceTimer: null };
      placeSearchState.set(entryId, s);
    }
    return s;
  }

  function hideSuggestions(entryId) {
    const state = getSearchState(entryId);
    state.controller?.abort();
    clearTimeout(state.debounceTimer);
    state.items = [];
    state.activeIndex = -1;
    state.loading = false;
    const box = container.querySelector(`.place-suggestions[data-id="${entryId}"]`);
    if (box) { box.hidden = true; box.innerHTML = ""; }
  }

  function applySuggestion(entryId, index) {
    const item = getSearchState(entryId).items[index];
    if (item) applyCoords(entryId, item.lat, item.lng);
  }

  function renderSuggestionsBox(entryId) {
    const state = getSearchState(entryId);
    const box = container.querySelector(`.place-suggestions[data-id="${entryId}"]`);
    if (!box) return;
    box.hidden = false;
    if (state.loading) {
      box.innerHTML = `<div class="place-suggestion-status">Szukam…</div>`;
      return;
    }
    if (!state.items.length) {
      box.innerHTML = `<div class="place-suggestion-status">Brak wyników</div>`;
      return;
    }
    box.innerHTML = state.items
      .map((item, i) => `<div class="place-suggestion-item${i === state.activeIndex ? " active" : ""}" data-index="${i}">${escapeHtml(item.label)}</div>`)
      .join("");
    box.querySelectorAll(".place-suggestion-item").forEach((el) => {
      // mousedown (nie click) — musi wystrzelić PRZED blur inputa, który chowa podpowiedzi
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        applySuggestion(entryId, Number(el.dataset.index));
      });
    });
  }

  function scheduleSearch(entryId, query) {
    const state = getSearchState(entryId);
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(async () => {
      state.controller?.abort();
      const controller = new AbortController();
      state.controller = controller;
      state.loading = true;
      state.activeIndex = -1;
      renderSuggestionsBox(entryId);
      try {
        const items = await searchPlaces(query, controller.signal);
        if (controller.signal.aborted) return;
        state.items = items;
      } catch {
        if (controller.signal.aborted) return;
        state.items = [];
      } finally {
        if (!controller.signal.aborted) {
          state.loading = false;
          renderSuggestionsBox(entryId);
        }
      }
    }, PLACE_SEARCH_DEBOUNCE_MS);
  }

  function applyManualCoords(entryId) {
    const input = container.querySelector(`.manual-coords-input[data-id="${entryId}"]`);
    const errEl = container.querySelector(`.manual-coords-error[data-id="${entryId}"]`);
    const parsed = parseLatLngPaste(input.value);
    if (parsed) {
      applyCoords(entryId, parsed.lat, parsed.lng);
      return;
    }
    const state = getSearchState(entryId);
    if (!state.loading && state.items.length) {
      applySuggestion(entryId, Math.max(state.activeIndex, 0));
      return;
    }
    input.style.borderColor = "#b3261e";
    if (errEl) errEl.textContent = "Nie rozpoznałem formatu. Wpisz nazwę miejsca (min. 3 litery) albo wklej współrzędne.";
  }

  container.querySelectorAll(".manual-coords-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyManualCoords(btn.dataset.id));
  });
  container.querySelectorAll(".manual-coords-input").forEach((input) => {
    const entryId = input.dataset.id;
    input.addEventListener("keydown", (e) => {
      const state = getSearchState(entryId);
      if (!state.loading && state.items.length) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          state.activeIndex = (state.activeIndex + 1) % state.items.length;
          renderSuggestionsBox(entryId);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          state.activeIndex = (state.activeIndex - 1 + state.items.length) % state.items.length;
          renderSuggestionsBox(entryId);
          return;
        }
      }
      if (e.key === "Escape") {
        hideSuggestions(entryId);
        return;
      }
      if (e.key === "Enter") applyManualCoords(entryId);
    });
    input.addEventListener("input", () => {
      input.style.borderColor = "";
      const errEl = container.querySelector(`.manual-coords-error[data-id="${entryId}"]`);
      if (errEl) errEl.textContent = "";
      const value = input.value.trim();
      if (parseLatLngPaste(value) || value.length < PLACE_SEARCH_MIN_CHARS) {
        hideSuggestions(entryId);
        return;
      }
      scheduleSearch(entryId, value);
    });
    input.addEventListener("blur", () => {
      // opóźnienie, żeby "mousedown" na podpowiedzi zdążył się złapać przed jej zniknięciem
      setTimeout(() => hideSuggestions(entryId), 150);
    });
  });

  document.getElementById("photoSetAddBtn").style.display =
    countPhotoLikeEntries() >= MAX_PHOTO_SET ? "none" : "block";
}

// punkty "puste" (bez zdjęcia, bez oznaczenia) nie wliczają się do limitu
// MAX_PHOTO_SET — służą wyłącznie do korekty trasy i można ich dodać dowolnie dużo
function countPhotoLikeEntries() {
  return photoSetEntries.filter((e) => e.kind !== "empty").length;
}

document.getElementById("photoSetAddBtn").addEventListener("click", () => {
  document.getElementById("photoSetInput").click();
});

function addPinnedMarker(kind) {
  if (photoSetEntries.some((e) => e.kind === kind)) return; // tylko jeden start i jedna meta
  photoSetEntries.push({
    id: `p${photoSetIdCounter++}`,
    name: kind === "start" ? "Start" : "Meta",
    fileKey: null,
    type: null,
    mediaEl: null,
    url: null,
    timestamp: kind === "start" ? -Infinity : Infinity, // niezależnie i tak wymuszone przez getOrderedPhotoSetEntries
    lat: null,
    lng: null,
    status: "no-gps",
    kind,
  });
  renderPhotoSetList();
  updatePhotoSetNextBtn();
  updatePinnedMarkerButtons();
}

function updatePinnedMarkerButtons() {
  document.getElementById("addStartMarkerBtn").disabled = photoSetEntries.some((e) => e.kind === "start");
  document.getElementById("addFinishMarkerBtn").disabled = photoSetEntries.some((e) => e.kind === "finish");
}

document.getElementById("addStartMarkerBtn").addEventListener("click", () => addPinnedMarker("start"));
document.getElementById("addFinishMarkerBtn").addEventListener("click", () => addPinnedMarker("finish"));

// "pusty" punkt — wyłącznie koryguje przebieg trasy (via-point dla routingu),
// bez żadnego oznaczenia w wideo (bez ikony, zdjęcia, numeru). W odróżnieniu
// od start/mety można go dodać dowolnie wiele razy i przeciągnąć w dowolne
// miejsce listy, żeby dopracować kształt trasy. Znacznik czasu = teraz, więc
// domyślnie ląduje na końcu chronologicznej kolejności (obok mety) — przeciągnij
// go w docelowe miejsce.
function addEmptyMarker() {
  photoSetEntries.push({
    id: `p${photoSetIdCounter++}`,
    name: "Pusty punkt",
    fileKey: null,
    type: null,
    mediaEl: null,
    url: null,
    timestamp: Date.now(),
    lat: null,
    lng: null,
    status: "no-gps",
    kind: "empty",
  });
  renderPhotoSetList();
  updatePhotoSetNextBtn();
}

document.getElementById("addEmptyMarkerBtn").addEventListener("click", addEmptyMarker);

document.getElementById("photoSetInput").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  e.target.value = ""; // pozwala wybrać te same pliki ponownie w przyszłości
  if (files.length === 0) return;
  hideError();

  const remaining = MAX_PHOTO_SET - countPhotoLikeEntries();
  if (files.length > remaining) {
    showError(`Możesz dodać jeszcze maksymalnie ${remaining} plików (limit ${MAX_PHOTO_SET} łącznie).`);
    return;
  }
  for (const file of files) {
    photoSetEntries.push(await processPhotoFile(file));
    renderPhotoSetList();
  }
  applyRememberedOrder();
  updatePhotoSetNextBtn();
});

document.getElementById("photoSetReplaceInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !replacingEntryId) return;
  const idx = photoSetEntries.findIndex((entry) => entry.id === replacingEntryId);
  if (idx === -1) return;
  const newEntry = await processPhotoFile(file);
  newEntry.id = replacingEntryId; // zachowaj pozycję na liście
  detachMediaEl(photoSetEntries[idx]);
  photoSetEntries[idx] = newEntry;
  replacingEntryId = null;
  renderPhotoSetList();
  updatePhotoSetNextBtn();
});

document.getElementById("step1PhotosNextBtn").addEventListener("click", async () => {
  const sorted = getOrderedPhotoSetEntries();
  if (sorted.length < 2) return;
  hideError();
  const btn = document.getElementById("step1PhotosNextBtn");
  btn.disabled = true;
  const originalLabel = btn.textContent;
  try {
    const waypoints = sorted.map((e, i) => ({
      name: e.kind ? e.name : `Zdjęcie ${i + 1}`,
      lat: e.lat,
      lng: e.lng,
      kind: e.kind ?? null,
    }));
    lastWaypoints = waypoints;
    // zdjęcia są już "dołączone" - to one były źródłem trasy
    waypointPhotos = sorted.map((e) => ({ type: e.type, mediaEl: e.mediaEl, url: e.url }));

    btn.textContent = "Liczę trasę…";
    const { coordinates, distanceMeters, durationSeconds } = await fetchRoadRoute(waypoints);
    lastRouteCoordinates = coordinates;

    renderWaypointsList(waypoints);
    document.getElementById("statDist").textContent = `${(distanceMeters / 1000).toFixed(0)} km`;
    document.getElementById("statDur").textContent = `${(durationSeconds / 3600).toFixed(1)} h`;
    showRouteOnMap(coordinates, waypoints);
    buildPhotosUI(waypoints); // pokaże już dołączone zdjęcia na liście

    goToScreen(2);
  } catch (e) {
    showError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
    updatePhotoSetNextBtn();
  }
});

// Nazwy punktów pochodzą z wklejonego linku (czyli z niezaufanego źródła) —
// zawsze wstawiamy je jako tekst (textContent), nigdy jako HTML.
function renderWaypointsList(waypoints) {
  const list = document.getElementById("waypointsList");
  list.textContent = "";
  waypoints.forEach((w) => {
    const row = document.createElement("div");
    const suffix = w.kind === "empty" ? " (niewidoczny, tylko koryguje trasę)" : "";
    row.textContent = `${w.name}${suffix} (${w.lat.toFixed(3)}, ${w.lng.toFixed(3)})`;
    list.appendChild(row);
  });
}

function buildPhotosUI(waypoints) {
  waypointPhotos = waypoints.map((_, i) => waypointPhotos[i] ?? null); // zachowaj już wybrane, dopasuj długość
  const list = document.getElementById("photosList");
  list.innerHTML = "";
  waypoints.forEach((w, i) => {
    // punkty "puste" nie mają w ogóle opcji dołączenia zdjęcia — to ich jedyna
    // cecha: modyfikują trasę bez żadnego oznaczenia (ikona, zdjęcie, numer)
    if (w.kind === "empty") return;
    const row = document.createElement("div");
    row.className = "photo-row";
    row.innerHTML = `
      <span class="num">${i + 1}.</span>
      <span class="name">${escapeHtml(w.name)}</span>
      <span class="thumb-wrap" id="thumbWrap-${i}"></span>
      <input type="file" accept="image/*,video/*" id="photoInput-${i}">
    `;
    list.appendChild(row);

    const thumbWrap = row.querySelector(`#thumbWrap-${i}`);
    const isStart = i === 0;
    const isFinish = i === waypoints.length - 1;
    function renderThumb(entry) {
      thumbWrap.innerHTML = "";
      if (entry) {
        const el = document.createElement(entry.type === "video" ? "video" : "img");
        el.className = "thumb";
        el.src = entry.url;
        if (entry.type === "video") {
          el.muted = true;
          el.playsInline = true;
        }
        thumbWrap.appendChild(el);
        return;
      }
      // brak zdjęcia - jeśli to pierwszy/ostatni punkt, pokaż podgląd tej samej
      // flagi start/meta, która i tak pokaże się w animacji, zamiast pustego miejsca
      if (isFinish) {
        thumbWrap.innerHTML = `<span class="thumb thumb-flag"><svg width="26" height="26" viewBox="0 0 24 24">
          <line x1="7" y1="4" x2="7" y2="20" stroke="#1b1f23" stroke-width="1.8"/>
          <rect x="7" y="4" width="5.5" height="3.5" fill="#1b1f23"/><rect x="12.5" y="4" width="5.5" height="3.5" fill="#fff" stroke="#1b1f23" stroke-width="0.4"/>
          <rect x="7" y="7.5" width="5.5" height="3.5" fill="#fff" stroke="#1b1f23" stroke-width="0.4"/><rect x="12.5" y="7.5" width="5.5" height="3.5" fill="#1b1f23"/>
        </svg></span>`;
      } else if (isStart) {
        thumbWrap.innerHTML = `<span class="thumb thumb-flag"><svg width="26" height="26" viewBox="0 0 24 24">
          <line x1="7" y1="4" x2="7" y2="20" stroke="#1b1f23" stroke-width="1.8"/>
          <rect x="7" y="4" width="11" height="7" fill="#2d6a4f" stroke="#1b1f23" stroke-width="1"/>
        </svg></span>`;
      }
    }
    renderThumb(waypointPhotos[i]);

    row.querySelector(`#photoInput-${i}`).addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const entry = await loadMediaFromFile(file);
        detachMediaEl(waypointPhotos[i]);
        waypointPhotos[i] = entry;
        renderThumb(entry);
        // KLUCZOWE: waypointFeatures budują się od razu po pobraniu trasy (krok 1),
        // czyli zanim zdążysz dołączyć zdjęcia na ekranie 2 — bez tej synchronizacji
        // dołączone zdjęcie/wideo nigdy nie trafiłoby do animacji.
        if (waypointFeatures[i]) {
          waypointFeatures[i].photoImage = entry.mediaEl;
          waypointFeatures[i].mediaType = entry.type;
        }
      } catch {
        showError(`Nie udało się wczytać pliku dla punktu "${w.name}".`);
      }
    });
  });
  document.getElementById("photosCard").style.display = "block";
}

document.getElementById("step1NextBtn").addEventListener("click", async () => {
  hideError();
  const url = document.getElementById("linkInput").value.trim();
  const btn = document.getElementById("step1NextBtn");
  btn.disabled = true;
  try {
    btn.textContent = "Wyciągam punkty…";
    const { waypoints } = parseGoogleMapsLink(url);
    lastWaypoints = waypoints;
    buildPhotosUI(waypoints);

    btn.textContent = "Liczę trasę…";
    const { coordinates, distanceMeters, durationSeconds } = await fetchRoadRoute(waypoints);
    lastRouteCoordinates = coordinates;

    renderWaypointsList(waypoints);
    document.getElementById("statDist").textContent = `${(distanceMeters / 1000).toFixed(0)} km`;
    document.getElementById("statDur").textContent = `${(durationSeconds / 3600).toFixed(1)} h`;
    showRouteOnMap(coordinates, waypoints);

    goToScreen(2);
  } catch (e) {
    showError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Dalej: Wyciągnij punkty →";
  }
});

const BASE_DURATION_SECONDS = 7; // odpowiada prędkości = 1, tak jak dotychczasowe domyślne tempo


// łączy pole tekstowe z suwakiem - edycja w jednym aktualizuje drugie,
// oba wywołują ten sam onChange
function wireCombo(textId, sliderId, { toValue, toSlider, fallback, onChange }) {
  const textEl = document.getElementById(textId);
  const sliderEl = document.getElementById(sliderId);

  textEl.addEventListener("input", () => {
    const v = parseDecimalInput(textEl.value, fallback);
    sliderEl.value = toSlider(v);
    onChange(v);
    saveSettings();
  });
  sliderEl.addEventListener("input", () => {
    const v = toValue(parseInt(sliderEl.value, 10));
    textEl.value = formatNum(v);
    onChange(v);
    saveSettings();
  });

  function setValue(v) {
    textEl.value = formatNum(v);
    sliderEl.value = toSlider(v);
    onChange(v);
  }
  setValue.default = fallback; // do przycisku "przywróć domyślne" przy suwaku
  return setValue;
}

const setSpeed = wireCombo("speedInput", "speedSlider", {
  toValue: (raw) => raw / 10,
  toSlider: (v) => Math.round(v * 10),
  fallback: 1,
  onChange: (v) => {
    speedMultiplier = v;
    selectedDuration = BASE_DURATION_SECONDS / v;
  },
});

const setWobble = wireCombo("wobbleInput", "wobbleSlider", {
  toValue: (raw) => raw,
  toSlider: (v) => Math.round(v),
  fallback: 0,
  onChange: (v) => {
    wobbleAmplitude = v * 0.6; // 0-10 -> 0-6°, 0 = całkowicie wyłączone
  },
});

const setIconSize = wireCombo("sizeInput", "sizeSlider", {
  toValue: (raw) => raw / 10,
  toSlider: (v) => Math.round(v * 10),
  fallback: 0.4,
  onChange: (v) => {
    iconScale = v;
  },
});

const setGrow = wireCombo("growInput", "growSlider", {
  toValue: (raw) => raw / 10,
  toSlider: (v) => Math.round(v * 10),
  fallback: 1.5,
  onChange: (v) => {
    REVEAL_GROW_MS = v * 1000;
  },
});

const setHold = wireCombo("holdInput", "holdSlider", {
  toValue: (raw) => raw / 10,
  toSlider: (v) => Math.round(v * 10),
  fallback: 1,
  onChange: (v) => {
    REVEAL_HOLD_MS = v * 1000;
  },
});

// kliknięcie w "(domyślnie: X)" przy suwaku przywraca jego wartość fabryczną
const RESET_SETTERS = { speed: setSpeed, wobble: setWobble, size: setIconSize, grow: setGrow, hold: setHold };
document.querySelectorAll(".reset-default").forEach((el) => {
  const setter = RESET_SETTERS[el.dataset.reset];
  el.addEventListener("click", () => {
    setter(setter.default);
    saveSettings();
  });
});

async function playAnimation() {
  if (!lastRouteCoordinates) return;
  hideError();
  const btn = document.getElementById("playAnimBtn");
  btn.disabled = true;
  btn.textContent = `Animacja (prędkość ${speedMultiplier})…`;
  try {
    await animateRoute(lastRouteCoordinates, selectedDuration);
  } catch (e) {
    showError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "▶ Odtwórz animację";
  }
}
document.getElementById("playAnimBtn").addEventListener("click", playAnimation);

document.getElementById("exportBtn").addEventListener("click", async () => {
  if (!lastRouteCoordinates) return;
  hideError();
  const btn = document.getElementById("exportBtn");
  btn.disabled = true;
  btn.textContent = "Nagrywam… 0%";
  try {
    const result = await exportVideo(selectedDuration, (progress) => {
      btn.textContent = `Nagrywam… ${Math.round(progress * 100)}%`;
    });
    btn.textContent = `Pobrano (.${result.ext}) ✓`;
    setTimeout(() => {
      btn.textContent = "Pobierz wideo";
    }, 2500);
  } catch (e) {
    showError(e.message);
    btn.textContent = "Pobierz wideo";
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Nawigacja między ekranami ---------- */
function resetToStaticPreview() {
  if (map) {
    setLayerVisible("route-line", true);
    setLayerVisible("trail-line", false);
    motoMarkerVisible = false;
    showStaticPreviewOnStage();
  }
}

function goToScreen(n) {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`screen${i}`).style.display = i === n ? "block" : "none";
  }
  window.scrollTo({ top: 0, behavior: "instant" });
  if (n === 2) resetToStaticPreview(); // wracamy z animacji - pokaż z powrotem statyczną trasę, nie zamrożoną klatkę
  if (n === 3) playAnimation(); // od razu pokaż efekt wchodząc na ekran animacji
}

document.getElementById("step2BackBtn").addEventListener("click", () => goToScreen(1));
document.getElementById("step2NextBtn").addEventListener("click", () => goToScreen(3));
document.getElementById("step3BackBtn").addEventListener("click", () => goToScreen(2));
document.getElementById("step3NextBtn").addEventListener("click", () => goToScreen(4));
document.getElementById("step4BackBtn").addEventListener("click", () => goToScreen(3));
document.getElementById("restartBtn").addEventListener("click", () => goToScreen(1));

document.querySelectorAll(".options-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.getElementById(btn.dataset.target);
    const isHidden = target.style.display === "none";
    target.style.display = isHidden ? "block" : "none";
    btn.textContent = btn.textContent.replace(isHidden ? "▾" : "▴", isHidden ? "▴" : "▾");
  });
});

// 64 kolory: 8 odcieni x 8 poziomów jasności
const COLOR_PALETTE = (() => {
  const hues = [0, 25, 45, 90, 160, 200, 260, 320];
  const lightnesses = [25, 35, 45, 55, 65, 75, 85, 92];
  const colors = [];
  for (const l of lightnesses) {
    for (const h of hues) colors.push(`hsl(${h}, 75%, ${l}%)`);
  }
  return colors;
})();
routeColor = COLOR_PALETTE[3 * 8 + 1]; // pomarańczowawy, zbliżony do dotychczasowego domyślnego

function applyRouteColor(color) {
  routeColor = color;
  document.querySelectorAll(".color-swatch").forEach((el) => el.classList.toggle("active", el.dataset.color === color));
  const toggle = document.getElementById("colorSwatchToggle");
  if (toggle) toggle.style.background = color;
  if (map?.getLayer("route-line")) map.setPaintProperty("route-line", "line-color", color);
  if (map?.getLayer("trail-line")) map.setPaintProperty("trail-line", "line-color", color);
}

function buildColorPickerUI() {
  const container = document.getElementById("colorPicker");
  container.innerHTML = "";
  COLOR_PALETTE.forEach((color) => {
    const btn = document.createElement("button");
    btn.className = "color-swatch" + (color === routeColor ? " active" : "");
    btn.dataset.color = color;
    btn.style.background = color;
    btn.addEventListener("click", () => {
      applyRouteColor(color);
      saveSettings();
    });
    container.appendChild(btn);
  });
  document.getElementById("colorSwatchToggle").style.background = routeColor;
}

document.getElementById("colorSwatchToggle").addEventListener("click", () => {
  const picker = document.getElementById("colorPicker");
  picker.style.display = picker.style.display === "none" ? "grid" : "none";
});

/* ---------- Proporcje wideo ---------- */
const ASPECT_RATIOS = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "2:3": { w: 1080, h: 1620 },
  "3:4": { w: 1080, h: 1440 },
  "19.5:9": { w: 1080, h: 2340 },
};
let currentRatioKey = "9:16";

function applyAspectRatio(key) {
  if (!ASPECT_RATIOS[key]) return;
  currentRatioKey = key;
  const { w, h } = ASPECT_RATIOS[key];
  STAGE_W = w;
  STAGE_H = h;
  document.getElementById("mapWrap").style.aspectRatio = `${w} / ${h}`;
  if (stageCanvas) {
    stageCanvas.width = w;
    stageCanvas.height = h;
  }
  if (frozenCanvas) {
    frozenCanvas.width = w;
    frozenCanvas.height = h;
  }
  if (map) {
    map.resize();
    if (lastRouteCoordinates) {
      fitToRoute(lastRouteCoordinates);
      showStaticPreviewOnStage();
    }
  }
}

document.getElementById("ratioSelect").addEventListener("change", (e) => {
  applyAspectRatio(e.target.value);
  saveSettings();
});

/* ---------- Zapamiętywanie ustawień (localStorage) ---------- */
const SETTINGS_KEY = "routeVisualiserSettings_v1";

function saveSettings() {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        routeColor,
        selectedIconKey,
        iconScale,
        speedMultiplier,
        wobbleValue: parseInt(document.getElementById("wobbleSlider").value, 10),
        growSeconds: REVEAL_GROW_MS / 1000,
        holdSeconds: REVEAL_HOLD_MS / 1000,
        ratioKey: currentRatioKey,
      })
    );
  } catch {
    // localStorage może być niedostępny (np. tryb prywatny) - po prostu nie zapisujemy
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function applyLoadedSettings() {
  const s = loadSettings();
  if (!s) return s;
  // wartość z localStorage trafia do stylu CSS i stylu mapy - akceptujemy tylko kolory z palety
  if (COLOR_PALETTE.includes(s.routeColor)) routeColor = s.routeColor;
  if (s.selectedIconKey && ICON_LIBRARY[s.selectedIconKey]) selectedIconKey = s.selectedIconKey;
  return s;
}

function applyLoadedSettingsPostBuild(s) {
  if (!s) return;
  if (typeof s.iconScale === "number") setIconSize(s.iconScale);
  if (typeof s.speedMultiplier === "number") setSpeed(s.speedMultiplier);
  if (typeof s.wobbleValue === "number") setWobble(s.wobbleValue);
  if (typeof s.growSeconds === "number") setGrow(s.growSeconds);
  if (typeof s.holdSeconds === "number") setHold(s.holdSeconds);
  if (s.ratioKey && ASPECT_RATIOS[s.ratioKey]) {
    currentRatioKey = s.ratioKey;
    document.getElementById("ratioSelect").value = s.ratioKey;
    applyAspectRatio(s.ratioKey);
  }
}

// kolejność ważna: najpierw surowe wartości (ikona/kolor) PRZED zbudowaniem
// pickerów, żeby renderowały się od razu z poprawnym zaznaczeniem
const _loadedSettings = applyLoadedSettings();
buildIconPickerUI();
buildColorPickerUI();
applyLoadedSettingsPostBuild(_loadedSettings);

/* ---------- Prywatność: ręczne czyszczenie danych zapisanych w przeglądarce ---------- */
document.getElementById("clearStoredDataBtn").addEventListener("click", () => {
  clearStoredData();
  const info = document.getElementById("clearStoredDataInfo");
  info.textContent = "Usunięto zapamiętane lokalizacje plików i ustawienia z tej przeglądarki.";
});
