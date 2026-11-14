"use strict";

/* ---------- 2) Wyznaczanie trasy ---------- */
// Publiczne serwery OSRM: demo projektu OSRM (samochód) oraz instancje FOSSGIS
// (rower, pieszo). Tryb "straight" nie korzysta z sieci — liczony jest lokalnie.
const ROUTING_ENDPOINTS = {
  driving: "https://router.project-osrm.org/route/v1/driving",
  cycling: "https://routing.openstreetmap.de/routed-bike/route/v1/driving",
  walking: "https://routing.openstreetmap.de/routed-foot/route/v1/driving",
};
const ROUTING_TIMEOUT_MS = 20000;
const ROUTING_MAX_ATTEMPTS = 3;

function validateWaypoints(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    throw new Error("Do zbudowania trasy potrzebne są co najmniej dwa punkty.");
  }
  waypoints.forEach((w, i) => {
    if (!isValidLatLng(w.lat, w.lng)) {
      throw new Error(
        `Punkt ${i + 1} (${w.name ?? "bez nazwy"}) ma nieprawidłowe współrzędne ` +
        `(${w.lat}, ${w.lng}). Popraw go i spróbuj ponownie.`
      );
    }
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Pobiera trasę drogową. Ponawia przy błędach PRZEJŚCIOWYCH: brak połączenia,
// przekroczony czas, HTTP 429 (limit zapytań) i 5xx (przeciążony serwer).
// Błędy 4xx oznaczają złe dane wejściowe — ponawianie nic by nie dało.
async function fetchRoadRoute(waypoints, mode = "driving") {
  validateWaypoints(waypoints);
  const base = ROUTING_ENDPOINTS[mode] ?? ROUTING_ENDPOINTS.driving;
  const coordsParam = waypoints.map((w) => `${w.lng},${w.lat}`).join(";");
  const url = `${base}/${coordsParam}?overview=full&geometries=geojson&steps=false`;

  let lastProblem = "";
  for (let attempt = 1; attempt <= ROUTING_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(1200 * (attempt - 1));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ROUTING_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, { referrerPolicy: "no-referrer", credentials: "omit", signal: controller.signal });
    } catch (networkErr) {
      lastProblem = controller.signal.aborted ? "serwer nie odpowiedział na czas" : "brak połączenia z serwerem";
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429 || res.status >= 500) {
      lastProblem = res.status === 429 ? "serwer ogranicza liczbę zapytań (HTTP 429)" : `serwer zwrócił błąd HTTP ${res.status}`;
      continue;
    }
    if (!res.ok) {
      // pokaż realną treść błędu z OSRM (zwykle konkretny powód), nie tylko goły kod HTTP
      let detail = "";
      try {
        const body = await res.json();
        if (body?.message) detail = `: ${body.message}`;
        else if (body?.code) detail = `: ${body.code}`;
      } catch {
        // odpowiedź nie była JSON-em - zostaje sam kod HTTP
      }
      throw new Error(`Serwer routingu odrzucił zapytanie (HTTP ${res.status}${detail}).`);
    }

    let data;
    try {
      data = await res.json();
    } catch {
      lastProblem = "serwer zwrócił nieczytelną odpowiedź";
      continue;
    }
    const route = data?.routes?.[0];
    if (data?.code !== "Ok" || !route?.geometry?.coordinates?.length) {
      throw new Error(`Nie udało się policzyć trasy (code: ${data?.code ?? "brak"}). Sprawdź, czy wszystkie punkty leżą w pobliżu dróg.`);
    }
    return {
      coordinates: route.geometry.coordinates, // [[lng,lat], ...]
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      // pozycje punktów wzdłuż trasy liczone z odcinków routera — patrz waypointFractionsFromLegs
      waypointFractions: waypointFractionsFromLegs(route.legs),
    };
  }
  throw new Error(
    `Nie udało się pobrać trasy po ${ROUTING_MAX_ATTEMPTS} próbach (${lastProblem}).\n` +
    "To darmowy, publiczny serwer wyznaczania tras bez gwarancji dostępności — bywa chwilowo przeciążony. " +
    "Sprawdź połączenie z internetem i spróbuj ponownie za chwilę."
  );
}

// trasa dla wybranego sposobu podróży: drogami (serwer routingu) albo w linii prostej (lokalnie)
async function computeRoute(waypoints, mode) {
  if (mode === "straight") {
    validateWaypoints(waypoints);
    return buildStraightRoute(waypoints);
  }
  return fetchRoadRoute(waypoints, mode);
}

/* ---------- 4) Podpięcie UI ---------- */
let lastWaypoints = null;
let waypointPhotos = []; // trwałe (nie resetowane przy ponownym pobraniu trasy), indeksowane jak waypoints

