# TVPlayer — Samsung Tizen IPTV-speler

Eigen speler. Geen content. Gebruiker levert M3U-link of Xtream-login.

## Structuur
- `config.xml` — Tizen-manifest (AVPlay, internet, toetsen)
- `index.html` — drie schermen: setup, browse, player
- `css/style.css` — 1920×1080 TV-layout
- `js/sources.js` — M3U-parser, Xtream API-client
- `js/player.js` — AVPlay op TV, HTML5-video in browser
- `js/app.js` — navigatie, afstandsbediening, opslag
- `test.m3u` — twee openbare teststreams

## Testen op Mac (browser)
```
cd tvplayer
python3 -m http.server 8000
```
Open `http://localhost:8000` in Safari (speelt HLS native).
Toetsen: pijltjes, Enter = OK, Esc = Terug.
Playlist-URL: `http://localhost:8000/test.m3u`.

## Op Samsung TV (Mac)
1. Installeer VS Code + extensie `tizentv`.
2. Command palette → `Tizen TV: Run Certificate Manager` → Samsung-certificaat.
3. TV: Apps → `12345` → Developer mode aan → IP Mac invullen → TV herstarten.
4. VS Code-instellingen: TV-IP invullen.
5. Map `tvplayer` openen → `Tizen TV: Build Signed Package` → `Launch Application`.

## Afstandsbediening
- Setup: pijltjes, OK, Terug
- Lijst: links/rechts wisselt kolom, CH+/CH− bladert
- Speler: op/neer of CH = zappen, cijfers = kanaalnummer, Play/Pause, Terug = lijst

## Volgende stappen
- Backend: accounts, device-ID, licentie, playlist via website
- EPG (XMLTV)
- Films/series via Xtream `get_vod_streams`, `get_series`
- LG webOS-build (zelfde code, ander manifest)
