"use strict";
/* Funkcje dodatkowe: styl mapy, kamera, napisy, kadrowanie, muzyka, import GPX,
   link do trasy, zapis projektu w przeglądarce i tryb aplikacji (PWA).
   Ładowane po app.js — korzysta z jego stanu i funkcji. */

/* ---------- Styl mapy, kamera, napisy ---------- */
const mapStyleSelect = document.getElementById("mapStyleSelect");
const cameraSelect = document.getElementById("cameraSelect");
const captionsCheck = document.getElementById("captionsCheck");
const summaryCheck = document.getElementById("summaryCheck");
const titleInput = document.getElementById("titleInput");

// kontrolki pokazują to, co wczytano z zapisanych ustawień (app.js)
mapStyleSelect.value = mapStyleKey;
cameraSelect.value = cameraMode;
captionsCheck.checked = showCaptions;
summaryCheck.checked = showSummary;

function refreshStaticPreview() {
  if (map && currentRoute && stageMode === "static") renderStatic();
}

mapStyleSelect.addEventListener("change", async () => {
  const previous = mapStyleKey;
  hideError();
  mapStyleSelect.disabled = true;
  try {
    await applyMapStyle(mapStyleSelect.value);
    saveSettings();
    refreshStaticPreview();
  } catch (e) {
    mapStyleSelect.value = previous;
    showError(e.message);
  } finally {
    mapStyleSelect.disabled = false;
  }
});

cameraSelect.addEventListener("change", () => {
  cameraMode = cameraSelect.value === "follow" ? "follow" : "full";
  saveSettings();
});

captionsCheck.addEventListener("change", () => {
  showCaptions = captionsCheck.checked;
  saveSettings();
  refreshStaticPreview();
});

summaryCheck.addEventListener("change", () => {
  showSummary = summaryCheck.checked;
  saveSettings();
  updateDurationInfo();
});

function setVideoTitle(title) {
  videoTitle = String(title ?? "").trim().slice(0, 80);
  if (titleInput.value.trim() !== videoTitle) titleInput.value = videoTitle;
  updateDurationInfo();
}

titleInput.addEventListener("input", () => {
  videoTitle = titleInput.value.trim().slice(0, 80);
  updateDurationInfo();
  scheduleProjectSave();
});

/* ---------- Ręczne ustawianie kadru ---------- */
const framingBtn = document.getElementById("framingBtn");

function updateFramingUi() {
  framingBtn.textContent = framingMode ? "Gotowe" : "Ustaw kadr ręcznie";
  framingBtn.setAttribute("aria-pressed", String(framingMode));
  document.getElementById("framingHint").style.display = framingMode ? "block" : "none";
  document.getElementById("mapWrap").classList.toggle("framing", framingMode);
}

function endFramingMode() {
  if (!framingMode) return;
  setFramingMode(false);
  updateFramingUi();
}

framingBtn.addEventListener("click", () => {
  if (!map || !currentRoute) return;
  setFramingMode(!framingMode);
  updateFramingUi();
  if (framingMode) document.getElementById("mapWrap").scrollIntoView({ block: "center", behavior: "smooth" });
});

document.getElementById("framingResetBtn").addEventListener("click", () => {
  if (!map || !currentRoute) return;
  resetFraming();
});

/* ---------- Muzyka ---------- */
const MAX_MUSIC_BYTES = 60 * 1024 * 1024;
const MUSIC_DEFAULT_INFO = document.getElementById("musicInfo").textContent;

function updateMusicUi() {
  document.getElementById("musicRemoveBtn").style.display = musicEntry ? "block" : "none";
  document.getElementById("musicPickBtn").textContent = musicEntry ? "Zmień plik z muzyką" : "Wybierz plik z muzyką";
  document.getElementById("musicInfo").textContent = musicEntry
    ? `Wybrano: ${musicEntry.file.name}. Muzyka zostanie dograna do filmu i wyciszona na końcu.`
    : MUSIC_DEFAULT_INFO;
}

function chooseMusic(file) {
  if (!file) return;
  if (file.size > MAX_MUSIC_BYTES) {
    showError("Ten plik z muzyką jest za duży (limit 60 MB).");
    return;
  }
  const probe = document.createElement("audio");
  if (file.type && probe.canPlayType(file.type) === "") {
    showError(`Ta przeglądarka nie odtworzy pliku „${file.name}”. Wybierz plik MP3, M4A/AAC, OGG albo WAV.`);
    return;
  }
  setMusicFile(file);
  updateMusicUi();
  scheduleProjectSave();
}

