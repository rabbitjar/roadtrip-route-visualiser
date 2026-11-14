"use strict";
/* Konfiguracja usług zewnętrznych — jedyne miejsce, które trzeba zmienić, żeby
   przepiąć aplikację na własny albo płatny serwer.

   WAŻNE: po zmianie adresu dopisz nowy host do dyrektywy connect-src w
   Content-Security-Policy w index.html — inaczej przeglądarka zablokuje zapytania.

   routing: serwery zgodne z API OSRM ("/route/v1/{profil}/{lng,lat;lng,lat}").
   Domyślne to darmowe serwery publiczne BEZ gwarancji dostępności — dobre do
   użytku prywatnego, za słabe dla serwisu z większym ruchem. Zamienniki opisuje
   README (własny OSRM w Dockerze albo dostawca komercyjny z API zgodnym z OSRM). */
const APP_CONFIG = Object.freeze({
  routing: Object.freeze({
    driving: "https://router.project-osrm.org/route/v1/driving",
    cycling: "https://routing.openstreetmap.de/routed-bike/route/v1/driving",
    walking: "https://routing.openstreetmap.de/routed-foot/route/v1/driving",
    // dodatkowe parametry doklejane do każdego zapytania, np. "access_token=..." u dostawcy komercyjnego
    extraQuery: "",
    timeoutMs: 20000,
    maxAttempts: 3,
  }),
  // wyszukiwarka miejsc zgodna z API Photon ("/api/?q=" i "/reverse?lon=&lat=")
  placeSearch: "https://photon.komoot.io",
});
