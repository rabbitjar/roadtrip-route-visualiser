"use strict";
/* Service worker: instalacja na ekranie głównym i start bez sieci.
   Strategia "najpierw sieć": gdy jest internet, zawsze serwowana jest świeża
   wersja aplikacji (kopia w pamięci jest przy okazji odświeżana); kopia służy
   tylko jako zapas offline. Obsługiwane są wyłącznie pliki samej aplikacji —
   kafelki map i zapytania o trasy idą prosto do swoich serwerów. */
const CACHE = "moto-route-shell-v3";
const SHELL = [
  "./",
  "index.html",
  "css/style.css",
  "js/config.js",
  "js/core.js",
  "js/render.js",
  "js/export.js",
  "js/app.js",
  "js/features.js",
  "vendor/maplibre-gl.js",
  "vendor/maplibre-gl.css",
  "vendor/exifr-lite.umd.js",
  "vendor/mp4-muxer.js",
  "favicon.svg",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("index.html");
        return Response.error();
      })
  );
});
