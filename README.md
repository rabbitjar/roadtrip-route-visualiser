# Moto Route — film z trasy na mapie

Aplikacja w przeglądarce, która zamienia trasę w krótki animowany film (MP4)
gotowy na Stories, Reels czy TikToka: pojazd jedzie po mapie, na przystankach
pokazują się zdjęcia i filmy, na końcu jest podsumowanie.

Wszystko dzieje się lokalnie w przeglądarce — bez konta, bez instalacji i bez
własnego serwera. Zdjęcia i filmy nie są nigdzie wysyłane.

## Co potrafi

- **Trzy źródła trasy:** link Google Maps (`google.com/maps/dir/…`), zdjęcia/filmy
  z telefonu (lokalizacja z EXIF, kolejność według czasu) albo ślad **GPX**.
- **Sposób podróży:** samochód/motocykl, rower, pieszo albo linia prosta
  (samolot, kajak, prom).
- **Wygląd:** ikona pojazdu, kolor trasy, styl mapy (jasna, kolorowa, ciemna,
  satelita), proporcje kadru, ręczne kadrowanie, kamera podążająca za pojazdem.
- **Napisy:** podpisy miejsc, plansza z tytułem, podsumowanie na końcu.
- **Muzyka** dogrywana do filmu.
- **Eksport** klatka po klatce do MP4 (H.264), z przyciskiem „Udostępnij” na telefonie.
- **Zapis projektu** w przeglądarce, **link do trasy** do wysłania znajomym,
  instalacja na ekranie głównym (PWA).

## Uruchomienie lokalne

To strona statyczna — wystarczy dowolny serwer plików:

```bash
npm start            # python3 -m http.server 8080
# potem otwórz http://localhost:8080
```

Otwieranie `index.html` prosto z dysku (`file://`) nie zadziała w pełni:
przeglądarki blokują wtedy m.in. service workera i część API.

## Publikacja

Repozytorium można opublikować bez budowania, np. przez GitHub Pages
(Settings → Pages → Deploy from a branch → `main`, katalog `/`). Wymagany jest
**https** — bez niego nie działa m.in. udostępnianie, schowek i tryb aplikacji.

## Struktura

