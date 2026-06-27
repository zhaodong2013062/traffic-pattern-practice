# Cessna 172 — Traffic Pattern Trainer

A static, no-build web app for memorizing the C172 airport traffic pattern,
from takeoff roll to touchdown (with a go-around branch). Built from a CFI
whiteboard and corroborated against the FAA Airplane Flying Handbook (Ch. 8)
and AIM §4-3-3.

## Run it
Open `index.html` in any browser, or serve the folder. No build step.

## Host on GitHub Pages
Settings → Pages → deploy from branch → `/` (root). It's pure HTML/CSS/JS.

## Interaction model
This is a **decision trainer**, not a guided checklist. At each point the app
shows the *situation* ("what's happening / about to happen") and asks
**"What do you do now?"** with a shuffled set of options:

- **Right choice** → instruments + airplane animate, the next point arms.
- **Wrong choice** → red shake, no progress, try again.
- **Show hint** → reveals the explanation and glows the relevant control(s).
- **Compound steps** (Before-Landing flow, Power/Alt/Airspeed check, GA climb)
  drop into a *perform* phase: actuate each item in the correct order from
  memory (the hint highlights the next one).
- **Cockpit shortcut:** clicking the correct control directly also counts.
- **Go-around** is offered on final / over-the-threshold.

## How it works
- **Cockpit panel** (`js/cockpit.js`) — an SVG C172 six-pack + tach, throttle,
  flap selector, yoke and rudder. Needles and digital readouts animate to each
  step's target values (the readouts double as a numbers memory aid).
- **Sequence** (`js/sequence.js`) — the single source of truth: every step,
  its phase, the action label (the correct answer), target instrument values,
  and the airplane's position on the minimap.
- **Minimap** (`js/minimap.js`) — top-down left-hand pattern; the airplane
  travels leg-to-leg in semi-real-time and the active leg lights up.
- **State machine** (`js/app.js`) — presents the choices, scores them, runs the
  perform phase for compound steps, auto-advances after the semi-real-time
  transit, and handles the go-around branch.
