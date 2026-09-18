# OmarchyTube

Frågar **vem som skall titta** och öppnar YouTube för den personen — i ett
webbläsarfönster med egen Google-session.

Det är hela appen. Den frågar, den öppnar, den stänger sig.

## Varför den är så liten

Första versionen försökte vara webbläsaren: eget videorutnät mot YouTubes
interna API, egen CSS injicerad i YouTubes sidor, ett "TV-läge" med förfalskad
SmartTV-agent och egen inloggning. Varje del av det slogs mot något vi inte kan
vinna:

* **Inloggningen.** Google vägrar lösenordsformuläret inuti en inbäddad
  webbläsare (`Couldn't sign you in — This browser or app may not be secure`).
  Mätt, två gånger. I en riktig webbläsare fungerar det.
* **TV-läget.** YouTubes TV-app räknar sin textskala ur fönsterbredden, i
  kvadrat: ett fönster på 941 px gav rotfont 5,88 px mot 24 px vid 1920 — en
  fjärdedels bild, oläsbar. YouTubes design, inte en bugg vi kan laga.
* **Appens skal.** Våra injicerade geometriregler (`#container` tvingad till
  100vw/100vh) träffade YouTubes skrivbordssida, som har **sju** element med det
  id:t — masthead, spelare, spellista — och la hela sidan i ett band högst upp
  med resten bortklippt.
* **Renderingen.** Electron på Wayland gjorde `setZoomFactor(0.49)` till ett
  `devicePixelRatio` på 0,49 i stället för en sidzoom: layouten sa 1920 CSS-px
  medan ytan målades i fönstrets storlek.

Allt det där är redan löst i en webbläsare, av folk som gör det till yrke. Kvar
är det som faktiskt var vårt: frågan, och att hålla sessionerna åtskilda. Varje
profil får sin egen `--user-data-dir`, så att logga in som någon annan aldrig
rör ditt eget flöde, din historik eller dina prenumerationer.

## Att använda den

1. Starta **OmarchyTube** — profilväljaren är det enda fönstret.
2. <kbd>↵</kbd> på en profil öppnar den profilens webbläsarfönster på
   <kbd>youtube.com</kbd>. Startaren stänger sig själv så snart webbläsaren är uppe.
3. Logga in en gång per profil, i det fönstret. Google behandlar det som en
   vanlig webbläsare, eftersom det är en.
4. <kbd>N</kbd> lägger till en profil. <kbd>F2</kbd> växlar mellan skrivbords-
   och TV-läge (TV öppnar `youtube.com/tv` — för en stor skärm).
   <kbd>Delete</kbd> två gånger tar bort en profil; webbläsarkatalogen ligger
   kvar om du vill ta bort kontot också.

```sh
omarchy-tube            # väljaren
omarchy-tube --tv       # starta i TV-läge
omarchy-tube --desktop  # starta i skrivbordsläge
OMARCHYTUBE_BROWSER=chromium omarchy-tube   # annan webbläsare
```

## Vad den behöver

* **Electron** (väljarfönstret) — `npm install`.
* **En Chromium-webbläsare i PATH** — `brave` som standard, byt med
  `OMARCHYTUBE_BROWSER`.

Webbläsaren är där YouTube bor; startaren laddar aldrig en YouTubesida själv och
injicerar ingenting någonstans.

## Filer

| Fil | Vad den är |
|---|---|
| `src/main.js` | väljarfönstret, IPC:n och starten — inget annat |
| `src/profiles.js` | profillistan (`userData/profiles.json`), ren och provad |
| `src/browser-launch.js` | webbläsarkommandot per profil, rent och provat |
| `src/profiles.html/.css/-page.js` | skärmen "Vem skall titta?" |
| `src/preload.js` | rendererns hela yta: fem profilkanaler |

## Prov

```sh
npm test
```

23 prov: profilreglerna (id:n måste tåla att bli katalognamn, två profiler får
aldrig dela katalog), webbläsarkommandot (varje profil får sin egen katalog,
adressen följer läget), IPC-kanalerna (varje `invoke` har en `handle`), och ett
arkitekturprov som fäller om det rivna lagret — en injektor, en inbäddad
YouTubesida, en förfalskad webbläsaridentitet — skulle komma tillbaka.
