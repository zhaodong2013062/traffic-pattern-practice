/* ============================================================================
   sequence.js  —  The single source of truth for the C172 traffic pattern.

   INTERACTION MODEL (no multiple choice):
     At each pattern point the app shows only the CURRENT CONDITIONS. The pilot
     must click the correct instrument/control on the cockpit panel. Clicking
     the right one opens a small VALUE PICKER ("what setting?") whose choices are
     specific to that control and that stage. There is no up-front guidance —
     only a wrong-instrument indicator, or a hint if the pilot asks for one.

   Each step describes:
     id          unique key
     phase       leg of the pattern (drives the phase banner + minimap colour)
     condition   the situation shown to the pilot ("runway abeam left")
     hint        explanation revealed only when the pilot presses "Show hint"
     actions     ordered list of {target, answer, opts?} the pilot must perform.
                   target  cockpit element id to click
                   answer  the correct value/setting (string)
                   opts    explicit value choices (must contain answer). If
                           omitted, choices are generated from VALUE_POOLS[target]
                           (the answer plus sampled distractors — so the picker
                           is dynamic between runs).
                 A single-action array is a normal step. Multi-action arrays are
                 compound flows: each action is performed IN ORDER.
     values      instrument target values to animate to once the step completes
     pos         {x,y} position of the airplane on the minimap (viewBox units)
     dwell       ms the airplane spends travelling to `pos` (semi real-time)
     branch      (landing approach only) true => a go-around is offered here
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

/* Value pools for controls with a natural set of settings. The picker shows the
   correct answer plus a few of these as distractors, so it stays dynamic. The
   `answer` on each action must match one of these strings exactly. */
const VALUE_POOLS = {
  throttle:  ["Full power — ≈2500 RPM", "Cruise — 2150 RPM", "1500 RPM", "1200 RPM", "Idle"],
  flaps:     ["Flaps UP — 0°", "Flaps 10°", "Flaps 20°", "Flaps 30° — full"],
  fuel:      ["Selector — BOTH", "Selector — LEFT", "Selector — RIGHT", "Selector — OFF"],
  mixture:   ["Mixture — RICH", "Mixture — lean", "Mixture — idle cutoff"],
  seatbelt:  ["Belts & signs — ON", "Belts — off"],
  autopilot: ["Autopilot — OFF", "Autopilot — ON"],
  comm:      ["“Instruments green”", "“Airspeed alive”", "“Going around”",
              "“Traffic in sight”", "“Clear of the active”"],
};

/* Instrument value keys: rpm, ias (kts), alt (ft), flaps (deg), vsi (ft/min).
   Values carry forward step-to-step unless overridden. */