document.getElementById("musicPickBtn").addEventListener("click", () => document.getElementById("musicInput").click());
document.getElementById("musicInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  hideError();
  chooseMusic(file);
});
document.getElementById("musicRemoveBtn").addEventListener("click", () => {
  clearMusic();
  updateMusicUi();
  scheduleProjectSave();
});

/* ---------- Import śladu GPX ---------- */
const MAX_GPX_BYTES = 40 * 1024 * 1024;
let gpxParsed = null; // { route, waypoints } gotowe do pokazania

function parseGpxText(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Nie udało się odczytać pliku — to nie jest poprawny plik GPX.");
  }
  const byTag = (name) => Array.from(doc.getElementsByTagNameNS("*", name));
  const toPoint = (el) => {
    const timeText = Array.from(el.children).find((c) => c.localName === "time")?.textContent;
    const time = timeText ? Date.parse(timeText) : NaN;
    return { lat: parseFloat(el.getAttribute("lat")), lng: parseFloat(el.getAttribute("lon")), time: Number.isFinite(time) ? time : undefined };
  };
  // ślad (trk) to faktycznie przejechana droga; gdy go nie ma, bierzemy zaplanowaną trasę (rte)
  let track = byTag("trkpt").map(toPoint);
  if (track.length < 2) track = byTag("rtept").map(toPoint);
  const named = byTag("wpt").map((el) => ({
    ...toPoint(el),
    name: Array.from(el.children).find((c) => c.localName === "name")?.textContent ?? "",
  }));
  return buildGpxRoute(track, named.filter((p) => p.name.trim()));
}

