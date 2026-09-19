# OmarchyTube

Frågar **vem som skall titta** och öppnar sedan YouTube i appen för den
personen — ett fönster, en Google-session per profil.

## Att använda den

1. Starta **OmarchyTube**: profilväljaren är fönstret.
2. <kbd>↵</kbd> på en profil öppnar YouTube i det fönstret, i den profilens egen
   session.
3. Inloggningen går via YouTubes TV-skärm, den enda väg Google lämnar öppen för en
   inbäddad webbläsare: en **QR-kod och en åttateckenskod**. I TV-layouten ligger
   skärmen bakom *avataren uppe till vänster* → kontoskärmen → *Sign in*; tryck
   <kbd>↵</kbd> om den öppnar på *Get started*. Skanna med mobilen, eller tryck
   <kbd>F4</kbd> för `yt.be/activate`. Kontot hamnar i profilens egen session och
   stannar där — appen rör det aldrig. Ett försök med YouTubes egen *Sign in* på
   skrivbordssidan fångas och skickas till samma dörr, eftersom Google svarar en
   inbäddad webbläsare med *"This browser or app may not be secure"*.
4. <kbd>F2</kbd> växlar skrivbords-/TV-layout. Det är allt den gör — ett lägesbyte
   som aldrig rör sessionen.
5. En profil öppnas som en **fullskärmsapp**. Det är inte utsmyckning: Hyprland
   tilade ett vanligt fönster till halva skärmen (mätt: 941 px), och YouTubes
   10-fotslayout i 941 px visar två gigantiska brickor och kanten av en tredje i
   stället för en läsbar rad. En riktig fullskärmsbegäran från fönstret slår
   tilningen.
6. När kontot finns i sessionen går appen tillbaka till ditt läge — skrivbordet som
   standard, vilket ser ut som YouTube och visar flera rader.
7. <kbd>F3</kbd> tar tillbaka väljaren i samma fönster, <kbd>Esc</kbd> går tillbaka
   till profilen, <kbd>F2</kbd> växlar skrivbords-/TV-läge, <kbd>F11</kbd> växlar
   fullskärm. <kbd>N</kbd> lägger till en profil, <kbd>Delete</kbd> två gånger tar
   bort en.

```sh
omarchy-tube            # väljaren
omarchy-tube --tv       # starta på youtube.com/tv
omarchy-tube --desktop  # starta på youtube.com
```

## De två layouterna, och vilken man skall leva i

YouTubes TV-layout är ett **tiofotsgränssnitt**: byggt för en soffa tre meter från
teven. Alltså en hylla i taget, två till tre mycket stora brickor, och konst skalad
för det avståndet — nivåerna YouTube serverar är 320×180, 480×360, 640×480 och
1280×720, och en bricka 600 px bred från en 480 px-källa ser precis så mjuk ut som
det låter. Den lyder inte heller zoom, eftersom skalan är byggd i `rem` mot
fönsterbredden.

Skrivbordslayouten är den för en skärm: flera rader, fyra till sex kolumner och
skarpa bilder. TV-layouten finns här som **inloggningsdörr** och för en stor skärm på
avstånd; skrivbordslayouten är den man tittar i. <kbd>F2</kbd> växlar, och när du väl
är inloggad är den tangenten ett riktigt val som sparas. Dörren skriver aldrig över
det: efter inloggning kommer du tillbaka till layouten du stod i.

## Hur många videor som får plats

Korten storleksbestäms av sidans egna brytpunkter, så att zooma ut **vyn** ger plats
för fler: 1920 px ger fyra kolumner i YouTubes skrivbordslayout, och standardzoomen
**0,80** ger en CSS-yta på 2400 px — fem till sex kolumner.
<kbd>Ctrl</kbd>+<kbd>-</kbd>, <kbd>Ctrl</kbd>+<kbd>+</kbd> och
<kbd>Ctrl</kbd>+<kbd>0</kbd> stegar, och värdet sparas (`picker-state.json`).

Zoomen är webbläsarens egen vy-inställning, inte ett ingrepp i YouTubes sidor —
ingen CSS och ingen JavaScript går in. En mätt reservation: TV-layouten är byggd i
rem mot fönsterbredden, så där ändrar zoom ingenting; den ser likadan ut hur man än
skalar. TV-läget är inloggningsdörren och soffläget — skrivbordslayouten är den som
blir tätare.

## Varför inloggningen går via TV-skärmen

