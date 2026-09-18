# OmarchyTube

Asks **who is watching**, then opens YouTube for that person — in a browser
window with its own Google session.

That is the whole app. It asks, it opens, it closes itself.

## Why it is this small

The first version tried to be the browser: its own video grid over YouTube's
internal API, canned CSS injected into YouTube's pages, a "TV mode" with a
spoofed SmartTV user agent, its own sign-in flow. Every part of that fought
something we could not win:

* **Sign-in.** Google refuses the password form inside an embedded browser
  (`Couldn't sign you in — This browser or app may not be secure`). Measured,
  twice. In a real browser it just works.
* **TV mode.** YouTube's TV app computes its text scale from the window width,
  squared: a 941 px window gave a root font of 5.88 px against 24 px at 1920 —
  a quarter of the picture, unreadable. YouTube's design, not a bug we can fix.
* **The shell.** Our injected geometry rules (`#container` forced to 100vw/100vh)
  hit YouTube's desktop page, which has **seven** elements with that id —
  masthead, player, playlist panel — and left the page in a band at the top with
  everything else clipped.
* **Rendering.** Electron on Wayland gave `setZoomFactor(0.49)` a
  `devicePixelRatio` of 0.49 instead of a page zoom, so the layout said 1920 CSS
  px while the surface painted at window size.

Each of those is already solved in a browser, by people who do it for a living.
So the app does the part that was actually ours: the question, and keeping the
sessions apart. Every profile gets its own `--user-data-dir`, so signing in as
someone else never touches your own feed, history or subscriptions.

## Using it

1. Launch **OmarchyTube** — the profile picker is the only window.
2. <kbd>↵</kbd> on a profile opens that profile's browser window at
   <kbd>youtube.com</kbd>. The launcher closes itself as soon as the browser is
   up.
3. Sign in once per profile, in that window. Google treats it as an ordinary
   browser, because it is one.
4. <kbd>N</kbd> adds a profile. <kbd>F2</kbd> switches the launcher between
   desktop and TV mode (TV opens `youtube.com/tv` — for a big screen).
   <kbd>Delete</kbd> twice removes a profile; its browser directory stays behind
   for you to delete if the account should go too.

```sh
omarchy-tube            # the picker
omarchy-tube --tv       # start in TV mode
omarchy-tube --desktop  # start in desktop mode
OMARCHYTUBE_BROWSER=chromium omarchy-tube   # a different browser
```

## What it needs

* **Electron** (the picker window) — `npm install`.
* **A Chromium-family browser on `PATH`** — `brave` by default, override with
  `OMARCHYTUBE_BROWSER`.

The browser is where YouTube lives; the launcher never loads a YouTube page
itself and injects nothing anywhere.

## Files

| File | What it is |
|---|---|
| `src/main.js` | the picker window, the IPC, and the launch — nothing else |
| `src/profiles.js` | the profile list (`userData/profiles.json`), pure and tested |
| `src/browser-launch.js` | the browser command per profile, pure and tested |
| `src/profiles.html/.css/-page.js` | the "who is watching" screen |
| `src/preload.js` | the renderer's entire surface: five profile channels |

## Tests

```sh
npm test
```

23 tests: the profile rules (ids must survive being directory names, two
profiles may never share one), the browser command (a profile always gets its
own directory, the URL follows the mode), the IPC channels (every `invoke` has
a `handle`), and one architecture test that fails if the deleted layer — an
injector, an embedded YouTube page, a spoofed user agent — ever comes back.