// Komunikat błędu jest na górze strony i sam przewija się w pole widzenia —
// wcześniej lądował pod całym ekranem i łatwo było go nie zauważyć.
function showError(msg) {
  const box = document.getElementById("errorBox");
  box.style.display = "block";
  document.getElementById("errorText").textContent = msg;
  box.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function hideError() {
  document.getElementById("errorBox").style.display = "none";
}

// Zdjęcia są od razu zmniejszane do rozmiaru, jakiego faktycznie potrzebuje
// kadr wideo. Trzymanie 20 zdjęć z telefonu w pełnej rozdzielczości (po
// zdekodowaniu ~50-200 MB każde) potrafiło zabić kartę przeglądarki na telefonie.
const MAX_MEDIA_SIDE = 2048;
const LIST_THUMB_SIDE = 120;

async function decodeImageFile(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // np. format, którego createImageBitmap nie zna — próbujemy jeszcze przez <img>
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
    img.src = url;
  });
}

function drawScaled(source, maxSide) {
  const { w, h } = getMediaSize(source);
  const k = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function unsupportedFileError(file) {
  const looksHeic = /\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type);
  return new Error(
    looksHeic
      ? `„${file.name}”: ta przeglądarka nie potrafi otworzyć zdjęć HEIC. Zapisz zdjęcie jako JPEG (albo w ustawieniach aparatu wybierz format „Najbardziej zgodny”).`
      : `„${file.name}”: nie udało się otworzyć pliku — format nie jest obsługiwany przez tę przeglądarkę albo plik jest uszkodzony.`
  );
}

// Wczytuje zdjęcie albo film do postaci gotowej do rysowania na canvasie.
// Zwraca { type, mediaEl, url, file }:
//  - zdjęcie: mediaEl = zmniejszony canvas, url = mała miniaturka (data URL) do list
//  - film: mediaEl = <video> (wyciszony, zapętlony), url = adres blob: pliku
async function loadMediaFromFile(file) {
  const isVideo = file.type.startsWith("video/");
  if (!isVideo) {
    let decoded;
    try {
      decoded = await decodeImageFile(file);
    } catch {
      throw unsupportedFileError(file);
    }
    const mediaEl = drawScaled(decoded, MAX_MEDIA_SIDE);
    decoded.close?.(); // ImageBitmap w pełnej rozdzielczości nie jest już potrzebny
    const url = drawScaled(mediaEl, LIST_THUMB_SIDE).toDataURL("image/jpeg", 0.8);
    return { type: "image", mediaEl, url, file };
  }
  const url = URL.createObjectURL(file);
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
    video.onloadeddata = () => resolve({ type: "video", mediaEl: video, url, file });
    video.onerror = () => {
      video.remove();
      URL.revokeObjectURL(url);
      reject(unsupportedFileError(file));
    };
    video.src = url;
  });
}

// Zwalnia zasoby po podmienionym/usuniętym pliku: ukryty element <video>,
// adres blob: i pamięć zdjęcia. Ten sam wpis bywa współdzielony między listą
// zdjęć (krok 1) a przystankami (krok 2), więc zwalniamy go dopiero wtedy,
// gdy nie korzysta z niego już żadne z tych miejsc.
function releaseMedia(entry) {
  if (!entry?.mediaEl) return;
  const stillUsed =
    photoSetEntries.some((e) => e.mediaEl === entry.mediaEl) ||
    waypointPhotos.some((e) => e?.mediaEl === entry.mediaEl);
  if (stillUsed) return;
  if (entry.mediaEl instanceof HTMLVideoElement) {
    entry.mediaEl.pause();
    entry.mediaEl.removeAttribute("src");
    entry.mediaEl.load();
    entry.mediaEl.remove();
    if (entry.url) URL.revokeObjectURL(entry.url);
  } else if (entry.mediaEl instanceof HTMLCanvasElement) {
    entry.mediaEl.width = entry.mediaEl.height = 0; // natychmiast oddaje pamięć bitmapy
  }
  entry.mediaEl = null;
}

/* ---------- Alternatywne źródło trasy: zbiór zdjęć z EXIF GPS + czas ---------- */
const SOURCE_PANELS = { link: "sourceLink", photos: "sourcePhotos", gpx: "sourceGpx" };

function selectSourceTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
  });
  Object.entries(SOURCE_PANELS).forEach(([key, id]) => {
    document.getElementById(id).style.display = key === tab ? "block" : "none";
  });
  // ślad GPX jest gotową trasą — sposób podróży dotyczy tylko tras wyznaczanych
  document.getElementById("travelModeCard").style.display = tab === "gpx" ? "none" : "block";
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    hideError();
    selectSourceTab(btn.dataset.tab);
  });
});