document.getElementById("gpxPickBtn").addEventListener("click", () => document.getElementById("gpxInput").click());
document.getElementById("gpxInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  hideError();
  const info = document.getElementById("gpxInfo");
  const nextBtn = document.getElementById("step1GpxNextBtn");
  gpxParsed = null;
  nextBtn.disabled = true;
  info.textContent = "";
  try {
    if (file.size > MAX_GPX_BYTES) throw new Error("Ten plik GPX jest za duży (limit 40 MB).");
    gpxParsed = parseGpxText(await file.text());
    const km = formatDecimalPl(gpxParsed.route.distanceMeters / 1000);
    const stops = gpxParsed.waypoints.length - 2;
    info.textContent = `${file.name}: ${km} km, ${gpxParsed.route.coordinates.length} punktów śladu` +
      (stops > 0 ? `, nazwane miejsca: ${stops}` : "") + ".";
    nextBtn.disabled = false;
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById("step1GpxNextBtn").addEventListener("click", async () => {
  if (!gpxParsed) return;
  hideError();
  const btn = document.getElementById("step1GpxNextBtn");
  btn.disabled = true;
  try {
    // kopia punktów: nazwy można potem edytować bez psucia wczytanego pliku
    await openRoute({ source: "gpx", waypoints: gpxParsed.waypoints.map((w) => ({ ...w })), rawRoute: gpxParsed.route });
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = !gpxParsed;
  }
});

/* ---------- Podpisy zdjęć nazwą miejscowości ---------- */
// Punkty zbudowane ze zdjęć nazywają się domyślnie "Zdjęcie 3" — kiepski podpis
// w filmie. Pytamy Photona o miejscowość dla współrzędnych i podmieniamy nazwę,
// o ile użytkownik w międzyczasie nie wpisał własnej.
let autoNameRun = 0;
async function autoNameWaypoints(waypoints) {
  const run = ++autoNameRun;
  for (let i = 0; i < waypoints.length; i++) {
    const w = waypoints[i];
    if (!w.autoNamed) continue;
    try {
      const url = `${APP_CONFIG.placeSearch}/reverse?lon=${encodeURIComponent(w.lng)}&lat=${encodeURIComponent(w.lat)}&limit=1`;
      const res = await fetch(url, { referrerPolicy: "no-referrer", credentials: "omit" });
      if (run !== autoNameRun || lastWaypoints !== waypoints) return; // w międzyczasie powstała inna trasa
      if (!res.ok) continue;
      const props = (await res.json())?.features?.[0]?.properties ?? {};
      const place = [props.city, props.district, props.county, props.name].find((v) => typeof v === "string" && v.trim());
      if (!place || !w.autoNamed) continue;
      w.name = place.trim().slice(0, 60);
      w.autoNamed = false;
      const input = document.querySelector(`.wp-name[data-index="${i}"]`);
      if (input && document.activeElement !== input) input.value = w.name;
      setWaypointName(i, w.name);
      scheduleProjectSave();
    } catch {
      // brak sieci / limit zapytań — zostaje nazwa domyślna
    }
  }
}

/* ---------- Link do trasy ---------- */
const SHARE_HASH_PREFIX = "#trasa=";
const SHARE_INFO_DEFAULT = document.getElementById("shareLinkInfo").textContent;

function updateShareLinkAvailability() {
  // ślad GPX ma tysiące punktów — nie zmieści się w adresie
  document.getElementById("shareLinkCard").style.display = projectSource === "gpx" ? "none" : "block";
  document.getElementById("shareLinkOutput").style.display = "none";
  document.getElementById("shareLinkInfo").textContent = SHARE_INFO_DEFAULT;
}

function buildShareLink() {
  const encoded = encodeSharedRoute({ mode: travelMode, waypoints: lastWaypoints, title: videoTitle });
  return `${location.origin}${location.pathname}${SHARE_HASH_PREFIX}${encoded}`;
}

document.getElementById("shareLinkBtn").addEventListener("click", async () => {
  if (!lastWaypoints) return;
  const link = buildShareLink();
  const info = document.getElementById("shareLinkInfo");
  const output = document.getElementById("shareLinkOutput");
  try {
    await navigator.clipboard.writeText(link);
    info.textContent = "Skopiowano link do schowka. Zawiera punkty trasy i ich nazwy (bez zdjęć).";
  } catch {
    // schowek niedostępny — pokazujemy link do ręcznego skopiowania
    output.value = link;
    output.style.display = "block";
    output.focus();
    output.select();
    info.textContent = "Zaznacz i skopiuj link powyżej.";
  }
});

async function openSharedRouteFromHash() {
  if (!location.hash.startsWith(SHARE_HASH_PREFIX)) return false;
  const encoded = location.hash.slice(SHARE_HASH_PREFIX.length);
  // adres czyścimy od razu: odświeżenie strony nie ma w kółko otwierać tej samej trasy
  history.replaceState(null, "", location.pathname + location.search);
  try {
    const shared = decodeSharedRoute(encoded);
    setTravelMode(shared.mode);
    travelModeTouched = true;
    setVideoTitle(shared.title);
    const rawRoute = await computeRoute(shared.waypoints, shared.mode);
    await openRoute({ source: "shared", waypoints: shared.waypoints, rawRoute });
  } catch (e) {
    showError(e.message);
  }
  return true;
}

/* ---------- Zapis projektu w przeglądarce (IndexedDB) ---------- */
// Jeden "ostatni projekt": trasa, nazwy, tytuł oraz dołączone pliki (zdjęcia,
// filmy, muzyka). Dzięki temu zamknięcie karty albo telefon ubijający
// przeglądarkę w tle nie kasuje pracy. Dane zostają wyłącznie na tym urządzeniu.
const PROJECT_DB = "routeVisualiser";
const PROJECT_STORE = "projects";
const PROJECT_KEY = "last";

function openProjectDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("IndexedDB niedostępne"));
    const req = indexedDB.open(PROJECT_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(PROJECT_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function projectStoreRequest(mode, action) {
  const db = await openProjectDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECT_STORE, mode);
      const req = action(tx.objectStore(PROJECT_STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function buildProjectRecord(includeFiles) {
  const fileOf = (entry) => (includeFiles ? entry?.file ?? null : null);
  return {
    v: 1,
    savedAt: Date.now(),
    source: projectSource,
    mode: travelMode,
    title: videoTitle,
    linkText: document.getElementById("linkInput").value.trim().slice(0, 5000),
    waypoints: lastWaypoints.map(({ name, lat, lng, kind }) => ({ name, lat, lng, kind: kind ?? null })),
    rawRoute: lastRawRoute,
    waypointFiles: lastWaypoints.map((_, i) => fileOf(waypointPhotos[i])),
    // lista zdjęć z kroku 1 w kolejności, w jakiej zbudowała tę trasę; plik zapisujemy
    // tu tylko wtedy, gdy jest inny niż przypięty do przystanku (bez dublowania danych)
    photoSet: routePhotoEntries.map((e, i) => ({
      name: e.name,
      kind: e.kind ?? null,
      lat: e.lat,
      lng: e.lng,
      status: e.status,
      timestamp: Number.isFinite(e.timestamp) ? e.timestamp : 0,
      fileKey: e.fileKey ?? null,
      sharedWithWaypoint: !!e.file && e.file === waypointPhotos[i]?.file,
      ownFile: e.file && e.file !== waypointPhotos[i]?.file ? fileOf(e) : null,
    })),
    musicFile: includeFiles ? musicEntry?.file ?? null : null,
    filesIncluded: includeFiles,
  };
}

let projectSaveTimer = null;
let projectDirty = false; // są zmiany warte zapisania (patrz openRoute w app.js)
function scheduleProjectSave() {
  projectDirty = true;
  clearTimeout(projectSaveTimer);
  projectSaveTimer = setTimeout(saveProjectNow, 700);
}

async function saveProjectNow() {
  clearTimeout(projectSaveTimer);
  if (!currentRoute || !lastWaypoints || !lastRawRoute || currentScreen < 2) return;
  try {
    await projectStoreRequest("readwrite", (store) => store.put(buildProjectRecord(true), PROJECT_KEY));
  } catch (e) {
    try {
      // brak miejsca na pliki (duże filmy) — zapisujemy chociaż samą trasę i nazwy
      await projectStoreRequest("readwrite", (store) => store.put(buildProjectRecord(false), PROJECT_KEY));
    } catch {
      // zapis niemożliwy (np. tryb prywatny) — aplikacja działa dalej bez zapisu
    }
  }
}

async function deleteSavedProject() {
  clearTimeout(projectSaveTimer);
  document.getElementById("resumeCard").style.display = "none";
  try {
    await projectStoreRequest("readwrite", (store) => store.delete(PROJECT_KEY));
  } catch {
    // nie było czego usuwać
  }
}

function isUsableProjectRecord(rec) {
  return !!rec && rec.v === 1 &&
    Array.isArray(rec.waypoints) && rec.waypoints.length >= 2 &&
    rec.waypoints.every((w) => w && isValidLatLng(w.lat, w.lng)) &&
    Array.isArray(rec.rawRoute?.coordinates) && rec.rawRoute.coordinates.length >= 2 &&
    Array.isArray(rec.rawRoute.waypointFractions);
}

let pendingResume = null;
async function offerSavedProject() {
  let rec = null;
  try {
    rec = await projectStoreRequest("readonly", (store) => store.get(PROJECT_KEY));
  } catch {
    return;
  }
  if (!isUsableProjectRecord(rec)) return;
  pendingResume = rec;
  const when = new Date(rec.savedAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  const km = Math.round((rec.rawRoute.distanceMeters || 0) / 1000);
  const files = (rec.waypointFiles || []).filter(Boolean).length;
  document.getElementById("resumeInfo").textContent =
    `${rec.title ? `„${rec.title}” — ` : ""}${rec.waypoints.length} punktów, ${km} km` +
    (files ? `, zdjęcia/filmy: ${files}` : "") + ` · zapisano ${when}`;
  document.getElementById("resumeCard").style.display = "block";
}

async function loadSavedMedia(file) {
  if (!file) return null;
  try {
    return await loadMediaFromFile(file);
  } catch {
    return null; // plik nie daje się już otworzyć — projekt wznawiamy bez niego
  }
}

async function restoreProject(rec) {
  const names = { cycling: "cycling", walking: "walking", straight: "straight" };
  setTravelMode(names[rec.mode] ?? "driving");
  travelModeTouched = true;
  setVideoTitle(rec.title);
  if (typeof rec.linkText === "string") document.getElementById("linkInput").value = rec.linkText;
  const source = ["link", "photos", "gpx", "shared"].includes(rec.source) ? rec.source : "link";
  selectSourceTab(source === "shared" ? "link" : source);

  const waypoints = rec.waypoints.map((w) => ({
    name: String(w.name ?? "").slice(0, 60),
    lat: w.lat,
    lng: w.lng,
    kind: WAYPOINT_KINDS.includes(w.kind) ? w.kind : null,
  }));
  const wpMedia = [];
  for (let i = 0; i < waypoints.length; i++) wpMedia.push(await loadSavedMedia(rec.waypointFiles?.[i]));

  let photos = wpMedia;
  if (source === "photos" && Array.isArray(rec.photoSet) && rec.photoSet.length === waypoints.length) {
    const old = photoSetEntries;
    const entries = [];
    for (let i = 0; i < rec.photoSet.length; i++) {
      const item = rec.photoSet[i];
      const media = item.sharedWithWaypoint ? wpMedia[i] : await loadSavedMedia(item.ownFile);
      const located = item.status === "ok" && isValidLatLng(item.lat, item.lng);
      entries.push({
        id: `p${photoSetIdCounter++}`,
        name: String(item.name ?? "").slice(0, 200),
        fileKey: item.fileKey ?? null,
        type: media?.type ?? null,
        mediaEl: media?.mediaEl ?? null,
        url: media?.url ?? null,
        file: media?.file ?? null,
        timestamp: Number.isFinite(item.timestamp) ? item.timestamp : 0,
        lat: located ? item.lat : null,
        lng: located ? item.lng : null,
        status: located ? "ok" : "no-gps",
        ...(WAYPOINT_KINDS.includes(item.kind) ? { kind: item.kind } : {}),
      });
    }
    photoSetEntries = entries;
    manualOrderApplied = true; // kolejność z zapisu, nie ponowne sortowanie po czasie
    old.forEach(releaseMedia);
    routePhotoEntries = getOrderedPhotoSetEntries();
    // przystanek dzieli wpis z listą zdjęć, tak jak przy zwykłym budowaniu trasy ze zdjęć
    photos = routePhotoEntries.map((e, i) => (rec.photoSet[i].sharedWithWaypoint ? (e.mediaEl ? e : null) : wpMedia[i]));
    renderPhotoSetList();
    updatePhotoSetNextBtn();
    updatePinnedMarkerButtons();
  }

  if (rec.musicFile) setMusicFile(rec.musicFile);
  updateMusicUi();
  const keepEntries = routePhotoEntries;
  await openRoute({ source, waypoints, rawRoute: rec.rawRoute, photos });
  routePhotoEntries = source === "photos" ? keepEntries : [];
}

document.getElementById("resumeBtn").addEventListener("click", async () => {
  if (!pendingResume) return;
  const btn = document.getElementById("resumeBtn");
  hideError();
  btn.disabled = true;
  btn.textContent = "Wczytuję projekt…";
  try {
    await restoreProject(pendingResume);
    pendingResume = null;
    document.getElementById("resumeCard").style.display = "none";
  } catch (e) {
    showError(`Nie udało się wznowić projektu: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Wznów";
  }
});

document.getElementById("resumeDeleteBtn").addEventListener("click", () => {
  pendingResume = null;
  deleteSavedProject();
});

// wywoływane przez "Zacznij od nowa" (app.js)
function resetProjectExtras() {
  autoNameRun++;
  setVideoTitle("");
  clearMusic();
  updateMusicUi();
  gpxParsed = null;
  document.getElementById("gpxInfo").textContent = "";
  document.getElementById("step1GpxNextBtn").disabled = true;
  customFraming = false;
  endFramingMode();
  pendingResume = null;
  deleteSavedProject();
}

// zapis także przy chowaniu karty — telefon może ją potem ubić bez ostrzeżenia
document.addEventListener("visibilitychange", () => {
  if (document.hidden && !exportInProgress && projectDirty) saveProjectNow();
});

/* ---------- Tryb aplikacji (PWA) ---------- */
// Service worker zapewnia instalację na ekranie głównym i start bez sieci.
// Działa tylko przez https (albo na localhost).
if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // brak service workera niczego nie psuje — aplikacja działa jak zwykła strona
    });
  });
}

/* ---------- Start ---------- */
updateMusicUi();
updateFramingUi();
openSharedRouteFromHash().then((opened) => {
  if (!opened) offerSavedProject();
});
