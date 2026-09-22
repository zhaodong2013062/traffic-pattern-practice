# Cessna 172 — Traffic Pattern Trainer

A static, no-build web app with two C172 drills:

- **Pattern** — the airport traffic pattern, takeoff roll to touchdown, with a
  go-around branch. Built from a CFI whiteboard and corroborated against the
  FAA Airplane Flying Handbook (Ch. 8) and AIM §4-3-3.
- **Emergencies** — the C172S emergency-procedures checklists, one random
  scenario at a time. Built from the school's emergency placard and
  corroborated against C172S POH Section 3.

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

## Emergencies mode
Same loop, different stakes. You get the **situation** and nothing else — not
even the category on the banner, because identifying the emergency is part of
the drill. It is named for you in the debrief, once you've flown it.

- **Setup card** — every scenario opens with the situation and the aircraft
  state ("1,800 ft · gliding 68 KIAS · engine out, will not restart") and a
  Begin button. Nothing is live until you press it, so you are never dropped
  into the middle of a checklist.
- **Random deck** — each session shuffles the scenarios you selected and plays
  them one at a time, with no repeats until the deck is exhausted.
- **Pick what to drill** — the `Scenarios` button opens a picker grouped the way
  the placard is (Engine Failure · Fire · Forced Landing · Icing), with per-group
  toggles and a "Drill this one" button to loop a single checklist. Your
  selection is remembered between sessions.
- **Strict order** — items run in QRH order. Wrong item or wrong value gives red
  feedback and does not advance. There is no timer.
- **Memory items are closed-book** — while the current item is a memory item the
  checklist stays shut and there is no hint, only **Read the checklist**, which
  is recorded in the debrief. Reference items show their lines as you work them.
- **Branches** — the card's real decision points ("If Risk of Fire", "If Engine
  Starts", "If fire extinguished and electrical power is necessary") are asked
  as questions; the situation tells you which branch applies.
- **Checklists that point at other checklists** — where the card says *Forced
  Landing Checklist*, you can run it right there and keep flying the same
  emergency; it then drops out of the rest of the deck.
- **Debrief** — per scenario and per session: items completed, wrong clicks, and
  whether the memory items were flown from memory or the checklist was opened.

The cockpit re-renders for this mode as a working emergency panel, not a menu:
a magneto key switch that turns to OFF · R · L · BOTH · START, the split red
MASTER rocker, STBY BATT / avionics / fuel pump / pitot heat / lights rockers,
red push-pull knobs for the fuel shutoff and cabin heat, the alternate static
air knob, the fuel selector valve, a circuit breaker panel, the extinguisher in
its bracket, the hand mic, the door handle, the belt buckle — and **toe brakes
on the rudder pedals**. Switches flip, knobs pull out and the key rotates as you
set them. A windscreen strip across the top carries the "look outside" items.

As in the pattern, **airspeed is flown with the yoke** — best glide is a pitch
attitude, not a number you dial in, so the ASI is a reference and never a
target.

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
- **State machine** (`js/app.js`) — the mode switch plus the pattern drill:
  control clicks, wrong-control/wrong-value feedback, hints, compound-step
  sequencing, the semi-real-time transit, and the go-around branch.
- **Shared chrome** (`js/ui.js`) — the value popover (anchored to the clicked
  control), the feedback line and the phase banner, used by both drills.
- **Emergency scenarios** (`js/emergencies.js`) — the source of truth for the
  emergency drill: each scenario's situation, starting instrument values, and
  its checklist as ordered nodes (`item` / `decision` / `handoff`), with each
  item flagged as a memory item or a reference item.
- **Emergency drill** (`js/emergency.js`) — the deck and scenario picker, the
  closed-book rule, the checklist card, branch handling and the debrief.