/* ---------- Sposób podróży ---------- */
let travelMode = "driving";
let travelModeTouched = false; // użytkownik wybrał sam — nie nadpisujemy trybem odczytanym z linku

function setTravelMode(mode) {
  if (!TRAVEL_MODES.includes(mode)) return;
  travelMode = mode;
  document.getElementById("travelModeSelect").value = mode;
}

document.getElementById("travelModeSelect").addEventListener("change", (e) => {
  travelModeTouched = true;
  setTravelMode(e.target.value);
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
  deleteSavedProject(); // zapisany projekt (trasa + pliki) w IndexedDB
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
  // (plik bez GPS/EXIF nie jest błędem — wtedy lokalizację wpisuje się ręcznie)
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
    file,
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

function movePhotoSetEntry(entryId, delta) {
  const ordered = getOrderedPhotoSetEntries();
  const from = ordered.findIndex((e) => e.id === entryId);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= ordered.length) return;
  if (ordered[to].kind === "start" || ordered[to].kind === "finish") return; // start/meta trzymają krańce
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  photoSetEntries = ordered;
  manualOrderApplied = true;
  savePhotoMemory();
  renderPhotoSetList();
  // po przebudowie listy fokus wraca na ten sam przycisk tego samego wiersza
  const again = document.querySelector(`.ps-move-btn[data-id="${entryId}"][data-delta="${delta}"]`);
  (again && !again.disabled ? again : document.querySelector(`.ps-move-btn[data-id="${entryId}"]:not([disabled])`))?.focus();
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
             <input type="text" placeholder="Miasto, miejsce, restauracja… albo wklej współrzędne" aria-label="Lokalizacja punktu: nazwa miejsca albo współrzędne" class="manual-coords-input" autocomplete="off" data-id="${entry.id}">
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
      thumbTag = `<img class="thumb" src="${entry.url}" alt="">`;
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
      : `<button type="button" class="ps-replace-btn" data-id="${entry.id}" title="Podmień" aria-label="Podmień plik">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1b1f23" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
            <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
          </svg>
        </button>`;

    // strzałki góra/dół: zmiana kolejności bez przeciągania (klawiatura, czytniki ekranu)
    const middle = sorted.filter((e) => e.kind !== "start" && e.kind !== "finish");
    const posInMiddle = middle.indexOf(entry);
    const moveBtnsHtml = isPinned
      ? ""
      : `<button type="button" class="ps-move-btn" data-id="${entry.id}" data-delta="-1" aria-label="Przesuń wyżej" title="Przesuń wyżej"${posInMiddle === 0 ? " disabled" : ""}>▲</button>
         <button type="button" class="ps-move-btn" data-id="${entry.id}" data-delta="1" aria-label="Przesuń niżej" title="Przesuń niżej"${posInMiddle === middle.length - 1 ? " disabled" : ""}>▼</button>`;

    row.innerHTML = `
      ${dragHandleHtml}
      <span class="num">${i + 1}.</span>
      ${thumbTag}
      <div class="photoset-info">
        <div class="photoset-name">${escapeHtml(entry.name)}</div>
        ${statusHtml}
      </div>
      <div class="photoset-actions">
        ${moveBtnsHtml}
        ${replaceBtnHtml}
        <button type="button" class="ps-remove-btn" data-id="${entry.id}" title="Usuń" aria-label="Usuń">✕</button>
      </div>
    `;
    row.dataset.entryId = entry.id;
    container.appendChild(row);
  });

  setupDragHandles(container);

  container.querySelectorAll(".ps-remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const removed = photoSetEntries.find((e) => e.id === btn.dataset.id);
      photoSetEntries = photoSetEntries.filter((e) => e.id !== btn.dataset.id);
      releaseMedia(removed);
      renderPhotoSetList();
      updatePhotoSetNextBtn();
      updatePinnedMarkerButtons();
    });
  });
  container.querySelectorAll(".ps-move-btn").forEach((btn) => {
    btn.addEventListener("click", () => movePhotoSetEntry(btn.dataset.id, Number(btn.dataset.delta)));
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
  // ponad limit: bierzemy tyle, ile się mieści, zamiast odrzucać cały wybór
  const skippedOverLimit = Math.max(0, files.length - remaining);
  if (skippedOverLimit > 0) files.length = Math.max(0, remaining);
  // jeden nieczytelny plik (np. HEIC w Chrome na Androidzie) nie może przerwać
  // wczytywania pozostałych — zbieramy błędy i pokazujemy je razem na końcu
  const failures = [];
  const addBtn = document.getElementById("photoSetAddBtn");
  const addBtnLabel = addBtn.textContent;
  addBtn.disabled = true;
  try {
    for (let i = 0; i < files.length; i++) {
      addBtn.textContent = `Wczytuję ${i + 1} z ${files.length}…`;
      try {
        photoSetEntries.push(await processPhotoFile(files[i]));
        renderPhotoSetList();
      } catch (err) {
        failures.push(err?.message || `„${files[i].name}”: nie udało się wczytać pliku.`);
      }
    }
  } finally {
    addBtn.disabled = false;
    addBtn.textContent = addBtnLabel;
  }
  applyRememberedOrder();
  renderPhotoSetList();
  updatePhotoSetNextBtn();
  const notes = [];
  if (skippedOverLimit > 0) {
    notes.push(
      files.length > 0
        ? `Dodano pierwsze ${files.length} plików — pozostałe ${skippedOverLimit} pominięto, bo limit to ${MAX_PHOTO_SET}.`
        : `Limit ${MAX_PHOTO_SET} plików jest już wykorzystany — usuń któryś, żeby dodać nowy.`
    );
  }
  if (failures.length) {
    notes.push(`Pominięto ${failures.length} z ${files.length} plików:\n${failures.join("\n")}`);
  }
  if (notes.length) showError(notes.join("\n\n"));
});

