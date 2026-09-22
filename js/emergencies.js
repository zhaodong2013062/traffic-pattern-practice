/* ============================================================================
   emergencies.js  —  Source of truth for the EMERGENCY PROCEDURES drill.

   Same interaction model as the pattern trainer: the pilot is given only the
   situation, must click the right control, then pick the right setting. What
   differs here is that a scenario is a *checklist*, not a flight path:

     - Items run in QRH order, EXCEPT within a group: consecutive items that
       share a `g` may be done in any order (killing the fuel, the spark and
       the master is one action in the pilot's head, not three ordered ones).
       All of them must be done before the checklist moves on.
     - Memory items (bold on the card) run CLOSED-BOOK: the checklist is not
       shown and the hint button is withheld until the pilot explicitly asks
       to read it, which is recorded in the debrief.
     - Reference items show their checklist block while the pilot works it.
     - `decision` nodes carry the card's real branches ("If Risk of Fire",
       "If Engine Starts"), and pick the correct branch from the situation.

   Every scenario stands on its own: `situation` says what is happening now
   without assuming the pilot just flew some other scenario, and `state` is the
   one-line aircraft state shown on the setup card before the drill arms.
   A `handoff` node whose `continues` names another scenario rolls straight on
   into that checklist, which is how the card's "Forced Landing Checklist"
   pointer actually gets flown.

   Node shapes (executed in order; `label`/`goto` handle the branches):
     { t:"item",  line, control, correct, memory, options?, values?, note? }
     { t:"decision", prompt, options:[{ label, goto, correct? }] }
     { t:"handoff", line, text, continues? } a pointer to another checklist
   `goto:"end"` finishes the scenario.

   SOURCE: the school's C172S (G1000) emergency placard, corroborated against
   the C172S POH Section 3 checklists. One deliberate deviation is noted
   inline: the POH prints 70 KIAS flaps-up for engine failure immediately
   after takeoff; the placard (and this drill) use the 68 KIAS best-glide
   figure the school teaches.
   ========================================================================== */

const EMERGENCY_GROUPS = {
  ENGINE:  { name: "ENGINE FAILURE", color: "#2f5fd0" },
  FIRE:    { name: "FIRE",           color: "#c0392b" },
  FORCED:  { name: "FORCED LANDING", color: "#e8590c" },
  ICING:   { name: "ICING",          color: "#2980b9" },
};

/* Default menu per control. Items override with `options` only where the
   default would give the answer away or read wrong for that checklist. */
const EMER_CONTROL_OPTIONS = {
  throttle:    ["IDLE", "FULL", "1800 RPM for 2 min", "300 ft/min descent at 55 KIAS"],
  mixture:     ["RICH", "LEAN", "IDLE CUTOFF"],
  fuelshutoff: ["PULL OFF", "PUSH IN (full in)"],
  fuelpump:    ["ON", "OFF"],
  fuel:        ["BOTH", "LEFT", "RIGHT", "OFF"],
  magnetos:    ["BOTH", "START", "OFF", "CHECK (L / R / BOTH)"],
  master:      ["ON", "OFF"],
  stbybatt:    ["ARM", "ON", "OFF"],
  avionics:    ["ON", "OFF"],
  allswitches: ["All OFF (except magnetos)", "All ON"],
  breakers:    ["CHECK", "PULL ALL", "RESET ALL"],
  flaps:       ["UP (0°)", "10°", "20°", "FULL (30°)", "As required"],
  /* Airspeed is FLOWN, not selected: pitch with the yoke, read the ASI. */
  yoke:        ["Pitch for 68 KIAS — best glide", "Pitch for 100+ KIAS",
                "Hold the nose up to stretch the glide", "Lower the nose and accelerate"],
  vents:       ["OPEN", "CLOSED"],
  cabinheat:   ["PULL ON", "OFF", "CLOSED"],
  defroster:   ["OPEN", "CLOSED"],
  pitotheat:   ["ON", "OFF"],
  altstatic:   ["PULL ON", "OFF"],
  lights:      ["OFF", "ON"],
  extinguisher:["USE IT — as required", "OBTAIN / get it in hand", "STOW"],
  elt:         ["ON", "ARM", "TEST"],
  doors:       ["UNLATCH", "LATCH / secure", "UNLATCH AND GET OUT"],
  seatbelt:    ["SECURE", "RELEASE"],
  call:        ["MAYDAY — squawk 7700", "Announce your intentions", "Request a straight-in"],
  autopilot:   ["DISCONNECT", "ON", "OFF"],
  rudder:      ["Sideslip to keep the flames clear", "Track the centerline", "Centre the ball"],
  brakes:      ["APPLY", "RELEASE"],
  outside:     ["Select a landing area", "Keep scanning the instruments", "Turn back to the field"],
  action:      ["Land as soon as practical", "Continue to the destination",
                "Climb and hold"],
};

