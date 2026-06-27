# Cessna 172 — Traffic Pattern Trainer

A static, no-build web app for memorizing the C172 airport traffic pattern,
from takeoff roll to touchdown (with a go-around branch). Built from a CFI
whiteboard and corroborated against the FAA Airplane Flying Handbook (Ch. 8)
and AIM §4-3-3.

## Live demo
**https://zhaodong2013062.github.io/traffic-pattern-practice/**

Repo: https://github.com/zhaodong2013062/traffic-pattern-practice

> If the link 404s, enable GitHub Pages: **Settings → Pages → Deploy from a
> branch → `main` / `/` (root)**. It's pure HTML/CSS/JS, no build step.

## Run it locally
Open `index.html` in any browser, or serve the folder. No build step.

## Interaction model
This is a **decision trainer**, not a guided checklist — and there is **no
multiple choice**. At each point the app shows only the *current conditions*
("what's happening / about to happen"). You then:

1. **Click the instrument or control** you'd actually use. There's no prompt
   telling you which one — click the wrong thing and you get a red
   *wrong-instrument* shake, no progress.
2. **Pick its setting** from a small value picker that opens on the control
   you clicked — e.g. clicking the throttle offers `2150 RPM`, `1500 RPM`,
   `Idle`, `Full power`… The choices are **specific to that control and that
   stage of the pattern** (and the distractors are sampled, so they vary run to
   run). Wrong setting → red ✗, try again.
3. A correct setting **animates the instruments + airplane** and arms the next
   point.

Other behavior:

- **Compound points** (downwind level-off, the Power/Alt/Airspeed scan, the
  Before-Landing flow, the go-around clean-up) chain several
  *click-control → pick-setting* actions in order; progress dots track them.
- **Show hint** is the only guidance, and only on request: it reveals the
  explanation and glows the correct control (or the correct value once the
  picker is open).
- **Go-around** is offered on final / over the threshold.

## How it works
- **Cockpit panel** (`js/cockpit.js`) — an SVG C172 six-pack + tach, throttle,
  flap selector, yoke, rudder, plus a comm/callout button, fuel selector,
  mixture, and seatbelt/autopilot switches so every step is a panel
  interaction. Needles and digital readouts animate to each step's targets.
- **Sequence** (`js/sequence.js`) — the single source of truth: each pattern
  point's phase, conditions, the ordered `actions` (`{target, answer, opts}`),
  the on-demand hint, target instrument values, and the airplane's minimap
  position. `VALUE_POOLS` supplies the dynamic settings for valued controls.
- **Minimap** (`js/minimap.js`) — top-down left-hand pattern; the airplane
  travels leg-to-leg in semi-real-time and the active leg lights up.
- **State machine** (`js/app.js`) — shows the conditions, scores the
  click-then-pick interaction (`await-control` → `await-value`), runs compound
  flows, animates the transit, and handles the go-around branch.
