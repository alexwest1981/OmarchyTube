# OmarchyTube

Asks **who is watching**, then opens YouTube inside the app for that person —
one window, one Google session per profile.

## Using it

1. Launch **OmarchyTube**: the profile picker is the window.
2. <kbd>↵</kbd> on a profile opens YouTube in that window, in that profile's own
   session partition.
3. Signing in is a door the app opens **for** you, not a maze. A signed-out
   profile opens YouTube's normal page — it looks like YouTube and it obeys zoom.
   The moment you try YouTube's own sign-in, the app catches Google's blocked
   embedded path and takes you to the TV sign-in instead: a **QR code and an
   eight-character code** (that screen's first item is *Get started* — press
   <kbd>↵</kbd> if you are not on the code screen yet). Scan it with your phone, or
   press <kbd>F4</kbd> to open `yt.be/activate`. The account lands in that profile,
   and the app returns to your normal mode on its own. <kbd>F2</kbd> takes you to
   the door directly.
4. A profile opens as a **fullscreen app**. That is not decoration: Hyprland tiles
   a normal window to half the screen (941 px measured), and YouTube's ten-foot TV
   layout in 941 px shows two gigantic tiles and the edge of a third instead of a
   readable row. A real fullscreen request from the window beats tiling.
5. Once the account is in the session the app leaves the TV sign-in screen and
   goes back to your mode — desktop by default, which looks like YouTube and shows
   several rows.
6. <kbd>F3</kbd> brings the picker back in the same window, <kbd>Esc</kbd> goes
   back to the profile, <kbd>F2</kbd> switches desktop/TV mode, <kbd>F11</kbd>
   toggles fullscreen. <kbd>N</kbd> adds a profile, <kbd>Delete</kbd> twice removes
   one.

```sh
omarchy-tube            # the picker
omarchy-tube --tv       # start on youtube.com/tv
omarchy-tube --desktop  # start on youtube.com
```

## How many videos fit

Cards are sized by the page's own breakpoints, so zooming the **view** out fits
more of them: 1920 px gives four columns on YouTube's desktop layout, and the
default zoom of **0.80** gives a 2400 CSS px viewport — five to six.
<kbd>Ctrl</kbd>+<kbd>-</kbd>, <kbd>Ctrl</kbd>+<kbd>+</kbd> and
<kbd>Ctrl</kbd>+<kbd>0</kbd> step it, and the value is remembered
(`picker-state.json`).

Zoom is the browser's own view setting, not an edit to YouTube's pages — no CSS
and no JavaScript goes in. One measured caveat: the TV layout is built in rem
against the window width, so zoom changes nothing there; it looks the same at any
scale. TV mode is the sign-in door and the sofa mode — the desktop layout is the
one that gets denser.

## Why sign-in goes through the TV screen

The obvious route — YouTube's normal password form — is closed to every
embedded browser. That is why the app intercepts it instead of showing it:
clicking *Sign in* on YouTube's page would land on a Google error in the app's
own window, which looks like a broken app. Measured twice, from a real run:

> **Couldn't sign you in.** This browser or app may not be secure.

The TV client's device flow is the route Google does open, and it is the one
that puts the account inside the app's own session: the screen shows a QR code
and an eight-character code, you confirm it on your phone or at
`yt.be/activate`, and the app is signed in. It cannot be automated away — the
code has to travel from the app's screen to a device Google trusts.

## What this app does not do

It does not touch YouTube's pages. No CSS, no JavaScript, no zoom, no scaling.
That rule came from measurement, not taste:

* Injected geometry (`#container` forced to `100vw`/`100vh`, `overflow: hidden`
  on `html, body`) hit YouTube's desktop page, which has **seven** elements with
  that id — masthead, player, playlist panel, channel name — and left the page in
  a band at the top with everything else clipped.
* `setZoomFactor(0.49)` on Wayland became a `devicePixelRatio` of 0.49 instead of
  a page zoom: the layout reported 1920 CSS px while the surface painted at window
  size, so the picture sat in one quarter of the window.
* The TV app computes its own text scale from the window width, squared: 941 px
  gave a root font of 5.88 px against 24 px at 1920. That is YouTube's design, so
  TV mode maximises the window instead of fighting it.

What the app does own: the window, the question, the session partition per
profile, the user agent each mode needs, and blocking YouTube's ad endpoints at
the network layer.

## Files

| File | What it is |
|---|---|
| `src/main.js` | the window, the keys, the session rules, the launch |
| `src/profiles.js` | the profile list (`userData/profiles.json`), pure and tested |
| `src/user-agent.js` | the TV and desktop identities, pure and tested |
| `src/sign-in.js` | signed in ⇒ mode page, signed out ⇒ TV sign-in, pure and tested |
| `src/zoom.js` | the zoom steps behind Ctrl+- and Ctrl+0, pure and tested |
| `src/profiles.html/.css/-page.js` | the "who is watching" screen |
| `src/preload.js` | the renderer's entire surface: five profile channels |

## Tests

```sh
npm test
```

37 tests: the zoom steps, the sign-in decision, the profile rules (ids must survive being partition names, two profiles
may never share one), the user agent per mode, the sign-in decision, the IPC
channels, and an architecture test that fails if an injector, a page script or a
second zoom mechanism ever comes back.