Appen fångar bara Googles **blockerade lösenordsväg** (ServiceLogin / signin-v2 /
kontoväljaren / YouTubes egen `/signin`) — och bara medan du står i
skrivbordslayouten. Allt annat, inklusive TV-appens egen inloggning, lämnas i fred.
Den grinden är mätt: att fånga varje Google-adress slet TV-inloggningen mitt i och
släppte användaren tillbaka i TV-flödet utan att någonsin få skriva något.

Står du i TV-layouten är inloggningen YouTubes egen skärm: avataren uppe till
vänster → kontoskärmen → *Sign in* → QR-koden (eller tryck <kbd>↵</kbd> på
*Get started* om den kom upp).

**Appen raderar aldrig sessionsdata.** Regeln har en historia: en version av
programmet städade profilens kakor och lokala lagring innan den öppnade
inloggningsdörren, för att TV-appen skulle visa inloggningen i stället för sitt
flöde. Det fungerade — och den slängde samtidigt bort sessionen TV-appen just fått,
eftersom det är där TV-appen har den. Varje <kbd>F2</kbd> betydde att QR-koden fick
skannas igen. Ingenting i `src/` får ta bort kakor eller lagring nu, och ett prov
fäller om något försöker. Dörren öppnar en sida; den städar inte.

Den uppenbara vägen — YouTubes vanliga lösenordsformulär — är stängd för varje
inbäddad webbläsare. Därför fångar appen den i stället för att visa den: ett klick
på *Logga in* på YouTubes sida skulle landa i ett Google-fel i appens eget fönster,
vilket ser ut som en trasig app. Mätt två gånger, i en riktig körning:

> **Couldn't sign you in.** This browser or app may not be secure.

TV-klientens device-flöde är den väg Google öppnar, och den lägger kontot i
appens egen session: skärmen visar en QR-kod och en åttateckenskod, du bekräftar
på mobilen eller på `yt.be/activate`, och appen är inloggad. Det går inte att
automatisera bort — koden måste från appens skärm till en enhet Google litar på.

## Vad appen inte gör

Den rör inte YouTubes sidor. Ingen CSS, ingen JavaScript, ingen zoom, ingen
skalning. Regeln kommer ur mätningar, inte ur tycke:

* Injicerad geometri (`#container` tvingad till `100vw`/`100vh`, `overflow: hidden`
  på `html, body`) träffade YouTubes skrivbordssida, som har **sju** element med
  det id:t — masthead, spelare, spellista, kanalnamn — och la hela sidan i ett band
  högst upp med resten bortklippt.
* `setZoomFactor(0.49)` på Wayland blev ett `devicePixelRatio` på 0,49 i stället
  för en sidzoom: layouten sa 1920 CSS-px medan ytan målades i fönstrets storlek,
  så bilden hamnade i en fjärdedel av rutan.
* TV-appen räknar sin egen textskala ur fönsterbredden, i kvadrat: 941 px gav
  rotfont 5,88 px mot 24 px vid 1920. Det är YouTubes design, så TV-läget maximerar
  fönstret i stället för att slåss mot den.

Det appen äger: fönstret, frågan, sessionen per profil, webbläsaridentiteten varje
läge behöver, och att blockera YouTubes annonsändpunkter i nätverkslagret.

## Filer

| Fil | Vad den är |
|---|---|
| `src/main.js` | fönstret, tangenterna, sessionsreglerna, starten |
| `src/profiles.js` | profillistan (`userData/profiles.json`), ren och provad |
| `src/user-agent.js` | TV- och skrivbordsidentiteterna, rena och provade |
| `src/sign-in.js` | inloggad ⇒ lägets sida, utloggad ⇒ TV-inloggningen, ren och provad |
| `src/zoom.js` | zoomstegen bakom Ctrl+- och Ctrl+0, rena och provade |
| `src/profiles.html/.css/-page.js` | skärmen "Vem skall titta?" |
| `src/preload.js` | rendererns hela yta: fem profilkanaler |

## Prov

```sh
npm test
```

59 prov: att ingenting raderar sessionsdata, dörren, fångstgrinden, lägesvalet, zoomstegen, och en skanner som fäller om en definition anropar sig själv, inloggningsbeslutet, profilreglerna (id:n måste tåla att bli partitionsnamn, två profiler får
aldrig dela en), webbläsaridentiteten per läge, inloggningsbeslutet, IPC-kanalerna,
och ett arkitekturprov som fäller om en injektor, ett zoom-anrop eller ett
sidskript kommer tillbaka.
