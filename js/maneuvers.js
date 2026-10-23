/* ============================================================================
   maneuvers.js  —  Source of truth for the PHASE-CHECK MANEUVERS drill.

   Same question as the pattern: each step shows only the CONDITIONS, the pilot
   clicks a control and picks its setting. One maneuver per run, the one the
   evaluator asks for, opened on a setup card with its ACS standards.

   Sources
     Standards     FAA-S-ACS-6C, Private Pilot – Airplane (Nov 2023):
                   PA.V.A steep turns, PA.V.B ground reference, PA.VII.A-C
                   slow flight & stalls, PA.IX.A emergency descent.
     Procedures    FAA-H-8083-3C Airplane Flying Handbook (ch. 5 slow flight &
                   stalls, ch. 7 ground reference, ch. 9 steep turns), and the
                   Southeastern Oklahoma State C172 Maneuvers Guide (rev
                   1/25/2024) for the C172 power / flap / airspeed profile.
     Speeds        C172S POH: Vx 62, Vy 74, Va 105 @2550 / 98 @2200 / 90 @1900,
                   flaps 10° ≤110, 10°–30° ≤85, balked landing flaps to 20°
                   immediately after full power. Stall horn 5–10 kt above
                   the stall in all configurations.

   School profiles differ (RPM, the speed you hold in slow flight, the
   emergency-descent configuration). Where a number is a school's choice
   rather than the POH's, the condition text says so; check yours.

   Step shape is the pattern's (sequence.js) plus:
     phase        SETUP | ENTRY | MANEUVER | RECOVERY (the card label)
     anyOrder     the acts may be done in any order (the pre-maneuver check)
   Act shape is the pattern's plus:
     why          { controlId | menu choice : text } — a wrong click that is a
                  classic evaluator deduction gets the reason, not just a ✗,
                  and is listed in the debrief.
   ========================================================================== */

const MANEUVER_PHASES = {
  SETUP:    { name: "SETUP",    color: "#34ace0" },
  ENTRY:    { name: "ENTRY",    color: "#ffb142" },
  MANEUVER: { name: "MANEUVER", color: "#706fd3" },
  RECOVERY: { name: "RECOVERY", color: "#2ed573" },
};

/* Menus for the controls only this drill asks about; everything else falls
   back to CONTROL_OPTIONS from sequence.js. */
const MAN_CONTROL_OPTIONS = {
  trim:    ["Trim nose-up", "Trim nose-down", "Leave it"],
  outside: ["Clear of airspace & towns · field picked", "Over the town — fine", "Pick a field if I need one"],
  mixture: ["Set for altitude", "Full LEAN", "CUTOFF"],
};

// recurring deductions, worded once
const WHY = {
  powerFirst: "Power before the nose comes down — the classic stall-recovery deduction. Reduce the angle of attack first.",
  allFlaps: "All the flaps at once loses lift in a hurry — sink, and possibly a secondary stall. Flaps 20° first, then in stages.",
  aileronStall: "Picking a wing up with aileron near the stall can drop it further (and is how cross-control spins start). Keep it coordinated with rudder.",
  negativeG: "Lower the nose firmly, but not into negative G — just enough to break the stall.",
  secondary: "Hauling the nose up before the speed builds is how you get a secondary stall.",
  chase: "Big pitch corrections to chase altitude — hold a set attitude and make small adjustments.",
  skipClear: "Skipping the clearing turns is one of the most common phase-check deductions.",
};

const CLIMB_OPTIONS = ["Pitch for Vy (74) — positive rate", "Pull up hard", "Hold the nose down"];
const CLIMB_WHY = { "Pull up hard": WHY.secondary };

/* ----------------------- the pre-maneuver flow --------------------------
   Height · area · engine check · radio · clearing turns · references. Shared
   by every maneuver; `o` carries the parts that differ. Ground reference
   maneuvers are flown LOW (600–1,000 AGL) and set their own references. */
function preManeuver(o) {
  const steps = [
    {
      id: "pre-height", phase: "SETUP",
      condition: o.where + " Terrain here is about 1,000 MSL. " + o.ask,
      acts: [{ target: "alt", correct: o.low ? "600–1,000 AGL — right for this" : "Recovery will be above 1,500 AGL",
               options: ["Recovery will be above 1,500 AGL", "600–1,000 AGL — right for this", "Too low — climb first"] }],
    },
    {
      id: "pre-area", phase: "SETUP",
      condition: "Height is good. Below you: farmland, the reservoir off to the east, a long " +
        "hayfield at your 10 o'clock, the town and the Class C shelf well behind you.",
      acts: [{ target: "outside", correct: "Clear of airspace & towns · field picked" }],
    },
    {
      id: "pre-check", phase: "SETUP", anyOrder: true,
      condition: "Area is good. Now the pre-maneuver check (fuel-injected 172S — there is no carb heat).",
      acts: [
        { target: "fuel", correct: "BOTH" },
        { target: "mixture", correct: "Set for altitude" },
        { target: "seatbelt", correct: "Secure / fasten" },
      ],
    },
    {
      id: "pre-radio", phase: "SETUP",
      condition: "Checks complete. Two other trainers are working this practice area.",
      acts: [{ target: "call", correct: "Area call — position, altitude, maneuver",
               options: ["Area call — position, altitude, maneuver", "Mayday", "Going around", "No call needed"] }],
    },
    {
      id: "pre-clear", phase: "SETUP",
      condition: "Announced. You're about to commit to the maneuver.",
      acts: [{ target: "yoke", correct: "Clearing turns — two 90° (or one 180°)",
               options: ["Clearing turns — two 90° (or one 180°)", "Roll straight into it", "A quick wing-rock"],
               why: { "Roll straight into it": WHY.skipClear, "A quick wing-rock": WHY.skipClear } }],
    },
  ];
  if (o.reference) steps.push({
    id: "pre-ref", phase: "SETUP",
    condition: "Clear above, below and behind. Rolled out heading north with a lone peak on the nose.",
    acts: [{ target: "hi", correct: "Entry 360° on the peak · " + o.reference,
             options: ["Entry 360° on the peak · " + o.reference, "No reference needed", "Entry 180° · 3,000"] }],
  });
  return steps;
}

