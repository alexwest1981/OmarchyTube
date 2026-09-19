# OmarchyTube

Frågar **vem som skall titta** och öppnar sedan YouTube i appen för den
personen — ett fönster, en Google-session per profil.

## Att använda den

1. Starta **OmarchyTube**: profilväljaren är fönstret.
2. <kbd>↵</kbd> på en profil öppnar YouTube i det fönstret, i den profilens egen
   session.
3. Inloggningen är en dörr appen öppnar **åt** dig, inte en snårskog. En utloggad
   profil öppnar YouTubes vanliga sida — den ser ut som YouTube och lyder zoom. I
   samma stund du försöker med YouTubes egen inloggning fångar appen Googles
   blockerade inbäddade väg och tar dig till TV-inloggningen i stället: en **QR-kod
   och en åttateckenskod** (första valet på den skärmen är *Get started* — tryck
   <kbd>↵</kbd> om du inte är på kodsidan). Skanna med mobilen, eller tryck
   <kbd>F4</kbd> för att öppna `yt.be/activate`. Kontot hamnar i profilen, och appen
   går själv tillbaka till ditt vanliga läge. <kbd>F2</kbd> tar dig till dörren
   direkt.
4. En profil öppnas som en **fullskärmsapp**. Det är inte utsmyckning: Hyprland
   tilade ett vanligt fönster till halva skärmen (mätt: 941 px), och YouTubes
   10-fotslayout i 941 px visar två gigantiska brickor och kanten av en tredje i
   stället för en läsbar rad. En riktig fullskärmsbegäran från fönstret slår
   tilningen.
5. När kontot finns i sessionen lämnar appen TV-inloggningen och går tillbaka till
   ditt läge — skrivbordet som standard, vilket ser ut som YouTube och visar flera
   rader.
6. <kbd>F3</kbd> tar tillbaka väljaren i samma fönster, <kbd>Esc</kbd> går tillbaka
   till profilen, <kbd>F2</kbd> växlar skrivbords-/TV-läge, <kbd>F11</kbd> växlar
   fullskärm. <kbd>N</kbd> lägger till en profil, <kbd>Delete</kbd> två gånger tar
   bort en.

```sh
omarchy-tube            # väljaren
omarchy-tube --tv       # starta på youtube.com/tv
omarchy-tube --desktop  # starta på youtube.com
```

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

En sak TV-appen gör på egen hand är att hoppa förbi inloggningsrutan: har
profilen redan besökardata öppnar den sitt vanliga flöde (*Recommended*, *New to
you*) i stället, och där finns **ingen QR-kod** någonstans — mätt, och det var dit
ett klick på *Sign in* ledde. Därför städar appen bort profilens besökskakor **och dess
lokala lagring** precis innan den öppnar dörren — att bara ta kakorna räckte inte,
TV-appen kände ändå igen en återkommande besökare. Bara när det inte finns något konto: en befintlig session
rörs aldrig.

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

43 prov: dörren, städningen, fångstgrinden, zoomstegen, inloggningsbeslutet, profilreglerna (id:n måste tåla att bli partitionsnamn, två profiler får
aldrig dela en), webbläsaridentiteten per läge, inloggningsbeslutet, IPC-kanalerna,
och ett arkitekturprov som fäller om en injektor, ett zoom-anrop eller ett
sidskript kommer tillbaka.
