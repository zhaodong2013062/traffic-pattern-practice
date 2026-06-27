/* ============================================================================
   sequence.js  —  Source of truth for the C172 traffic pattern.

   Interaction model: at each step only the CONDITIONS are shown. The pilot
   must click the correct instrument/control, then choose the correct value
   from that control's menu (e.g. throttle -> 1500 / 2150 / idle). No guidance
   is given until a hint is requested.

   Each step:
     id, phase, condition          situational text shown to the pilot
     acts: [ ... ]                 one or more click-then-pick actions, IN ORDER
     pos {x,y}, dwell              airplane position / travel time on the minimap
     branch                        true => a go-around may be initiated here

   Each act:
     target        control/instrument id the pilot must click
     correct       the menu choice that is correct
     options       (optional) override the control's default menu for this stage
     values        (optional) instrument values to animate to when the act lands
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

/* Default menu offered when a control is clicked. A step's act may override
   `options` to vary the choices by stage. */
const CONTROL_OPTIONS = {
  throttle:  ["Full power (2500)", "2150 RPM", "1500 RPM", "Idle"],
  flaps:     ["0° (up)", "10°", "20°", "30° (full)"],
  hi:        ["Track runway heading", "Turn crosswind", "Turn downwind", "Turn base", "Turn final"],
  ai:        ["Climb attitude", "Level off", "Pitch for descent", "Pitch up — go around"],
  yoke:      ["Rotate", "Flare (back-pressure)", "Hold it off", "Lower nosewheel"],
  asi:       ["90 kts", "80 kts", "74 kts", "70 kts", "60 kts"],
  alt:       ["1000 ft (TPA)", "700 ft AGL", "Descending", "50 ft"],
  tach:      ["2500 RPM", "2150 RPM", "1500 RPM", "1000 RPM"],
  vsi:       ["Positive rate / climb", "Level", "Descending"],
  ti:        ["Wings level", "Standard-rate turn"],
  rudder:    ["Line up on centerline", "Track centerline", "Apply brakes"],
  fuel:      ["BOTH", "LEFT", "RIGHT", "OFF"],
  mixture:   ["RICH", "LEAN", "CUTOFF"],
  autopilot: ["OFF", "ON / engage"],
  seatbelt:  ["Secure / fasten", "Release"],
  call:      ["Instruments green", "Airspeed alive", "Going around", "Clear of runway"],
};

