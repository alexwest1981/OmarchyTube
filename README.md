# OmarchyTube

Vår egen YouTube-klient för Linux. Inget inloggningskrångel, ingen webbläsare,
ingen YouTubes webbsida.

* **Fönstret och rutnätet är våra.** Sök, bläddra med piltangenterna, Enter spelar.
  Rutnätet är tätt: 240 px-kort, sju kolumner i 1920.
* **Datan kommer från YouTubes InnerTube-API** (sök, utan konto) — ren HTTP, ingen
  renderad sida, inget som kan omdirigeras eller kläs om.
* **Videon spelas av mpv** (med yt-dlp inbyggt), som löser strömmar, signaturer och
  codecs. Vi lånar en spelare i stället för att underhålla en egen.
* **Ingen inloggning finns** — alltså ingen inloggning som kan hamna i en loop.
  Prenumerationer och personliga flöden kräver ett konto; det är en frivillig
  senare detalj (Googles device-flöde med en egen OAuth-klient).

## Kör

```
~/Work/omarchy-tube/bin/omarchy-tube        # eller genvägen ~/.local/bin/omarchy-tube
```

`/` fokuserar sökfältet, ↑↓←→ väljer, Enter spelar, F11 fullskärm, Ctrl+Q avslutar.

## Vad som mättes (2026-09-19)

| Mätning | Resultat |
|---|---|
| InnerTube-sökning utan konto | 19–45 träffar |
| YouTubes egna startflöden utan konto | HTTP 400 / tomt — därför är sökning ingången |
| mpv utan formatväljare | HTTP 403 på videoströmmen |
| mpv med `--ytdl-format=bv*+ba/b` | AV1 3840x2160 60 fps + Opus |
| Miniatyrnivåer | mq 320x180, hq 480x360, sd 640x480, **hq720 1280x720** |

## Vad som medvetet inte finns

Profiler och väljare, TV-läge, användaragent-spoofning, kakstädning, zoom,
inbäddad inloggning. Allt det hörde till arkitekturen där appen *var* YouTubes
webbsidor; den är riven.

## Prov

```
npm test
```
21 prov: arkitekturlås (ingen session rörs, ingen YouTube-sida laddas, bara mpv
startas), kontraktet sida↔brygga↔huvud, spelarens formatväljare, rutnätets
miniatyrer, självrekursions-skannern och ett smoketest av huvudprocessen.