document.getElementById("photoSetReplaceInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !replacingEntryId) return;
  const targetId = replacingEntryId;
  replacingEntryId = null;
  hideError();
  let newEntry;
  try {
    newEntry = await processPhotoFile(file);
  } catch (err) {
    showError(err?.message || "Nie udało się wczytać pliku.");
    return;
  }
  const idx = photoSetEntries.findIndex((entry) => entry.id === targetId);
  if (idx === -1) {
    releaseMedia(newEntry);
    return;
  }
  newEntry.id = targetId; // zachowaj pozycję na liście
  const old = photoSetEntries[idx];
  photoSetEntries[idx] = newEntry;
  releaseMedia(old);
  savePhotoMemory();
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
      autoNamed: !e.kind, // zostanie zastąpione nazwą miejscowości (patrz autoNameWaypoints)
      lat: e.lat,
      lng: e.lng,
      kind: e.kind ?? null,
    }));
    btn.textContent = "Liczę trasę…";
    const rawRoute = await computeRoute(waypoints, travelMode);
    routePhotoEntries = sorted;
    // zdjęcia są już "dołączone" - to one były źródłem trasy (ten sam wpis co na liście)
    await openRoute({ source: "photos", waypoints, rawRoute, photos: sorted.map((e) => (e.mediaEl ? e : null)) });
  } catch (e) {
    showError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
    updatePhotoSetNextBtn();
  }
});

/* ---------- Wspólne zakończenie budowania trasy (link / zdjęcia / GPX / link do trasy / zapisany projekt) ---------- */
let projectSource = null; // "link" | "photos" | "gpx" | "shared"
let lastRawRoute = null; // trasa w postaci zwróconej przez router — do zapisu projektu
let routePhotoEntries = []; // wpisy z listy zdjęć w kolejności, w jakiej zbudowały bieżącą trasę

async function openRoute({ source, waypoints, rawRoute, photos }) {
  const route = prepareRoute(rawRoute);

  // Zdjęcia dołączone do przystanków zostają tylko wtedy, gdy to wciąż TA SAMA
  // trasa (np. powrót o krok i ponowne "Dalej" albo zmiana sposobu podróży).
  // Przy innych punktach przypinanie starych zdjęć po numerze punktu dawałoby
  // zdjęcia w przypadkowych miejscach nowej trasy.
  const key = routeKeyFor(source, waypoints);
  const previousPhotos = waypointPhotos;
  if (photos) waypointPhotos = photos;
  else if (key !== routeSourceKey) waypointPhotos = [];
  if (waypointPhotos !== previousPhotos) previousPhotos.forEach(releaseMedia);
  if (source !== "photos") routePhotoEntries = [];

  routeSourceKey = key;
  projectSource = source;
  lastWaypoints = waypoints;
  lastRawRoute = rawRoute;

  renderWaypointsList(waypoints);
  renderRouteStats(route);
  await showRouteOnMap(route, waypoints);
  buildPhotosUI(waypoints);
  updateShareLinkAvailability();
  await goToScreen(2);
  // Trasa otwarta z cudzego linku nie nadpisuje zapisanego projektu, dopóki
  // użytkownik sam czegoś w niej nie zmieni (nazwa, zdjęcie, tytuł, muzyka).
  projectDirty = false;
  if (source !== "shared") scheduleProjectSave();
  autoNameWaypoints(waypoints);
}

