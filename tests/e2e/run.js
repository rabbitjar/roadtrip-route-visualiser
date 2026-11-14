"use strict";
/* Testy end-to-end w prawdziwej przeglądarce (Playwright + Chromium).
   Uruchomienie: npm run test:e2e

   Testy są hermetyczne — nie dotykają internetu. Wszystkie usługi zewnętrzne
   (styl mapy, routing OSRM, wyszukiwarka Photon) są podstawiane lokalnie, więc
   wynik nie zależy od dostępności darmowych serwerów ani od limitów zapytań. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const FIX = (name) => path.join(__dirname, "fixtures", name);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json",
};

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/* ---------- podstawione usługi zewnętrzne ---------- */
const haversine = ([lng1, lat1], [lng2, lat2]) => {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
};

// odpowiedź w formacie OSRM: "droga" to linia łamana z 20 punktami na odcinek
function fakeOsrm(url) {
  const coords = new URL(url).pathname.split("/").pop().split(";").map((p) => p.split(",").map(Number));
  const geometry = [];
  const legs = [];
  for (let i = 0; i < coords.length - 1; i++) {
    for (let k = i === 0 ? 0 : 1; k <= 20; k++) {
      const f = k / 20;
      geometry.push([coords[i][0] + (coords[i + 1][0] - coords[i][0]) * f, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * f]);
    }
    const distance = haversine(coords[i], coords[i + 1]);
    legs.push({ distance, duration: distance / 15 });
  }
  const distance = legs.reduce((s, l) => s + l.distance, 0);
  return { code: "Ok", routes: [{ geometry: { type: "LineString", coordinates: geometry }, legs, distance, duration: distance / 15 }] };
}

const BLANK_STYLE = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#dfe6e2" } }] };
const json = (route, body, status = 200) =>
  route.fulfill({ status, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(body) });

async function mockNetwork(context, calls, state) {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    const url = route.request().url();
    calls.push(url);
    if (url.includes("/styles/")) return json(route, BLANK_STYLE);
    if (/router\.project-osrm\.org|routing\.openstreetmap\.de/.test(url)) {
      if (state.routingStatus !== 200) return json(route, { code: "Error", message: "mock" }, state.routingStatus);
      return json(route, fakeOsrm(url));
    }
    if (url.includes("photon.komoot.io/reverse")) {
      const lat = Number(new URL(url).searchParams.get("lat"));
      return json(route, { features: [{ properties: { city: lat > 50 ? "Kraków" : "Myślenice" }, geometry: { coordinates: [19.9, lat] } }] });
    }
    if (url.includes("photon.komoot.io/api")) {
      return json(route, { features: [{ properties: { name: "<b>Zakopane</b>", country: "Polska" }, geometry: { type: "Point", coordinates: [19.9496, 49.2992] } }] });
    }
    return route.abort();
  });
}