/* Shorthand: an item node. */
const it = (line, control, correct, opts = {}) =>
  Object.assign({ t: "item", line, control, correct, memory: true }, opts);

const EMERGENCIES = [
  /* ====================== ENGINE FAILURE ================================ */
  {
    id: "ef-takeoff-roll", group: "ENGINE",
    title: "Engine Failure During Takeoff",
    card: "ENGINE FAILURE · DURING TAKEOFF",
    situation: "Takeoff roll on runway 14, accelerating through 40 KIAS. The " +
      "engine coughs, loses power, and you smell raw fuel. There is still " +
      "runway ahead of you.",
    state: "On the runway · 40 KIAS · power failing · raw fuel smell",
    values: { rpm: 700, ias: 40, alt: 0, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 140 },
    nodes: [
      it("THROTTLE — IDLE", "throttle", "IDLE", { values: { rpm: 500, ias: 30 } }),
      it("BRAKES — APPLY", "brakes", "APPLY", { values: { ias: 10 } }),
      {
        t: "decision",
        prompt: "Stopped on the runway. Is there a risk of fire?",
        options: [
          { label: "Yes — raw fuel smell, secure the airplane", goto: "secure", correct: true },
          { label: "No — hold position and call the tower", goto: "end" },
        ],
      },
      it("MIXTURE — IDLE CUTOFF", "mixture", "IDLE CUTOFF",
         { label: "secure", g: "secure the engine", values: { rpm: 0 } }),
      it("FUEL SHUTOFF — PULL OFF", "fuelshutoff", "PULL OFF", { g: "secure the engine" }),
      it("MAGNETOS — OFF", "magnetos", "OFF", { g: "secure the engine" }),
      it("MASTER — OFF", "master", "OFF"),
      it("COMMS — ANNOUNCE", "call", "Announce your intentions", { memory: false }),
      it("STBY BATT — OFF", "stbybatt", "OFF"),
      it("AIRPLANE — EVACUATE", "doors", "UNLATCH AND GET OUT", { memory: false }),
    ],
  },
  {
    id: "ef-after-takeoff", group: "ENGINE",
    title: "Engine Failure After Takeoff",
    card: "ENGINE FAILURE · AFTER TAKEOFF",
    situation: "Just airborne off runway 14, climbing through 400 ft AGL with " +
      "the flaps up. The engine goes quiet. There is open field ahead and no " +
      "runway left behind you.",
    state: "400 ft AGL · 70 KIAS · flaps up · engine out",
    values: { rpm: 600, ias: 70, alt: 400, flaps: 0, vsi: -600, pitch: -3, bank: 0, hdg: 140 },
    nodes: [
      /* POH prints 70 KIAS flaps-up here; the placard teaches best glide. */
      it("AIRSPEED — 68 KIAS FLAPS UP / 65 KIAS FLAPS DOWN", "yoke",
         "Pitch for 68 KIAS — 65 with the flaps down",
         { options: ["Pitch for 68 KIAS — 65 with the flaps down", "Pitch for 100+ KIAS",
                     "Hold the nose up to stretch the glide", "Turn back toward the runway"],
           values: { ias: 68, vsi: -700, pitch: -4 },
           note: "Do not attempt to turn back to the runway. Land within about 30° of straight ahead." }),
      it("MIXTURE — IDLE CUTOFF", "mixture", "IDLE CUTOFF", { g: "secure the engine", values: { rpm: 0 } }),
      it("FUEL SHUTOFF — PULL OFF", "fuelshutoff", "PULL OFF", { g: "secure the engine" }),
      it("MAGNETOS — OFF", "magnetos", "OFF", { g: "secure the engine" }),
      it("WING FLAPS — AS REQUIRED", "flaps", "As required", { memory: false, values: { flaps: 20 } }),
      it("STBY BATT — OFF", "stbybatt", "OFF", { g: "electrics off" }),
      it("MASTER — OFF", "master", "OFF", { memory: false, g: "electrics off" }),
      it("CABIN DOOR — UNLATCHED", "doors", "UNLATCH", { memory: false, values: { alt: 150, ias: 65 } }),
    ],
  },
  {
    id: "ef-in-flight", group: "ENGINE",
    title: "Engine Failure In Flight",
    card: "ENGINE FAILURE · IN FLIGHT",
    situation: "Cruise at 3,500 ft, ten miles out from the field. The engine " +
      "stops making power and the propeller is windmilling.",
    state: "3,500 ft · 100 KIAS · engine out, prop windmilling",
    values: { rpm: 800, ias: 100, alt: 3500, flaps: 0, vsi: -400, pitch: -2, bank: 0, hdg: 140 },
    nodes: [
      it("AIRSPEED — 68 KIAS", "yoke", "Pitch for 68 KIAS — best glide",
         { values: { ias: 68, vsi: -700, pitch: -3 } }),
      it("LANDING AREA — SELECT", "outside", "Select a landing area"),
      /* The placard runs the boost pump partway down the restart list. It goes
         first here: if the engine-driven pump has quit or the engine is fuel
         starved, the boost pump is the one switch that brings it back, and it
         costs nothing to have it running while the rest of the flow is worked.
         Moved rather than repeated, so the item is not asked twice. */
      it("FUEL PUMP — ON", "fuelpump", "ON",
         { g: "fuel to the engine",
           note: "Boost pump first — if it is fuel starvation or a failed " +
                 "engine-driven pump, this is what brings the engine back." }),
      it("FUEL SHUTOFF — PUSH IN (ON)", "fuelshutoff", "PUSH IN (full in)", { g: "fuel to the engine" }),
      it("FUEL SELECTOR — BOTH", "fuel", "BOTH", { g: "fuel to the engine" }),
      it("MIXTURE — RICH", "mixture", "RICH", { g: "fuel to the engine" }),
      it("MAGNETOS — CHECK", "magnetos", "CHECK (L / R / BOTH)",
         { note: "Start position if the propeller has stopped windmilling." }),
      { t: "handoff", line: "FORCED LANDING CHECKLIST", continues: "forced-no-power",
        text: "The engine will not restart. Fly the airplane to the field you " +
              "picked and run the Emergency Landing Without Engine Power checklist." },
    ],
  },

  /* ============================== FIRE ================================== */
  {
    id: "fire-start-ground", group: "FIRE",
    title: "Engine Fire During Start",
    card: "FIRE · DURING START ON GROUND",
    situation: "On the ramp at engine start. The engine is over-primed and " +
      "flames are visible in the induction air intake. It has not caught.",
    state: "Parked · engine not running · fire in the intake",
    values: { rpm: 0, ias: 0, alt: 0, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 140 },
    nodes: [
      it("MAGNETOS — START (keep cranking)", "magnetos", "START",
         { note: "Cranking draws the fire back into the engine." }),
      {
        t: "decision",
        prompt: "You keep cranking. The engine does not catch. " +
                "Which branch of the card are you on?",
        options: [
          { label: "It started — run it at 1800 RPM, then shut down", goto: "started" },
          { label: "It will not start — keep cranking and secure the airplane",
            goto: "nostart", correct: true },
        ],
      },
      it("THROTTLE — 1800 RPM FOR 2 MIN", "throttle", "1800 RPM for 2 min",
         { label: "started", values: { rpm: 1800 } }),
      it("ENGINE — SHUTDOWN", "mixture", "IDLE CUTOFF",
         { values: { rpm: 0 }, goto: "end" }),

      it("THROTTLE — FULL", "throttle", "FULL", { label: "nostart", g: "set up to clear the fire" }),
      it("MIXTURE — IDLE CUTOFF", "mixture", "IDLE CUTOFF", { g: "set up to clear the fire" }),
      it("MAGNETOS — START (keep cranking)", "magnetos", "START"),
      it("FUEL SHUTOFF — PULL OFF", "fuelshutoff", "PULL OFF", { g: "secure the engine" }),
      it("FUEL PUMP — OFF", "fuelpump", "OFF", { g: "secure the engine" }),
      it("MAGNETOS — OFF", "magnetos", "OFF", { g: "secure the engine" }),
      it("STBY BATT — OFF", "stbybatt", "OFF", { g: "electrics off" }),
      it("MASTER — OFF", "master", "OFF", { g: "electrics off" }),
      it("FIRE EXTINGUISHER — OBTAIN", "extinguisher", "OBTAIN / get it in hand", { memory: false }),
      it("AIRPLANE — EVACUATE", "doors", "UNLATCH AND GET OUT", { memory: false }),
      it("FIRE — EXTINGUISH", "extinguisher", "USE IT — as required", { memory: false }),
    ],
  },
  {
    id: "fire-engine-flight", group: "FIRE",
    title: "Engine Fire In Flight",
    card: "FIRE · ENGINE FIRE IN FLIGHT",
    situation: "Cruise at 2,500 ft. Flame and heavy smoke stream back from the " +
      "engine cowling.",
    state: "2,500 ft · 110 KIAS · engine fire",
    values: { rpm: 2300, ias: 110, alt: 2500, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 140 },
    nodes: [
      it("MIXTURE — IDLE CUTOFF", "mixture", "IDLE CUTOFF", { g: "starve the fire", values: { rpm: 0 } }),
      it("FUEL SHUTOFF — PULL OFF", "fuelshutoff", "PULL OFF", { g: "starve the fire" }),
      it("FUEL PUMP — OFF", "fuelpump", "OFF", { g: "starve the fire" }),
      it("MASTER — OFF", "master", "OFF"),
      it("CABIN VENTS — OPEN", "vents", "OPEN", { memory: false, g: "keep the smoke out" }),
      it("CABIN HT / AIR — OFF", "cabinheat", "OFF", { g: "keep the smoke out" }),
      it("AIRSPEED — 100+ KIAS", "yoke", "Pitch for 100+ KIAS",
         { memory: false, values: { ias: 105, vsi: -900, pitch: -6, alt: 2100 },
           note: "A higher speed helps blow the fire out." }),
      { t: "handoff", line: "FORCED LANDING CHECKLIST", continues: "forced-no-power",
        text: "The engine is secured and the fire is starved of fuel. Run the " +
              "Emergency Landing Without Engine Power checklist." },
    ],
  },
  {
    id: "fire-electrical", group: "FIRE",
    title: "Electrical Fire In Flight",
    card: "FIRE · ELECTRICAL FIRE IN FLIGHT",
    situation: "Night cross-country at 3,000 ft. Acrid smoke and the smell of " +
      "burning insulation fill the cabin, and the ammeter shows a heavy discharge.",
    state: "Night · 3,000 ft · 110 KIAS · electrical smoke",
    values: { rpm: 2300, ias: 110, alt: 3000, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 140 },
    nodes: [
      it("STBY BATT — OFF", "stbybatt", "OFF", { g: "electrics off" }),
      it("MASTER — OFF", "master", "OFF", { g: "electrics off" }),
      it("CABIN VENTS / AIR / HEAT — CLOSED", "vents", "CLOSED"),
      it("FIRE EXTINGUISHER — AS REQUIRED", "extinguisher", "USE IT — as required"),
      it("AVIONICS (BUS 1 / 2) — OFF", "avionics", "OFF", { memory: false, g: "isolate the buses" }),
      it("ALL SWITCHES (except magnetos) — OFF", "allswitches", "All OFF (except magnetos)",
         { memory: false, g: "isolate the buses",
           note: "Once the extinguisher has been used, make sure the fire is out " +
                 "BEFORE using outside air to clear the smoke." }),
      it("CABIN VENTS / AIR / WINDOWS — OPEN", "vents", "OPEN",
         { memory: false, g: "once the fire is out" }),
      it("CIRCUIT BREAKERS — CHECK", "breakers", "CHECK", { memory: false, g: "once the fire is out" }),
      {
        t: "decision",
        prompt: "The fire is out and the airplane is cold and dark. It is night. " +
                "Do you need electrical power to get down safely?",
        options: [
          { label: "Yes — you need lights and radios to land", goto: "power", correct: true },
          { label: "No — stay cold and dark", goto: "end" },
        ],
      },
      it("MASTER — ON", "master", "ON", { label: "power", memory: false }),
      it("STBY BATT — ARM", "stbybatt", "ARM", { memory: false }),
      it("AVIONICS (BUS 1 / 2) — ON", "avionics", "ON", { memory: false }),
      it("LAND — AS SOON AS PRACTICAL", "action", "Land as soon as practical", { memory: false }),
    ],
  },
  {
    id: "fire-cabin", group: "FIRE",
    title: "Cabin Fire",
    card: "FIRE · CABIN FIRE",
    situation: "Cruise at 2,500 ft. Smoke is pouring from behind the instrument " +
      "panel — the fire is in the cabin itself.",
    state: "2,500 ft · 105 KIAS · smoke in the cabin",
    values: { rpm: 2300, ias: 105, alt: 2500, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 140 },
    nodes: [
      it("STBY BATT — OFF", "stbybatt", "OFF", { g: "electrics off" }),
      it("MASTER — OFF", "master", "OFF", { g: "electrics off" }),
      it("CABIN VENTS / AIR / HEAT — CLOSED", "vents", "CLOSED"),
      it("FIRE EXTINGUISHER — AS REQUIRED", "extinguisher", "USE IT — as required",
         { note: "Make sure the fire is out BEFORE using outside air to clear the smoke." }),
      it("CABIN VENTS / AIR / WINDOWS — OPEN", "vents", "OPEN", { memory: false }),
      it("LAND — AS SOON AS PRACTICAL", "action", "Land as soon as practical", { memory: false }),
    ],
  },
  {
    id: "fire-wing", group: "FIRE",
    title: "Wing Fire",
    card: "FIRE · WING FIRE",
    situation: "Cruise at 2,500 ft. There is fire on the left wing, out at the " +
      "nav/strobe light.",
    state: "2,500 ft · 105 KIAS · fire on the left wing",
    values: { rpm: 2300, ias: 105, alt: 2500, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 140 },
    nodes: [
      it("LIGHTS — OFF", "lights", "OFF", { g: "kill the wing electrics" }),
      it("PITOT HEAT — OFF", "pitotheat", "OFF", { g: "kill the wing electrics" }),
      it("SIDESLIP — AS NECESSARY", "rudder", "Sideslip to keep the flames clear",
         { memory: false, values: { bank: 8 },
           note: "Sideslip to keep the flames away from the fuel tank and the cabin." }),
      it("LAND — AS SOON AS PRACTICAL", "action", "Land as soon as practical", { memory: false }),
    ],
  },

  /* ========================= FORCED LANDING ============================= */
  {
    id: "forced-no-power", group: "FORCED",
    title: "Forced Landing — No Engine Power",
    card: "FORCED LANDING · NO ENGINE POWER",
    situation: "The engine has failed and will not restart — the restart flow " +
      "is done and the propeller has stopped. You are gliding through 1,800 ft " +
      "with a field picked and made.",
    state: "1,800 ft · gliding 68 KIAS · engine out, will not restart",
    values: { rpm: 400, ias: 68, alt: 1800, flaps: 0, vsi: -700, pitch: -4, bank: 0, hdg: 140 },
    nodes: [
      it("AIRSPEED — 68 KIAS FLAPS UP / 65 KIAS FLAPS DOWN", "yoke",
         "Pitch for 68 KIAS — 65 with the flaps down",
         { memory: false,
           options: ["Pitch for 68 KIAS — 65 with the flaps down", "Pitch for 100+ KIAS",
                     "Hold the nose up to stretch the glide"] }),
      it("TRANSMIT — MAYDAY / 7700", "call", "MAYDAY — squawk 7700", { memory: false, g: "tell someone" }),
      it("ELT — ON", "elt", "ON", { memory: false, g: "tell someone" }),
      it("FUEL SHUTOFF — PULL OFF", "fuelshutoff", "PULL OFF", { memory: false, g: "secure the engine" }),
      it("MIXTURE — IDLE CUTOFF", "mixture", "IDLE CUTOFF",
         { memory: false, g: "secure the engine", values: { rpm: 0 } }),
      it("MAGNETOS — OFF", "magnetos", "OFF", { memory: false, g: "secure the engine" }),
      it("WING FLAPS — AS REQUIRED", "flaps", "As required",
         { memory: false, values: { flaps: 30, ias: 65, alt: 900 } }),
      it("STBY BATT — OFF", "stbybatt", "OFF", { memory: false, g: "electrics off" }),
      it("MASTER — OFF", "master", "OFF", { memory: false, g: "electrics off" }),
      it("SEATS / BELTS — SECURE", "seatbelt", "SECURE", { memory: false, g: "prepare the cabin" }),
      it("DOORS — UNLATCH", "doors", "UNLATCH",
         { memory: false, g: "prepare the cabin", values: { alt: 200, vsi: -500 } }),
    ],
  },
  {
    id: "forced-with-power", group: "FORCED",
    title: "Precautionary Landing — With Engine Power",
    card: "FORCED LANDING · WITH ENGINE POWER",
    situation: "Weather has closed in below you and you are low on fuel. The " +
      "engine is still running, and you have decided to put it down in a field " +
      "rather than press on.",
    state: "1,200 ft · 90 KIAS · engine running · field selected",
    values: { rpm: 2000, ias: 90, alt: 1200, flaps: 0, vsi: -300, pitch: -2, bank: 0, hdg: 140 },
    nodes: [
      it("LANDING AREA — SELECT", "outside", "Select a landing area", { memory: false }),
      it("TRANSMIT — MAYDAY / 7700", "call", "MAYDAY — squawk 7700", { memory: false, g: "tell someone" }),
      it("ELT — ON", "elt", "ON", { memory: false, g: "tell someone" }),
      it("FLAPS — AS REQUIRED", "flaps", "As required", { memory: false, values: { flaps: 20, ias: 75 } }),
      it("AIRSPEED — 68 KIAS FLAPS UP / 65 KIAS FLAPS DOWN", "yoke",
         "Pitch for 68 KIAS — 65 with the flaps down",
         { memory: false, values: { ias: 65, alt: 600 },
           options: ["Pitch for 68 KIAS — 65 with the flaps down", "Pitch for 100+ KIAS",
                     "Hold the nose up to stretch the glide"] }),
      it("STBY BATT — OFF", "stbybatt", "OFF", { memory: false, g: "electrics off" }),
      it("MASTER — OFF", "master", "OFF", { memory: false, g: "electrics off" }),
      it("SEATS / BELTS — SECURE", "seatbelt", "SECURE", { memory: false, g: "prepare the cabin" }),
      it("DOORS — UNLATCH", "doors", "UNLATCH", { memory: false, g: "prepare the cabin", values: { alt: 150 } }),
      { t: "handoff", line: "AFTER TOUCHDOWN — SECURING CHECKLIST",
        text: "Down and stopped. Run the Securing checklist." },
    ],
  },
  {
    id: "forced-ditching", group: "FORCED",
    title: "Water Ditching",
    card: "FORCED LANDING · WATER DITCHING",
    situation: "Engine out over open water at 1,500 ft, high wind and heavy " +
      "seas. There is no shoreline within gliding distance.",
    state: "1,500 ft · gliding 68 KIAS · open water · high wind, heavy seas",
    values: { rpm: 500, ias: 68, alt: 1500, flaps: 0, vsi: -600, pitch: -4, bank: 0, hdg: 140 },
    nodes: [
      it("LANDING AREA — SELECT", "outside", "Select a landing area", { memory: false }),
      it("TRANSMIT — MAYDAY / 7700", "call", "MAYDAY — squawk 7700", { memory: false, g: "tell someone" }),
      it("ELT — ON", "elt", "ON", { memory: false, g: "tell someone" }),
      it("SEATS / BELTS — SECURE", "seatbelt", "SECURE", { memory: false }),
      it("WING FLAPS — FULL", "flaps", "FULL (30°)", { memory: false, values: { flaps: 30, ias: 60 } }),
      it("POWER — 300 FT/MIN DESCENT AT 55 KIAS", "throttle", "300 ft/min descent at 55 KIAS",
         { memory: false, values: { rpm: 1200, ias: 55, vsi: -300, alt: 700 },
           note: "High wind and heavy seas: touch down into the wind. Light wind " +
                 "and heavy swells: land parallel to the swells." }),
      it("DOORS — UNLATCH", "doors", "UNLATCH", { memory: false }),
      it("TOUCHDOWN — LEVEL AND STABILIZED", "yoke",
         "Hold a level attitude at the established rate of descent",
         { memory: false, values: { alt: 0, vsi: 0, pitch: 2 },
           options: ["Hold a level attitude at the established rate of descent",
                     "Flare and hold it off", "Nose low into the water"] }),
      it("AIRPLANE — EVACUATE", "doors", "UNLATCH AND GET OUT", { memory: false }),
    ],
  },

  /* ============================== ICING ================================= */
  {
    id: "icing-flight", group: "ICING",
    title: "Inadvertent Icing Encounter",
    card: "ICING · DURING FLIGHT",
    situation: "In cloud at 5,000 ft, +1°C. Clear ice is building on the wing " +
      "struts and the windshield is glazing over.",
    state: "5,000 ft · 95 KIAS · in cloud, +1°C · ice building",
    values: { rpm: 2300, ias: 95, alt: 5000, flaps: 0, vsi: 0, pitch: 1, bank: 0, hdg: 140 },
    nodes: [
      it("PITOT HEAT — ON", "pitotheat", "ON", { g: "protect the airspeed, hand-fly it" }),
      it("AUTOPILOT — DISCONNECT", "autopilot", "DISCONNECT",
         { g: "protect the airspeed, hand-fly it",
           note: "Hand-fly it — an autopilot can mask the changing trim as ice builds." }),
      it("ICING CONDITIONS — EXIT", "yoke", "Turn back and change altitude to get out of it",
         { options: ["Turn back and change altitude to get out of it",
                     "Hold this altitude and heading", "Climb deeper into the cloud"],
           values: { alt: 4200, vsi: -500, hdg: 320 },
           note: "Turn back or change altitude for an outside air temperature that " +
                 "is less conducive to icing." }),
      it("CABIN HEAT — PULL ON", "cabinheat", "PULL ON", { g: "clear the windshield" }),
      it("DEFROSTER OUTLETS — OPEN", "defroster", "OPEN", { g: "clear the windshield" }),
      { t: "handoff", line: "CONTINUE QRH 7-1",
        text: "Memory items complete. Continue with QRH 7-1 for the rest of the " +
              "icing procedure." },
    ],
  },
  {
    id: "icing-static", group: "ICING",
    title: "Static Source Blockage",
    card: "ICING · STATIC SOURCE BLOCKAGE",
    situation: "Climbing through 3,000 ft in visible moisture. The altimeter " +
      "has frozen, the VSI reads zero in the climb and the airspeed is reading " +
      "low — the static port is blocked.",
    state: "3,000 ft · climbing · altimeter frozen, VSI zero",
    values: { rpm: 2300, ias: 80, alt: 3000, flaps: 0, vsi: 0, pitch: 4, bank: 0, hdg: 140 },
    nodes: [
      it("ALTERNATE STATIC AIR — PULL ON", "altstatic", "PULL ON",
         { values: { ias: 95, vsi: 500 },
           note: "Indications come from cabin air, so expect a slightly high " +
                 "altimeter and airspeed." }),
      it("CABIN HT / AIR — PULL ON", "cabinheat", "PULL ON", { g: "settle the cabin pressure" }),
      it("CABIN VENTS — CLOSED", "vents", "CLOSED", { memory: false, g: "settle the cabin pressure" }),
      { t: "handoff", line: "CONTINUE QRH 7-2",
        text: "Continue with QRH 7-2 for the rest of the procedure." },
    ],
  },
];
