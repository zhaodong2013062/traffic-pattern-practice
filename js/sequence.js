/* ============================================================================
   sequence.js  —  Source of truth for the C172 traffic pattern.

   Interaction model: at each step only the CONDITIONS are shown. The pilot
   must click the correct instrument/control, then choose the correct value
   from that control's menu (e.g. throttle -> 1500 / 2150 / idle). No guidance
   is given until a hint is requested.

   Flying the airplane (turns, pitch, flare) is done with the YOKE — the
   attitude/heading indicators are *references*, not controls. Power is the
   throttle, configuration is flaps, the menu choices vary by stage.

   Each step:
     id, phase, condition          situational text shown to the pilot
     acts: [ ... ]                 one or more click-then-pick actions, IN ORDER
     pos {x,y}, dwell              where the airplane sits on the minimap when
                                   this step is active, and how long it takes to
                                   fly there from the previous point
     branch                        true => a go-around may be initiated here

   Each act:
     target        control id the pilot must click
     correct       the menu choice that is correct
     options       (optional) override the control's default menu for this stage
     values        (optional) instrument values to animate to when the act lands

   Minimap geometry (viewBox 300x340): runway centerline x=190 (threshold y=250,
   departure y=110); pattern is LEFT traffic — upwind up the centerline,
   crosswind across the top to x=112, downwind down x=112, base across to the
   centerline, final back up to the threshold.
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

/* Default menu offered when a control is clicked. Flight controls (yoke) vary
   so much by stage that most yoke acts override `options`; the rest use these. */