/* ---------- mini-framework ---------- */
let failed = 0, passed = 0;
function check(name, ok, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const LINK = "https://www.google.com/maps/dir/Krak%C3%B3w/Zakopane/Nowy+Targ/data=!4m2!8m2!3d50.0647!4d19.9450!8m2!3d49.2992!4d19.9496!8m2!3d49.4775!4d20.0323";
const onScreen2 = async (page) => {
  await page.waitForSelector("#screen2", { state: "visible", timeout: 30000 });
  await page.waitForFunction(() => map && map.loaded(), null, { timeout: 30000 });
};
const clickJs = (page, id) => page.evaluate((i) => document.getElementById(i).click(), id);

async function main() {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: "block", acceptDownloads: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const calls = [];
  const state = { routingStatus: 200 };
  await mockNetwork(context, calls, state);
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("dialog", (d) => d.accept());
  await page.goto(base);

  /* --- bezpieczeństwo --- */
  const evil = "https://www.google.com/maps/dir/" + encodeURIComponent('<img src=x onerror="window.__xss=1">') + "/" +
    encodeURIComponent('"><svg onload=window.__xss=2>') + "/data=!8m2!3d50.0647!4d19.9450!8m2!3d49.2992!4d19.9496";
  await page.fill("#linkInput", evil);
  await page.click("#step1NextBtn");
  await onScreen2(page);
  check("XSS: nazwy z linku są tekstem, kod się nie wykonuje",
    await page.evaluate(() => window.__xss === undefined && document.querySelectorAll('#screen2 img[src="x"], #screen2 svg[onload]').length === 0 &&
      document.querySelector(".wp-name").value.startsWith("<img")));
  check("CSP blokuje skrypt inline", await page.evaluate(() => {
    const s = document.createElement("script"); s.textContent = "window.__inline = 1"; document.body.appendChild(s); return window.__inline === undefined;
  }));
  check("CSP blokuje połączenie z nieznanym hostem", await page.evaluate(() => fetch("https://example.com/").then(() => false, () => true)));
  check("strona nie ładuje skryptów z CDN", !calls.some((u) => /unpkg|jsdelivr|cdnjs/.test(u)));

  /* --- link Google Maps --- */
  await page.click("#step2BackBtn");
  await page.fill("#linkInput", LINK);
  await page.click("#step1NextBtn");
  await onScreen2(page);
  check("link: 3 punkty, dystans i czas", (await page.locator(".wp-name").count()) === 3 && /^\d+ km$/.test(await page.textContent("#statDist")) && /h|min/.test(await page.textContent("#statDur")));
  check("wskaźnik kroków", (await page.textContent("#stepperLabel")).startsWith("Krok 2 z 4"));
  check("mapa w rozdzielczości sceny", await page.evaluate(() => Math.abs(map.getCanvas().width - STAGE_W) <= 3));
  check("scena narysowana (linia trasy w kolorze)", await page.evaluate(() => {
    const d = stageCtx.getImageData(0, 0, STAGE_W, STAGE_H).data;
    for (let i = 0; i < d.length; i += 16) if (d[i] > 200 && d[i + 1] > 90 && d[i + 1] < 170 && d[i + 2] < 90) return true;
    return false;
  }));

  /* --- awaria routera --- */
  await page.click("#step2BackBtn");
  state.routingStatus = 503;
  await page.fill("#linkInput", LINK.replace("20.0323", "20.0400"));
  await page.click("#step1NextBtn");
  await page.waitForSelector("#errorBox", { state: "visible", timeout: 20000 });
  check("router 503: trzy próby i czytelny błąd", /po 3 próbach.*HTTP 503/s.test(await page.textContent("#errorText")));
  state.routingStatus = 200;

  /* --- zestaw zdjęć: pętla, dwa zdjęcia w jednym miejscu, nieczytelny plik --- */
  await page.click('.tab-btn[data-tab="photos"]');
  await page.setInputFiles("#photoSetInput", ["1-krakow.jpg", "zepsute.heic", "2-myslenice.jpg", "3-myslenice-drugie.jpg", "4-krakow-powrot.jpg"].map(FIX));
  await page.waitForFunction(() => photoSetEntries.length === 4 && !document.getElementById("photoSetAddBtn").disabled, null, { timeout: 30000 });
  check("nieczytelny plik pominięty, reszta wczytana z GPS", /Pominięto 1 z 5/.test(await page.textContent("#errorText")) && await page.evaluate(() => photoSetEntries.every((e) => e.status === "ok")));
  await page.click("#step1PhotosNextBtn");
  await onScreen2(page);
  const plan = await page.evaluate(() => {
    const tl = buildAnimationPlan();
    return { frac: waypointFeatures.map((w) => +w.frac.toFixed(3)), reveals: tl.segments.filter((s) => s.type === "reveal").map((s) => s.stopIndex) };
  });
  check("pętla: meta na końcu, pozycje rosnące", plan.frac[0] === 0 && plan.frac[3] === 1 && plan.frac[1] === plan.frac[2], JSON.stringify(plan.frac));
  check("każde zdjęcie ma własny pokaz, w kolejności", plan.reveals.join() === "0,1,2,3", plan.reveals.join());
  await page.waitForFunction(() => lastWaypoints.every((w) => !w.autoNamed), null, { timeout: 10000 });
  check("zdjęcia podpisane nazwą miejscowości", (await page.evaluate(() => lastWaypoints.map((w) => w.name).join("|"))) === "Kraków|Myślenice|Myślenice|Kraków");

  /* --- animacja: start, zatrzymanie --- */
  await page.click("#step2NextBtn");
  await page.waitForFunction(() => animationRunning, null, { timeout: 10000 });
  check("długość filmu pokazana", /Długość filmu: ok\. \d+(,\d)? s/.test(await page.textContent("#screen3 .duration-info")));
  await clickJs(page, "playAnimBtn");
  await page.waitForFunction(() => !animationRunning, null, { timeout: 10000 });
  check("zatrzymanie animacji wraca do podglądu", await page.evaluate(() => stageMode === "static"));

  /* --- eksport --- */
  await page.evaluate(() => setSpeed(5)); // krótki film = szybki test
  await page.click("#step3NextBtn");
  await page.waitForSelector("#screen4", { state: "visible" });
  await clickJs(page, "exportBtn");
  await page.waitForFunction(() => exportInProgress && animationRunning, null, { timeout: 20000 });
  await clickJs(page, "exportBtn");
  for (let i = 0; i < 100 && (await page.evaluate(() => exportInProgress)); i++) await page.waitForTimeout(200);
  check("anulowanie eksportu: bez pliku i bez błędu", (await page.isHidden("#exportResult")) && (await page.isHidden("#errorBox")));
  await clickJs(page, "exportBtn");
  await page.waitForSelector("#exportResult", { state: "visible", timeout: 240000 });
  const download = page.waitForEvent("download", { timeout: 20000 });
  await page.click("#saveBtn");
  const out = path.join(os.tmpdir(), `moto-route-e2e-${Date.now()}.bin`);
  await (await download).saveAs(out);
  const head = fs.readFileSync(out).subarray(0, 64);
  const size = fs.statSync(out).size;
  fs.unlinkSync(out);
  const info = await page.textContent("#exportResultInfo");
  check("eksport: pobrany plik wideo", size > 50000 && /^trasa\.(mp4|webm)/.test(info.replace("Plik ", "")), `${info} (${size} B)`);
  if (/\.mp4/.test(info)) check("plik MP4 ma poprawny nagłówek (ftyp)", head.includes(Buffer.from("ftyp")));
  check("podgląd nagrania ma rozdzielczość sceny", await page.evaluate(() => new Promise((resolve) => {
    const v = document.getElementById("exportPreview");
    const done = () => resolve(v.videoWidth === STAGE_W && v.videoHeight === STAGE_H);
    if (v.readyState >= 1) done(); else { v.onloadedmetadata = done; setTimeout(() => resolve(false), 8000); }
  })));

  /* --- zapis projektu i wznowienie --- */
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForSelector("#resumeCard", { state: "visible", timeout: 10000 });
  await page.click("#resumeBtn");
  await onScreen2(page);
  check("wznowienie projektu: lista zdjęć i przystanki ze zdjęciami", await page.evaluate(() =>
    photoSetEntries.length === 4 && waypointFeatures.every((w) => w.media?.mediaEl) && lastWaypoints[1].name === "Myślenice"));

  /* --- link do trasy --- */
  await page.click("#shareLinkBtn");
  await page.waitForFunction(() => /Skopiowano/.test(document.getElementById("shareLinkInfo").textContent), null, { timeout: 5000 });
  const shareLink = await page.evaluate(() => navigator.clipboard.readText());
  const page2 = await context.newPage();
  page2.on("pageerror", (e) => problems.push(`pageerror(2): ${e.message}`));
  await page2.goto(shareLink);
  await onScreen2(page2);
  check("link do trasy odtwarza punkty i czyści adres", await page2.evaluate(() => lastWaypoints.length === 4 && lastWaypoints[0].name === "Kraków" && location.hash === ""));
  await page2.close();

  /* --- reset --- */
  await clickJs(page, "step2BackBtn");
  await page.waitForSelector("#screen1", { state: "visible" });
  await page.evaluate(() => resetProject());
  await page.waitForFunction(() => photoSetEntries.length === 0 && currentRoute === null, null, { timeout: 5000 });
  await page.reload();
  await page.waitForTimeout(1000);
  check('"Zacznij od nowa" czyści projekt i zapis', await page.isHidden("#resumeCard"));

  /* --- GPX i linia prosta (bez routera) --- */
  const routingBefore = calls.filter((u) => /osrm|routing\.openstreetmap/.test(u)).length;
  await page.click('.tab-btn[data-tab="gpx"]');
  await page.setInputFiles("#gpxInput", FIX("slad.gpx"));
  await page.waitForFunction(() => !document.getElementById("step1GpxNextBtn").disabled, null, { timeout: 10000 });
  await page.click("#step1GpxNextBtn");
  await onScreen2(page);
  check("GPX: Start / nazwany punkt / Meta", (await page.evaluate(() => lastWaypoints.map((w) => w.name).join("|"))) === "Start|Postój <b>x</b>|Meta");
  await page.click("#step2BackBtn");
  await page.click('.tab-btn[data-tab="link"]');
  await page.selectOption("#travelModeSelect", "straight");
  await page.fill("#linkInput", LINK);
  await page.click("#step1NextBtn");
  await onScreen2(page);
  check("linia prosta i GPX nie pytają routera", calls.filter((u) => /osrm|routing\.openstreetmap/.test(u)).length === routingBefore && (await page.textContent("#statDur")) === "—");

  /* --- wyszukiwarka miejsc: etykieta z API jest tekstem --- */
  await page.click("#step2BackBtn");
  await page.click('.tab-btn[data-tab="photos"]');
  await page.click("#addStartMarkerBtn");
  await page.fill(".manual-coords-input", "Zakop");
  await page.waitForSelector(".place-suggestion-item", { timeout: 10000 });
  check("podpowiedź miejsca: HTML z API pokazany jako tekst", await page.evaluate(() => {
    const el = document.querySelector(".place-suggestion-item");
    return el.textContent.includes("<b>Zakopane</b>") && el.querySelector("b") === null;
  }));

  const real = problems.filter((p) => !/Refused to|Content Security Policy|example\.com|Failed to load resource|zepsute\.heic/.test(p));
  check("brak błędów w konsoli", real.length === 0, real.join(" | ").slice(0, 400));

  await browser.close();
  server.close();
  console.log(`\n${passed} zaliczonych, ${failed} niezaliczonych`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
