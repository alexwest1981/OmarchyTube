# OmarchyTube

Asks **who is watching**, then opens YouTube inside the app for that person —
one window, one Google session per profile.

## Using it

1. Launch **OmarchyTube**: the profile picker is the window.
2. <kbd>↵</kbd> on a profile opens YouTube in that window, in that profile's own
   session partition.
3. First time on a profile: YouTube's TV sign-in shows a **QR code and an
   eight-character code** (the first item on that screen is *Get started* — press
   <kbd>↵</kbd> if you are not there yet). Scan it with your phone, or press
   <kbd>F4</kbd> to open `yt.be/activate` in a browser and type the code there.
   The account lands in that profile and stays there.
4. <kbd>F3</kbd> brings the picker back in the same window, <kbd>Esc</kbd> goes
   back to the profile, <kbd>F2</kbd> switches desktop/TV mode,
   <kbd>F11</kbd> is fullscreen. <kbd>N</kbd> adds a profile, <kbd>Delete</kbd>
   twice removes one.

```sh
omarchy-tube            # the picker
omarchy-tube --tv       # start on youtube.com/tv
omarchy-tube --desktop  # start on youtube.com
```

## Why sign-in goes through the TV screen

The obvious route — YouTube's normal password form — is closed to every
embedded browser. Measured twice, from a real run:

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
| `src/profiles.html/.css/-page.js` | the "who is watching" screen |
| `src/preload.js` | the renderer's entire surface: five profile channels |

## Tests

```sh
npm test
```

30 tests: the profile rules (ids must survive being partition names, two profiles
may never share one), the user agent per mode, the sign-in decision, the IPC
channels, and an architecture test that fails if an injector, a zoom call or a
page script ever comes back.
