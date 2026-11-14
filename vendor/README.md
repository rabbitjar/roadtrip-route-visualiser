# Biblioteki zewnętrzne (kopie lokalne)

Pliki w tym katalogu to niezmienione kopie wydań z npm. Trzymamy je w repozytorium
zamiast ładować z CDN, żeby strona nie wykonywała kodu, którego wersji i treści
nie kontrolujemy (i żeby Content-Security-Policy mogło dopuszczać skrypty tylko z `'self'`).

| Plik | Pakiet | Wersja | Licencja |
|---|---|---|---|
| `maplibre-gl.js`, `maplibre-gl.css` | maplibre-gl | 5.24.0 | BSD-3-Clause (`LICENSE-maplibre-gl.txt`) |
| `exifr-lite.umd.js` | exifr (`dist/lite.umd.js`) | 7.1.3 | MIT (`LICENSE-exifr.txt`) |
| `mp4-muxer.js` | mp4-muxer (`build/mp4-muxer.js`) | 5.2.2 | MIT (`LICENSE-mp4-muxer.txt`) |

Aktualizacja: `npm pack <pakiet>@<wersja>`, skopiuj plik z `dist/`, usuń końcowy
komentarz `sourceMappingURL` i zaktualizuj tabelę powyżej.
