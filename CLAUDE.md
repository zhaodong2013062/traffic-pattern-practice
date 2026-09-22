# CLAUDE.md

Guidance for working in this repository.

## What this is
A **static, no-build** web app with two Cessna 172 drills, switched from the
top bar:
- **Pattern** — the airport traffic pattern (takeoff → touchdown, plus a
  go-around branch).
- **Emergencies** — the emergency-procedures checklists, one random scenario
  at a time.

Pure HTML/CSS/vanilla JS — no framework, no bundler, no package.json. It opens
directly in a browser and is hosted on GitHub Pages.

Live: https://zhaodong2013062.github.io/traffic-pattern-practice/

## Layout
```
index.html        entry point; cockpit + value popover (left), conditions + minimap/checklist (right)
style.css         all styling
js/sequence.js    SOURCE OF TRUTH (pattern) — PHASES, CONTROL_OPTIONS, SEQUENCE[], GOAROUND[]
js/emergencies.js SOURCE OF TRUTH (emergencies) — EMERGENCY_GROUPS, EMER_CONTROL_OPTIONS, EMERGENCIES[]
js/cockpit.js     SVG C172 panel; window.Cockpit API (render(el, mode)/setValues/highlight/flash/…)
js/minimap.js     top-down pattern; window.Minimap API (render/moveTo/setLegActive/…)
js/ui.js          shared chrome — value popover, feedback line, phase banner
js/emergency.js   emergency drill controller (deck, picker, checklist card, debrief)
js/app.js         mode switch + the pattern drill
```
Load order in index.html matters:
sequence → emergencies → cockpit → minimap → ui → emergency → app.

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

## Emergencies mode (don't regress this either)
- Every scenario opens on a **setup card**: the situation, the aircraft state
  line, and a Begin button. Nothing is armed until Begin — the pilot is never
  dropped into the middle of a checklist.
- Each scenario's `situation` **stands on its own**. It never assumes the pilot
  just flew some other scenario, even where the checklist really is a
  continuation (forced landing).
- The banner reads a generic **EMERGENCY** while you fly; naming the group
  would answer the drill's first question. The checklist is named in the
  debrief once it is done.
- A `handoff` node with `continues` **rolls on into that checklist** in the same
  run (engine failure → forced landing), and that scenario drops out of the
  rest of the deck. The offer is withheld if the session already flew it.
- A session is a **shuffled deck** of the scenarios selected in the picker —
  no scenario repeats until the deck is exhausted. The selection persists in
  `localStorage`; "Drill this one" loops a single scenario instead.
- Items run in QRH order, **except within a group**: consecutive items sharing
  a `g` are accepted in any order, and all of them must be done before the
  checklist moves on. Groups are the actions a pilot does as one thought —
  securing the engine (mixture · fuel shutoff · mags), killing the electrics
  (stby batt · master), getting fuel to the engine, telling someone (mayday ·
  ELT), preparing the cabin (belts · doors). Anything with a real reason to be
  ordered stays ordered: airspeed before everything, master ON before avionics
  ON, close the vents before using the extinguisher.
- A group is **closed-book if any of its items is a memory item** — showing the
  reference half would give away the memory half sitting next to it.
- There is no timer.
- **Memory items are closed-book**: while the current item is one, nothing
  ahead of it is shown and the hint button is withheld — only "Read the
  checklist", which is recorded in the scenario debrief. Reference items show
  their lines as you work them.
- `decision` nodes carry the card's real branches ("If Risk of Fire", "If
  Engine Starts"); the situation text determines which branch is correct.
- **Airspeed is flown, not selected.** Same rule as the pattern: pitch with the
  YOKE, read the ASI. No emergency item targets an instrument — the six-pack is
  reference only in this mode.
- The cockpit re-renders in emergency layout, drawn as actual hardware rather
  than a grid of identical buttons: a magneto key switch that rotates, a split
  red MASTER rocker, push-pull knobs (fuel shutoff, alt static, cabin heat/air,
  defrost), a fuel selector valve, a breaker panel, an extinguisher, the hand
  mic, the door handle, the belt buckle — and **toe brakes on the rudder
  pedals**, which is where the brakes are. Finding the control is part of the
  drill, so don't flatten these back into tiles.
- Each control's `setLabel` both prints the chosen value and *moves the thing*
  (rockers flip, knobs pull out, the key rotates, the valve pointer swings).
- The tach is not drawn in this mode — no checklist item targets it, and RPM
  still reads through the throttle knob travel.
- Only two ids are not hardware — `action` ("land as soon as practical") and
  `allswitches` — and they are drawn as placards, on their own plate, to keep
  that distinction visible.

Whatever a `decision` node asks must be answerable from the `situation` — if a
branch turns on it being night, the situation says it is night.

To add/change a scenario, edit `EMERGENCIES` in `js/emergencies.js`. Each needs
a `situation`, a `state` line and its `nodes`, which are
`{t:"item"|"decision"|"handoff"}`; `label`/`goto` wire the branches and
`goto:"end"` finishes. Items that may be done in any order share a `g`
(consecutive items only, and don't put the same control in one group twice).
Any new control needs a menu in `EMER_CONTROL_OPTIONS`, a display name in
`CONTROL_NAMES`, and hardware drawn for it in `renderEmergency` in
`cockpit.js` — use one of the existing primitives (`rocker`, `pullKnob`,
`keySwitch`, `fuelValve`, `placard` …) rather than inventing a tile.

## Aviation accuracy
Pattern numbers/procedures come from a CFI whiteboard, corroborated against the
FAA Airplane Flying Handbook (Ch. 8) and AIM §4-3-3. Emergency checklists come
from the school's C172S (G1000) emergency placard, corroborated against the
C172S POH Section 3. If you change a procedure or speed/altitude/RPM, verify it
against an authoritative source — don't guess.

One known deviation is commented in `js/emergencies.js`: the POH prints 70 KIAS
flaps-up for engine failure immediately after takeoff, while the placard (and
this drill) use the 68 KIAS best-glide figure the school teaches.

## Testing
There's no test runner. Verify changes by driving the app in headless Chromium
(Playwright is available at `/opt/node22/lib/node_modules/playwright`, browser
at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Serve the folder over
http and click through both the full landing and the go-around branch, plus an
emergency session (every scenario, the closed-book behaviour, and a mode
round-trip back to pattern), checking for console errors. Chromium's favicon
probe 404s — that one is not an app error. Cockpit groups have empty bbox centers, so dispatch click
events on `[data-id="…"]` elements rather than using `.click()`.

## Conventions
- Match the existing vanilla-JS style; keep it dependency-free and buildless.
- Comments are concise and explain *why*; mirror the surrounding density.
- Don't add a build step, framework, or npm dependency without being asked.
