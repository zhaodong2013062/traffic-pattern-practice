# Cessna 172 — Traffic Pattern Trainer

A static, no-build web app for memorizing the C172 airport traffic pattern,
from takeoff roll to touchdown (with a go-around branch). Built from a CFI
whiteboard and corroborated against the FAA Airplane Flying Handbook (Ch. 8)
and AIM §4-3-3.

## Run it
Open `index.html` in any browser, or serve the folder. No build step.

## Host on GitHub Pages
Settings → Pages → deploy from branch → `/` (root). It's pure HTML/CSS/JS.

## How it works
- **Cockpit panel** (`js/cockpit.js`) — an SVG C172 six-pack + tach, throttle,
  flap selector, yoke and rudder. Needles and digital readouts animate to each
  step's target values (the readouts double as a numbers memory aid).
- **Sequence** (`js/sequence.js`) — the single source of truth: every step,
  its phase, the control(s) to actuate, target instrument values, and the
  airplane's position on the minimap. Compound steps (e.g. the Before-Landing
  flow) require clicking each item in order.
- **Minimap** (`js/minimap.js`) — top-down left-hand pattern; the airplane
  travels leg-to-leg in semi-real-time and the active leg lights up.
- **State machine** (`js/app.js`) — arms the next action, gives green/red
  feedback, auto-advances after the semi-real-time transit, and handles the
  go-around branch offered on final/threshold.

Actuate the highlighted control to advance. Non-control actions (verbal
callouts, the Before-Landing checklist) appear on the fold-out kneeboard.
