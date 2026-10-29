/* ============================================================================
   flashcards.js  —  Source of truth for the STAGE CHECK FLASHCARDS.

   Stage 1 (FL16, pre-solo) per the Rainier Flight Service PPL syllabus v6.5:
   the oral (Memory Item / Limitations Quiz, three systems, PAVE / IMSAFE,
   lost comms, maneuver aerodynamics, solo endorsements) and the graded tasks
   (slow flight, stalls, steep turns, ground reference, spin awareness,
   pattern, landings, go-around, forward slip, simulated engine failure).

   Sources: C172S POH (Sections 2–4), FAA-S-ACS-6C, the Airplane Flying
   Handbook (FAA-H-8083-3C), the PHAK (FAA-H-8083-25C), 14 CFR parts 61 / 91.
   The emergency and maneuver decks are BUILT from emergencies.js and
   maneuvers.js, so a checklist or a standard is only ever written once.

   The school's own Memory Item / Limitations Quiz and Stan Manual are not in
   the syllabus — cards marked `verify` are the ones most likely to differ
   from what your school teaches.

   Card shape: { deck, q, a, src, verify? }   a may use \n for line breaks.
   ========================================================================== */

const FLASH_DECKS = {
  limits:   { name: "Limitations & V-speeds", color: "#ff6b35" },
  systems:  { name: "Systems",                color: "#34ace0" },
  aero:     { name: "Aerodynamics",           color: "#706fd3" },
  maneuver: { name: "Maneuvers",              color: "#ffd32a" },
  pattern:  { name: "Pattern & landings",     color: "#33d9b2" },
  emerg:    { name: "Emergency memory items", color: "#ff4757" },
  regs:     { name: "Student pilot & regs",   color: "#2ed573" },
  adm:      { name: "Preflight & ADM",        color: "#ffb142" },
};

const POH = "C172S POH";