// Lista punktów z edytowalnymi nazwami (to one są podpisami w filmie).
// Nazwy pochodzą m.in. z wklejonego linku, czyli z niezaufanego źródła — trafiają
// wyłącznie do .value / textContent, nigdy do HTML.
function renderWaypointsList(waypoints) {
  const list = document.getElementById("waypointsList");
  list.textContent = "";
  waypoints.forEach((w, i) => {
    const row = document.createElement("div");
    row.className = "wp-row";
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = `${i + 1}.`;
    row.appendChild(num);
    if (w.kind === "empty") {
      const note = document.createElement("span");
      note.className = "wp-note";
      note.textContent = "Pusty punkt (niewidoczny, tylko koryguje trasę)";
      row.appendChild(note);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "wp-name";
      input.maxLength = 60;
      input.value = w.name ?? "";
      input.dataset.index = String(i);
      input.setAttribute("aria-label", `Nazwa punktu ${i + 1} (podpis w filmie)`);
      input.addEventListener("input", () => {
        w.name = input.value.trim();
        w.autoNamed = false;
        setWaypointName(i, w.name);
        scheduleProjectSave();
      });
      row.appendChild(input);
    }
    const coords = document.createElement("span");
    coords.className = "wp-coords";
    coords.textContent = `${w.lat.toFixed(3)}, ${w.lng.toFixed(3)}`;
    row.appendChild(coords);
    list.appendChild(row);
  });
}

function setWaypointName(index, name) {
  if (waypointFeatures[index]) waypointFeatures[index].name = name;
  if (map && currentRoute && stageMode === "static") renderStatic();
}

let routeSourceKey = null; // z czego powstała bieżąca trasa — patrz routeKeyFor

function routeKeyFor(source, waypoints) {
  return source + ":" + waypoints.map((w) => `${w.lat.toFixed(5)},${w.lng.toFixed(5)},${w.kind ?? ""}`).join(";");
}

function renderRouteStats(route) {
  const labels = {
    gpx: ["Długość śladu", "Czas nagrania śladu"],
    straight: ["Dystans w linii prostej", "Szac. czas podróży"],
  }[projectSource === "gpx" ? "gpx" : travelMode] ?? ["Dystans", "Szac. czas podróży"];
  document.getElementById("statDistLabel").textContent = labels[0];
  document.getElementById("statDurLabel").textContent = labels[1];
  document.getElementById("statDist").textContent = `${(route.distanceMeters / 1000).toFixed(0)} km`;
  document.getElementById("statDur").textContent = formatDuration(route.durationSeconds);
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
      <input type="file" accept="image/*,video/*" id="photoInput-${i}" aria-label="Zdjęcie lub film dla punktu ${i + 1}">
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
        hideError();
        const entry = await loadMediaFromFile(file);
        const old = waypointPhotos[i];
        waypointPhotos[i] = entry;
        releaseMedia(old);
        renderThumb(entry);
        // przystanki na mapie budują się od razu po pobraniu trasy (krok 1), czyli
        // zanim zdążysz dołączyć zdjęcia tutaj — stąd jawna synchronizacja
        setWaypointMedia(i, entry);
        updateDurationInfo();
        scheduleProjectSave();
      } catch (err) {
        showError(err?.message || `Nie udało się wczytać pliku dla punktu "${w.name}".`);
      } finally {
        e.target.value = "";
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
    const parsed = parseGoogleMapsLink(url);
    // link z trasą pieszą/rowerową sam podpowiada sposób podróży (o ile nie wybrano go ręcznie)
    if (!travelModeTouched && (parsed.travelMode === "cycling" || parsed.travelMode === "walking")) {
      setTravelMode(parsed.travelMode);
    }
    btn.textContent = "Liczę trasę…";
    const rawRoute = await computeRoute(parsed.waypoints, travelMode);
    await openRoute({ source: "link", waypoints: parsed.waypoints, rawRoute });
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
  // dozwolony zakres wynika z suwaka — wartość wpisana ręcznie jest do niego
  // przycinana (wcześniej "0.001" dawało film trwający dwie godziny)
  const min = toValue(parseInt(sliderEl.min, 10));
  const max = toValue(parseInt(sliderEl.max, 10));
  const clamp = (v) => clampNumber(v, min, max);

  textEl.addEventListener("input", () => {
    const v = clamp(parseDecimalInput(textEl.value, fallback));
    sliderEl.value = toSlider(v);
    onChange(v);
    saveSettings();
    updateDurationInfo();
  });
  // po wyjściu z pola pokazujemy wartość faktycznie użytą (po przycięciu)
  textEl.addEventListener("change", () => {
    textEl.value = formatNum(clamp(parseDecimalInput(textEl.value, fallback)));
  });
  sliderEl.addEventListener("input", () => {
    const v = toValue(parseInt(sliderEl.value, 10));
    textEl.value = formatNum(v);
    onChange(v);
    saveSettings();
    updateDurationInfo();
  });

  function setValue(v) {
    v = clamp(Number.isFinite(v) ? v : fallback);
    textEl.value = formatNum(v);
    sliderEl.value = toSlider(v);
    onChange(v);
    updateDurationInfo();
  }
  setValue.default = fallback; // do przycisku "przywróć domyślne" przy suwaku
  return setValue;
}

