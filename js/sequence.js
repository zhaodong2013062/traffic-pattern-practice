/* ============================================================================
   sequence.js  —  The single source of truth for the C172 traffic pattern.

   Each step describes:
     id            unique key
     phase         leg of the pattern (drives the phase banner + minimap color)
     label         short title shown in the action card
     description   what the pilot does
     condition     situational context shown as a sub-line ("runway abeam left")
     callout       optional spoken phrase (verbalization steps)
     targets       array of cockpit element ids that must be actuated, IN ORDER.
                   A single-element array is a normal single click. Multi-element
                   arrays are the "compound" steps (the user clicks each in turn).
     kind          "control"  -> click a cockpit control/instrument
                   "foldout"  -> confirm on the fold-out kneeboard panel
                   "minimap"  -> acknowledge a condition shown on the minimap
     values        instrument target values to animate to once the step completes
     pos           {x,y} position of the airplane on the minimap (viewBox units)
     dwell         ms the airplane spends travelling to `pos` (semi real-time)
     branch        (landing approach only) true => a go-around is offered here
   ========================================================================== */

const PHASES = {
  TAKEOFF:   { name: "TAKEOFF",   color: "#ff6b35" },
  UPWIND:    { name: "UPWIND",    color: "#ffb142" },
  CROSSWIND: { name: "CROSSWIND", color: "#ffd32a" },
  DOWNWIND:  { name: "DOWNWIND",  color: "#34ace0" },
  BASE:      { name: "BASE",      color: "#706fd3" },
  FINAL:     { name: "FINAL",     color: "#33d9b2" },
  LANDING:   { name: "LANDING",   color: "#2ed573" },
  GOAROUND:  { name: "GO-AROUND", color: "#ff4757" },
};

/* Instrument value keys: rpm, ias (airspeed kts), alt (ft), flaps (deg),
   vsi (ft/min). Values carry forward step-to-step unless overridden. */