const SEQUENCE = [
  /* ---------------------------- TAKEOFF ---------------------------------- */
  {
    id: "lineup", phase: "TAKEOFF",
    condition: "Holding short, cleared for takeoff. Runway heading.",
    hint: "Taxi onto the runway and use rudder/nosewheel steering to line up on the centerline.",
    actions: [{ target: "rudder", answer: "Center on the centerline",
      opts: ["Center on the centerline", "Hold the brakes", "Full left rudder"] }],
    values: { rpm: 1000, ias: 0, alt: 0, flaps: 0, vsi: 0 },
    pos: { x: 190, y: 258 }, dwell: 600,
  },
  {
    id: "full-throttle", phase: "TAKEOFF",
    condition: "Lined up on the centerline. Begin the takeoff roll.",
    hint: "Smoothly advance the throttle to full power (~2500 RPM) for the takeoff roll.",
    actions: [{ target: "throttle", answer: "Full power — ≈2500 RPM" }],
    values: { rpm: 2500, ias: 0, alt: 0 },
    pos: { x: 190, y: 252 }, dwell: 800,
  },
  {
    id: "instruments-green", phase: "TAKEOFF",
    condition: "Power is up, accelerating down the runway.",
    hint: "Scan the engine gauges — everything in the green arc — and call it out.",
    actions: [{ target: "comm", answer: "“Instruments green”" }],
    values: { ias: 25, rpm: 2500 },
    pos: { x: 190, y: 244 }, dwell: 900,
  },
  {
    id: "airspeed-alive", phase: "TAKEOFF",
    condition: "Accelerating through ~40 kts.",
    hint: "The airspeed needle is now registering — call “airspeed alive”.",
    actions: [{ target: "comm", answer: "“Airspeed alive”" }],
    values: { ias: 45 },
    pos: { x: 190, y: 232 }, dwell: 900,
  },
  {
    id: "rotate", phase: "TAKEOFF",
    condition: "55 KIAS — Vr.",
    hint: "At rotation speed, apply smooth back pressure on the yoke to lift off.",
    actions: [{ target: "yoke", answer: "Smooth back pressure — rotate",
      opts: ["Smooth back pressure — rotate", "Push the nose forward", "Hold neutral"] }],
    values: { ias: 60, alt: 50, vsi: 600 },
    pos: { x: 190, y: 214 }, dwell: 1000,
  },
  {
    id: "climb-attitude", phase: "UPWIND",
    condition: "Positive rate, climbing.",
    hint: "Pitch for Vy (74 kts) and hold the attitude-indicator picture.",
    actions: [{ target: "ai", answer: "Pitch to the Vy climb (74 kts)",
      opts: ["Pitch to the Vy climb (74 kts)", "Hold a level attitude", "Lower the nose"] }],
    values: { ias: 74, alt: 200, vsi: 700 },
    pos: { x: 190, y: 165 }, dwell: 1400,
  },

  /* ---------------------- UPWIND -> CROSSWIND ---------------------------- */
  {
    id: "track-upwind", phase: "UPWIND",
    condition: "Upwind leg, climbing at 74 kts.",
    hint: "Track the extended runway centerline using the heading indicator.",
    actions: [{ target: "hi", answer: "Maintain runway heading",
      opts: ["Maintain runway heading", "Turn left 90°", "Turn right 45°"] }],
    values: { alt: 500, vsi: 700 },
    pos: { x: 190, y: 120 }, dwell: 1400,
  },
  {
    id: "turn-crosswind", phase: "CROSSWIND",
    condition: "700 ft AGL — time to turn.",
    hint: "At 700 AGL make a left climbing turn to the crosswind leg.",
    actions: [{ target: "hi", answer: "Climbing left turn to crosswind",
      opts: ["Climbing left turn to crosswind", "Continue runway heading", "Turn right to crosswind"] }],
    values: { alt: 800, vsi: 600 },
    pos: { x: 150, y: 88 }, dwell: 1500,
  },

  /* ----------------------------- DOWNWIND ------------------------------- */
  {
    id: "level-downwind", phase: "DOWNWIND",
    condition: "1–1.2 NM out, abeam runway, opposite heading.",
    hint: "Turn downwind, level off at the 1000 ft TPA, and set cruise power (2150 RPM).",
    actions: [
      { target: "hi", answer: "Left turn to downwind, level off",
        opts: ["Left turn to downwind, level off", "Keep climbing straight", "Turn right toward base"] },
      { target: "throttle", answer: "Cruise — 2150 RPM" },
    ],
    values: { alt: 1000, ias: 90, rpm: 2150, vsi: 0 },
    pos: { x: 112, y: 100 }, dwell: 1600,
  },
  {
    id: "abeam-power", phase: "DOWNWIND",
    condition: "Runway threshold abeam — 90° off your left.",
    hint: "Threshold off the wing: reduce power to 1500 RPM to begin the descent.",
    actions: [{ target: "throttle", answer: "1500 RPM" }],
    values: { rpm: 1500, ias: 85, vsi: -300 },
    pos: { x: 112, y: 248 }, dwell: 1700,
  },
  {
    id: "flaps-10", phase: "DOWNWIND",
    condition: "Below 110 kts (Vfe), descending.",
    hint: "Add the first notch of flaps — 10° — within the white arc.",
    actions: [{ target: "flaps", answer: "Flaps 10°" }],
    values: { flaps: 10, ias: 80, vsi: -400 },
    pos: { x: 112, y: 258 }, dwell: 900,
  },
  {
    id: "paa-check", phase: "DOWNWIND",
    condition: "Configured — confirm the airplane in a scan.",
    hint: "Power / Altitude / Airspeed check: tach ~1500, descending out of TPA, ~80 kts. Click each gauge and confirm its reading.",
    actions: [
      { target: "tach", answer: "Power ~1500 RPM — checks",
        opts: ["Power ~1500 RPM — checks", "Power 2150 RPM", "Full power"] },
      { target: "alt", answer: "Descending out of TPA — checks",
        opts: ["Descending out of TPA — checks", "Level at TPA", "Still climbing"] },
      { target: "asi", answer: "Airspeed ~80 kts — checks",
        opts: ["Airspeed ~80 kts — checks", "~60 kts", "~100 kts"] },
    ],
    values: { ias: 80 },
    pos: { x: 112, y: 270 }, dwell: 1100,
  },
  {
    id: "before-landing", phase: "DOWNWIND",
    condition: "Complete the Before-Landing flow before turning base.",
    hint: "Seatbelts/signs ON → Fuel selector BOTH → Mixture RICH → Autopilot OFF.",
    actions: [
      { target: "seatbelt",  answer: "Belts & signs — ON" },
      { target: "fuel",      answer: "Selector — BOTH" },
      { target: "mixture",   answer: "Mixture — RICH" },
      { target: "autopilot", answer: "Autopilot — OFF" },
    ],
    values: {},
    pos: { x: 112, y: 282 }, dwell: 1200,
  },

  /* ------------------------------- BASE --------------------------------- */
  {
    id: "turn-base", phase: "BASE",
    condition: "Threshold ~45° behind your shoulder.",
    hint: "When the touchdown point is 45° behind you, turn left onto base.",
    actions: [{ target: "hi", answer: "Left turn onto base",
      opts: ["Left turn onto base", "Continue downwind", "Turn straight to final"] }],
    values: { ias: 80, vsi: -500 },
    pos: { x: 150, y: 300 }, dwell: 1500,
  },
  {
    id: "flaps-20", phase: "BASE",
    condition: "On base, 80 kts, continuing the descent.",
    hint: "Add the second notch of flaps — 20°.",
    actions: [{ target: "flaps", answer: "Flaps 20°" }],
    values: { flaps: 20, ias: 75, vsi: -500 },
    pos: { x: 175, y: 303 }, dwell: 1000,
  },

  /* ------------------------------- FINAL -------------------------------- */
  {
    id: "turn-final", phase: "FINAL",
    condition: "Approaching the extended centerline.",
    hint: "Roll out on final, wings level, lined up with the runway.",
    actions: [{ target: "hi", answer: "Roll out on final, wings level",
      opts: ["Roll out on final, wings level", "Overshoot and re-intercept", "Turn back toward base"] }],
    values: { ias: 75, vsi: -500 },
    pos: { x: 190, y: 300 }, dwell: 1400,
  },
  {
    id: "flaps-30", phase: "FINAL",
    condition: "Runway made, on centerline.",
    hint: "Select full flaps — 30° — for the landing configuration.",
    actions: [{ target: "flaps", answer: "Flaps 30° — full" }],
    values: { flaps: 30, ias: 70, vsi: -500 },
    pos: { x: 190, y: 292 }, dwell: 1000,
  },
  {
    id: "stabilized", phase: "FINAL",
    condition: "On glidepath, on centerline — stabilize.",
    hint: "Pitch and trim for 70 kts; manage the descent with power.",
    actions: [{ target: "asi", answer: "Pitch & trim for 70 kts",
      opts: ["Pitch & trim for 70 kts", "Hold 90 kts", "Slow to 55 kts"] }],
    values: { ias: 70, vsi: -450 },
    pos: { x: 190, y: 282 }, dwell: 1200,
  },
  {
    id: "aim-point", phase: "FINAL",
    condition: "Judge your sight picture on final.",
    hint: "If the aim point is stationary in the windscreen, you're on the correct glidepath.",
    actions: [{ target: "ai", answer: "Aim point steady — on glidepath",
      opts: ["Aim point steady — on glidepath", "Aim point sinking — going low", "Aim point rising — going high"] }],
    values: { vsi: -450 },
    pos: { x: 190, y: 272 }, dwell: 1200, branch: true,
  },

  /* ------------------------------ LANDING ------------------------------- */
  {
    id: "cross-threshold", phase: "LANDING",
    condition: "Over the threshold, ~50 ft AGL.",
    hint: "Crossing the numbers, begin to ease the last of the power off as you start the round-out.",
    actions: [{ target: "ai", answer: "Round-out picture — ease power off",
      opts: ["Round-out picture — ease power off", "Push the nose down", "Add full power"] }],
    values: { ias: 65, alt: 50, vsi: -300 },
    pos: { x: 190, y: 253 }, dwell: 1100, branch: true,
  },
  {
    id: "throttle-idle", phase: "LANDING",
    condition: "Round-out height — entering the flare.",
    hint: "Smoothly close the throttle to idle as you enter the flare.",
    actions: [{ target: "throttle", answer: "Idle" }],
    values: { rpm: 1000, ias: 60, vsi: -150 },
    pos: { x: 190, y: 250 }, dwell: 900,
  },
  {
    id: "flare", phase: "LANDING",
    condition: "~20 ft — round out.",
    hint: "Progressive back pressure to arrest the descent and raise the nose.",
    actions: [{ target: "yoke", answer: "Progressive back pressure — flare",
      opts: ["Progressive back pressure — flare", "Push the nose forward", "Hold neutral"] }],
    values: { ias: 55, alt: 20, vsi: -60 },
    pos: { x: 190, y: 248 }, dwell: 900,
  },
  {
    id: "hold-off", phase: "LANDING",
    condition: "Floating — airspeed bleeding off.",
    hint: "Hold the nose off and let the airplane settle as speed decays.",
    actions: [{ target: "yoke", answer: "Hold it off — let it settle",
      opts: ["Hold it off — let it settle", "Lower the nose now", "Add power"] }],
    values: { ias: 50, alt: 8, vsi: -30 },
    pos: { x: 190, y: 246 }, dwell: 1000,
  },
  {
    id: "mains-touch", phase: "LANDING",
    condition: "Mains touch down first.",
    hint: "Keep holding the yoke back as the main wheels touch.",
    actions: [{ target: "yoke", answer: "Keep holding back pressure",
      opts: ["Keep holding back pressure", "Release the yoke", "Push forward"] }],
    values: { ias: 45, alt: 0, vsi: 0 },
    pos: { x: 190, y: 243 }, dwell: 800,
  },
  {
    id: "lower-nose", phase: "LANDING",
    condition: "Decelerating on the mains.",
    hint: "As elevator authority fades, gently lower the nosewheel to the runway.",
    actions: [{ target: "yoke", answer: "Gently lower the nosewheel",
      opts: ["Gently lower the nosewheel", "Hold full back pressure", "Pull harder"] }],
    values: { ias: 35 },
    pos: { x: 190, y: 238 }, dwell: 800,
  },
  {
    id: "rollout", phase: "LANDING",
    condition: "Rollout — stay on the centerline.",
    hint: "Track the centerline with rudder and apply brakes as needed to stop.",
    actions: [{ target: "rudder", answer: "Track centerline, brakes as needed",
      opts: ["Track centerline, brakes as needed", "Full aileron only", "Add power"] }],
    values: { ias: 10, rpm: 1000 },
    pos: { x: 190, y: 218 }, dwell: 1000,
  },
];

