# OmarchyTube

Vår egen YouTube-klient för Linux. Fönstret, rutnätet och sessionen är våra.
Ingen YouTube-sida laddas, ingen webbläsare startas och ingen kaka rörs.

## Flikar

| Flik | Varifrån |
|---|---|
| **Rekommenderat** | YouTubes eget flöde (InnerTube, kräver konto) |
| **Senaste** | din feed: nyaste videon från varje kanal du följer, nyast först |
| **Mina kanaler** | din prenumerationslista; Enter på en kanal visar dess videor |
| **Sök** | InnerTube-sökning — fungerar utan konto |

Enter spelar i **mpv** (som har yt-dlp inbyggt och löser strömmar, signaturer och
codecs själv). `/` fokuserar sökfältet, `L` öppnar inloggningen, F11 fullskärm,
Ctrl+Q avslutar.

## Inloggning: din egen nyckel, en gång

Appen använder Googles **device-flöde** — samma kod-flöde som TV-appens QR-kod —
men med en OAuth-klient som är din. Inga kakor, ingen webbläsare, ingen loop.

1. <https://console.cloud.google.com/apis/credentials> → **Create credentials** →
   **OAuth client ID** → typ **TVs and limited-input devices**
2. (Första gången: konfigurera samtyckesrutan — External, och lägg till din egen
   adress som testanvändare.)
3. Klistra in **klient-id** och **klienthemlighet** i appen och tryck
   *Spara och hämta kod*.
4. Öppna <https://www.google.com/device>, skriv in koden, klart.

Refresh-token sparas i `~/.config/omarchy-tube/token.json` (0600) och förnyas av
appen. **Tryck "Publish app"** i konsolen när du är klar — i *Testing*-läge
slutar refresh-token att gälla efter sju dagar.

Kvoten (Data API v3) är 10 000 enheter per dygn. Din feed kostar ~1 enhet per
kanal, alltså ~50 per uppdatering — det räcker till runt 190 uppdateringar.

## Vad som mättes (2026-09-19)

| Mätning | Resultat |
|---|---|
| InnerTube-sökning utan konto | 19–94 träffar |
| YouTubes egna startflöden utan konto | HTTP 400 / tomt — därför krävs kontot |
| Googles egna TV-klienter (device-flöde) | `restricted_client` / `invalid_client` — stängda |
| `yt-dlp --username oauth` | "Login with OAuth is no longer supported" |
| Braves kakor (v11) | går inte att dekryptera: 0/101, med nyckelring och `peanuts` |
| mpv utan formatväljare | HTTP 403 på videoströmmen |
| mpv med `--ytdl-format=bv*+ba/b` | AV1 3840x2160 60 fps + Opus |
| Miniatyrnivåer | mq 320x180, hq 480x360, sd 640x480, **hq720 1280x720** |

## Prov

```
npm test
```
31 prov: arkitekturlås (ingen session rörs, ingen YouTube-sida laddas, bara mpv
startas), kontraktet sida↔brygga↔huvud, inloggningens kodflöde och tokenförvaring,
varaktighetsräkningen, spelarens formatväljare, självrekursions-skannern och ett
smoketest av huvudprocessen.
