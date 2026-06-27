# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this is
A static, **no-build** browser app: a Cessna 172 traffic-pattern trainer.
Pure HTML/CSS/vanilla JS, no framework, no bundler, no dependencies. Just open
`index.html` (or serve the folder) — there is nothing to compile or install.

## Project layout
```
index.html       markup + element ids the JS wires to; loads the four scripts in order
style.css        all styling (cockpit SVG, action card / value picker, minimap)
js/sequence.js   DATA — the single source of truth for the pattern (no logic)
js/cockpit.js    window.Cockpit — builds the SVG panel, exposes a small API
js/minimap.js    window.Minimap — top-down pattern view + airplane animation
js/app.js        the state machine that ties it all together
```
Script load order matters: `sequence.js` → `cockpit.js` → `minimap.js` →
`app.js` (later files use globals from earlier ones).

## Interaction model (important — don't regress this)
There is **no multiple choice**. Each pattern point shows only the *current
conditions*. The pilot must:
1. **click the correct instrument/control** on the SVG panel
   (`mode === "await-control"`). Wrong element → `Cockpit.flash(id, false)`
   shake + a "not that one" indicator; no progress.
2. **pick the correct setting** from the value picker that opens on that control
   (`mode === "await-value"`). The choices are stage-specific and partly
   randomized.

No up-front guidance is shown. The **only** guidance is the on-demand
**Show hint** button. Branch steps (final / threshold) offer **Go Around**.

## Adding or editing a pattern step
Edit `SEQUENCE` (or `GOAROUND`) in `js/sequence.js`. Each step:
```js
{
  id, phase,                 // phase is a key in PHASES
  condition,                 // the situation shown to the pilot
  hint,                      // revealed only via "Show hint"
  actions: [                 // ordered; >1 entry = compound step
    { target: "throttle",    // a cockpit element data-id
      answer: "1500 RPM",    // correct value (must match a VALUE_POOLS entry…)
      opts: [...] },         // …OR provide explicit choices incl. the answer
  ],
  values: { rpm, ias, alt, flaps, vsi },   // instruments animate to these on completion
  pos: { x, y }, dwell,      // minimap position + travel time (ms)
  branch: true,              // optional: offer go-around here
}
```
- If `opts` is omitted, the picker is built from `VALUE_POOLS[target]`
  (answer + sampled distractors). The `answer` must then be an exact string in
  that pool.
- `target` must be a real cockpit element id. Existing ids: `throttle`, `flaps`,
  `yoke`, `rudder`, `asi`, `ai`, `alt`, `ti`, `hi`, `vsi`, `tach`, `comm`,
  `fuel`, `mixture`, `seatbelt`, `autopilot`. Display names live in `NAMES` in
  `app.js`. To add a new control, build it in `cockpit.js` (register it in
  `groups` and wire `clickCb`), add a `NAMES` entry, and style it in `style.css`.

## Cockpit API (`window.Cockpit`)
`render(container)`, `onClick(fn)` (fn receives the clicked `data-id`),
`setValues(values, animate)`, `highlight(ids)` / `clearHighlight()`,
`markDone(id)`, `flash(id, ok)` (green pulse / red shake).

## Conventions
- Vanilla JS, no dependencies. Keep it framework-free and build-free.
- `sequence.js` is data only — keep logic out of it.
- Match the existing comment style: a banner header per file explaining intent.
- The flight numbers (speeds, RPM, altitudes, flap settings) reflect real C172
  pattern technique — change them deliberately, not casually.

## Verifying changes
There's no test suite. Verify in a browser: open `index.html`, click **Start**,
and fly a lap — confirm wrong-control shake, the value picker, hints, compound
steps, and the go-around branch all behave. A headless check with Playwright
(`playwright-core` + the system Chromium) can auto-play a full run by reading
`SEQUENCE`/`GOAROUND` from the page and dispatching `click` on each
`[data-id]`; watch for `pageerror`/`console.error` and a `TOUCHDOWN` finish.