const MANEUVERS = [
  /* ----------------------------- SLOW FLIGHT ---------------------------- */
  {
    id: "slow-flight", name: "Slow Flight", acs: "PA.VII.A", color: "#706fd3",
    brief: "Maneuvering at the edge of the envelope: an airspeed where any more angle of attack, " +
      "load factor or power reduction would bring the stall warning — and no stall horn.",
    state: "3,500 MSL · 95 KIAS · cruise power · flaps up · heading 360",
    standards: ["Altitude ±100 ft", "Heading ±10°", "Airspeed +10 / −0 kt", "Bank ±10°",
      "No stall warning", "Completed no lower than 1,500 AGL"],
    values: { rpm: 2200, ias: 95, alt: 3500, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 360 },
    pre: { where: "Level at 3,500 MSL over the practice area.", ask: "The evaluator asks for slow flight.", reference: "3,500 ft" },
    steps: [
      {
        id: "sf-power", phase: "ENTRY",
        condition: "\"Slow flight, full flaps, straight and level.\" You're at cruise, 95 KIAS.",
        acts: [{ target: "throttle", correct: "1500 RPM", values: { rpm: 1500 } }],
      },
      {
        id: "sf-hold", phase: "ENTRY",
        condition: "Power coming back — the nose wants to drop and the airspeed is decaying.",
        acts: [{ target: "yoke", correct: "Raise the nose — hold altitude",
                 options: ["Raise the nose — hold altitude", "Let it descend", "Push forward"],
                 values: { ias: 100, pitch: 3 } }],
      },
      {
        id: "sf-flaps10", phase: "ENTRY",
        condition: "Holding 3,500, slowing through 100 KIAS.",
        acts: [{ target: "flaps", correct: "10° · ≤110 kt", values: { flaps: 10, ias: 84 } }],
      },
      {
        id: "sf-flaps20", phase: "ENTRY",
        condition: "Below 85 KIAS, still slowing.",
        acts: [{ target: "flaps", correct: "20° · ≤85 kt", values: { flaps: 20, ias: 72 } }],
      },
      {
        id: "sf-flaps30", phase: "ENTRY",
        condition: "Through 72 KIAS, holding altitude.",
        acts: [{ target: "flaps", correct: "30° full · ≤85 kt", values: { flaps: 30, ias: 58, pitch: 6 } }],
      },
      {
        id: "sf-power-up", phase: "MANEUVER",
        condition: "Nearly at the target — a few knots above where the horn chirps — and the " +
          "altimeter has started to sink: 3,460.",
        acts: [{ target: "throttle", correct: "Add power to hold altitude",
                 options: ["Add power to hold altitude", "Reduce power", "Leave it"],
                 values: { rpm: 1900, ias: 50, alt: 3500, vsi: 0 } }],
      },
      {
        id: "sf-trim", phase: "MANEUVER",
        condition: "Steady at about 50 KIAS, no horn — but you're holding a lot of back pressure.",
        acts: [{ target: "trim", correct: "Trim nose-up" }],
      },
      {
        id: "sf-rudder", phase: "MANEUVER",
        condition: "High power, low airspeed: the nose is yawing left and the ball is out to the right.",
        acts: [{ target: "rudder", correct: "Right rudder — step on the ball",
                 options: ["Right rudder — step on the ball", "Left rudder", "Neutral — let it go"],
                 why: { yoke: WHY.aileronStall } }],
      },
      {
        id: "sf-horn", phase: "MANEUVER",
        condition: "The airspeed creeps down and the stall horn chirps.",
        acts: [{ target: "yoke", correct: "Lower the nose slightly",
                 options: ["Lower the nose slightly", "Pull back to hold altitude", "Hold attitude"],
                 why: { throttle: "Behind the power curve, pitch sets the airspeed and power sets the altitude — the fix for a chirping horn is the nose." },
                 values: { ias: 52, pitch: 5 } }],
      },
      {
        id: "sf-turn", phase: "MANEUVER",
        condition: "\"Turn left to 270, holding altitude.\"",
        acts: [
          { target: "yoke", correct: "Shallow bank left (≈10°)",
            options: ["Shallow bank left (≈10°)", "Bank left 30°", "Bank right"],
            why: { "Bank left 30°": "Bank raises load factor and stall speed — at this airspeed a 30° bank brings the horn, or the stall." },
            values: { bank: -10, hdg: 270 } },
          { target: "throttle", correct: "Add a little power",
            options: ["Add a little power", "Reduce power", "Leave it"], values: { rpm: 2000 } },
        ],
      },
      {
        id: "sf-recover", phase: "RECOVERY",
        condition: "Rolled out on 270. \"Recover to cruise.\"",
        acts: [
          { target: "throttle", correct: "Full power (2500)", values: { rpm: 2500, bank: 0 } },
          { target: "yoke", correct: "Lower the nose — hold altitude",
            options: ["Lower the nose — hold altitude", "Pitch up and climb", "Push over"] },
          { target: "flaps", correct: "20° · ≤85 kt", why: { "0° (up)": WHY.allFlaps },
            values: { flaps: 20, ias: 60, pitch: 3 } },
        ],
      },
      {
        id: "sf-flaps-vx", phase: "RECOVERY",
        condition: "Accelerating through Vx, 62 KIAS.",
        acts: [{ target: "flaps", correct: "10° · ≤110 kt", values: { flaps: 10, ias: 70 } }],
      },
      {
        id: "sf-flaps-vy", phase: "RECOVERY",
        condition: "Through Vy, 74 KIAS, still accelerating.",
        acts: [{ target: "flaps", correct: "0° (up)", values: { flaps: 0, ias: 85, pitch: 1 } }],
      },
      {
        id: "sf-cruise", phase: "RECOVERY",
        condition: "Clean, level at 3,500 and accelerating toward cruise.",
        acts: [{ target: "throttle", correct: "Cruise power",
                 options: ["Cruise power", "Leave it at full", "Idle"], values: { rpm: 2200, ias: 95, pitch: 0 } }],
      },
    ],
  },

  /* --------------------------- POWER-OFF STALL -------------------------- */
  {
    id: "power-off-stall", name: "Power-Off Stall", acs: "PA.VII.B", color: "#ff6b35",
    brief: "The approach-to-landing stall. Configure as for landing, establish a stabilized " +
      "descent, then go to idle and raise the nose until it stalls — full stall, then recover.",
    state: "3,500 MSL · 95 KIAS · cruise power · flaps up · heading 360",
    standards: ["Heading ±10° (straight)", "Or bank ≤20° ±10° (turning)", "Recover after the full stall",
      "Coordinated throughout", "Completed no lower than 1,500 AGL"],
    values: { rpm: 2200, ias: 95, alt: 3500, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 360 },
    pre: { where: "Level at 3,500 MSL over the practice area.", ask: "The evaluator asks for a power-off stall.", reference: "3,500 ft" },
    steps: [
      {
        id: "pof-power", phase: "ENTRY",
        condition: "\"Power-off stall, landing configuration, straight ahead.\" You're at cruise, 95 KIAS.",
        acts: [{ target: "throttle", correct: "1500 RPM", values: { rpm: 1500, ias: 100, pitch: 3 } }],
      },
      {
        id: "pof-flaps10", phase: "ENTRY",
        condition: "Holding 3,500, slowing through 100 KIAS.",
        acts: [{ target: "flaps", correct: "10° · ≤110 kt", values: { flaps: 10, ias: 84 } }],
      },
      {
        id: "pof-flaps20", phase: "ENTRY",
        condition: "Below 85 KIAS.",
        acts: [{ target: "flaps", correct: "20° · ≤85 kt", values: { flaps: 20, ias: 75 } }],
      },
      {
        id: "pof-flaps30", phase: "ENTRY",
        condition: "Through 75 KIAS — finish configuring for landing.",
        acts: [{ target: "flaps", correct: "30° full · ≤85 kt", values: { flaps: 30, ias: 68 } }],
      },
      {
        id: "pof-descend", phase: "ENTRY",
        condition: "Landing configuration. Set it up like final.",
        acts: [{ target: "yoke", correct: "Pitch for 65 KIAS — stabilized descent",
                 options: ["Pitch for 65 KIAS — stabilized descent", "Hold altitude", "Pitch for 85 KIAS"],
                 values: { ias: 65, vsi: -500, alt: 3350, pitch: -2 } }],
      },
      {
        id: "pof-idle", phase: "MANEUVER",
        condition: "Stabilized at 65 KIAS, descending through 3,300 — as if crossing the threshold.",
        acts: [{ target: "throttle", correct: "Idle", values: { rpm: 1000 } }],
      },
      {
        id: "pof-raise", phase: "MANEUVER",
        condition: "Power at idle.",
        acts: [{ target: "yoke", correct: "Smoothly raise to the landing attitude — and keep going",
                 options: ["Smoothly raise to the landing attitude — and keep going", "Yank it back", "Hold the descent attitude"],
                 values: { pitch: 10, ias: 52, vsi: -200 } }],
      },
      {
        id: "pof-coord", phase: "MANEUVER",
        condition: "Controls going mushy and the left wing starts to dip.",
        acts: [{ target: "rudder", correct: "Rudder — keep it coordinated",
                 options: ["Rudder — keep it coordinated", "Let it yaw", "Hard left rudder"],
                 why: { yoke: WHY.aileronStall } }],
      },
      {
        id: "pof-call", phase: "MANEUVER",
        condition: "Stall horn, then buffet — and the nose breaks through.",
        acts: [{ target: "call", correct: "\"Buffet… stall\"",
                 options: ["\"Buffet… stall\"", "\"Going around\"", "\"Clear left, clear right\""],
                 values: { ias: 45, vsi: -700, pitch: -2 } }],
      },
      {
        id: "pof-recover", phase: "RECOVERY",
        condition: "Full stall.",
        acts: [
          { target: "yoke", correct: "Nose down — reduce AOA",
            options: ["Nose down — reduce AOA", "Hold back pressure", "Push hard forward"],
            why: { throttle: WHY.powerFirst, "Push hard forward": WHY.negativeG },
            values: { pitch: -4, ias: 52 } },
          { target: "yoke", correct: "Roll wings level",
            options: ["Roll wings level", "Pick the wing up with aileron, no rudder", "Hold the bank"],
            why: { "Pick the wing up with aileron, no rudder": WHY.aileronStall }, values: { bank: 0 } },
          { target: "throttle", correct: "Full power (2500)", values: { rpm: 2500, ias: 58 } },
        ],
      },
      {
        id: "pof-flaps", phase: "RECOVERY",
        condition: "Stall broken, full power, the nose back near the horizon.",
        acts: [{ target: "flaps", correct: "20° · ≤85 kt", why: { "0° (up)": WHY.allFlaps },
                 values: { flaps: 20, ias: 62, vsi: 0, pitch: 3 } }],
      },
      {
        id: "pof-climb", phase: "RECOVERY",
        condition: "Accelerating, the descent arrested.",
        acts: [{ target: "yoke", correct: CLIMB_OPTIONS[0], options: CLIMB_OPTIONS, why: CLIMB_WHY,
                 values: { ias: 66, vsi: 400, pitch: 7, alt: 3200 } }],
      },
      {
        id: "pof-flaps10-up", phase: "RECOVERY",
        condition: "Positive rate, through Vx.",
        acts: [{ target: "flaps", correct: "10° · ≤110 kt", values: { flaps: 10, ias: 72, vsi: 600 } }],
      },
      {
        id: "pof-flaps0", phase: "RECOVERY",
        condition: "Climbing at Vy, 74 KIAS, 3,300 and climbing.",
        acts: [{ target: "flaps", correct: "0° (up)", values: { flaps: 0, ias: 74, alt: 3400 } }],
      },
      {
        id: "pof-cruise", phase: "RECOVERY",
        condition: "Back at 3,500 — \"Return to cruise.\"",
        acts: [
          { target: "yoke", correct: "Level off", options: ["Level off", "Keep climbing", "Descend"],
            values: { alt: 3500, vsi: 0, pitch: 0, ias: 90 } },
          { target: "throttle", correct: "Cruise power",
            options: ["Cruise power", "Leave it at full", "Idle"], values: { rpm: 2200, ias: 95 } },
        ],
      },
    ],
  },

  /* --------------------------- POWER-ON STALL --------------------------- */
  {
    id: "power-on-stall", name: "Power-On Stall", acs: "PA.VII.C", color: "#ff4757",
    brief: "The takeoff/departure stall. Slow to about rotation speed, add climb power, then " +
      "raise the nose to a stall — holding right rudder against the left-turning tendencies.",
    state: "3,500 MSL · 95 KIAS · cruise power · flaps up · heading 360",
    standards: ["Power ≥65% (as assigned)", "Heading ±10° (straight)", "Or bank ≤20° ±10° (turning)",
      "Recover after the full stall", "Completed no lower than 1,500 AGL"],
    values: { rpm: 2200, ias: 95, alt: 3500, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 360 },
    pre: { where: "Level at 3,500 MSL over the practice area.", ask: "The evaluator asks for a power-on stall.", reference: "3,500 ft" },
    steps: [
      {
        id: "pon-power", phase: "ENTRY",
        condition: "\"Power-on stall, departure configuration — flaps up — straight ahead.\"",
        acts: [{ target: "throttle", correct: "1500 RPM", values: { rpm: 1500 } }],
      },
      {
        id: "pon-slow", phase: "ENTRY",
        condition: "Power back, flaps up, holding 3,500.",
        acts: [{ target: "yoke", correct: "Raise the nose — hold altitude",
                 options: ["Raise the nose — hold altitude", "Let it descend", "Push forward"],
                 values: { ias: 60, pitch: 5 } }],
      },
      {
        id: "pon-full", phase: "ENTRY",
        condition: "Slowed to about 60 KIAS — near rotation speed.",
        acts: [{ target: "throttle", correct: "Full power (2500)", values: { rpm: 2500 } }],
      },
      {
        id: "pon-pitch", phase: "MANEUVER",
        condition: "Climb power set.",
        acts: [{ target: "yoke", correct: "Smoothly raise to the stall attitude",
                 options: ["Smoothly raise to the stall attitude", "Yank it 30° nose-up", "Hold level"],
                 values: { pitch: 15, ias: 52, vsi: 400, alt: 3550 } }],
      },
      {
        id: "pon-rudder", phase: "MANEUVER",
        condition: "Nose high, full power, slowing: the nose yaws left and the ball slides right.",
        acts: [{ target: "rudder", correct: "Right rudder — step on the ball",
                 options: ["Right rudder — step on the ball", "Left rudder", "Neutral — let it go"],
                 why: { yoke: WHY.aileronStall } }],
      },
      {
        id: "pon-call", phase: "MANEUVER",
        condition: "Stall horn, buffet — the nose drops sharply.",
        acts: [{ target: "call", correct: "\"Buffet… stall\"",
                 options: ["\"Buffet… stall\"", "\"Going around\"", "\"Clear left, clear right\""],
                 values: { ias: 48, vsi: -300, pitch: 4 } }],
      },
      {
        id: "pon-recover", phase: "RECOVERY",
        condition: "Full stall — and the right wing drops.",
        acts: [
          { target: "yoke", correct: "Nose down — reduce AOA",
            options: ["Nose down — reduce AOA", "Hold back pressure", "Push hard forward"],
            why: { "Push hard forward": WHY.negativeG, "Hold back pressure": "Holding the angle of attack keeps it stalled." },
            values: { pitch: -3, ias: 55, bank: 12 } },
          { target: "yoke", correct: "Roll wings level (coordinated)",
            options: ["Roll wings level (coordinated)", "Pick the wing up with aileron, no rudder", "Hold the bank"],
            why: { "Pick the wing up with aileron, no rudder": WHY.aileronStall }, values: { bank: 0 } },
          { target: "throttle", correct: "Verify full power",
            options: ["Verify full power", "Reduce to idle", "1500 RPM"] },
        ],
      },
      {
        id: "pon-climb", phase: "RECOVERY",
        condition: "Stall broken, accelerating with the nose just below the horizon.",
        acts: [{ target: "yoke", correct: CLIMB_OPTIONS[0], options: CLIMB_OPTIONS, why: CLIMB_WHY,
                 values: { ias: 74, vsi: 600, pitch: 8, alt: 3450 } }],
      },
      {
        id: "pon-cruise", phase: "RECOVERY",
        condition: "Back at 3,500 on heading — \"Return to cruise.\"",
        acts: [
          { target: "yoke", correct: "Level off", options: ["Level off", "Keep climbing", "Descend"],
            values: { alt: 3500, vsi: 0, pitch: 0, ias: 90 } },
          { target: "throttle", correct: "Cruise power",
            options: ["Cruise power", "Leave it at full", "Idle"], values: { rpm: 2200, ias: 95 } },
        ],
      },
    ],
  },

  /* ----------------------------- STEEP TURNS ---------------------------- */
  {
    id: "steep-turns", name: "Steep Turns", acs: "PA.V.A", color: "#ffd32a",
    brief: "A coordinated 360° at 45° of bank, then straight into a 360° the other way, at or " +
      "below maneuvering speed. Roll out about half the bank angle — ~20° — before the heading.",
    state: "3,500 MSL · 95 KIAS · cruise power · 2,200 lb (Va 98 KIAS) · heading 360",
    standards: ["Altitude ±100 ft", "Airspeed ±10 kt", "Bank 45° ±5°", "Roll out on entry heading ±10°",
      "At or below Va"],
    values: { rpm: 2200, ias: 95, alt: 3500, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 360 },
    pre: { where: "Level at 3,500 MSL over the practice area.", ask: "The evaluator asks for steep turns.", reference: "3,500 ft" },
    steps: [
      {
        id: "st-speed", phase: "ENTRY",
        condition: "\"Steep turn to the left, then right.\" At 2,200 lb today Va is 98 KIAS.",
        acts: [{ target: "throttle", correct: "Power for 95 KIAS — below Va",
                 options: ["Power for 95 KIAS — below Va", "Full power — 115 KIAS", "Idle"],
                 why: { "Full power — 115 KIAS": "Above Va a full control deflection or a gust can overstress the airplane — enter at or below Va." } }],
      },
      {
        id: "st-roll-left", phase: "MANEUVER",
        condition: "Stable at 95 KIAS, 3,500, heading 360.",
        acts: [{ target: "yoke", correct: "Roll left to 45°",
                 options: ["Roll left to 45°", "Roll left to 30°", "Roll left to 60°"],
                 values: { bank: -45, hdg: 340 } }],
      },
      {
        id: "st-30", phase: "MANEUVER",
        condition: "Through 30° of bank the nose wants to drop and the airspeed starts to bleed.",
        acts: [
          { target: "yoke", correct: "Add back pressure — nose on the horizon",
            options: ["Add back pressure — nose on the horizon", "Push forward", "Hold the controls still"],
            values: { pitch: 3, hdg: 300 } },
          { target: "throttle", correct: "Add a little power",
            options: ["Add a little power", "Reduce power", "Idle"], values: { rpm: 2350 } },
        ],
      },
      {
        id: "st-high", phase: "MANEUVER",
        condition: "Passing 270: altimeter 3,550 and creeping up.",
        acts: [{ target: "yoke", correct: "Relax back pressure slightly",
                 options: ["Relax back pressure slightly", "Shove the nose down", "Roll out and start again"],
                 why: { "Shove the nose down": WHY.chase },
                 values: { alt: 3520, hdg: 260, pitch: 2 } }],
      },
      {
        id: "st-overbank", phase: "MANEUVER",
        condition: "Passing 180: the bank has crept to 52°.",
        acts: [{ target: "yoke", correct: "Shallow back to 45°",
                 options: ["Shallow back to 45°", "Let it steepen", "Roll wings level"],
                 values: { bank: -45, hdg: 150, alt: 3500 } }],
      },
      {
        id: "st-rollout-left", phase: "MANEUVER",
        condition: "Heading passing 020 — your entry heading was 360.",
        acts: [{ target: "yoke", correct: "Roll out — wings level on 360",
                 options: ["Roll out — wings level on 360", "Wait until 360, then roll out", "Keep turning"],
                 why: { "Wait until 360, then roll out": "Starting the roll-out at the heading overshoots it — lead by about half the bank angle." },
                 values: { bank: 0, hdg: 0, pitch: 0 } }],
      },
      {
        id: "st-roll-right", phase: "MANEUVER",
        condition: "Wings level on 360. \"Now to the right.\"",
        acts: [
          { target: "yoke", correct: "Roll right to 45°",
            options: ["Roll right to 45°", "Roll right to 30°", "Roll right to 60°"],
            values: { bank: 45, hdg: 40 } },
          { target: "yoke", correct: "Add back pressure — nose on the horizon",
            options: ["Add back pressure — nose on the horizon", "Push forward", "Hold the controls still"],
            values: { pitch: 3, hdg: 70 } },
        ],
      },
      {
        id: "st-slow", phase: "MANEUVER",
        condition: "Passing 180: altitude 3,480, airspeed down to 86 KIAS.",
        acts: [{ target: "throttle", correct: "Add a little power",
                 options: ["Add a little power", "Reduce power", "Idle"],
                 why: { yoke: "Diving for airspeed costs altitude — in a steep turn the airspeed fix is power." },
                 values: { rpm: 2400, ias: 95, alt: 3500, hdg: 180 } }],
      },
      {
        id: "st-rollout-right", phase: "RECOVERY",
        condition: "Heading passing 340 — back toward 360.",
        acts: [
          { target: "yoke", correct: "Roll out — wings level on 360",
            options: ["Roll out — wings level on 360", "Wait until 360, then roll out", "Keep turning"],
            why: { "Wait until 360, then roll out": "Starting the roll-out at the heading overshoots it — lead by about half the bank angle." },
            values: { bank: 0, hdg: 360, pitch: 0 } },
          { target: "throttle", correct: "Back to entry power",
            options: ["Back to entry power", "Leave the extra power in", "Idle"], values: { rpm: 2200 } },
        ],
      },
    ],
  },

  /* -------------------------- TURNS AROUND A POINT ---------------------- */
  {
    id: "turns-point", name: "Turns Around a Point", acs: "PA.V.B", color: "#33d9b2",
    brief: "A constant-radius circle around a ground point, entered downwind. The bank follows " +
      "groundspeed: steepest with the wind behind you, shallowest into it.",
    state: "2,000 MSL (1,000 AGL) · 90 KIAS · wind 270° at 15 kt",
    standards: ["Altitude ±100 ft", "Airspeed ±10 kt", "600–1,000 AGL", "Constant radius — wind correction",
      "Coordinated, divided attention"],
    values: { rpm: 2150, ias: 90, alt: 2000, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 90 },
    pre: { low: true, where: "Level at 2,000 MSL, south of the practice area. Wind 270° at 15 kt.",
           ask: "The evaluator asks for turns around a point." },
    steps: [
      {
        id: "tp-entry", phase: "ENTRY",
        condition: "A lone grain silo in open fields, emergency fields all around it. Wind from the west.",
        acts: [{ target: "yoke", correct: "Enter downwind (090), silo off the left wing",
                 options: ["Enter downwind (090), silo off the left wing", "Enter upwind (270)", "Fly directly over the silo"] }],
      },
      {
        id: "tp-downwind", phase: "MANEUVER",
        condition: "Abeam the silo, heading 090, the wind right on your tail.",
        acts: [{ target: "yoke", correct: "Roll into the steepest bank (~45°)",
                 options: ["Roll into the steepest bank (~45°)", "Shallow bank (~15°)", "Wings level"],
                 values: { bank: -40, hdg: 45 } }],
      },
      {
        id: "tp-north", phase: "MANEUVER",
        condition: "Heading north now — the wind is from your left and your groundspeed is dropping.",
        acts: [{ target: "yoke", correct: "Gradually shallow the bank",
                 options: ["Gradually shallow the bank", "Steepen the bank", "Hold the same bank"],
                 values: { bank: -28, hdg: 0 } }],
      },
      {
        id: "tp-upwind", phase: "MANEUVER",
        condition: "Heading 270, straight into the wind.",
        acts: [{ target: "yoke", correct: "Shallowest bank of the circle",
                 options: ["Shallowest bank of the circle", "Steepest bank of the circle", "Wings level"],
                 values: { bank: -15, hdg: -90 } }],
      },
      {
        id: "tp-alt", phase: "MANEUVER",
        condition: "Altimeter reads 1,920 — you've been watching the silo.",
        acts: [{ target: "yoke", correct: "Ease back to 2,000 — small correction",
                 options: ["Ease back to 2,000 — small correction", "Ignore it", "Pull up hard"],
                 why: { "Pull up hard": "A hard pull while banked at low altitude raises the load factor and stall speed." },
                 values: { alt: 2000 } }],
      },
      {
        id: "tp-south", phase: "MANEUVER",
        condition: "Heading 180, wind from your right, groundspeed building.",
        acts: [{ target: "yoke", correct: "Gradually steepen the bank",
                 options: ["Gradually steepen the bank", "Shallow the bank", "Hold the same bank"],
                 values: { bank: -30, hdg: -180 } }],
      },
      {
        id: "tp-exit", phase: "RECOVERY",
        condition: "Heading 090 again — one full turn, back on downwind.",
        acts: [{ target: "yoke", correct: "Roll out — exit on downwind",
                 options: ["Roll out — exit on downwind", "Roll out into the wind", "Keep circling"],
                 values: { bank: 0, hdg: -270 } }],
      },
    ],
  },

  /* ------------------------------- S-TURNS ------------------------------ */
  {
    id: "s-turns", name: "S-Turns", acs: "PA.V.B", color: "#34ace0",
    brief: "Two 180° half-circles of equal radius either side of a straight road perpendicular " +
      "to the wind, crossing the road wings-level each time.",
    state: "2,000 MSL (1,000 AGL) · 90 KIAS · wind 270° at 15 kt",
    standards: ["Altitude ±100 ft", "Airspeed ±10 kt", "600–1,000 AGL", "Reverse directly over the road",
      "Equal half-circles — wind correction"],
    values: { rpm: 2150, ias: 90, alt: 2000, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 90 },
    pre: { low: true, where: "Level at 2,000 MSL, south of the practice area. Wind 270° at 15 kt.",
           ask: "The evaluator asks for S-turns." },
    steps: [
      {
        id: "s-entry", phase: "ENTRY",
        condition: "A straight north–south road across open fields. Wind from the west.",
        acts: [{ target: "yoke", correct: "Cross the road perpendicular, heading 090 (downwind)",
                 options: ["Cross the road perpendicular, heading 090 (downwind)", "Fly along the road", "Cross at 45°"] }],
      },
      {
        id: "s-first", phase: "MANEUVER",
        condition: "Directly over the road, wings level, the wind on your tail.",
        acts: [{ target: "yoke", correct: "Roll into the steepest bank",
                 options: ["Roll into the steepest bank", "Shallow bank", "Fly straight a little first"],
                 values: { bank: -40, hdg: 45 } }],
      },
      {
        id: "s-shallow", phase: "MANEUVER",
        condition: "Heading north, halfway round — groundspeed decreasing.",
        acts: [{ target: "yoke", correct: "Gradually shallow the bank",
                 options: ["Gradually shallow the bank", "Steepen the bank", "Hold the same bank"],
                 values: { bank: -22, hdg: 0 } }],
      },
      {
        id: "s-cross1", phase: "MANEUVER",
        condition: "Approaching the road, almost on 270, into the wind.",
        acts: [{ target: "yoke", correct: "Wings level right over the road",
                 options: ["Wings level right over the road", "Hold the bank across it", "Roll out well before it"],
                 values: { bank: 0, hdg: -90 } }],
      },
      {
        id: "s-second", phase: "MANEUVER",
        condition: "Over the road heading 270 — slowest groundspeed of the maneuver.",
        acts: [{ target: "yoke", correct: "Shallow bank to the right",
                 options: ["Shallow bank to the right", "Steep bank to the right", "Continue left"],
                 values: { bank: 15, hdg: -60 } }],
      },
      {
        id: "s-steepen", phase: "MANEUVER",
        condition: "Heading north again, groundspeed building as the wind swings behind you.",
        acts: [{ target: "yoke", correct: "Gradually steepen the bank",
                 options: ["Gradually steepen the bank", "Shallow the bank", "Hold the same bank"],
                 values: { bank: 35, hdg: 0 } }],
      },
      {
        id: "s-cross2", phase: "RECOVERY",
        condition: "Back to the road, heading 090, downwind.",
        acts: [{ target: "yoke", correct: "Wings level right over the road",
                 options: ["Wings level right over the road", "Hold the bank across it", "Roll out well before it"],
                 values: { bank: 0, hdg: 90 } }],
      },
    ],
  },

  /* -------------------------- RECTANGULAR COURSE ------------------------ */
  {
    id: "rectangular", name: "Rectangular Course", acs: "PA.V.B", color: "#ffb142",
    brief: "A traffic pattern around a field: equal distance from each side, crabbing on the legs " +
      "and adjusting each corner's bank (and how far past 90° you turn) for the wind.",
    state: "2,000 MSL (1,000 AGL) · 90 KIAS · wind 270° at 15 kt · left-hand course",
    standards: ["Altitude ±100 ft", "Airspeed ±10 kt", "600–1,000 AGL", "Entered 45° to the downwind",
      "Constant distance — wind correction"],
    values: { rpm: 2150, ias: 90, alt: 2000, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 45 },
    pre: { low: true, where: "Level at 2,000 MSL, south of the practice area. Wind 270° at 15 kt.",
           ask: "The evaluator asks for a rectangular course." },
    steps: [
      {
        id: "rc-entry", phase: "ENTRY",
        condition: "A square field bordered by roads; you'll fly it left-hand. Wind from the west.",
        acts: [{ target: "yoke", correct: "Enter 45° to the downwind leg",
                 options: ["Enter 45° to the downwind leg", "Enter over the middle of the field", "Enter on the upwind leg"],
                 values: { hdg: 90 } }],
      },
      {
        id: "rc-corner1", phase: "MANEUVER",
        condition: "Downwind (090), wind on your tail, reaching the corner. Next leg runs north.",
        acts: [{ target: "yoke", correct: "Steep bank, turn past 90° — crab into the wind",
                 options: ["Steep bank, turn past 90° — crab into the wind", "Shallow bank, exactly 90°", "Turn right"],
                 values: { bank: -35, hdg: 30 } }],
      },
      {
        id: "rc-base", phase: "MANEUVER",
        condition: "Rolled out on the north leg. The wind is from your left.",
        acts: [{ target: "yoke", correct: "Hold a crab to the left",
                 options: ["Hold a crab to the left", "Crab to the right", "Point straight at 360"],
                 values: { bank: 0, hdg: -10 } }],
      },
      {
        id: "rc-corner2", phase: "MANEUVER",
        condition: "Corner ahead — the next leg runs straight into the wind.",
        acts: [{ target: "yoke", correct: "Medium bank, less than 90° of turn",
                 options: ["Medium bank, less than 90° of turn", "Steep bank, more than 90°", "Turn right"],
                 values: { bank: -25, hdg: -90 } }],
      },
      {
        id: "rc-corner3", phase: "MANEUVER",
        condition: "Upwind leg (270), slowest groundspeed. Next leg runs south, wind from your right.",
        acts: [{ target: "yoke", correct: "Shallowest bank, less than 90° — crab into the wind",
                 options: ["Shallowest bank, less than 90° — crab into the wind", "Steep bank, more than 90°", "Turn right"],
                 values: { bank: -15, hdg: -170 } }],
      },
      {
        id: "rc-corner4", phase: "MANEUVER",
        condition: "South leg, crabbed right. Groundspeed building toward the last corner.",
        acts: [{ target: "yoke", correct: "Medium bank steepening, more than 90°",
                 options: ["Medium bank steepening, more than 90°", "Shallow bank, exactly 90°", "Turn right"],
                 values: { bank: -30, hdg: -270 } }],
      },
      {
        id: "rc-exit", phase: "RECOVERY",
        condition: "Back on downwind, the field off your left wing.",
        acts: [{ target: "yoke", correct: "Roll out — wings level on downwind",
                 options: ["Roll out — wings level on downwind", "Keep turning", "Crab left"],
                 values: { bank: 0 } }],
      },
    ],
  },

  /* --------------------------- EMERGENCY DESCENT ------------------------ */
  {
    id: "emergency-descent", name: "Emergency Descent", acs: "PA.IX.A", color: "#c0392b",
    brief: "Get down fast without overspeeding: idle, a 30–45° bank to keep positive G and look for " +
      "traffic and fields, and the POH/school airspeed for the configuration. This is the school " +
      "guide's flaps-down profile (80 KIAS, full flaps); some schools fly it clean.",
    state: "4,500 MSL · 95 KIAS · cruise power · flaps up · heading 360",
    standards: ["Bank 30°–45°", "Airspeed +0 / −10 kt", "Level off at the assigned altitude ±100 ft",
      "Checklist and radio calls"],
    values: { rpm: 2200, ias: 95, alt: 4500, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 360 },
    pre: { where: "Level at 4,500 MSL over the practice area.", ask: "The evaluator asks for an emergency descent." },
    steps: [
      {
        id: "ed-idle", phase: "ENTRY",
        condition: "\"Smoke in the cabin — emergency descent to 2,500.\"",
        acts: [
          { target: "throttle", correct: "Idle", values: { rpm: 1000 } },
          { target: "mixture", correct: "RICH", options: ["RICH", "LEAN", "CUTOFF"] },
        ],
      },
      {
        id: "ed-bank", phase: "ENTRY",
        condition: "Power at idle.",
        acts: [{ target: "yoke", correct: "Roll into a 30–45° bank",
                 options: ["Roll into a 30–45° bank", "Wings level, push over", "60° bank"],
                 why: { "Wings level, push over": "Pushing over wings-level unloads the airplane — the bank keeps positive G." },
                 values: { bank: -30, hdg: 330, ias: 100 } }],
      },
      {
        id: "ed-f10", phase: "ENTRY",
        condition: "Descending in the turn, below 110 KIAS.",
        acts: [{ target: "flaps", correct: "10° · ≤110 kt", values: { flaps: 10, ias: 90, hdg: 270 } }],
      },
      {
        id: "ed-f30", phase: "ENTRY",
        condition: "Below 85 KIAS.",
        acts: [{ target: "flaps", correct: "30° full · ≤85 kt", values: { flaps: 30, ias: 82, hdg: 200 } }],
      },
      {
        id: "ed-speed", phase: "MANEUVER",
        condition: "Full flaps. The airspeed is drifting toward 88.",
        acts: [{ target: "yoke", correct: "Pitch for 80 KIAS",
                 options: ["Pitch for 80 KIAS", "Pitch for 100 KIAS", "Pitch for 60 KIAS"],
                 why: { "Pitch for 100 KIAS": "Flap limit is 85 KIAS — 100 overspeeds the flaps." },
                 values: { ias: 80, vsi: -1200, alt: 3800, pitch: -8, hdg: 120 } }],
      },
      {
        id: "ed-call", phase: "MANEUVER",
        condition: "Through 3,800, descending 1,200 fpm, airspeed steady.",
        acts: [{ target: "call", correct: "Mayday (simulated)",
                 options: ["Mayday (simulated)", "Area call — position, altitude, maneuver", "No call"] }],
      },
      {
        id: "ed-level", phase: "RECOVERY",
        condition: "Descending through 2,620 toward the 2,500 level-off.",
        acts: [
          { target: "yoke", correct: "Roll wings level and level off",
            options: ["Roll wings level and level off", "Wait for 2,500, then pull", "Keep descending"],
            why: { "Wait for 2,500, then pull": "At 1,200 fpm, lead the level-off by about 10% of the descent rate (~120 ft), or you'll bust the altitude." },
            values: { bank: 0, vsi: 0, alt: 2500, pitch: 0, hdg: 90 } },
          { target: "throttle", correct: "Full power (2500)", values: { rpm: 2500 } },
          { target: "flaps", correct: "20° · ≤85 kt", why: { "0° (up)": WHY.allFlaps }, values: { flaps: 20, ias: 70 } },
        ],
      },
      {
        id: "ed-clean", phase: "RECOVERY",
        condition: "Level at 2,500, accelerating.",
        acts: [
          { target: "flaps", correct: "10° · ≤110 kt", values: { flaps: 10, ias: 75 } },
          { target: "flaps", correct: "0° (up)", values: { flaps: 0, ias: 85 } },
          { target: "throttle", correct: "Cruise power",
            options: ["Cruise power", "Leave it at full", "Idle"], values: { rpm: 2200, ias: 95 } },
        ],
      },
    ],
  },
];
