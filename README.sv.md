# 📺 OmarchyTube (ReVanced för Omarchy)

[🇬🇧 English version](README.md)

En dedikerad, helskärmsoptimerad YouTube-applikation för **Omarchy** och **Hyprland**, inspirerad av YouTube ReVanced och SmartTube.

Utvecklad för att ge en ren helskärmsupplevelse i eget fönster utan webbläsarkonst, med stöd för smidig **QR-kodsinloggning**, automatisk annonsblockering och **SponsorBlock**.

---

## ✨ Funktioner

- 🏠 **Eget rutnät (appens startsida)**
  - Appen öppnar i sitt eget rutnät: en tangentbordsstyrd vägg av videokort byggd på YouTubes egna data (InnerTube), inte en inbäddad webbsida.
  - <kbd>/</kbd> söker, pilarna flyttar, <kbd>Enter</kbd> spelar upp. Uppspelningen sker på YouTubes **vanliga tittarsida**, så annonsblockering, SponsorBlock och den flytande tillbaka-knappen gäller fortfarande.
  - <kbd>F1</kbd> växlar till YouTubes egen vy (TV eller desktop, beroende på läge); <kbd>Escape</kbd> eller <kbd>Alt</kbd> + <kbd>Home</kbd> tar dig tillbaka till rutnätet.

![Rutnätet i 1920×1080](screenshots/browse-1920x1080.png)

- 📱 **Säker QR-kodsinloggning (TV/Leanback-läge)**:
  - Ingen risk för Googles *"This browser or app may not be secure"*.
  - Logga in med Googles officiella **OAuth Device Flow**: skanna QR-koden med mobilen eller gå till `youtube.com/activate`.
- 🎛️ **Två visningslägen (Växla med <kbd>F2</kbd>)**:
  - **TV-läge (Standard)**: YouTubes Leanback-gränssnitt optimerat för 100% ren helskärm, piltangenter och QR-inloggning.
  - **Desktop-läge**: YouTubes vanliga webbgränssnitt för klassisk musnavigation.
- 🛡️ **Annonsfritt på flera nivåer**:
  - Nätverksblockering av Googles och YouTubes annons- och spårningsservrar.
  - Kosmetisk rensning av sponsringsrutor och banners.
  - Omedelbar automatisk överhoppning av eventuella videoreklaminslag.
- ⚡ **SponsorBlock**:
  - Hoppar automatiskt över sponsringsinslag, intron, outron och egen reklam via SponsorBlocks API.
  - Visuella markeringar på tidslinjen och klickbar "Ångra"-knapp.
- 🪟 **Byggd för Omarchy & Hyprland**:
  - Körs med native Wayland (`--ozone-platform=wayland`) och hårdvaruacceleration.
  - Fönsterklass: `OmarchyTube`.

---

## 🚀 Starta appen

1. **Från startmenyn (Super-tangenten / Walker / Rofi)**:
   Sök efter **OmarchyTube**.
2. **Från terminalen**:
   ```bash
   OmarchyTube
   ```
3. **Starta direkt i skrivbordsläge**:
   ```bash
   OmarchyTube --desktop
   ```

---

## ⌨️ Tangentbordskontroller

| Tangent / Mus | Funktion |
|---|---|
| <kbd>F1</kbd> | **Växla mellan appens eget rutnät och YouTubes egen vy** (TV eller desktop, beroende på läge) |
| <kbd>/</kbd> | Fokusera rutnätets sökfält |
| <kbd>Piltangenter</kbd> / <kbd>PageUp</kbd> / <kbd>PageDown</kbd> / <kbd>Home</kbd> / <kbd>End</kbd> | Flytta dig i rutnätet |
| <kbd>Enter</kbd> | Spela upp det markerade kortet (öppnar YouTubes tittarsida) |
| <kbd>Escape</kbd> / <kbd>Backspace</kbd> / <kbd>q</kbd> | I ett videoklipp: **lämna videon och gå tillbaka till rutnätet**. I rutnätet: **tillbaka till hemskärmen** |
| Klick på `[ ← Tillbaka ]` i hörnet | **Flytande tillbaka-knapp som visas vid musrörelse** |
| Musknapp 4 (Bakåt) | Backa ur video / historik |
| <kbd>F11</kbd> | Växla fönstrets helskärmsläge |
| <kbd>F2</kbd> | **Växla direkt mellan TV-läge och Desktop-läge** |
| <kbd>F3</kbd> | **Byt tittare** (öppnar profilväljaren) |
| <kbd>Pilar</kbd> + <kbd>Enter</kbd> | Navigera och välj i TV-läget |
| <kbd>Mellanslag</kbd> / <kbd>k</kbd> | Spela / Pausa |
| <kbd>Ctrl</kbd> + <kbd>R</kbd> / <kbd>F5</kbd> | Ladda om sidan |
| <kbd>Alt</kbd> + <kbd>Home</kbd> | Tillbaka till rutnätet |

---

## 🔐 Hur inloggningen fungerar

OmarchyTube frågar **"Vem skall titta?"** innan något annat. En profil är en
Google-session — eget flöde, egna prenumerationer, egen historik och egna listor,
i sin egen partition — så att låna ut datorn inte betyder att låna ut sina
rekommendationer.

1. Starta **OmarchyTube**. Första skärmen är profilväljaren, inte en videosida:
   välj med piltangenterna och <kbd>Enter</kbd>, eller tryck <kbd>N</kbd> för att
   lägga till en profil.
2. En ny profil öppnar **YouTubes TV-inloggning** i den profilens session, och
   appen trycker själv det enda tangenttryck som krävs: det första som möter dig
   är **QR-koden och de åtta tecknen**. Skanna med mobilen, eller öppna
   [yt.be/activate](https://yt.be/activate) och skriv koden.
   Inte lösenordsformuläret, och det är med flit: mätt 2026-09-18 svarar Google
   en inbäddad webbläsare med *"Couldn't sign you in — This browser or app may
   not be secure"*. QR-vägen är den Google öppnar för en TV-klient, och den som
   lägger kontot i profilens egen session.
3. När du är inloggad öppnas profilen direkt på YouTube i det läge du lämnade:
   <kbd>F2</kbd> växlar mellan TV-läget (`youtube.com/tv`, hela tiofotsupplevelsen)
   och skrivbordsläget (`youtube.com`).
4. <kbd>F1</kbd> visar appens eget rutnät i samma profil. Anropen går genom
   profilens session, så hemflödet där är det kontot har kurerat.
5. <kbd>F3</kbd> tar tillbaka väljaren så du kan byta tittare. Varje profil har
   sitt eget fönster, så ett byte är ett fokusbyte, inte en omladdning.

Profilerna ligger i `userData/profiles.json`; kontona ligger i Chromiums egna
session-partitioner (`persist:omarchy-tube-<id>`) och försvinner med profilen.