const SEQUENCE = [
  /* ---------------------------- TAKEOFF ---------------------------------- */
  {
    id: "lineup", phase: "TAKEOFF",
    label: "Line up on centerline",
    description: "Taxi onto the runway and align with the centerline.",
    condition: "Runway heading, ready for departure.",
    targets: ["rudder"], kind: "control",
    values: { rpm: 1000, ias: 0, alt: 0, flaps: 0, vsi: 0 },
    pos: { x: 190, y: 258 }, dwell: 600,
  },
  {
    id: "full-throttle", phase: "TAKEOFF",
    label: "Full throttle",
    description: "Smoothly advance throttle to full power (~2500 RPM).",
    condition: "Begin the takeoff roll.",
    targets: ["throttle"], kind: "control",
    values: { rpm: 2500, ias: 0, alt: 0 },
    pos: { x: 190, y: 252 }, dwell: 800,
  },
  {
    id: "instruments-green", phase: "TAKEOFF",
    label: 'Verbalize: "Instruments green"',
    description: "Scan the engine gauges — all in the green arc.",
    condition: "Power is up, accelerating.",
    callout: "Instruments green",
    targets: ["call-instruments"], kind: "foldout",
    values: { ias: 25, rpm: 2500 },
    pos: { x: 190, y: 244 }, dwell: 900,
  },
  {
    id: "airspeed-alive", phase: "TAKEOFF",
    label: 'Verbalize: "Airspeed alive"',
    description: "Airspeed indicator begins to register (~40 kts).",
    condition: "Accelerating through 40 kts.",
    callout: "Airspeed alive",
    targets: ["call-airspeed"], kind: "foldout",
    values: { ias: 45 },
    pos: { x: 190, y: 232 }, dwell: 900,
  },
  {
    id: "rotate", phase: "TAKEOFF",
    label: "Rotate at 55 kts",
    description: "Apply smooth back pressure on the yoke to lift off.",
    condition: "55 KIAS — Vr.",
    targets: ["yoke"], kind: "control",
    values: { ias: 60, alt: 50, vsi: 600 },
    pos: { x: 190, y: 214 }, dwell: 1000,
  },
  {
    id: "climb-attitude", phase: "UPWIND",
    label: "Set climb attitude, 74 kts",
    description: "Pitch for Vy and hold the attitude indicator picture.",
    condition: "Positive rate, climbing.",
    targets: ["ai"], kind: "control",
    values: { ias: 74, alt: 200, vsi: 700 },
    pos: { x: 190, y: 165 }, dwell: 1400,
  },

  /* ---------------------- UPWIND -> CROSSWIND ---------------------------- */
  {
    id: "track-upwind", phase: "UPWIND",
    label: "Track runway heading",
    description: "Maintain extended centerline, climbing at 74 kts.",
    condition: "Upwind leg.",
    targets: ["hi"], kind: "control",
    values: { alt: 500, vsi: 700 },
    pos: { x: 190, y: 120 }, dwell: 1400,
  },
  {
    id: "turn-crosswind", phase: "CROSSWIND",
    label: "Turn crosswind at 700 ft AGL",
    description: "At 700 AGL, make a left climbing turn to crosswind.",
    condition: "700 ft AGL — turn left 90°.",
    targets: ["hi"], kind: "control",
    values: { alt: 800, vsi: 600 },
    pos: { x: 150, y: 88 }, dwell: 1500,
  },

  /* ----------------------------- DOWNWIND ------------------------------- */
  {
    id: "level-downwind", phase: "DOWNWIND",
    label: "Level at TPA — 2150 RPM, 90 kts",
    description: "Turn downwind, level at 1000 ft TPA, set cruise power.",
    condition: "1–1.2 NM from runway, parallel, opposite heading.",
    targets: ["hi", "throttle"], kind: "control",
    values: { alt: 1000, ias: 90, rpm: 2150, vsi: 0 },
    pos: { x: 112, y: 100 }, dwell: 1600,
  },
  {
    id: "abeam-power", phase: "DOWNWIND",
    label: "Abeam — chunk of power to 1500 RPM",
    description: "Threshold is directly off your wing. Reduce power to 1500 RPM.",
    condition: "Runway threshold abeam — 90° off your left.",
    targets: ["throttle"], kind: "control",
    values: { rpm: 1500, ias: 85, vsi: -300 },
    pos: { x: 112, y: 248 }, dwell: 1700,
  },
  {
    id: "flaps-10", phase: "DOWNWIND",
    label: "Flaps 10°",
    description: "Add the first notch of flaps (within the white arc).",
    condition: "Below 110 kts (Vfe).",
    targets: ["flaps"], kind: "control",
    values: { flaps: 10, ias: 80, vsi: -400 },
    pos: { x: 112, y: 258 }, dwell: 900,
  },
  {
    id: "paa-check", phase: "DOWNWIND",
    label: "Power / Alt / Airspeed check",
    description: "Verify each in turn: power 1500, descending from TPA, ~80 kts.",
    condition: "Confirm the airplane is configured.",
    targets: ["tach", "alt", "asi"], kind: "control",
    values: { ias: 80 },
    pos: { x: 112, y: 270 }, dwell: 1100,
  },
  {
    id: "before-landing", phase: "DOWNWIND",
    label: "Before Landing checklist",
    description: "Run the flow: Seatbelts → Fuel BOTH → Mixture RICH → Autopilot OFF.",
    condition: "Complete before turning base.",
    targets: ["seatbelt", "fuel", "mixture", "autopilot"], kind: "foldout",
    values: {},
    pos: { x: 112, y: 282 }, dwell: 1200,
  },

  /* ------------------------------- BASE --------------------------------- */
  {
    id: "turn-base", phase: "BASE",
    label: "Turn base — threshold at 45°",
    description: "When the threshold is 45° behind you, turn left to base.",
    condition: "45° to the touchdown point.",
    targets: ["hi"], kind: "control",
    values: { ias: 80, vsi: -500 },
    pos: { x: 150, y: 300 }, dwell: 1500,
  },
  {
    id: "flaps-20", phase: "BASE",
    label: "Flaps 20°",
    description: "Second notch of flaps, continue the descent.",
    condition: "On base, 80 kts.",
    targets: ["flaps"], kind: "control",
    values: { flaps: 20, ias: 75, vsi: -500 },
    pos: { x: 175, y: 303 }, dwell: 1000,
  },

  /* ------------------------------- FINAL -------------------------------- */
  {
    id: "turn-final", phase: "FINAL",
    label: "Turn final — align centerline",
    description: "Roll out on the extended centerline, wings level.",
    condition: "Lined up with the runway.",
    targets: ["hi"], kind: "control",
    values: { ias: 75, vsi: -500 },
    pos: { x: 190, y: 300 }, dwell: 1400,
  },
  {
    id: "flaps-30", phase: "FINAL",
    label: "Flaps 30° (full)",
    description: "Full flaps for landing configuration.",
    condition: "Runway made, on centerline.",
    targets: ["flaps"], kind: "control",
    values: { flaps: 30, ias: 70, vsi: -500 },
    pos: { x: 190, y: 292 }, dwell: 1000,
  },
  {
    id: "stabilized", phase: "FINAL",
    label: "70 kts — stabilized",
    description: "Pitch for 70 kts, trim, manage descent with power.",
    condition: "On speed, on glidepath, on centerline.",
    targets: ["asi"], kind: "control",
    values: { ias: 70, vsi: -450 },
    pos: { x: 190, y: 282 }, dwell: 1200,
  },
  {
    id: "aim-point", phase: "FINAL",
    label: "Aim point stationary in windscreen",
    description: "The aiming point isn't moving up or down — you're on glidepath.",
    condition: "Aim point fixed = correct glidepath.",
    targets: ["confirm-glidepath"], kind: "minimap",
    values: { vsi: -450 },
    pos: { x: 190, y: 272 }, dwell: 1200, branch: true,
  },

  /* ------------------------------ LANDING ------------------------------- */
  {
    id: "cross-threshold", phase: "LANDING",
    label: "Cross the threshold (~50 ft)",
    description: "Crossing the numbers, begin to bleed off the last of the power.",
    condition: "Over the threshold, ~50 ft AGL.",
    targets: ["confirm-threshold"], kind: "minimap",
    values: { ias: 65, alt: 50, vsi: -300 },
    pos: { x: 190, y: 253 }, dwell: 1100, branch: true,
  },
  {
    id: "throttle-idle", phase: "LANDING",
    label: "Throttle to idle",
    description: "Smoothly close the throttle as you enter the flare.",
    condition: "Round-out height.",
    targets: ["throttle"], kind: "control",
    values: { rpm: 1000, ias: 60, vsi: -150 },
    pos: { x: 190, y: 250 }, dwell: 900,
  },
  {
    id: "flare", phase: "LANDING",
    label: "Begin flare (~20 ft)",
    description: "Progressive back pressure to arrest the descent, raise the nose.",
    condition: "~20 ft — round out.",
    targets: ["yoke"], kind: "control",
    values: { ias: 55, alt: 20, vsi: -60 },
    pos: { x: 190, y: 248 }, dwell: 900,
  },
  {
    id: "hold-off", phase: "LANDING",
    label: "Hold the nose, let it settle",
    description: "Hold attitude and let airspeed bleed off as the airplane floats.",
    condition: "Float — keep the nose up.",
    targets: ["yoke"], kind: "control",
    values: { ias: 50, alt: 8, vsi: -30 },
    pos: { x: 190, y: 246 }, dwell: 1000,
  },
  {
    id: "mains-touch", phase: "LANDING",
    label: "Mains touch — hold back pressure",
    description: "Main wheels touch first; keep holding the yoke back.",
    condition: "Touchdown on the mains.",
    targets: ["yoke"], kind: "control",
    values: { ias: 45, alt: 0, vsi: 0 },
    pos: { x: 190, y: 243 }, dwell: 800,
  },
  {
    id: "lower-nose", phase: "LANDING",
    label: "Gently lower the nosewheel",
    description: "As elevator authority fades, ease the nosewheel down.",
    condition: "Decelerating on the runway.",
    targets: ["yoke"], kind: "control",
    values: { ias: 35 },
    pos: { x: 190, y: 238 }, dwell: 800,
  },
  {
    id: "rollout", phase: "LANDING",
    label: "Track centerline — brakes to stop",
    description: "Maintain centerline with rudder, apply brakes as needed.",
    condition: "Rollout complete. Nice landing!",
    targets: ["rudder"], kind: "control",
    values: { ias: 10, rpm: 1000 },
    pos: { x: 190, y: 218 }, dwell: 1000,
  },
];

