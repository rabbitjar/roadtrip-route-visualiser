"use strict";
// Testy czystych funkcji z js/core.js. Uruchomienie: npm run test:unit
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../js/core.js");

const LINK_A =
  "https://www.google.com/maps/dir/Krak%C3%B3w/Zakopane,+Polska/Nowy+Targ/@49.7,19.9,9z/data=!4m2!8m2!3d50.0647!4d19.9450!8m2!3d49.2992!4d19.9496!8m2!3d49.4775!4d20.0323!3e0";

test("parseGoogleMapsLink: format !8m2!3d..!4d.. z nazwami", () => {
  const { waypoints, travelMode } = core.parseGoogleMapsLink(LINK_A);
  assert.deepEqual(waypoints.map((w) => w.name), ["Kraków", "Zakopane", "Nowy Targ"]);
  assert.deepEqual(waypoints[0], { name: "Kraków", lat: 50.0647, lng: 19.945 });
  assert.equal(travelMode, "driving");
});

test("parseGoogleMapsLink: format !1d{lng}!2d{lat} i brak nazw", () => {
  const { waypoints } = core.parseGoogleMapsLink("https://www.google.com/maps/dir/data=!1d19.945!2d50.0647!1d19.9496!2d49.2992");
  assert.equal(waypoints.length, 2);
  assert.deepEqual([waypoints[0].lat, waypoints[0].lng], [50.0647, 19.945]);
  assert.equal(waypoints[1].name, "Punkt 2");
});

test("parseGoogleMapsLink: tryb podróży z linku", () => {
  assert.equal(core.parseGoogleMapsLink(LINK_A.replace("!3e0", "!3e1")).travelMode, "cycling");
  assert.equal(core.parseGoogleMapsLink(LINK_A.replace("!3e0", "!3e2")).travelMode, "walking");
});

test("parseGoogleMapsLink: czytelne błędy", () => {
  assert.throws(() => core.parseGoogleMapsLink("to nie link"), /poprawny link/);
  assert.throws(() => core.parseGoogleMapsLink("javascript:alert(1)"), /http\(s\)/);
  assert.throws(() => core.parseGoogleMapsLink("https://maps.app.goo.gl/abc"), /krótki link/);
  assert.throws(() => core.parseGoogleMapsLink("https://www.google.com/maps/place/Krak%C3%B3w"), /współrzędnych/);
});

test("parseGoogleMapsLink: zepsute kodowanie procentowe nie wywraca parsera, nazwy są przycinane", () => {
  const long = "A".repeat(300);
  const { waypoints } = core.parseGoogleMapsLink(
    `https://www.google.com/maps/dir/%E0%A4%A/${long}/data=!8m2!3d50.1!4d19.9!8m2!3d50.2!4d19.8`
  );
  assert.equal(waypoints.length, 2);
  assert.equal(waypoints[1].name.length, 80);
});