// "Długość filmu: 12,4 s" — zamiast abstrakcyjnej "prędkości 1" widać od razu,
// ile potrwa gotowe wideo przy bieżących ustawieniach
function updateDurationInfo() {
  const text = currentRoute ? describeVideoDuration() : "";
  document.querySelectorAll(".duration-info").forEach((el) => { el.textContent = text; });
}

function describeVideoDuration() {
  const d = estimateVideoDuration();
  const parts = [`jazda ${formatDecimalPl(d.travelMs / 1000)} s`];
  if (d.reveals > 0) {
    const noun = d.reveals === 1 ? "pokaz zdjęcia" : "pokazy zdjęć";
    parts.push(`${d.reveals} × ${noun} po ${formatDecimalPl(d.revealMs / 1000)} s`);
  }
  if (d.introMs > 0) parts.unshift(`tytuł ${formatDecimalPl(d.introMs / 1000)} s`);
  if (showSummary) parts.push(`podsumowanie ${formatDecimalPl(d.outroMs / 1000)} s`);
  return `Długość filmu: ok. ${formatDecimalPl(d.totalMs / 1000)} s (${parts.join(" + ")})`;
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
  const reset = () => {
    setter(setter.default);
    saveSettings();
  };
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.addEventListener("click", reset);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      reset();
    }
  });
});

const PLAY_LABEL = "▶ Odtwórz animację";
const STOP_LABEL = "■ Zatrzymaj animację";
const EXPORT_LABEL = "● Nagraj wideo";
let exportInProgress = false;
let lastExport = null; // { blob, ext, url } — ostatnie gotowe nagranie

async function playAnimation() {
  if (!currentRoute) return;
  const btn = document.getElementById("playAnimBtn");
  if (animationRunning) {
    cancelPlayback(); // ten sam przycisk zatrzymuje trwającą animację
    return;
  }
  hideError();
  btn.textContent = STOP_LABEL;
  try {
    await playTimeline({
      onPreparing: (p) => { btn.textContent = `■ Wczytuję mapę… ${Math.round(p * 100)}% (dotknij, aby przerwać)`; },
      onStart: () => { btn.textContent = STOP_LABEL; },
    });
  } catch (e) {
    showError(e.message);
  } finally {
    btn.textContent = PLAY_LABEL;
  }
}
document.getElementById("playAnimBtn").addEventListener("click", playAnimation);