const CONTROL_OPTIONS = {
  throttle:  ["Full power (2500)", "2150 RPM", "1500 RPM", "Idle"],
  flaps:     ["0° (up)", "10° · ≤110 kt", "20° · ≤85 kt", "30° full · ≤85 kt"],
  yoke:      ["Wings level", "Bank left", "Bank right"],
  asi:       ["90 kts", "80 kts", "74 kts", "70 kts", "60 kts"],
  alt:       ["1000 ft (TPA)", "700 ft AGL", "Descending", "50 ft"],
  tach:      ["2500 RPM", "2150 RPM", "1500 RPM", "1000 RPM"],
  vsi:       ["Positive rate / climb", "Level", "Descending"],
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
    condition: "Cleared for takeoff. Lined up to roll on runway heading.",
    acts: [{ target: "rudder", correct: "Line up on centerline",
             values: { rpm: 1000, ias: 0, alt: 0, flaps: 0, vsi: 0 } }],
    pos: { x: 190, y: 256 }, dwell: 600,
  },
  {
    id: "full-throttle", phase: "TAKEOFF",
    condition: "On the centerline. Begin the takeoff roll.",
    acts: [{ target: "throttle", correct: "Full power (2500)", values: { rpm: 2500 } }],
    pos: { x: 190, y: 248 }, dwell: 800,
  },
  {
    id: "instruments-green", phase: "TAKEOFF",
    condition: "Power is up and you're accelerating. Engine gauges in the green.",
    acts: [{ target: "call", correct: "Instruments green", values: { ias: 25 } }],
    pos: { x: 190, y: 240 }, dwell: 700,
  },
  {
    id: "airspeed-alive", phase: "TAKEOFF",
    condition: "The airspeed needle starts to move (~40 kts).",
    acts: [{ target: "call", correct: "Airspeed alive", values: { ias: 45 } }],
    pos: { x: 190, y: 228 }, dwell: 700,
  },
  {
    id: "rotate", phase: "TAKEOFF",
    condition: "55 KIAS — rotation speed.",
    acts: [{ target: "yoke", correct: "Rotate (ease back)",
             options: ["Rotate (ease back)", "Hold it on the ground", "Push forward"],
             values: { ias: 60, alt: 50, vsi: 600 } }],
    pos: { x: 190, y: 214 }, dwell: 800,
  },

  /* ------------------------------ UPWIND -------------------------------- */
  {
    id: "climb-attitude", phase: "UPWIND",
    condition: "Airborne, positive rate of climb. Set the climb.",
    acts: [{ target: "yoke", correct: "Pitch for Vy (74 kts)",
             options: ["Pitch for Vy (74 kts)", "Lower the nose", "Hold level"],
             values: { ias: 74, alt: 200, vsi: 700 } }],
    pos: { x: 190, y: 178 }, dwell: 1100,
  },
  {
    id: "track-upwind", phase: "UPWIND",
    condition: "Upwind leg — climbing straight out on the extended centerline.",
    acts: [{ target: "yoke", correct: "Wings level, runway heading",
             options: ["Wings level, runway heading", "Bank left", "Bank right"],
             values: { alt: 500 } }],
    pos: { x: 190, y: 116 }, dwell: 1200,
  },

  /* ----------------------------- CROSSWIND ------------------------------ */
  {
    id: "turn-crosswind", phase: "CROSSWIND",
    condition: "Climbing through 700 ft AGL on the upwind leg.",
    acts: [{ target: "yoke", correct: "Bank left to crosswind",
             options: ["Bank left to crosswind", "Bank right", "Continue straight ahead"],
             values: { alt: 800 } }],
    pos: { x: 182, y: 92 }, dwell: 1200,
  },
  {
    id: "climb-to-tpa", phase: "CROSSWIND",
    condition: "On crosswind, still climbing — reaching pattern altitude. Level off at 1000 ft TPA.",
    acts: [{ target: "yoke", correct: "Level off at 1000 ft TPA",
             options: ["Level off at 1000 ft TPA", "Keep climbing", "Begin descent"],
             values: { alt: 1000, ias: 85, vsi: 0 } }],
    pos: { x: 146, y: 83 }, dwell: 1100,
  },

  /* ------------------------------ DOWNWIND ------------------------------ */
  {
    id: "turn-downwind", phase: "DOWNWIND",
    condition: "At pattern altitude, about 1–1.2 NM from the runway — turn downwind.",
    acts: [{ target: "yoke", correct: "Bank left to downwind",
             options: ["Bank left to downwind", "Bank right", "Continue on crosswind"],
             values: { alt: 1000 } }],
    pos: { x: 112, y: 92 }, dwell: 1100,
  },
  {
    id: "level-downwind", phase: "DOWNWIND",
    condition: "Rolled out on downwind — parallel to the runway, opposite heading. Set cruise power.",
    acts: [{ target: "throttle", correct: "2150 RPM",
             values: { ias: 90, rpm: 2150, vsi: 0 } }],
    pos: { x: 112, y: 122 }, dwell: 1100,
  },
  {
    id: "before-landing", phase: "DOWNWIND",
    condition: "Level on downwind — run the Before-Landing flow before you start down.",
    acts: [
      { target: "seatbelt", correct: "Secure / fasten" },
      { target: "fuel", correct: "BOTH" },
      { target: "mixture", correct: "RICH" },
      { target: "autopilot", correct: "OFF" },
    ],
    pos: { x: 112, y: 150 }, dwell: 900,
  },
  {
    id: "paa-check", phase: "DOWNWIND",
    condition: "Before starting down, verify: Power, Altitude, Airspeed.",
    acts: [
      { target: "tach", correct: "2150 RPM" },
      { target: "alt", correct: "1000 ft (TPA)" },
      { target: "asi", correct: "90 kts" },
    ],
    pos: { x: 112, y: 178 }, dwell: 900,
  },
  {
    id: "abeam-power", phase: "DOWNWIND",
    condition: "Threshold directly off your left wing (abeam). Chunk of power — start down.",
    acts: [{ target: "throttle", correct: "1500 RPM", values: { rpm: 1500, ias: 85, alt: 950, vsi: -300 } }],
    pos: { x: 112, y: 248 }, dwell: 1500,
  },
  {
    id: "flaps-10", phase: "DOWNWIND",
    condition: "~85 KIAS, in the white arc — first notch of flaps. Vfe 10° is 110 KIAS.",
    acts: [{ target: "flaps", correct: "10° · ≤110 kt", values: { flaps: 10, ias: 80, alt: 880, vsi: -400 } }],
    pos: { x: 112, y: 258 }, dwell: 800,
  },

  /* -------------------------------- BASE -------------------------------- */
  {
    id: "turn-base", phase: "BASE",
    condition: "The threshold is about 45° behind your wing.",
    acts: [{ target: "yoke", correct: "Bank left to base",
             options: ["Bank left to base", "Bank right", "Continue on downwind"],
             values: { ias: 80, alt: 700, vsi: -500 } }],
    pos: { x: 118, y: 294 }, dwell: 1300,
  },
  {
    id: "flaps-20", phase: "BASE",
    condition: "On base at 80 KIAS, descending — second notch. Vfe (10°–full) is 85 KIAS.",
    acts: [{ target: "flaps", correct: "20° · ≤85 kt", values: { flaps: 20, ias: 75, alt: 600, vsi: -500 } }],
    pos: { x: 152, y: 301 }, dwell: 900,
  },

  /* ------------------------------- FINAL -------------------------------- */
  {
    id: "turn-final", phase: "FINAL",
    condition: "Approaching the extended centerline — roll out aligned with the runway.",
    acts: [{ target: "yoke", correct: "Bank left to final",
             options: ["Bank left to final", "Bank right", "Continue on base"],
             values: { ias: 75, alt: 500, vsi: -500 } }],
    pos: { x: 188, y: 302 }, dwell: 1300,
  },
  {
    id: "flaps-30", phase: "FINAL",
    condition: "Runway made, on centerline, ~75 KIAS slowing to 70 — full flaps. Vfe 85 KIAS.",
    acts: [{ target: "flaps", correct: "30° full · ≤85 kt", values: { flaps: 30, ias: 70, alt: 400, vsi: -500 } }],
    pos: { x: 190, y: 294 }, dwell: 800,
  },
  {
    id: "stabilized", phase: "FINAL",
    condition: "Aim point stationary in the windscreen — on glidepath. Hold the approach speed.",
    acts: [{ target: "yoke", correct: "Pitch for 70 kts",
             options: ["Pitch for 70 kts", "Lower the nose (faster)", "Raise the nose (slower)"],
             values: { ias: 70, alt: 250, vsi: -450 } }],
    pos: { x: 190, y: 278 }, dwell: 1100, branch: true,
  },

  /* ------------------------------ LANDING ------------------------------- */
  {
    id: "throttle-idle", phase: "LANDING",
    condition: "Crossing the threshold, ~50 ft. Bleed off the last of the power.",
    acts: [{ target: "throttle", correct: "Idle", values: { rpm: 1000, ias: 60, alt: 50, vsi: -250 } }],
    pos: { x: 190, y: 256 }, dwell: 1000, branch: true,
  },
  {
    id: "flare", phase: "LANDING",
    condition: "~20 ft — round out.",
    acts: [{ target: "yoke", correct: "Begin the flare (ease back)",
             options: ["Begin the flare (ease back)", "Push the nose down", "Hold attitude"],
             values: { ias: 55, alt: 20, vsi: -60 } }],
    pos: { x: 190, y: 251 }, dwell: 800, branch: true,
  },
  {
    id: "hold-off", phase: "LANDING",
    condition: "Floating just off the surface — let the speed bleed away.",
    acts: [{ target: "yoke", correct: "Hold it off (more back-pressure)",
             options: ["Hold it off (more back-pressure)", "Relax back-pressure", "Push forward"],
             values: { ias: 50, alt: 8, vsi: -30 } }],
    pos: { x: 190, y: 248 }, dwell: 900, branch: true,
  },
  {
    id: "mains-touch", phase: "LANDING",
    condition: "Main wheels touch down first.",
    acts: [{ target: "yoke", correct: "Keep holding back-pressure",
             options: ["Keep holding back-pressure", "Push the nose down", "Neutral"],
             values: { ias: 45, alt: 0, vsi: 0 } }],
    pos: { x: 190, y: 245 }, dwell: 700, branch: true,
  },
  {
    id: "lower-nose", phase: "LANDING",
    condition: "Elevator authority fading as you slow.",
    acts: [{ target: "yoke", correct: "Gently lower the nosewheel",
             options: ["Gently lower the nosewheel", "Hold the nose up", "Pull back"],
             values: { ias: 35 } }],
    pos: { x: 190, y: 240 }, dwell: 700,
  },
  {
    id: "rollout", phase: "LANDING",
    condition: "All three wheels down, decelerating.",
    acts: [{ target: "rudder", correct: "Track centerline", values: { ias: 10 } }],
    pos: { x: 190, y: 226 }, dwell: 1000,
  },
];