| Ścieżka | Zawartość |
|---|---|
| `index.html`, `css/style.css` | interfejs |
| `js/config.js` | adresy usług zewnętrznych (routing, wyszukiwarka miejsc) |
| `js/core.js` | czyste funkcje: parsery, geometria, oś czasu animacji (pokryte testami jednostkowymi) |
| `js/render.js` | mapa, rysowanie klatek na canvasie, odtwarzanie, nagrywanie na żywo |
| `js/export.js` | eksport klatka po klatce (WebCodecs + MP4) |
| `js/app.js` | logika interfejsu (kroki 1–4) |
| `js/features.js` | GPX, muzyka, link do trasy, zapis projektu, PWA |
| `vendor/` | biblioteki zewnętrzne trzymane lokalnie (wersje i licencje w `vendor/README.md`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | tryb aplikacji (PWA) |
| `server/resolve.php` | opcjonalny skrypt rozwijający krótkie linki Google Maps |
| `tests/` | testy jednostkowe i end-to-end |

## Testy

```bash
npm ci
npx playwright install chromium   # jednorazowo
npm test                          # jednostkowe + end-to-end
```

- `npm run test:unit` — czyste funkcje z `js/core.js` (`node --test`).
- `npm run test:e2e` — pełne przejście aplikacji w Chromium. Testy są
  hermetyczne: mapy, routing i wyszukiwarka są podstawiane lokalnie, więc wynik
  nie zależy od dostępności darmowych serwerów.

Te same testy uruchamia GitHub Actions (`.github/workflows/test.yml`).

## Usługi zewnętrzne i ich ograniczenia

| Do czego | Usługa | Uwagi |
|---|---|---|
| Mapy | [OpenFreeMap](https://openfreemap.org) | bez klucza; dane © OpenStreetMap |
| Mapa satelitarna | [Sentinel-2 cloudless, EOX](https://s2maps.eu) | mozaika 2016, CC BY 4.0 |
| Trasy samochodowe | serwer demo [OSRM](https://project-osrm.org) | **bez gwarancji dostępności** |
| Trasy rowerowe i piesze | OSRM utrzymywany przez FOSSGIS (`routing.openstreetmap.de`) | zasady uczciwego użycia |
| Wyszukiwanie miejsc | [Photon](https://photon.komoot.io) | bez klucza, limity zapytań |

Atrybucja map jest rysowana w każdej klatce filmu — wymaga tego licencja danych.

### Własny albo płatny serwer tras

Darmowe serwery wystarczają do użytku prywatnego. Przy większym ruchu warto je
wymienić — wystarczy zmiana w `js/config.js`:

1. **Własny OSRM** (np. w Dockerze, `osrm/osrm-backend`, z wycinkiem danych
   z [Geofabrik](https://download.geofabrik.de)) — wpisz jego adres w
   `APP_CONFIG.routing.driving` (analogicznie `cycling`, `walking`).
2. **Dostawca komercyjny** z API zgodnym z OSRM — wpisz adres, a klucz podaj
   w `APP_CONFIG.routing.extraQuery` (np. `"access_token=…"`). Pamiętaj, że
   klucz w aplikacji działającej w przeglądarce jest widoczny dla każdego —
   ogranicz go u dostawcy do swojej domeny.
3. Dopisz nowy host do `connect-src` w nagłówku Content-Security-Policy
   w `index.html`, inaczej przeglądarka zablokuje zapytania.

### Krótkie linki Google Maps (opcjonalny skrypt na serwerze z PHP)

Aplikacja Google Maps udostępnia trasy jako krótkie linki (`maps.app.goo.gl/…`),
które nie zawierają punktów trasy. Przeglądarka nie pozwala stronie sprawdzić,
dokąd taki link prowadzi, więc robi to mały skrypt `server/resolve.php` na
dowolnym hostingu z PHP i rozszerzeniem cURL (np. HostGator).

Wdrożenie:

1. Wgraj `server/resolve.php` na serwer (cPanel → Menedżer plików albo FTP),
   np. do `public_html/server/resolve.php`.
2. W pliku uzupełnij `$ALLOWED_ORIGINS` adresem, pod którym działa aplikacja
   (np. `'https://twoja-domena.pl'`). Gdy aplikacja stoi na tej samej domenie co
   skrypt, lista może zostać pusta.
3. W `js/config.js` ustaw `shortLinkResolver`:
   - ta sama domena: `"server/resolve.php"`,
   - inna domena: pełny adres `"https://twoja-domena.pl/server/resolve.php"`
     i dopisz `https://twoja-domena.pl` do `connect-src` w CSP w `index.html`.
4. Sprawdź: otwórz w przeglądarce
   `https://twoja-domena.pl/server/resolve.php?url=https://maps.app.goo.gl/TWÓJ_LINK`
   — powinien pojawić się JSON z pełnym adresem `https://www.google.com/maps/dir/…`.

Skrypt łączy się wyłącznie z hostami Google, odpowiada tylko wskazanym stronom
i ma limit 30 zapytań na minutę z jednego adresu IP. Nie zapisuje linków.

Gdy `shortLinkResolver` jest pusty, aplikacja działa jak dotąd: prosi o wklejenie
pełnego adresu.

## Prywatność i bezpieczeństwo

- Pliki użytkownika są przetwarzane wyłącznie w przeglądarce. Na zewnątrz
  wychodzą tylko: współrzędne punktów (routing), wpisywane nazwy i współrzędne
  zdjęć (wyszukiwarka miejsc) oraz oglądany fragment mapy (kafelki). Aplikacja
  informuje o tym w sekcji „Prywatność” na pierwszym ekranie.
- Ostatni projekt i ustawienia są zapisywane lokalnie (IndexedDB, localStorage);
  przycisk „Usuń dane zapisane w tej przeglądarce” kasuje wszystko.
- Strona ma ścisłe Content-Security-Policy: skrypty tylko z własnego originu,
  połączenia tylko do usług z tabeli powyżej.
- Każdy tekst spoza aplikacji (nazwy z linków, nazwy plików, odpowiedzi API)
  jest wstawiany jako tekst, nigdy jako HTML.

Błąd bezpieczeństwa? Zgłoś go prywatnie przez zakładkę *Security → Report a
vulnerability* w repozytorium.

## Ograniczenia

- Krótkie linki Google (`maps.app.goo.gl`) działają dopiero po wdrożeniu skryptu
  `server/resolve.php` (opis wyżej). Bez niego trzeba otworzyć link
  w przeglądarce i skopiować pełny adres.
- Eksport klatkowy wymaga przeglądarki z WebCodecs i koderem H.264 (aktualne
  Chrome, Edge, Safari). W pozostałych aplikacja automatycznie nagrywa film na
  żywo — trwa to tyle, ile film, i karta musi zostać na wierzchu.
- Zdjęcia HEIC otwierają się tylko w przeglądarkach, które same je dekodują (Safari).

## Licencja

Kod aplikacji: MIT (`LICENSE`). Biblioteki w `vendor/` mają własne licencje.