// Blokada wygaszania ekranu na czas nagrywania: nagranie powstaje w czasie
// rzeczywistym, a przygaszony/zablokowany ekran je przerywa.
async function acquireWakeLock() {
  try {
    return (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    return null; // brak wsparcia albo odmowa (np. tryb oszczędzania energii) — nagrywamy bez blokady
  }
}

function clearExportResult() {
  if (lastExport?.url) URL.revokeObjectURL(lastExport.url);
  lastExport = null;
  const preview = document.getElementById("exportPreview");
  preview.removeAttribute("src");
  preview.load();
  document.getElementById("exportResult").style.display = "none";
}

function exportFile() {
  // sam typ MIME, bez parametru codecs — część aplikacji odrzuca przy udostępnianiu "video/mp4;codecs=…"
  return new File([lastExport.blob], `trasa.${lastExport.ext}`, { type: lastExport.blob.type.split(";")[0] });
}

function showExportResult(result) {
  clearExportResult();
  lastExport = { blob: result.blob, ext: result.ext, url: URL.createObjectURL(result.blob) };
  document.getElementById("exportPreview").src = lastExport.url;
  const mb = formatDecimalPl(result.blob.size / (1024 * 1024));
  document.getElementById("exportResultInfo").textContent = `Plik trasa.${result.ext}, ${mb} MB`;
  // "Udostępnij" tylko tam, gdzie system naprawdę przyjmie plik wideo (głównie telefony)
  let canShare = false;
  try {
    canShare = !!navigator.canShare?.({ files: [exportFile()] });
  } catch {
    canShare = false;
  }
  const shareBtn = document.getElementById("shareBtn");
  const saveBtn = document.getElementById("saveBtn");
  shareBtn.style.display = canShare ? "block" : "none";
  saveBtn.classList.toggle("secondary-btn", canShare);
  document.getElementById("exportResult").style.display = "block";
  document.getElementById("exportResult").scrollIntoView({ block: "nearest", behavior: "smooth" });
}

document.getElementById("saveBtn").addEventListener("click", () => {
  if (lastExport) downloadBlob(lastExport.blob, `trasa.${lastExport.ext}`);
});

document.getElementById("shareBtn").addEventListener("click", async () => {
  if (!lastExport) return;
  try {
    await navigator.share({ files: [exportFile()], title: "Moja trasa" });
  } catch (e) {
    // AbortError = użytkownik zamknął okno udostępniania; to nie jest błąd
    if (e?.name !== "AbortError") {
      showError("Nie udało się otworzyć udostępniania na tym urządzeniu. Użyj przycisku „Zapisz plik”.");
    }
  }
});

document.getElementById("exportBtn").addEventListener("click", async () => {
  if (!currentRoute) return;
  const btn = document.getElementById("exportBtn");
  if (exportInProgress) {
    cancelPlayback(); // ten sam przycisk anuluje trwające nagrywanie
    return;
  }
  hideError();
  cancelPlayback(); // gdyby jeszcze trwał podgląd animacji
  await waitForPlaybackToStop();
  exportInProgress = true;
  setNavigationLocked(true);
  clearExportResult();
  document.getElementById("exportHint").style.display = "block";
  btn.textContent = "■ Anuluj nagrywanie (0%)";
  const wakeLock = await acquireWakeLock();
  try {
    const result = await recordVideo(
      (progress) => { btn.textContent = `■ Anuluj nagrywanie (${Math.round(progress * 100)}%)`; },
      (p) => { btn.textContent = `■ Wczytuję mapę… ${Math.round(p * 100)}% (dotknij, aby anulować)`; }
    );
    if (!result.cancelled) showExportResult(result);
  } catch (e) {
    showError(e.message);
  } finally {
    wakeLock?.release().catch(() => {});
    btn.textContent = EXPORT_LABEL;
    document.getElementById("exportHint").style.display = "none";
    exportInProgress = false;
    setNavigationLocked(false);
  }
});

// w trakcie nagrywania nawigacja jest zablokowana — przejście na inny ekran
// przerwałoby nagranie albo uruchomiło drugą animację na tej samej scenie
function setNavigationLocked(locked) {
  ["step4BackBtn", "restartBtn"].forEach((id) => {
    document.getElementById(id).disabled = locked;
  });
}

function waitForPlaybackToStop() {
  return new Promise((resolve) => {
    const check = () => (animationRunning ? requestAnimationFrame(check) : resolve());
    check();
  });
}

/* ---------- Nawigacja między ekranami ---------- */
let currentScreen = 1;
const STEP_NAMES = ["Trasa", "Punkty i wygląd", "Animacja", "Wideo"];

async function goToScreen(n) {
  if (exportInProgress) return;
  // każda zmiana ekranu kończy trwającą animację — bez tego pętla animacji
  // dalej malowałaby scenę "pod spodem" kolejnego kroku
  cancelPlayback();
  await waitForPlaybackToStop();
  currentScreen = n;
  hideError();
  endFramingMode(); // kadr ustawia się tylko na ekranie 2
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`screen${i}`).style.display = i === n ? "block" : "none";
    const step = document.getElementById(`stepperItem${i}`);
    step.classList.toggle("active", i === n);
    step.classList.toggle("done", i < n);
    if (i === n) step.setAttribute("aria-current", "step"); else step.removeAttribute("aria-current");
  }
  document.getElementById("stepperLabel").textContent = `Krok ${n} z 4: ${STEP_NAMES[n - 1]}`;
  updateDurationInfo();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (n === 2 && map && currentRoute) {
    stageMode = "static"; // wracamy z animacji - pokaż statyczną trasę, nie ostatnią klatkę
    renderStatic();
  }
  if (n === 3) playAnimation(); // od razu pokaż efekt wchodząc na ekran animacji
}

