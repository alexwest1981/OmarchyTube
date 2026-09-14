# 📺 OmarchyTube (ReVanced för Omarchy)

En dedikerad, helskärmsoptimerad YouTube-applikation för **Omarchy** och **Hyprland**, inspirerad av YouTube ReVanced och SmartTube.

Utvecklad för att ge en ren helskärmsupplevelse i eget fönster utan webbläsarkonst, med stöd för smidig **QR-kodsinloggning**, automatisk annonsblockering och **SponsorBlock**.

---

## ✨ Funktioner

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
| <kbd>Escape</kbd> / <kbd>Backspace</kbd> / <kbd>q</kbd> | **Backa ur video till hemskärmen / feeden** |
| Klick på `←`-knappen i hörnet | **Flytande tillbaka-knapp som visas vid musrörelse** |
| Musknapp 4 (Bakåt) | Backa ur video / historik |
| <kbd>F11</kbd> | Växla fönstrets helskärmsläge |
| <kbd>F2</kbd> | **Växla direkt mellan TV-läge och Desktop-läge** |
| <kbd>Pilar</kbd> + <kbd>Enter</kbd> | Navigera och välj i TV-läget |
| <kbd>Mellanslag</kbd> / <kbd>k</kbd> | Spela / Pausa |
| <kbd>Ctrl</kbd> + <kbd>R</kbd> / <kbd>F5</kbd> | Ladda om sidan |
| <kbd>Alt</kbd> + <kbd>Home</kbd> | Gå till startsidan |

---

## 🔐 Hur inloggningen fungerar

1. Starta appen (den öppnas i TV-läget som standard).
2. Stega med piltangenterna till sidomenyn till vänster och klicka på **Logga in / Sign in**.
3. En stor, tydlig **QR-kod** och en 8-siffrig aktiveringskod visas på skärmen.
4. Skanna QR-koden med mobilens kamera (eller öppna [youtube.com/activate](https://youtube.com/activate) i din webbläsare).
5. Tryck **Tillåt** – appen loggas in direkt och sparar dina spellistor och prenumerationer permanent!
