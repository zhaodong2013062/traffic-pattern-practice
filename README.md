# Cessna 172 — Traffic Pattern Trainer

A static, no-build web app for memorizing the C172 airport traffic pattern,
from takeoff roll to touchdown (with a go-around branch). Built from a CFI
whiteboard and corroborated against the FAA Airplane Flying Handbook (Ch. 8)
and AIM §4-3-3.

## Live site
**https://zhaodong2013062.github.io/traffic-pattern-practice/**

(Served from GitHub Pages on the `main` branch. If it 404s, enable it under
Settings → Pages → Deploy from branch → `main` / root.)

## Run it locally
Open `index.html` in any browser, or serve the folder. No build step.

## Interaction model
This is a **click-the-instrument trainer**, not a guided checklist. At each
point the app shows only the current **conditions** ("what's happening / about
to happen"). You decide and act:

- **Click the control/instrument** you'd use. There is **no guidance** beforehand.
- **Wrong control** → red flash + "✗ not that one", no menu.
- **Correct control** → a value menu pops up *at that control* (dynamic per
  stage — e.g. throttle → Full / 2150 / 1500 / Idle).
- **Wrong value** → red shake on that choice, menu stays open.
- **Correct value** → instruments + airplane animate; the next action arms.
- **Compound steps** (Before-Landing flow, Power/Alt/Airspeed check, GA climb)
  require several click-then-pick actions in order, still with no guidance.
- **Show hint** → names the control to click / the value to set, and glows it.
- **Go-around** is offered on final / over-the-threshold.

## How it works
- **Cockpit panel** (`js/cockpit.js`) — an SVG C172 six-pack + tach, throttle,
  flap selector, yoke, rudder, and a pedestal/switch cluster (fuel selector,
  mixture, autopilot, seatbelts, radio/call). Needles and readouts animate to
  each step's values.
- **Sequence** (`js/sequence.js`) — the single source of truth: each step's
  conditions plus its ordered `acts` (which control to click + the correct
  value), instrument targets, and the airplane's minimap position.
  `CONTROL_OPTIONS` defines each control's default menu; an act can override it
  to vary the choices by stage.
- **Minimap** (`js/minimap.js`) — top-down left-hand pattern; the airplane
  travels leg-to-leg in semi-real-time and the active leg lights up.
- **State machine** (`js/app.js`) — handles control clicks, the value popover
  (anchored to the clicked control), wrong-control/wrong-value feedback, hints,
  compound-step sequencing, the semi-real-time transit, and the go-around branch.