const GOAROUND = [
  {
    id: "ga-power", phase: "GOAROUND",
    condition: "Going around — arrest the descent.",
    acts: [{ target: "throttle", correct: "Full power (2500)", values: { rpm: 2500, vsi: 0 } }],
    pos: { x: 190, y: 242 }, dwell: 900,
  },
  {
    id: "ga-pitch", phase: "GOAROUND",
    condition: "Establish a positive climb attitude.",
    acts: [{ target: "yoke", correct: "Pitch up to climb attitude",
             options: ["Pitch up to climb attitude", "Lower the nose", "Hold level"],
             values: { ias: 60, vsi: 500, alt: 100 } }],
    pos: { x: 190, y: 205 }, dwell: 1100,
  },
  {
    id: "ga-flaps-20", phase: "GOAROUND",
    condition: "Reduce the last notch of flaps to improve the climb.",
    acts: [{ target: "flaps", correct: "20° · ≤85 kt", values: { flaps: 20, ias: 65, vsi: 600 } }],
    pos: { x: 190, y: 170 }, dwell: 1000,
  },
  {
    id: "ga-climb", phase: "GOAROUND",
    condition: "Vy climb — verify, then milk the flaps up.",
    acts: [
      { target: "asi", correct: "60 kts" },
      { target: "vsi", correct: "Positive rate / climb" },
      { target: "flaps", correct: "10° · ≤110 kt", values: { flaps: 10, ias: 70, vsi: 700, alt: 400 } },
    ],
    pos: { x: 190, y: 135 }, dwell: 1200,
  },
  {
    id: "ga-call", phase: "GOAROUND",
    condition: "Make the radio call and re-enter the pattern.",
    acts: [{ target: "call", correct: "Going around", values: { alt: 700 } }],
    pos: { x: 190, y: 112 }, dwell: 1200,
  },
];