const SEQUENCE = [
  /* ----------------------------- TAKEOFF -------------------------------- */
  {
    id: "lineup", phase: "TAKEOFF",
    condition: "Cleared for takeoff. Runway heading, ready to roll.",
    acts: [{ target: "rudder", correct: "Line up on centerline",
             values: { rpm: 1000, ias: 0, alt: 0, flaps: 0, vsi: 0 } }],
    pos: { x: 190, y: 258 }, dwell: 600,
  },
  {
    id: "full-throttle", phase: "TAKEOFF",
    condition: "On the centerline. Begin the takeoff roll.",
    acts: [{ target: "throttle", correct: "Full power (2500)", values: { rpm: 2500 } }],
    pos: { x: 190, y: 252 }, dwell: 800,
  },
  {
    id: "instruments-green", phase: "TAKEOFF",
    condition: "Power is up and you're accelerating. Engine gauges in the green.",
    acts: [{ target: "call", correct: "Instruments green", values: { ias: 25 } }],
    pos: { x: 190, y: 244 }, dwell: 900,
  },
  {
    id: "airspeed-alive", phase: "TAKEOFF",
    condition: "The airspeed needle starts to move (~40 kts).",
    acts: [{ target: "call", correct: "Airspeed alive", values: { ias: 45 } }],
    pos: { x: 190, y: 232 }, dwell: 900,
  },
  {
    id: "rotate", phase: "TAKEOFF",
    condition: "55 KIAS — rotation speed.",
    acts: [{ target: "yoke", correct: "Rotate", values: { ias: 60, alt: 50, vsi: 600 } }],
    pos: { x: 190, y: 214 }, dwell: 1000,
  },
  {
    id: "climb-attitude", phase: "UPWIND",
    condition: "Airborne, positive rate of climb.",
    acts: [{ target: "ai", correct: "Climb attitude", values: { ias: 74, alt: 200, vsi: 700 } }],
    pos: { x: 190, y: 165 }, dwell: 1400,
  },

  /* -------------------------- UPWIND / CROSSWIND ------------------------ */
  {
    id: "track-upwind", phase: "UPWIND",
    condition: "Upwind leg, climbing at 74 kts on the extended centerline.",
    acts: [{ target: "hi", correct: "Track runway heading", values: { alt: 500 } }],
    pos: { x: 190, y: 120 }, dwell: 1400,
  },
  {
    id: "turn-crosswind", phase: "CROSSWIND",
    condition: "Passing 700 ft AGL.",
    acts: [{ target: "hi", correct: "Turn crosswind", values: { alt: 800 } }],
    pos: { x: 150, y: 88 }, dwell: 1500,
  },

  /* ------------------------------ DOWNWIND ------------------------------ */
  {
    id: "level-downwind", phase: "DOWNWIND",
    condition: "1–1.2 NM out, parallel to the runway, reaching pattern altitude.",
    acts: [
      { target: "hi", correct: "Turn downwind" },
      { target: "throttle", correct: "2150 RPM", values: { alt: 1000, ias: 90, rpm: 2150, vsi: 0 } },
    ],
    pos: { x: 112, y: 100 }, dwell: 1600,
  },
  {
    id: "abeam-power", phase: "DOWNWIND",
    condition: "The runway threshold is directly off your left wing (abeam).",
    acts: [{ target: "throttle", correct: "1500 RPM", values: { rpm: 1500, ias: 85, vsi: -300 } }],
    pos: { x: 112, y: 248 }, dwell: 1700,
  },
  {
    id: "flaps-10", phase: "DOWNWIND",
    condition: "Below 110 kts (Vfe), descending from TPA.",
    acts: [{ target: "flaps", correct: "10°", values: { flaps: 10, ias: 80, vsi: -400 } }],
    pos: { x: 112, y: 258 }, dwell: 900,
  },
  {
    id: "paa-check", phase: "DOWNWIND",
    condition: "Verify the airplane is configured: power, altitude, airspeed.",
    acts: [
      { target: "tach", correct: "1500 RPM" },
      { target: "alt", correct: "Descending" },
      { target: "asi", correct: "80 kts", values: { ias: 80 } },
    ],
    pos: { x: 112, y: 270 }, dwell: 1100,
  },
  {
    id: "before-landing", phase: "DOWNWIND",
    condition: "Run the Before-Landing flow before turning base.",
    acts: [
      { target: "seatbelt", correct: "Secure / fasten" },
      { target: "fuel", correct: "BOTH" },
      { target: "mixture", correct: "RICH" },
      { target: "autopilot", correct: "OFF" },
    ],
    pos: { x: 112, y: 282 }, dwell: 1200,
  },

  /* -------------------------------- BASE -------------------------------- */
  {
    id: "turn-base", phase: "BASE",
    condition: "The threshold is about 45° behind your wing.",
    acts: [{ target: "hi", correct: "Turn base", values: { ias: 80, vsi: -500 } }],
    pos: { x: 150, y: 300 }, dwell: 1500,
  },
  {
    id: "flaps-20", phase: "BASE",
    condition: "Established on base, 80 kts, descending.",
    acts: [{ target: "flaps", correct: "20°", values: { flaps: 20, ias: 75, vsi: -500 } }],
    pos: { x: 175, y: 303 }, dwell: 1000,
  },

  /* ------------------------------- FINAL -------------------------------- */
  {
    id: "turn-final", phase: "FINAL",
    condition: "Runway off your shoulder, ready to roll out on centerline.",
    acts: [{ target: "hi", correct: "Turn final", values: { ias: 75, vsi: -500 } }],
    pos: { x: 190, y: 300 }, dwell: 1400,
  },
  {
    id: "flaps-30", phase: "FINAL",
    condition: "Runway made, on centerline.",
    acts: [{ target: "flaps", correct: "30° (full)", values: { flaps: 30, ias: 70, vsi: -500 } }],
    pos: { x: 190, y: 292 }, dwell: 1000,
  },
  {
    id: "stabilized", phase: "FINAL",
    condition: "Aim point stationary in the windscreen — on glidepath. Set your approach speed.",
    acts: [{ target: "asi", correct: "70 kts", values: { ias: 70, vsi: -450 } }],
    pos: { x: 190, y: 275 }, dwell: 1300, branch: true,
  },

  /* ------------------------------ LANDING ------------------------------- */
  {
    id: "throttle-idle", phase: "LANDING",
    condition: "Crossing the threshold, ~50 ft. Bleed off the last of the power.",
    acts: [{ target: "throttle", correct: "Idle", values: { rpm: 1000, ias: 60, alt: 50, vsi: -250 } }],
    pos: { x: 190, y: 252 }, dwell: 1000, branch: true,
  },
  {
    id: "flare", phase: "LANDING",
    condition: "~20 ft — round out.",
    acts: [{ target: "yoke", correct: "Flare (back-pressure)", values: { ias: 55, alt: 20, vsi: -60 } }],
    pos: { x: 190, y: 248 }, dwell: 900,
  },
  {
    id: "hold-off", phase: "LANDING",
    condition: "Floating just off the surface — let the speed bleed away.",
    acts: [{ target: "yoke", correct: "Hold it off", values: { ias: 50, alt: 8, vsi: -30 } }],
    pos: { x: 190, y: 246 }, dwell: 1000,
  },
  {
    id: "mains-touch", phase: "LANDING",
    condition: "Main wheels touch down first.",
    acts: [{ target: "yoke", correct: "Hold it off", values: { ias: 45, alt: 0, vsi: 0 } }],
    pos: { x: 190, y: 243 }, dwell: 800,
  },
  {
    id: "lower-nose", phase: "LANDING",
    condition: "Elevator authority fading as you slow.",
    acts: [{ target: "yoke", correct: "Lower nosewheel", values: { ias: 35 } }],
    pos: { x: 190, y: 238 }, dwell: 800,
  },
  {
    id: "rollout", phase: "LANDING",
    condition: "All three wheels down, decelerating.",
    acts: [{ target: "rudder", correct: "Track centerline", values: { ias: 10 } }],
    pos: { x: 190, y: 218 }, dwell: 1000,
  },
];

