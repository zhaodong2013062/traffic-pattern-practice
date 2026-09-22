/* ============================================================================
   emergencies.js  —  Source of truth for the EMERGENCY PROCEDURES drill.

   Same interaction model as the pattern trainer: the pilot is given only the
   situation, must click the right control, then pick the right setting. What
   differs here is that a scenario is a *checklist*, not a flight path:

     - Items run in QRH order. Wrong item / wrong value = red, no advance.
     - Memory items (bold on the card) run CLOSED-BOOK: the checklist is not
       shown and the hint button is withheld until the pilot explicitly asks
       to read it, which is recorded in the debrief.
     - Reference items show their checklist block while the pilot works it.
     - `decision` nodes carry the card's real branches ("If Risk of Fire",
       "If Engine Starts"), and pick the correct branch from the situation.

   Node shapes (executed in order; `label`/`goto` handle the branches):
     { t:"item",  line, control, correct, memory, options?, values?, note? }
     { t:"decision", prompt, options:[{ label, goto, correct? }] }
     { t:"handoff", line, text }          a pointer to another checklist
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
  brakes:      ["APPLY", "RELEASE"],
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
  asi:         ["68 KIAS flaps up · 65 KIAS flaps down", "68 KIAS", "100+ KIAS", "55 KIAS"],
  vents:       ["OPEN", "CLOSED"],
  cabinheat:   ["PULL ON", "OFF", "CLOSED"],
  defroster:   ["OPEN", "CLOSED"],
  pitotheat:   ["ON", "OFF"],
  altstatic:   ["PULL ON", "OFF"],
  lights:      ["OFF", "ON"],
  extinguisher:["ACTIVATE — as required", "OBTAIN", "STOW"],
  elt:         ["ON", "ARM", "TEST"],
  doors:       ["UNLATCH", "LATCH / secure"],
  seatbelt:    ["SECURE", "RELEASE"],
  call:        ["MAYDAY — squawk 7700", "Announce your intentions", "Request a straight-in"],
  autopilot:   ["DISCONNECT", "ON", "OFF"],
  rudder:      ["Sideslip to keep the flames clear", "Track the centerline", "Apply brakes"],
  yoke:        ["Level attitude at the established rate of descent", "Flare and hold it off", "Nose low"],
  outside:     ["Select a landing area", "Keep scanning the instruments", "Turn back to the field"],
  action:      ["Evacuate the airplane", "Land as soon as practical",
                "Put the fire out with the extinguisher", "Shut the engine down"],
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
    situation: "Takeoff roll, accelerating through 40 KIAS. The engine coughs, " +
      "loses power and you smell raw fuel — there is still runway ahead of you.",
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
      it("MIXTURE — IDLE CUTOFF", "mixture", "IDLE CUTOFF", { label: "secure", values: { rpm: 0 } }),
      it("FUEL SHUTOFF — PULL OFF", "fuelshutoff", "PULL OFF"),
      it("MAGNETOS — OFF", "magnetos", "OFF"),
      it("MASTER — OFF", "master", "OFF"),
      it("COMMS — ANNOUNCE", "call", "Announce your intentions", { memory: false }),
      it("STBY BATT — OFF", "stbybatt", "OFF"),
      it("AIRPLANE — EVACUATE", "action", "Evacuate the airplane", { memory: false }),
    ],
  },
  {
    id: "ef-after-takeoff", group: "ENGINE",
    title: "Engine Failure After Takeoff",
    card: "ENGINE FAILURE · AFTER TAKEOFF",
    situation: "Climbing through 400 ft AGL off the departure end, flaps up. " +
      "The engine goes quiet. There is open field ahead, no runway left behind you.",
    values: { rpm: 600, ias: 70, alt: 400, flaps: 0, vsi: -600, pitch: -3, bank: 0, hdg: 140 },
    nodes: [
      /* POH prints 70 KIAS flaps-up here; the placard teaches best glide. */
      it("AIRSPEED — 68 KIAS FLAPS UP / 65 KIAS FLAPS DOWN", "asi",
         "68 KIAS flaps up · 65 KIAS flaps down",
         { values: { ias: 68, vsi: -700, pitch: -4 },
           note: "Do not attempt to turn back to the runway. Land within about 30° of straight ahead." }),
      it("MIXTURE — IDLE CUTOFF", "mixture", "IDLE CUTOFF", { values: { rpm: 0 } }),
      it("FUEL SHUTOFF — PULL OFF", "fuelshutoff", "PULL OFF"),
      it("MAGNETOS — OFF", "magnetos", "OFF"),
      it("WING FLAPS — AS REQUIRED", "flaps", "As required", { memory: false, values: { flaps: 20 } }),
      it("STBY BATT — OFF", "stbybatt", "OFF"),
      it("MASTER — OFF", "master", "OFF", { memory: false }),
      it("CABIN DOOR — UNLATCHED", "doors", "UNLATCH", { memory: false, values: { alt: 150, ias: 65 } }),
    ],
  },
  {
    id: "ef-in-flight", group: "ENGINE",
    title: "Engine Failure In Flight",
    card: "ENGINE FAILURE · IN FLIGHT",
    situation: "Cruise, 3,500 ft, well clear of the airport. The engine stops " +
      "making power and the propeller is windmilling.",
    values: { rpm: 800, ias: 100, alt: 3500, flaps: 0, vsi: -400, pitch: -2, bank: 0, hdg: 140 },
    nodes: [
      it("AIRSPEED — 68 KIAS", "asi", "68 KIAS", { values: { ias: 68, vsi: -700 } }),
      it("LANDING AREA — SELECT", "outside", "Select a landing area"),
      it("FUEL SHUTOFF — PUSH IN (ON)", "fuelshutoff", "PUSH IN (full in)"),
      it("FUEL SELECTOR — BOTH", "fuel", "BOTH"),
      it("MIXTURE — RICH", "mixture", "RICH"),
      it("FUEL PUMP — ON", "fuelpump", "ON"),
      it("MAGNETOS — CHECK", "magnetos", "CHECK (L / R / BOTH)",
         { note: "Start position if the propeller has stopped windmilling." }),
      { t: "handoff", line: "FORCED LANDING CHECKLIST",
        text: "No restart. Fly the airplane to the field you picked and run the " +
              "Emergency Landing Without Engine Power checklist." },
    ],
  },

  /* ============================== FIRE ================================== */
  {
    id: "fire-start-ground", group: "FIRE",
    title: "Engine Fire During Start",
    card: "FIRE · DURING START ON GROUND",
    situation: "On the ramp, cranking. The engine is over-primed and flames are " +
      "visible in the cowling air intake. It has not started.",
    values: { rpm: 0, ias: 0, alt: 0, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 140 },
    nodes: [
      it("MAGNETOS — START (keep cranking)", "magnetos", "START",
         { note: "Cranking draws the fire back into the engine." }),
      {
        t: "decision",
        prompt: "Does the engine start?",
        options: [
          { label: "It starts and runs", goto: "started" },
          { label: "It will not start", goto: "nostart", correct: true },
        ],
      },
      it("THROTTLE — 1800 RPM FOR 2 MIN", "throttle", "1800 RPM for 2 min",
         { label: "started", values: { rpm: 1800 } }),
      it("ENGINE — SHUTDOWN", "action", "Shut the engine down",
         { values: { rpm: 0 }, goto: "end" }),

      it("THROTTLE — FULL", "throttle", "FULL", { label: "nostart" }),
      it("MIXTURE — IDLE CUTOFF", "mixture", "IDLE CUTOFF"),
      it("MAGNETOS — START (keep cranking)", "magnetos", "START"),
      it("FUEL SHUTOFF — PULL OFF", "fuelshutoff", "PULL OFF"),
      it("FUEL PUMP — OFF", "fuelpump", "OFF"),
      it("MAGNETOS — OFF", "magnetos", "OFF"),
      it("STBY BATT — OFF", "stbybatt", "OFF"),
      it("MASTER — OFF", "master", "OFF"),
      it("FIRE EXTINGUISHER — OBTAIN", "extinguisher", "OBTAIN", { memory: false }),
      it("AIRPLANE — EVACUATE", "action", "Evacuate the airplane", { memory: false }),
      it("FIRE — EXTINGUISH", "action", "Put the fire out with the extinguisher", { memory: false }),
    ],
  },
  {
    id: "fire-engine-flight", group: "FIRE",
    title: "Engine Fire In Flight",
    card: "FIRE · ENGINE FIRE IN FLIGHT",
    situation: "Cruise at 2,500 ft. Flame and heavy smoke are streaming back from " +
      "the engine cowling.",
    values: { rpm: 2300, ias: 110, alt: 2500, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 140 },
    nodes: [
      it("MIXTURE — IDLE CUTOFF", "mixture", "IDLE CUTOFF", { values: { rpm: 0 } }),
      it("FUEL SHUTOFF — PULL OFF", "fuelshutoff", "PULL OFF"),
      it("FUEL PUMP — OFF", "fuelpump", "OFF"),
      it("MASTER — OFF", "master", "OFF"),
      it("CABIN VENTS — OPEN", "vents", "OPEN", { memory: false }),
      it("CABIN HT / AIR — OFF", "cabinheat", "OFF"),
      it("AIRSPEED — 100+ KIAS", "asi", "100+ KIAS",
         { memory: false, values: { ias: 105, vsi: -900, pitch: -6, alt: 2100 },
           note: "A higher speed helps blow the fire out." }),
      { t: "handoff", line: "FORCED LANDING CHECKLIST",
        text: "The engine is secured and the fire is starved of fuel. Run the " +
              "Emergency Landing Without Engine Power checklist." },
    ],
  },
  {
    id: "fire-electrical", group: "FIRE",
    title: "Electrical Fire In Flight",
    card: "FIRE · ELECTRICAL FIRE IN FLIGHT",
    situation: "Cruise. Acrid smoke and the smell of burning insulation fill the " +
      "cabin; the ammeter is showing a heavy discharge.",
    values: { rpm: 2300, ias: 110, alt: 3000, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 140 },
    nodes: [
      it("STBY BATT — OFF", "stbybatt", "OFF"),
      it("MASTER — OFF", "master", "OFF"),
      it("CABIN VENTS / AIR / HEAT — CLOSED", "vents", "CLOSED"),
      it("FIRE EXTINGUISHER — AS REQUIRED", "extinguisher", "ACTIVATE — as required"),
      it("AVIONICS (BUS 1 / 2) — OFF", "avionics", "OFF", { memory: false }),
      it("ALL SWITCHES (except magnetos) — OFF", "allswitches", "All OFF (except magnetos)",
         { memory: false,
           note: "Once the extinguisher has been used, make sure the fire is out " +
                 "BEFORE using outside air to clear the smoke." }),
      it("CABIN VENTS / AIR / WINDOWS — OPEN", "vents", "OPEN", { memory: false }),
      it("CIRCUIT BREAKERS — CHECK", "breakers", "CHECK", { memory: false }),
      {
        t: "decision",
        prompt: "The fire is out. Do you need electrical power to get down safely?",
        options: [
          { label: "Yes — night, and you need lights and radios", goto: "power", correct: true },
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
    situation: "Smoke is coming from behind the panel in the cabin itself.",
    values: { rpm: 2300, ias: 105, alt: 2500, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 140 },
    nodes: [
      it("STBY BATT — OFF", "stbybatt", "OFF"),
      it("MASTER — OFF", "master", "OFF"),
      it("CABIN VENTS / AIR / HEAT — CLOSED", "vents", "CLOSED"),
      it("FIRE EXTINGUISHER — AS REQUIRED", "extinguisher", "ACTIVATE — as required",
         { note: "Make sure the fire is out BEFORE using outside air to clear the smoke." }),
      it("CABIN VENTS / AIR / WINDOWS — OPEN", "vents", "OPEN", { memory: false }),
      it("LAND — AS SOON AS PRACTICAL", "action", "Land as soon as practical", { memory: false }),
    ],
  },
  {
    id: "fire-wing", group: "FIRE",
    title: "Wing Fire",
    card: "FIRE · WING FIRE",
    situation: "Fire on the left wing, at the strobe/nav light position.",
    values: { rpm: 2300, ias: 105, alt: 2500, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 140 },
    nodes: [
      it("LIGHTS — OFF", "lights", "OFF"),
      it("PITOT HEAT — OFF", "pitotheat", "OFF"),
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
    situation: "The restart attempt failed. You are gliding at 1,800 ft with a " +
      "field picked and made.",
    values: { rpm: 400, ias: 68, alt: 1800, flaps: 0, vsi: -700, pitch: -4, bank: 0, hdg: 140 },
    nodes: [
      it("AIRSPEED — 68 KIAS FLAPS UP / 65 KIAS FLAPS DOWN", "asi",
         "68 KIAS flaps up · 65 KIAS flaps down", { memory: false }),
      it("TRANSMIT — MAYDAY / 7700", "call", "MAYDAY — squawk 7700", { memory: false }),
      it("ELT — ON", "elt", "ON", { memory: false }),
      it("FUEL SHUTOFF — PULL OFF", "fuelshutoff", "PULL OFF", { memory: false }),
      it("MIXTURE — IDLE CUTOFF", "mixture", "IDLE CUTOFF", { memory: false, values: { rpm: 0 } }),
      it("MAGNETOS — OFF", "magnetos", "OFF", { memory: false }),
      it("WING FLAPS — AS REQUIRED", "flaps", "As required",
         { memory: false, values: { flaps: 30, ias: 65, alt: 900 } }),
      it("STBY BATT — OFF", "stbybatt", "OFF", { memory: false }),
      it("MASTER — OFF", "master", "OFF", { memory: false }),
      it("SEATS / BELTS — SECURE", "seatbelt", "SECURE", { memory: false }),
      it("DOORS — UNLATCH", "doors", "UNLATCH", { memory: false, values: { alt: 200, vsi: -500 } }),
    ],
  },
  {
    id: "forced-with-power", group: "FORCED",
    title: "Precautionary Landing — With Engine Power",
    card: "FORCED LANDING · WITH ENGINE POWER",
    situation: "Weather has closed in below you and fuel is low. The engine is " +
      "still running and you have picked a field.",
    values: { rpm: 2000, ias: 90, alt: 1200, flaps: 0, vsi: -300, pitch: -2, bank: 0, hdg: 140 },
    nodes: [
      it("LANDING AREA — SELECT", "outside", "Select a landing area", { memory: false }),
      it("TRANSMIT — MAYDAY / 7700", "call", "MAYDAY — squawk 7700", { memory: false }),
      it("ELT — ON", "elt", "ON", { memory: false }),
      it("FLAPS — AS REQUIRED", "flaps", "As required", { memory: false, values: { flaps: 20, ias: 75 } }),
      it("AIRSPEED — 68 KIAS FLAPS UP / 65 KIAS FLAPS DOWN", "asi",
         "68 KIAS flaps up · 65 KIAS flaps down", { memory: false, values: { ias: 65, alt: 600 } }),
      it("STBY BATT — OFF", "stbybatt", "OFF", { memory: false }),
      it("MASTER — OFF", "master", "OFF", { memory: false }),
      it("SEATS / BELTS — SECURE", "seatbelt", "SECURE", { memory: false }),
      it("DOORS — UNLATCH", "doors", "UNLATCH", { memory: false, values: { alt: 150 } }),
      { t: "handoff", line: "AFTER TOUCHDOWN — SECURING CHECKLIST",
        text: "Down and stopped. Run the Securing checklist." },
    ],
  },
  {
    id: "forced-ditching", group: "FORCED",
    title: "Water Ditching",
    card: "FORCED LANDING · WATER DITCHING",
    situation: "Engine out over open water, 1,500 ft, high wind and heavy seas. " +
      "There is no shoreline within gliding distance.",
    values: { rpm: 500, ias: 68, alt: 1500, flaps: 0, vsi: -600, pitch: -4, bank: 0, hdg: 140 },
    nodes: [
      it("LANDING AREA — SELECT", "outside", "Select a landing area", { memory: false }),
      it("TRANSMIT — MAYDAY / 7700", "call", "MAYDAY — squawk 7700", { memory: false }),
      it("ELT — ON", "elt", "ON", { memory: false }),
      it("SEATS / BELTS — SECURE", "seatbelt", "SECURE", { memory: false }),
      it("WING FLAPS — FULL", "flaps", "FULL (30°)", { memory: false, values: { flaps: 30, ias: 60 } }),
      it("POWER — 300 FT/MIN DESCENT AT 55 KIAS", "throttle", "300 ft/min descent at 55 KIAS",
         { memory: false, values: { rpm: 1200, ias: 55, vsi: -300, alt: 700 },
           note: "High wind and heavy seas: touch down into the wind. Light wind " +
                 "and heavy swells: land parallel to the swells." }),
      it("DOORS — UNLATCH", "doors", "UNLATCH", { memory: false }),
      it("TOUCHDOWN — LEVEL AND STABILIZED", "yoke",
         "Level attitude at the established rate of descent",
         { memory: false, values: { alt: 0, vsi: 0, pitch: 2 } }),
      it("AIRPLANE — EVACUATE", "action", "Evacuate the airplane", { memory: false }),
    ],
  },

  /* ============================== ICING ================================= */
  {
    id: "icing-flight", group: "ICING",
    title: "Inadvertent Icing Encounter",
    card: "ICING · DURING FLIGHT",
    situation: "In cloud at 5,000 ft, +1°C. Clear ice is building on the wing " +
      "struts and the windshield is glazing over.",
    values: { rpm: 2300, ias: 95, alt: 5000, flaps: 0, vsi: 0, pitch: 1, bank: 0, hdg: 140 },
    nodes: [
      it("PITOT HEAT — ON", "pitotheat", "ON"),
      it("AUTOPILOT — DISCONNECT", "autopilot", "DISCONNECT",
         { note: "Hand-fly it — an autopilot can mask the changing trim as ice builds." }),
      it("ICING CONDITIONS — EXIT", "action", "Leave the icing conditions",
         { options: ["Leave the icing conditions", "Hold the altitude and wait it out",
                     "Climb higher into the cloud"],
           values: { alt: 4200, vsi: -500, hdg: 320 },
           note: "Turn back or change altitude for an outside air temperature that " +
                 "is less conducive to icing." }),
      it("CABIN HEAT — PULL ON", "cabinheat", "PULL ON"),
      it("DEFROSTER OUTLETS — OPEN", "defroster", "OPEN"),
      { t: "handoff", line: "CONTINUE QRH 7-1",
        text: "Memory items complete. Continue with QRH 7-1 for the rest of the " +
              "icing procedure." },
    ],
  },
  {
    id: "icing-static", group: "ICING",
    title: "Static Source Blockage",
    card: "ICING · STATIC SOURCE BLOCKAGE",
    situation: "The altimeter has frozen, the VSI reads zero in a climb and the " +
      "airspeed is reading low. The static port is blocked.",
    values: { rpm: 2300, ias: 80, alt: 3000, flaps: 0, vsi: 0, pitch: 4, bank: 0, hdg: 140 },
    nodes: [
      it("ALTERNATE STATIC AIR — PULL ON", "altstatic", "PULL ON",
         { values: { ias: 95, vsi: 500 },
           note: "Indications come from cabin air, so expect a slightly high " +
                 "altimeter and airspeed." }),
      it("CABIN HT / AIR — PULL ON", "cabinheat", "PULL ON"),
      it("CABIN VENTS — CLOSED", "vents", "CLOSED", { memory: false }),
      { t: "handoff", line: "CONTINUE QRH 7-2",
        text: "Continue with QRH 7-2 for the rest of the procedure." },
    ],
  },
];