const FLASH_BASE = [
  /* ------------------------- limitations ------------------------------ */
  { deck: "limits", q: "Vne (never exceed)?", a: "163 KIAS — red line.", src: POH + " §2" },
  { deck: "limits", q: "Vno (max structural cruising)?",
    a: "129 KIAS — top of the green arc. Above it (yellow arc) only in smooth air.", src: POH + " §2" },
  { deck: "limits", q: "Va (maneuvering speed)?",
    a: "105 KIAS @ 2,550 lb\n98 KIAS @ 2,200 lb\n90 KIAS @ 1,900 lb\nIt goes DOWN as weight goes down.", src: POH + " §2" },
  { deck: "limits", q: "Why does Va decrease with weight?",
    a: "A lighter airplane is at a lower angle of attack for a given speed, so it can be pulled to a higher load factor before it stalls. Va keeps the stall happening before the structural limit is reached.", src: "PHAK ch. 5" },
  { deck: "limits", q: "Vfe (max flap extended)?",
    a: "10° flaps: 110 KIAS\n10°–30° flaps: 85 KIAS (top of the white arc).", src: POH + " §2" },
  { deck: "limits", q: "Vso and Vs1?",
    a: "Vso 40 KIAS (bottom of the white arc — landing configuration, max weight).\nVs1 48 KIAS (bottom of the green arc — flaps up).", src: POH + " §2" },
  { deck: "limits", q: "Vx and Vy (sea level)?", a: "Vx 62 KIAS (best ANGLE — obstacles).\nVy 74 KIAS (best RATE — altitude per minute).", src: POH + " §4" },
  { deck: "limits", q: "Best glide speed?", a: "68 KIAS.", src: POH + " §3" },
  { deck: "limits", q: "Rotation speed (normal takeoff)?", a: "55 KIAS.", src: POH + " §4", verify: true },
  { deck: "limits", q: "Max demonstrated crosswind?",
    a: "15 knots. Demonstrated, not a limitation — but beyond it you are a test pilot.", src: POH + " §4" },
  { deck: "limits", q: "Load factor limits?",
    a: "Flaps up: +3.8 / −1.52 G\nFlaps down: +3.0 G\n(Normal category.)", src: POH + " §2" },
  { deck: "limits", q: "Max ramp and max takeoff weight?", a: "Ramp 2,558 lb · takeoff / landing 2,550 lb.", src: POH + " §2" },
  { deck: "limits", q: "Fuel capacity?",
    a: "56 gal total, 53 usable (28 / 26.5 per tank). 3 gal unusable.", src: POH + " §2" },
  { deck: "limits", q: "Baggage limits?",
    a: "Area 1: 120 lb · Area 2: 50 lb · combined max 120 lb.", src: POH + " §2" },
  { deck: "limits", q: "Engine limits?",
    a: "Max 2,700 RPM. Oil pressure 20–115 PSI. Max oil temp 245 °F.", src: POH + " §2" },

  /* ---------------------------- systems -------------------------------- */
  { deck: "systems", q: "What engine does the 172S have?",
    a: "Lycoming IO-360-L2A: 180 hp at 2,700 RPM. Four cylinders, horizontally opposed, air-cooled, fuel-injected, normally aspirated.", src: POH + " §1" },
  { deck: "systems", q: "Why is there no carb heat in the 172S?",
    a: "It's fuel-injected — no carburetor, so no carburetor ice. If the induction air filter ices or clogs, an alternate air door opens automatically.", src: POH + " §7" },
  { deck: "systems", q: "How is the engine ignited, and why two magnetos?",
    a: "Two engine-driven magnetos, independent of the electrical system, each firing one of two plugs per cylinder. Redundancy, and more complete combustion. The engine runs with the master OFF.", src: POH + " §7" },
  { deck: "systems", q: "Oil capacity?", a: "8 quarts in the sump (9 total).", src: POH + " §1", verify: true },
  { deck: "systems", q: "Fuel system — how does fuel get to the engine?",
    a: "Two wing tanks → selector valve (LEFT / RIGHT / BOTH / OFF) → reservoir → fuel shutoff valve → strainer → engine-driven pump (electric aux pump as backup) → fuel control → manifold → injectors.", src: POH + " §7", verify: true },
  { deck: "systems", q: "Why fuel selector BOTH for takeoff, landing and maneuvers?",
    a: "It feeds from both tanks, so an unporting tank in a turn or slip, or one contaminated tank, is less likely to starve the engine.", src: POH + " §4" },
  { deck: "systems", q: "What powers the flaps, and what doesn't need electricity?",
    a: "Flaps are electric. The flight controls, engine (magnetos) and pitot-static instruments (ASI, altimeter, VSI) work with no electrical power.", src: POH + " §7" },
  { deck: "systems", q: "Pitot-static: which instruments use what?",
    a: "Pitot (ram) + static: airspeed.\nStatic only: altimeter and VSI.\nBlocked static → use alternate static air.", src: "PHAK ch. 8" },
  { deck: "systems", q: "Electrical system basics?",
    a: "28-volt DC, engine-driven alternator, main battery; G1000 airplanes add a standby battery for the essential bus. The split master is BAT and ALT.", src: POH + " §7", verify: true },

  /* -------------------------- aerodynamics ----------------------------- */
  { deck: "aero", q: "What is angle of attack?",
    a: "The angle between the wing's chord line and the relative wind. The wing stalls when it exceeds the critical AOA — at ANY airspeed, attitude or power setting.", src: "PHAK ch. 5" },
  { deck: "aero", q: "Why does stall speed rise in a turn?",
    a: "Load factor rises with bank: more lift needed means more AOA at the same speed. Stall speed rises with the square root of load factor.\n60° bank = 2 G → stall speed ×1.41 (48 → ~68 KIAS).", src: "PHAK ch. 5" },
  { deck: "aero", q: "Load factor at 30°, 45°, 60° bank (level)?", a: "30°: 1.15 G\n45°: 1.41 G\n60°: 2.0 G", src: "PHAK ch. 5" },
  { deck: "aero", q: "The four left-turning tendencies?",
    a: "Torque · spiraling slipstream · P-factor · gyroscopic precession. Strongest at high power, low airspeed, high AOA — takeoff, climbs, power-on stalls, slow flight. Fix: right rudder.", src: "PHAK ch. 5" },
  { deck: "aero", q: "What is adverse yaw?",
    a: "The rising wing has more lift and so more induced drag, which yaws the nose AWAY from the turn. Coordinate with rudder in the direction of the turn.", src: "PHAK ch. 5" },
  { deck: "aero", q: "Why is pitch for airspeed and power for altitude in slow flight?",
    a: "Below minimum-drag speed you're on the back side of the power curve: slower needs MORE power. Raising the nose slows you and increases drag, so altitude is held with power.", src: "AFH ch. 5" },
  { deck: "aero", q: "What two things cause a spin?",
    a: "The airplane must be STALLED and YAWING (one wing more stalled than the other). Usually a stall in uncoordinated flight — e.g. skidding the base-to-final turn.", src: "AFH ch. 5" },
  { deck: "aero", q: "Spin recovery (PARE)?",
    a: "Power — IDLE\nAilerons — NEUTRAL\nRudder — FULL OPPOSITE the rotation\nElevator — FORWARD, through the stall\nThen neutralize rudder and recover from the dive.", src: "AFH ch. 5 / POH §4" },
  { deck: "aero", q: "What is ground effect?",
    a: "Within about one wingspan of the ground, the ground blocks the wingtip vortices and downwash: less induced drag. The airplane floats in the flare and can lift off before it can climb.", src: "PHAK ch. 5" },
  { deck: "aero", q: "Stall warning in the 172S?", a: "A horn sounds 5–10 knots above the stall in all configurations.", src: POH + " §4" },

  /* ---------------------------- maneuvers ------------------------------ */
  { deck: "maneuver", q: "Pre-maneuver flow?",
    a: "The area call, then CAPPE:\nClearing turns\nAltitude (recover ≥1,500 AGL; ground ref 600–1,000 AGL)\nPick a heading\nPick a landmark\nEmergency landing spot", src: "School flow", verify: true },
  { deck: "maneuver", q: "Stall recovery, in order?",
    a: "1. Reduce AOA — nose down until the buffet / horn stops\n2. Roll wings level (coordinated)\n3. Add power\n4. Return to the desired flight path.\nNose BEFORE power.", src: "AFH ch. 5" },
  { deck: "maneuver", q: "Flaps after a power-off stall or go-around?",
    a: "20° immediately after full power, then 10° at a positive rate / Vx, then up at Vy. Never all at once.", src: POH + " §4 / school guide" },
  { deck: "maneuver", q: "Steep turn — when do you start the roll-out?",
    a: "About half the bank angle before the heading: ~20° early at 45° of bank.", src: "AFH ch. 10" },
  { deck: "maneuver", q: "Ground reference maneuvers — where is the bank steepest?",
    a: "Where groundspeed is highest: with the wind behind you (downwind). Shallowest heading into the wind.", src: "AFH ch. 7" },
  { deck: "maneuver", q: "Turns around a point — how do you enter?",
    a: "Downwind, at 600–1,000 AGL, at a distance that gives the radius you want, with the point off your wing.", src: "ACS PA.V.B / AFH ch. 7" },

  /* ----------------------- pattern & landings -------------------------- */
  { deck: "pattern", q: "Standard traffic pattern direction and altitude?",
    a: "Left turns unless marked otherwise. Pattern altitude typically 1,000 ft AGL for piston airplanes; check the chart supplement.", src: "AIM 4-3-3" },
  { deck: "pattern", q: "How do you enter the pattern at a non-towered field?",
    a: "45° to the downwind, at pattern altitude, abeam mid-field.", src: "AIM 4-3-3" },
  { deck: "pattern", q: "When do you go around?",
    a: "Not stabilized (speed, glidepath, centerline) · runway not clear · too high or too fast · balloon or bounce · anything doesn't look right. Decide early; full power first.", src: "AFH ch. 9" },
  { deck: "pattern", q: "Go-around (balked landing) procedure?",
    a: "Throttle FULL · flaps 20° · climb at 60 KIAS · flaps 10° until clear of obstacles · retract at a safe altitude and 65 KIAS.", src: POH + " §4" },
  { deck: "pattern", q: "Forward slip — why, and the 172S caution?",
    a: "Loses altitude without gaining airspeed: aileron one way, opposite rudder, nose straight down the runway line. The POH says to avoid steep slips with more than 20° of flaps — the elevator can oscillate.", src: POH + " §4" },
  { deck: "pattern", q: "Normal approach speed, full flaps?", a: "60–70 KIAS (POH range). The school drill uses 70 on final.", src: POH + " §4", verify: true },
  { deck: "pattern", q: "Stage 1 completion standards?",
    a: "±150 ft · ±10 kt · ±20° heading. Touchdown +1,500 / −500 ft of the intended point. Errors caught and corrected without help.", src: "Syllabus FL16" },

  /* ----------------------- student pilot & regs ------------------------ */
  { deck: "regs", q: "What must you carry to fly solo?",
    a: "Student pilot certificate, medical certificate (or BasicMed), government photo ID, and a logbook with your solo endorsements.", src: "14 CFR 61.3 / 61.51" },
  { deck: "regs", q: "Solo endorsements you need (FL16 checks 3)?",
    a: "Pre-solo aeronautical knowledge test passed · pre-solo flight training received · make and model solo endorsement (valid 90 days).", src: "14 CFR 61.87", verify: true },
  { deck: "regs", q: "Student pilot limitations?",
    a: "No passengers · no compensation or hire · not in furtherance of a business · visibility at least 3 SM day / 5 SM night · must see the surface · within your endorsement limits.", src: "14 CFR 61.89" },
  { deck: "regs", q: "VFR fuel reserve, day?", a: "Enough to reach the first point of intended landing plus 30 minutes at normal cruise (45 at night).", src: "14 CFR 91.151" },
  { deck: "regs", q: "Alcohol rules?", a: "8 hours bottle to throttle, under 0.04 BAC, and not under the influence.", src: "14 CFR 91.17" },
  { deck: "regs", q: "Right of way — head-on and converging?",
    a: "Head-on: both alter course to the RIGHT. Converging: the aircraft on the RIGHT has the right of way. Aircraft in distress over all; landing aircraft over all others.", src: "14 CFR 91.113" },
  { deck: "regs", q: "Preflight action (91.103) — NWKRAFT?",
    a: "NOTAMs · Weather · Known ATC delays · Runway lengths · Alternates · Fuel requirements · Takeoff & landing distances.", src: "14 CFR 91.103" },
  { deck: "regs", q: "Lost comms in the pattern at a towered field?",
    a: "Squawk 7600, stay clear above the pattern, determine direction of landing, enter the pattern, watch the tower for light signals. Steady green = cleared to land.", src: "AIM 4-2-13 / 6-4-1", verify: true },
  { deck: "regs", q: "Tower light signals in the air?",
    a: "Steady green: cleared to land · flashing green: return for landing · steady red: give way, keep circling · flashing red: airport unsafe, don't land · alternating red/green: exercise extreme caution.", src: "AIM 4-3-13" },

  /* ------------------------- preflight & ADM --------------------------- */
  { deck: "adm", q: "PAVE?", a: "Pilot · Aircraft · enVironment · External pressures.", src: "PHAK ch. 2" },
  { deck: "adm", q: "IMSAFE?", a: "Illness · Medication · Stress · Alcohol · Fatigue · Emotion (or Eating).", src: "PHAK ch. 2" },
  { deck: "adm", q: "Documents required on board (ARROW)?",
    a: "Airworthiness certificate · Registration · Radio station license (international only) · Operating limitations (POH/AFM) · Weight & balance.", src: "14 CFR 91.9 / 91.203" },
  { deck: "adm", q: "Required inspections (AV1ATE)?",
    a: "Annual (12 months) · VOR (IFR only) · 100-hour (for hire / instruction) · Altimeter-static (24 cal months, IFR) · Transponder (24 cal months) · ELT (12 months; battery).", src: "14 CFR 91.409 / 91.411 / 91.413 / 91.207" },
  { deck: "adm", q: "Day VFR required equipment (ATOMATOFLAMES)?",
    a: "Airspeed · Tachometer · Oil pressure · Manifold pressure (if applicable) · Altimeter · Temperature (liquid-cooled) · Oil temp · Fuel gauges · Landing gear position (retract) · Anticollision lights · Magnetic compass · ELT · Seat belts.", src: "14 CFR 91.205" },
  { deck: "adm", q: "Can you fly with inoperative equipment (no MEL)?",
    a: "Only if it isn't required by 91.205, the type certificate / equipment list, an AD or the KOEL; then remove or deactivate it and placard it INOPERATIVE.", src: "14 CFR 91.213(d)" },
  { deck: "adm", q: "Hazardous attitudes and antidotes?",
    a: "Anti-authority → follow the rules\nImpulsivity → not so fast, think first\nInvulnerability → it could happen to me\nMacho → taking chances is foolish\nResignation → I'm not helpless", src: "PHAK ch. 2" },
];

/* --------------------- decks built from other data ---------------------- */
// Memory items for every checklist the emergency drill flies; branch points
// read as their question so the order still makes sense.
function emergencyCards() {
  return EMERGENCIES.map((s) => {
    const lines = [];
    s.nodes.forEach((n) => {
      if (n.t === "item" && n.memory) lines.push(n.line);
      else if (n.t === "decision") lines.push("— " + n.prompt + " —");
    });
    const mem = lines.filter((l) => !l.startsWith("—")).length;
    return mem ? { deck: "emerg", q: s.title + " — memory items?", a: lines.join("\n"), src: "School C172S placard" } : null;
  }).filter(Boolean);
}

function maneuverCards() {
  return MANEUVERS.map((m) => ({
    deck: "maneuver", q: m.name + " — ACS standards?", a: m.standards.join("\n"), src: "ACS " + m.acs,
  }));
}

const FLASHCARDS = FLASH_BASE.concat(maneuverCards(), emergencyCards())
  .map((c, i) => Object.assign({ id: c.deck + "-" + i }, c));
