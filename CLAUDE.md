# CLAUDE.md

Guidance for working in this repository.

## What this is
A **static, no-build** web app that trains the Cessna 172 airport traffic
pattern (takeoff → touchdown, plus a go-around branch). Pure HTML/CSS/vanilla
JS — no framework, no bundler, no package.json. It opens directly in a browser
and is hosted on GitHub Pages.

Live: https://zhaodong2013062.github.io/traffic-pattern-practice/

## Layout
```
index.html        entry point; cockpit + value popover (left), conditions + minimap (right)
style.css         all styling
js/sequence.js    SOURCE OF TRUTH — PHASES, CONTROL_OPTIONS, SEQUENCE[], GOAROUND[]
js/cockpit.js     SVG C172 panel; window.Cockpit API (render/setValues/highlight/flash/…)
js/minimap.js     top-down pattern; window.Minimap API (render/moveTo/setLegActive/…)
js/app.js         state machine wiring it together
```
Load order in index.html matters: sequence → cockpit → minimap → app.

## Interaction model (don't regress this)
- Each step shows **only the conditions**. No hint about what to click.
- User **clicks a control**; correct control → a **value menu pops up at that
  control**; user picks the correct value. Wrong control / wrong value give red
  feedback and do not advance.
- A **Show hint** button is the only place guidance appears.
- Compound steps have multiple ordered `acts` (click-then-pick each).
- Branch steps (`branch: true`) offer **Go Around**.

To add/change a step, edit `SEQUENCE` (or `GOAROUND`) in `js/sequence.js`. Each
act = `{ target, correct, options?, values? }`. If a control needs a new menu,
add it to `CONTROL_OPTIONS`. New clickable controls must be drawn in
`cockpit.js` with a matching `data-id`.

## Aviation accuracy
Numbers/procedures come from a CFI whiteboard and were corroborated against the
FAA Airplane Flying Handbook (Ch. 8) and AIM §4-3-3. If you change a procedure
or speed/altitude/RPM, verify it against an authoritative source — don't guess.

## Testing
There's no test runner. Verify changes by driving the app in headless Chromium
(Playwright is available at `/opt/node22/lib/node_modules/playwright`, browser
at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Serve the folder over
http and click through both the full landing and the go-around branch, checking
for console errors. Cockpit groups have empty bbox centers, so dispatch click
events on `[data-id="…"]` elements rather than using `.click()`.

## Conventions
- Match the existing vanilla-JS style; keep it dependency-free and buildless.
- Comments are concise and explain *why*; mirror the surrounding density.
- Don't add a build step, framework, or npm dependency without being asked.