/* Go-around branch — entered from any step where branch === true. */
const GOAROUND = [
  {
    id: "ga-power", phase: "GOAROUND",
    label: "Full power immediately",
    description: "Throttle full forward — arrest the descent.",
    condition: "Go-around initiated.",
    targets: ["throttle"], kind: "control",
    values: { rpm: 2500, vsi: 0 },
    pos: { x: 190, y: 240 }, dwell: 900,
  },
  {
    id: "ga-pitch", phase: "GOAROUND",
    label: "Pitch away from the ground",
    description: "Establish a positive climb attitude on the attitude indicator.",
    condition: "Positive rate of climb.",
    targets: ["ai"], kind: "control",
    values: { ias: 60, vsi: 500, alt: 100 },
    pos: { x: 190, y: 210 }, dwell: 1100,
  },
  {
    id: "ga-flaps-20", phase: "GOAROUND",
    label: "Retract final notch — flaps 20°",
    description: "Reduce the last notch of flaps to improve climb.",
    condition: "Climbing, positive rate confirmed.",
    targets: ["flaps"], kind: "control",
    values: { flaps: 20, ias: 65, vsi: 600 },
    pos: { x: 190, y: 175 }, dwell: 1000,
  },
  {
    id: "ga-climb", phase: "GOAROUND",
    label: "Climb 60 kts, retract to 10°",
    description: "Pitch for Vx/Vy, verify positive rate, milk flaps to 10°.",
    condition: "Vy climb established.",
    targets: ["asi", "vsi", "flaps"], kind: "control",
    values: { flaps: 10, ias: 70, vsi: 700, alt: 400 },
    pos: { x: 190, y: 140 }, dwell: 1200,
  },
  {
    id: "ga-call", phase: "GOAROUND",
    label: 'Verbalize: "Going around"',
    description: "Make the call and re-enter the pattern upwind.",
    condition: "Going around — climbing out.",
    callout: "Going around",
    targets: ["call-goaround"], kind: "foldout",
    values: { alt: 700 },
    pos: { x: 190, y: 118 }, dwell: 1200,
  },
];