test("escapeHtml zamienia wszystkie znaki specjalne", () => {
  assert.equal(core.escapeHtml(`<img src=x onerror="a('b')">&\``), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;&#96;");
  assert.equal(core.escapeHtml(null), "");
});

test("parseLatLngPaste: różne formaty", () => {
  assert.deepEqual(core.parseLatLngPaste("52.2287693, 21.0176869"), { lat: 52.2287693, lng: 21.0176869 });
  assert.deepEqual(core.parseLatLngPaste("52,2287693, 21,0176869"), { lat: 52.2287693, lng: 21.0176869 });
  assert.deepEqual(core.parseLatLngPaste("https://www.google.com/maps/place/X/@49.2992,19.9496,14z"), { lat: 49.2992, lng: 19.9496 });
  assert.equal(core.parseLatLngPaste("Zakopane"), null);
  assert.equal(core.parseLatLngPaste("95.0, 200.0"), null);
});

test("isValidLatLng odrzuca NaN i wartości spoza zakresu", () => {
  assert.equal(core.isValidLatLng(NaN, 1), false);
  assert.equal(core.isValidLatLng(91, 0), false);
  assert.equal(core.isValidLatLng(-90, 180), true);
});

test("geometria: dystans, pozycja i kierunek", () => {
  const coords = [[19, 50], [19, 51]];
  const cum = core.buildCumulativeDistances(coords);
  assert.ok(Math.abs(cum[1] - 111195) < 200);
  const mid = core.positionAtDistance(coords, cum, cum[1] / 2);
  assert.ok(Math.abs(mid[1] - 50.5) < 1e-9);
  assert.ok(Math.abs(core.bearingDegrees([19, 50], [19, 51])) < 1e-6);
  assert.ok(Math.abs(core.bearingDegrees([19, 50], [20, 50]) - 90) < 1);
  assert.equal(core.headingAtDistance(coords, cum, cum[1]), null);
});

test("resampleByDistance: równe odstępy, zachowane końce", () => {
  const coords = [[19, 50], [19, 50.1], [19, 51]];
  const out = core.resampleByDistance(coords, core.buildCumulativeDistances(coords), 11);
  assert.equal(out.length, 11);
  assert.deepEqual(out[0], [19, 50]);
  assert.ok(Math.abs(out[10][1] - 51) < 1e-9);
  assert.ok(Math.abs(out[5][1] - 50.5) < 1e-6);
});

test("waypointFractionsFromLegs: pętla ma metę na końcu, nie na starcie", () => {
  assert.deepEqual(core.waypointFractionsFromLegs([{ distance: 100 }, { distance: 300 }]), [0, 0.25, 1]);
  assert.deepEqual(core.waypointFractionsFromLegs([{ distance: 0 }, { distance: 0 }]), [0, 0.5, 1]);
  assert.deepEqual(core.waypointFractionsFromLegs([]), [0]);
});

test("monotonicWaypointFractions: kolejne punkty tylko do przodu", () => {
  const coords = [[19, 50], [19.1, 50], [19.1, 50.1], [19, 50.1], [19, 50]];
  const cum = core.buildCumulativeDistances(coords);
  const fr = core.monotonicWaypointFractions(coords, cum, [
    { lng: 19, lat: 50 }, { lng: 19.1, lat: 50.1 }, { lng: 19, lat: 50 },
  ]);
  assert.equal(fr[0], 0);
  assert.equal(fr[2], 1);
  assert.ok(fr[1] > 0.4 && fr[1] < 0.6);
});

test("buildTimeline: każdy przystanek ze zdjęciem ma własny pokaz", () => {
  const tl = core.buildTimeline({
    total: 1000,
    travelMs: 10000,
    revealMs: 3000,
    endHoldMs: 500,
    stops: [
      { index: 0, dist: 0, hasMedia: false },
      { index: 1, dist: 400, hasMedia: true },
      { index: 2, dist: 400, hasMedia: true }, // to samo miejsce
      { index: 3, dist: 1000, hasMedia: true },
    ],
  });
  const reveals = tl.segments.filter((s) => s.type === "reveal");
  assert.deepEqual(reveals.map((s) => s.stopIndex), [1, 2, 3]);
  assert.deepEqual(reveals.map((s) => s.t0), [4000, 7000, 16000]);
  assert.equal(tl.totalMs, 10000 + 3 * 3000 + 500);
  assert.deepEqual(tl.marks[2], { tReveal: 7000, tSettle: 10000 });
  assert.equal(tl.segments.at(-1).type, "end");
});

test("buildTimeline: plansza startowa i zerowa długość", () => {
  const tl = core.buildTimeline({ total: 500, travelMs: 5000, stops: [], startHoldMs: 2000, endHoldMs: 1000 });
  assert.deepEqual(tl.segments.map((s) => s.type), ["start", "travel", "end"]);
  assert.equal(tl.totalMs, 8000);
  const zero = core.buildTimeline({ total: 0, travelMs: 5000, stops: [{ index: 0, dist: 0, hasMedia: true }], revealMs: 1000 });
  assert.equal(zero.totalMs, 1000);
});

test("timelineStateAt: stan w czasie", () => {
  const tl = core.buildTimeline({
    total: 1000, travelMs: 10000, revealMs: 2000, endHoldMs: 500,
    stops: [{ index: 0, dist: 500, hasMedia: true }],
  });
  assert.equal(core.timelineStateAt(tl, 2500).dist, 250);
  const reveal = core.timelineStateAt(tl, 6000);
  assert.deepEqual([reveal.type, reveal.dist, reveal.elapsed, reveal.stopIndex], ["reveal", 500, 1000, 0]);
  assert.equal(core.timelineStateAt(tl, 9500).dist, 750);
  assert.equal(core.timelineStateAt(tl, 99999).type, "end");
  assert.equal(core.timelineStateAt(tl, -5).dist, 0);
  assert.equal(core.timelineStateAt(tl, tl.totalMs).progress, 1);
});

test("followCameraBlend: 0 na planszach, 1 w środku jazdy", () => {
  const tl = core.buildTimeline({ total: 1000, travelMs: 10000, stops: [], startHoldMs: 2000, endHoldMs: 1000 });
  assert.equal(core.followCameraBlend(tl, 1000), 0);
  assert.equal(core.followCameraBlend(tl, 7000), 1);
  assert.equal(core.followCameraBlend(tl, 12000), 0);
  const ramp = core.followCameraBlend(tl, 2700);
  assert.ok(ramp > 0 && ramp < 1);
});

test("buildStraightRoute: ortodroma, odcinki i przekroczenie 180°", () => {
  const r = core.buildStraightRoute([{ lat: 52.23, lng: 21.01 }, { lat: 40.71, lng: -74.0 }]);
  assert.ok(Math.abs(r.distanceMeters / 1000 - 6850) < 60);
  assert.equal(r.durationSeconds, null);
  assert.deepEqual(r.waypointFractions, [0, 1]);
  assert.ok(Math.max(...r.coordinates.map((c) => c[1])) > 55, "łuk idzie na północ od obu końców");
  const pacific = core.buildStraightRoute([{ lat: 35.68, lng: 139.69 }, { lat: 37.77, lng: -122.42 }]);
  for (let i = 1; i < pacific.coordinates.length; i++) {
    assert.ok(Math.abs(pacific.coordinates[i][0] - pacific.coordinates[i - 1][0]) < 180);
  }
});

test("buildGpxRoute: punkty nazwane ułożone wzdłuż śladu", () => {
  const track = Array.from({ length: 11 }, (_, i) => ({ lat: 50 + i * 0.01, lng: 19, time: i * 60000 }));
  const { route, waypoints } = core.buildGpxRoute(track, [
    { lat: 50.08, lng: 19.001, name: "Drugi" },
    { lat: 50.02, lng: 19.001, name: "Pierwszy" },
    { lat: 999, lng: 0, name: "Zły" },
  ]);
  assert.deepEqual(waypoints.map((w) => w.name), ["Start", "Pierwszy", "Drugi", "Meta"]);
  assert.deepEqual(route.waypointFractions.map((f) => +f.toFixed(2)), [0, 0.2, 0.8, 1]);
  assert.equal(route.durationSeconds, 600);
  assert.throws(() => core.buildGpxRoute([{ lat: 50, lng: 19 }]), /co najmniej 2/);
  assert.throws(() => core.buildGpxRoute([{ lat: 50, lng: 19 }, { lat: 50, lng: 19 }]), /zerową długość/);
});

test("link do trasy: kodowanie w obie strony i walidacja", () => {
  const input = {
    mode: "cycling",
    title: "Żółwie tempo 🐢",
    waypoints: [
      { lat: 50.064712345, lng: 19.945, name: "Kraków <script>" },
      { lat: 49.2992, lng: 19.9496, name: "Meta", kind: "finish" },
    ],
  };
  const decoded = core.decodeSharedRoute(core.encodeSharedRoute(input));
  assert.equal(decoded.mode, "cycling");
  assert.equal(decoded.title, "Żółwie tempo 🐢");
  assert.deepEqual(decoded.waypoints[0], { lat: 50.06471, lng: 19.945, name: "Kraków <script>", kind: null });
  assert.equal(decoded.waypoints[1].kind, "finish");

  const forge = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  for (const bad of [
    "", "%%%", forge({ v: 2, w: [] }), forge({ v: 1, w: [[1, 2, "a"]] }),
    forge({ v: 1, w: [[1, 2, "a"], ["x", 2, "b"]] }), forge({ v: 1, w: [[91, 2, "a"], [1, 2, "b"]] }),
    forge({ v: 1, w: Array.from({ length: 61 }, () => [1, 2, "a"]) }),
  ]) {
    assert.throws(() => core.decodeSharedRoute(bad), /uszkodzony/);
  }
  const odd = core.decodeSharedRoute(forge({ v: 1, m: "teleport", w: [[1, 2, 5, "evil"], [3, 4, "x".repeat(500)]] }));
  assert.equal(odd.mode, "driving");
  assert.deepEqual([odd.waypoints[0].name, odd.waypoints[0].kind], ["Punkt 1", null]);
  assert.equal(odd.waypoints[1].name.length, 80);
});

test("formatowanie", () => {
  assert.equal(core.formatDuration(19200), "5 h 20 min");
  assert.equal(core.formatDuration(3600), "1 h");
  assert.equal(core.formatDuration(1500), "25 min");
  assert.equal(core.formatDuration(null), "—");
  assert.equal(core.formatDecimalPl(12.44), "12,4");
  assert.equal(core.clampNumber(0.001, 0.2, 5), 0.2);
  assert.equal(core.parseDecimalInput("1,5", 1), 1.5);
  assert.equal(core.parseDecimalInput("abc", 7), 7);
  assert.deepEqual(core.wrapText("ala ma kota i psa", 8, (t) => t.length, 3), ["ala ma", "kota i", "psa"]);
});