// "Zacznij od nowa" naprawdę zaczyna od nowa: czyści trasę, listę zdjęć i
// dołączone pliki (zwalniając ich pamięć). Ustawienia wyglądu zostają.
async function resetProject() {
  if (exportInProgress) return;
  if (!window.confirm("Zacząć od nowa? Bieżąca trasa i dołączone zdjęcia/filmy zostaną usunięte.")) return;
  cancelPlayback();
  await waitForPlaybackToStop();
  hideError();

  const media = [...photoSetEntries, ...waypointPhotos];
  photoSetEntries = [];
  waypointPhotos = [];
  media.forEach(releaseMedia);
  manualOrderApplied = false;
  lastWaypoints = null;
  routeSourceKey = null;
  currentRoute = null;
  waypointFeatures = [];
  lastTimeline = null;
  stageMode = "static";
  clearExportResult();
  projectSource = null;
  lastRawRoute = null;
  routePhotoEntries = [];
  resetProjectExtras(); // tytuł, muzyka, plik GPX, zapisany projekt (js/features.js)

  document.getElementById("linkInput").value = "";
  document.getElementById("photosList").textContent = "";
  document.getElementById("waypointsList").textContent = "";
  document.getElementById("mapWrap").style.display = "none";
  renderPhotoSetList();
  updatePhotoSetNextBtn();
  updatePinnedMarkerButtons();
  goToScreen(1);
}

document.getElementById("step2BackBtn").addEventListener("click", () => goToScreen(1));
document.getElementById("step2NextBtn").addEventListener("click", () => goToScreen(3));
document.getElementById("step3BackBtn").addEventListener("click", () => goToScreen(2));
document.getElementById("step3NextBtn").addEventListener("click", () => goToScreen(4));
document.getElementById("step4BackBtn").addEventListener("click", () => goToScreen(3));
document.getElementById("restartBtn").addEventListener("click", resetProject);

document.querySelectorAll(".options-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.getElementById(btn.dataset.target);
    const isHidden = target.style.display === "none";
    target.style.display = isHidden ? "block" : "none";
    btn.setAttribute("aria-expanded", String(isHidden));
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
  document.querySelectorAll(".color-swatch").forEach((el) => {
    el.classList.toggle("active", el.dataset.color === color);
    el.setAttribute("aria-pressed", String(el.dataset.color === color));
  });
  const toggle = document.getElementById("colorSwatchToggle");
  if (toggle) toggle.style.background = color;
  if (map && currentRoute && stageMode === "static") renderStatic(); // linia trasy jest rysowana na scenie
}

function buildColorPickerUI() {
  const container = document.getElementById("colorPicker");
  container.innerHTML = "";
  COLOR_PALETTE.forEach((color, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-swatch" + (color === routeColor ? " active" : "");
    btn.setAttribute("aria-label", `Kolor ${index + 1} z ${COLOR_PALETTE.length}`);
    btn.setAttribute("aria-pressed", String(color === routeColor));
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
  const open = picker.style.display === "none";
  picker.style.display = open ? "grid" : "none";
  document.getElementById("colorSwatchToggle").setAttribute("aria-expanded", String(open));
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
  if (map) {
    map.resize();
    syncMapPixelRatio();
    if (currentRoute) {
      stageMode = "static";
      fitToRouteUnlessCustom();
      renderStatic();
    }
  }
}

// po obrocie telefonu / zmianie rozmiaru okna kadr trzeba dopasować ponownie
window.addEventListener("resize", () => {
  if (!map || animationRunning) return;
  map.resize();
  syncMapPixelRatio();
  if (currentRoute && stageMode === "static") {
    fitToRouteUnlessCustom();
    renderStatic();
  }
});

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
        mapStyleKey,
        cameraMode,
        showCaptions,
        showSummary,
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
  if (typeof s.mapStyleKey === "string" && Object.hasOwn(MAP_STYLES, s.mapStyleKey)) mapStyleKey = s.mapStyleKey;
  if (s.cameraMode === "full" || s.cameraMode === "follow") cameraMode = s.cameraMode;
  if (typeof s.showCaptions === "boolean") showCaptions = s.showCaptions;
  if (typeof s.showSummary === "boolean") showSummary = s.showSummary;
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
  info.textContent = "Usunięto zapamiętane lokalizacje plików, ustawienia i zapisany projekt z tej przeglądarki.";
});


/* ---------- Drobne ułatwienia ---------- */
document.getElementById("errorCloseBtn").addEventListener("click", hideError);

// "Wklej ze schowka": na telefonie przytrzymywanie pola i wybieranie "Wklej" to
// kilka ruchów; przycisk robi to jednym. Pokazujemy go tylko tam, gdzie
// przeglądarka pozwala czytać schowek.
const pasteBtn = document.getElementById("pasteLinkBtn");
if (navigator.clipboard?.readText) {
  pasteBtn.style.display = "block";
  pasteBtn.addEventListener("click", async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) document.getElementById("linkInput").value = text;
      else showError("Schowek jest pusty. Skopiuj najpierw link do trasy z Google Maps.");
    } catch {
      showError("Przeglądarka nie pozwoliła odczytać schowka. Wklej link ręcznie w pole powyżej.");
    }
  });
}
