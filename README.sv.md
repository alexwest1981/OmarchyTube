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
| <kbd>Pilar</kbd> + <kbd>Enter</kbd> | Navigera och välj i TV-läget |
| <kbd>Mellanslag</kbd> / <kbd>k</kbd> | Spela / Pausa |
| <kbd>Ctrl</kbd> + <kbd>R</kbd> / <kbd>F5</kbd> | Ladda om sidan |
| <kbd>Alt</kbd> + <kbd>Home</kbd> | Tillbaka till rutnätet |

---

## 🔐 Hur inloggningen fungerar

1. Starta appen. Den öppnar i sitt **eget rutnät**.
2. Rutnätet fungerar utan konto: **sökningen** svarar inloggningsfri, men
   **hemflödet** gör det inte — YouTube svarar med ingenting förrän du har ett
   konto (dess eget svar är *"Your YouTube history is off"*). Rutnätet säger det
   och visar en sökning så länge du är utloggad.
3. Tryck <kbd>F1</kbd> för att öppna YouTubes egen TV-vy, stega med piltangenterna
   till sidomenyn till vänster och välj **Logga in / Sign in**.
4. En stor, tydlig **QR-kod** och en 8-siffrig aktiveringskod visas på skärmen.
5. Skanna QR-koden med mobilens kamera (eller öppna [youtube.com/activate](https://youtube.com/activate) i din webbläsare).
6. Tryck **Tillåt** – appen loggas in direkt och sparar inloggningen.
7. Tryck <kbd>Alt</kbd> + <kbd>Home</kbd> (eller <kbd>F1</kbd>) för att gå tillbaka
   till rutnätet: hemflödet är personligt nu, för rutnätets anrop går i samma
   session som inloggningen fyllde.

