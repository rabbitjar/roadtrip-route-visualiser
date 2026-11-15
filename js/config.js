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
  // Adres skryptu rozwijającego krótkie linki Google Maps (server/resolve.php).
  // Pusty = funkcja wyłączona (aplikacja prosi wtedy o wklejenie pełnego linku).
  //  - aplikacja i skrypt na tym samym serwerze:  "server/resolve.php"
  //  - skrypt na innej domenie:  "https://twoja-domena.pl/server/resolve.php"
  //    (wtedy dopisz tę domenę do connect-src w CSP i do $ALLOWED_ORIGINS w skrypcie)
  shortLinkResolver: "",
  // wyszukiwarka miejsc zgodna z API Photon ("/api/?q=" i "/reverse?lon=&lat=")
  placeSearch: "https://photon.komoot.io",
});