/* Go-around branch — entered from any step where branch === true. */
const GOAROUND = [
  {
    id: "ga-power", phase: "GOAROUND",
    condition: "Go-around initiated.",
    hint: "Throttle full forward immediately to arrest the descent.",
    actions: [{ target: "throttle", answer: "Full power — ≈2500 RPM" }],
    values: { rpm: 2500, vsi: 0 },
    pos: { x: 190, y: 240 }, dwell: 900,
  },
  {
    id: "ga-pitch", phase: "GOAROUND",
    condition: "Power's in — stop the descent.",
    hint: "Establish a positive climb attitude on the attitude indicator.",
    actions: [{ target: "ai", answer: "Positive climb attitude",
      opts: ["Positive climb attitude", "Level off", "Nose-down attitude"] }],
    values: { ias: 60, vsi: 500, alt: 100 },
    pos: { x: 190, y: 210 }, dwell: 1100,
  },
  {
    id: "ga-flaps-20", phase: "GOAROUND",
    condition: "Climbing, positive rate confirmed.",
    hint: "Retract the final notch of flaps to 20° to improve the climb.",
    actions: [{ target: "flaps", answer: "Flaps 20°" }],
    values: { flaps: 20, ias: 65, vsi: 600 },
    pos: { x: 190, y: 175 }, dwell: 1000,
  },
  {
    id: "ga-climb", phase: "GOAROUND",
    condition: "Establish the Vy climb and clean up.",
    hint: "Pitch for the climb speed, confirm a positive rate, then milk the flaps up to 10°.",
    actions: [
      { target: "asi", answer: "Pitch for the 70 kt climb",
        opts: ["Pitch for the 70 kt climb", "Hold 55 kts", "Accelerate to 90 kts"] },
      { target: "vsi", answer: "Confirm a positive rate",
        opts: ["Confirm a positive rate", "Confirm a descent", "Ignore the VSI"] },
      { target: "flaps", answer: "Flaps 10°" },
    ],
    values: { flaps: 10, ias: 70, vsi: 700, alt: 400 },
    pos: { x: 190, y: 140 }, dwell: 1200,
  },
  {
    id: "ga-call", phase: "GOAROUND",
    condition: "Climbing out — make the call.",
    hint: "Announce “going around” and re-enter the pattern on the upwind.",
    actions: [{ target: "comm", answer: "“Going around”" }],
    values: { alt: 700 },
    pos: { x: 190, y: 118 }, dwell: 1200,
  },
];