const GOAROUND = [
  {
    id: "ga-power", phase: "GOAROUND",
    condition: "Going around — arrest the descent.",
    acts: [{ target: "throttle", correct: "Full power (2500)", values: { rpm: 2500, vsi: 0 } }],
    pos: { x: 190, y: 240 }, dwell: 900,
  },
  {
    id: "ga-pitch", phase: "GOAROUND",
    condition: "Establish a positive climb.",
    acts: [{ target: "ai", correct: "Pitch up — go around", values: { ias: 60, vsi: 500, alt: 100 } }],
    pos: { x: 190, y: 210 }, dwell: 1100,
  },
  {
    id: "ga-flaps-20", phase: "GOAROUND",
    condition: "Reduce the last notch of flaps to improve the climb.",
    acts: [{ target: "flaps", correct: "20°", values: { flaps: 20, ias: 65, vsi: 600 } }],
    pos: { x: 190, y: 175 }, dwell: 1000,
  },
  {
    id: "ga-climb", phase: "GOAROUND",
    condition: "Vy climb — verify, then milk the flaps up.",
    acts: [
      { target: "asi", correct: "60 kts" },
      { target: "vsi", correct: "Positive rate / climb" },
      { target: "flaps", correct: "10°", values: { flaps: 10, ias: 70, vsi: 700, alt: 400 } },
    ],
    pos: { x: 190, y: 140 }, dwell: 1200,
  },
  {
    id: "ga-call", phase: "GOAROUND",
    condition: "Make the radio call and re-enter the pattern.",
    acts: [{ target: "call", correct: "Going around", values: { alt: 700 } }],
    pos: { x: 190, y: 118 }, dwell: 1200,
  },
];
