/* ============================================================================
   stagecheck.js  —  SOURCE OF TRUTH for the Stage 1 check review.

   The oral half of the stage check, laid out the way the school teaches it:
   PAVE first (Pilot · Aircraft · enVironment · External pressures), then
   systems, ADM, aerodynamics, the stabilized approach, and lost comms /
   airport operations. Everything is for the C172S (G1000).

   STAGE1_SECTIONS   the home screen, in order; each lists its topic ids.
   STAGE1_TOPICS     id -> { name, tag, color, learn: [block], drill: [activity] }
     block    = { h, html?, fig?: () => svg, widget? }   widget names are
                implemented in study.js (aoaLab, approachGrid, inopFlow,
                riskMatrix, frat, minimums).
     activity = { type: "acronym", word, items: [{ l, w, alt?, d }] }
              | { type: "quiz", qs: [{ q, o: [correct, ...wrong], why, fig? }] }
              | { type: "match", title, pairs: [[left, right], ...] }
              | { type: "sort", title, buckets: [..], items: [{ t, b, why }] }
              | { type: "inop", cases: [...] }
              | { type: "systems" }
     In a quiz the FIRST option is the correct one; the runner shuffles.
   STAGE1_SYSTEMS    the systems the examiner picks three of.

   Sources: 14 CFR 91.103 / 91.17 / 91.125 / 91.171 / 91.203 / 91.205 /
   91.207 / 91.213 / 91.409 / 91.411 / 91.413 / 43.3 / 43.9 / Part 43 App. A;
   AIM 4-3-3, 4-3-13, 2-3; PHAK (FAA-H-8083-25) ch. 2, 5, 14; AFH
   (FAA-H-8083-3C) ch. 5, 9; C172S POH sections 2, 6, 7. Systems numbers come
   from the POH as quoted in training material — the school's POH governs.
   ========================================================================== */

const STAGE1_SECTIONS = [
  { id: "pave", name: "PAVE", sub: "Pilot · Aircraft · enVironment · External pressures",
    topics: ["pilot", "inspections", "documents", "inop", "prevmaint", "environment", "external"] },
  { id: "systems", name: "Systems", sub: "The examiner picks three — know them all",
    topics: ["systems"] },
  { id: "adm", name: "ADM", sub: "Decision-making, risk, attitudes",
    topics: ["adm", "attitudes"] },
  { id: "aero", name: "Aerodynamics", sub: "Lift, stalls, spins, left-turning tendencies",
    topics: ["lift", "tendencies"] },
  { id: "approach", name: "Stabilized approach", sub: "CCLAPS and the energy fixes",
    topics: ["stabilized"] },
  { id: "comms", name: "Lost comms & airports", sub: "Light guns, CTAF, signs and markings",
    topics: ["lightgun", "untowered", "signs"] },
];

/* -------------------------------- helpers -------------------------------- */
const sgn = (k, t) => ({ k, t });

const STAGE1_TOPICS = {
  /* =============================== PILOT ================================ */
  pilot: {
    name: "Pilot", tag: "P", color: "#34ace0",
    learn: [
      { h: "IMSAFE — memorize it", html: `
        <table class="s1-table">
          <tr><th>I</th><td><b>Illness</b> — any symptom, even a cold (ear/sinus blocks at altitude).</td></tr>
          <tr><th>M</th><td><b>Medication</b> — prescription <i>and</i> OTC; antihistamines are the classic trap.</td></tr>
          <tr><th>S</th><td><b>Stress</b> — work, money, family, checkride nerves.</td></tr>
          <tr><th>A</th><td><b>Alcohol</b> — 8 hours bottle-to-throttle, under 0.04 BAC, not under the influence (91.17).</td></tr>
          <tr><th>F</th><td><b>Fatigue</b> — sleep, and how long you've been awake.</td></tr>
          <tr><th>E</th><td><b>Emotion</b> — upset, angry, distracted. (Some schools teach <b>Eating</b> — know both.)</td></tr>
        </table>` },
      { h: "Documents you carry", html: `
        <ul class="s1-list">
          <li><b>Pilot certificate</b> — your student pilot certificate.</li>
          <li><b>Medical certificate</b> (unless operating under an exception that doesn't apply to you).</li>
          <li><b>Government-issued photo ID.</b></li>
          <li><b>Logbook with your solo endorsements</b> — the solo endorsement is good for 90 days (61.87). Carry it on solo cross-countries (61.51).</li>
        </ul>` },
    ],
    drill: [
      { type: "acronym", word: "IMSAFE", items: [
        { l: "I", w: "Illness", alt: ["ill", "sick"] },
        { l: "M", w: "Medication", alt: ["med", "drug"] },
        { l: "S", w: "Stress" },
        { l: "A", w: "Alcohol" },
        { l: "F", w: "Fatigue", alt: ["tired"] },
        { l: "E", w: "Emotion", alt: ["eating", "emot"] },
      ] },
      { type: "quiz", qs: [
        { q: "What does 91.17 require before you fly after drinking?",
          o: ["8 hours since the last drink, BAC under 0.04, and not under the influence",
              "8 hours since the last drink — that's all",
              "12 hours and BAC under 0.08",
              "24 hours, regardless of BAC"],
          why: "All three conditions apply. Many schools set a stricter 12-hour rule — 8 is the legal floor." },
        { q: "You're about to fly solo. Which documents must you have on you?",
          o: ["Student pilot certificate, medical, photo ID — and the logbook with the solo endorsement",
              "Just the student pilot certificate",
              "Medical and photo ID only",
              "Pilot certificate and the aircraft's registration"],
          why: "The certificate, medical and ID are yours to carry; the endorsement is what makes the solo legal." },
        { q: "How long is a student's solo endorsement good for?",
          o: ["90 days", "30 days", "12 calendar months", "Until the private checkride"],
          why: "61.87(n): the instructor's solo endorsement is valid for 90 days." },
      ] },
    ],
  },

  /* ============================= INSPECTIONS ============================ */
  inspections: {
    name: "Inspections", tag: "A", color: "#ff9f43", sub: "AAVIATES",
    learn: [
      { h: "AAVIATES — memorize it", html: `
        <table class="s1-table wide">
          <tr><th>A</th><td><b>Annual</b></td><td>12 calendar months · signed off by an A&amp;P with an <b>IA</b> (Inspection Authorization) — an A&amp;P alone can't. N91FF is on a <b>phase</b> (progressive) inspection program instead (91.409(d)).</td></tr>
          <tr><th>A</th><td><b>ADs</b></td><td>Airworthiness Directives — <b>FAA, mandatory</b>. One-time, recurring, or emergency.<br>SAIB — <i>FAA advisory</i> · SB (Service Bulletin) — <i>manufacturer advisory</i>.</td></tr>
          <tr><th>V</th><td><b>VOR</b></td><td>Check within <b>30 days</b> (91.171) — required for IFR; the school applies it when the VOR is your primary means of navigation.</td></tr>
          <tr><th>I</th><td><b>Inspection — 100 hr</b></td><td>Required when the airplane is used <b>for hire</b> (rental, instruction). May be overflown by up to <b>10 hours</b> only to reach a place it can be done; the overflight counts against the next 100.</td></tr>
          <tr><th>A</th><td><b>Altimeter / pitot-static</b></td><td><b>24 calendar months</b> (91.411) — for IFR in controlled airspace.</td></tr>
          <tr><th>T</th><td><b>Transponder</b></td><td><b>24 calendar months</b> (91.413).</td></tr>
          <tr><th>E</th><td><b>ELT</b></td><td>Inspect every <b>12 calendar months</b>; replace the battery after <b>1 hour</b> of cumulative use or <b>half its useful life</b> (91.207).</td></tr>
          <tr><th>S</th><td><b>Squawks</b></td><td>Discrepancies — check the open squawks on <b>Needle Nine</b> before every flight.</td></tr>
        </table>` },
      { h: "Not airworthy, but needs to move?", html: `
        <p>A <b>special flight permit</b> (ferry permit, 14 CFR 21.197) lets an airplane that doesn't meet airworthiness
        requirements but is capable of safe flight fly to a repair shop. <b>Contact the FSDO.</b></p>` },
    ],
    drill: [
      { type: "acronym", word: "AAVIATES", items: [
        { l: "A", w: "Annual" },
        { l: "A", w: "ADs", alt: ["airworthiness directive", "ad"] },
        { l: "V", w: "VOR" },
        { l: "I", w: "Inspection (100 hr)", alt: ["100", "inspection", "hundred"] },
        { l: "A", w: "Altimeter / pitot-static", alt: ["altimeter", "pitot", "static"] },
        { l: "T", w: "Transponder" },
        { l: "E", w: "ELT", alt: ["emergency locator"] },
        { l: "S", w: "Squawks", alt: ["discrepanc"] },
      ] },
      { type: "sort", title: "Mandatory or advisory?", buckets: ["Mandatory", "Advisory"], items: [
        { t: "Airworthiness Directive (AD)", b: 0, why: "Issued by the FAA under Part 39 — compliance is the law." },
        { t: "Emergency AD", b: 0, why: "Effective on receipt — the most urgent kind." },
        { t: "Special Airworthiness Information Bulletin (SAIB)", b: 1, why: "FAA advisory — information, not a requirement." },
        { t: "Manufacturer's Service Bulletin (SB)", b: 1, why: "Advisory for a Part 91 operator — unless an AD makes it mandatory." },
        { t: "Recurring AD", b: 0, why: "Still an AD — mandatory every time it comes due." },
      ] },
      { type: "quiz", qs: [
        { q: "Who can sign off the annual inspection?",
          o: ["An A&P mechanic who holds an Inspection Authorization (IA)", "Any A&P mechanic",
              "The aircraft owner", "Any certificated flight instructor"],
          why: "A 100-hour can be signed by an A&P; the annual needs the IA." },
        { q: "The 100-hour comes due while you're on a ferry flight to the shop. How much can it be overflown?",
          o: ["Up to 10 hours, only to reach a place where it can be done", "Up to 10 hours for any reason",
              "Not at all", "Up to 25 hours with a placard"],
          why: "91.409(b). The extra time counts against the next 100 hours." },
        { q: "When does the ELT battery have to be replaced?",
          o: ["After 1 hour of cumulative use, or at 50% of its useful life", "Every 12 calendar months",
              "Every 24 calendar months", "Only when the self-test fails"],
          why: "91.207(c). The 12-month item is the ELT inspection, not the battery." },
        { q: "Transponder inspection interval?",
          o: ["24 calendar months", "12 calendar months", "100 hours", "30 days"],
          why: "91.413 — same as the altimeter/pitot-static check." },
        { q: "Why does a school airplane need a 100-hour inspection at all?",
          o: ["It's used for hire — rental and flight instruction", "Every airplane needs one",
              "Because it has a G1000", "Only if it's IFR certified"],
          why: "91.409(b): carrying anyone for hire, or flight instruction for hire in an airplane the instructor provides." },
        { q: "The airplane can't legally fly but is safe to move to the shop. Who do you call?",
          o: ["The FSDO — for a special flight permit", "Tower", "Flight Service", "The manufacturer"],
          why: "A special (ferry) flight permit is issued through the local Flight Standards District Office." },
      ] },
    ],
  },

  /* ============================== DOCUMENTS ============================= */
  documents: {
    name: "Documents", tag: "A", color: "#ff9f43", sub: "ARROW",
    learn: [
      { h: "ARROW — memorize it", html: `
        <table class="s1-table wide">
          <tr><th>A</th><td><b>Airworthiness certificate</b></td><td>Doesn't expire — but it's only <b>valid</b> while the inspections and maintenance are done (and the airplane stays registered). Displayed where passengers can see it (91.203).</td></tr>
          <tr><th>R</th><td><b>Registration</b></td><td><b>7 years</b> federal · <b>1 year</b> state.</td></tr>
          <tr><th>R</th><td><b>Radio station license</b></td><td>FCC — only required for <b>international</b> flight.</td></tr>
          <tr><th>O</th><td><b>Operating limitations</b></td><td><b>POH Section 2</b>, plus placards and instrument markings.</td></tr>
          <tr><th>W</th><td><b>Weight &amp; balance</b></td><td><b>POH Section 6</b> — the actual empty weight and CG of <i>this</i> airplane. The comprehensive equipment list is in Section 6 too (bonus points).</td></tr>
        </table>` },
    ],
    drill: [
      { type: "acronym", word: "ARROW", items: [
        { l: "A", w: "Airworthiness certificate", alt: ["airworth"] },
        { l: "R", w: "Registration" },
        { l: "R", w: "Radio station license", alt: ["radio"] },
        { l: "O", w: "Operating limitations", alt: ["operating", "poh", "limit"] },
        { l: "W", w: "Weight & balance", alt: ["weight"] },
      ] },
      { type: "quiz", qs: [
        { q: "When does the airworthiness certificate expire?",
          o: ["It doesn't — but it's invalid if inspections and maintenance aren't done",
              "Every 12 calendar months", "Every 7 years", "At the next annual"],
          why: "It stays in effect as long as the airplane is maintained per Parts 43 and 91 and stays US-registered." },
        { q: "How long is the federal registration good for?",
          o: ["7 years", "3 years", "1 year", "It never expires"], why: "Since 2023. The state registration is 1 year." },
        { q: "When is a radio station license required?", o: ["International flights", "Always", "In Class B", "At night"],
          why: "It's an FCC requirement only when you leave the US." },
        { q: "Where are the operating limitations?", o: ["POH Section 2 (plus placards and markings)", "POH Section 6", "POH Section 4", "The TCDS only"],
          why: "Section 2 is Limitations — airspeeds, weights, powerplant limits, placards." },
        { q: "Where is the weight and balance (and the comprehensive equipment list)?", o: ["POH Section 6", "POH Section 2", "POH Section 9", "The logbooks"],
          why: "Section 6 — this airplane's empty weight, CG and its equipment list." },
      ] },
    ],
  },

  /* ============================== INOP FLOW ============================= */
  inop: {
    name: "Inop flow", tag: "A", color: "#ff9f43", sub: "91.213 · ATOMATOFLAMES",
    learn: [
      { h: "Something's broken — can I go?", widget: "inopFlow", html: `
        <p>Without an MEL, <b>91.213(d)</b> is the flow. Go down it in order — the first <b>yes</b> grounds the airplane.</p>` },
      { h: "91.205(b) — day VFR: A TOMATO FLAMES", html: `
        <table class="s1-table">
          <tr><th>A</th><td>Airspeed indicator</td></tr>
          <tr><th>T</th><td>Tachometer</td></tr>
          <tr><th>O</th><td>Oil pressure gauge</td></tr>
          <tr><th>M</th><td>Manifold pressure gauge (altitude engines)</td></tr>
          <tr><th>A</th><td>Altimeter</td></tr>
          <tr><th>T</th><td>Temperature gauge (liquid-cooled engines)</td></tr>
          <tr><th>O</th><td>Oil temperature gauge (air-cooled engines)</td></tr>
          <tr><th>F</th><td>Fuel quantity gauge (each tank)</td></tr>
          <tr><th>L</th><td>Landing gear position indicator (retractables)</td></tr>
          <tr><th>A</th><td>Anticollision lights (certificated after March 11, 1996)</td></tr>
          <tr><th>M</th><td>Magnetic direction indicator (compass)</td></tr>
          <tr><th>E</th><td>ELT</td></tr>
          <tr><th>S</th><td>Safety belts (and front-seat shoulder harnesses)</td></tr>
        </table>
        <p class="s1-note">Night adds <b>FLAPS</b> (91.205(c)): Fuses (spares, if no breakers) · Landing light (if for hire) · Anticollision · Position lights · Source of electrical power.</p>` },
    ],
    drill: [
      { type: "acronym", word: "ATOMATOFLAMES", items: [
        { l: "A", w: "Airspeed indicator", alt: ["airspeed", "asi"] },
        { l: "T", w: "Tachometer", alt: ["tach"] },
        { l: "O", w: "Oil pressure gauge", alt: ["oil pres"] },
        { l: "M", w: "Manifold pressure gauge", alt: ["manifold"] },
        { l: "A", w: "Altimeter" },
        { l: "T", w: "Temperature gauge (liquid-cooled)", alt: ["temp", "coolant"] },
        { l: "O", w: "Oil temperature gauge", alt: ["oil temp"] },
        { l: "F", w: "Fuel quantity gauge", alt: ["fuel"] },
        { l: "L", w: "Landing gear position indicator", alt: ["landing gear", "gear"] },
        { l: "A", w: "Anticollision lights", alt: ["anticol", "anti-col", "beacon", "strobe"] },
        { l: "M", w: "Magnetic compass", alt: ["magnetic", "compass"] },
        { l: "E", w: "ELT", alt: ["emergency locator"] },
        { l: "S", w: "Safety belts", alt: ["seat", "safety", "belt"] },
      ] },
      { type: "inop", cases: [
        { item: "Right fuel quantity gauge", flight: "Day VFR, local", req: true,
          why: "F — fuel gauge for each tank, 91.205(b). No-go." },
        { item: "Landing light", flight: "Day VFR, dual lesson", given: "The KOEL and TCDS don't require it for day VFR. No AD applies.", req: false,
          why: "A landing light is only required at night when flying for hire (FLAPS). Deactivate or remove, placard INOP, record it — your call as PIC." },
        { item: "Landing light", flight: "Night, flight instruction for hire", req: true,
          why: "91.205(c)(4): at night, for hire, the landing light is required. No-go." },
        { item: "Anticollision beacon", flight: "Day VFR — a 2008 C172S", req: true,
          why: "A — anticollision lights are required on airplanes certificated after March 11, 1996. No-go." },
        { item: "Position (nav) lights", flight: "Day VFR, back well before sunset", given: "The KOEL and TCDS don't require them for day VFR. No AD applies.", req: false,
          why: "Position lights are in FLAPS — night only. Placard and go, and be on the ground before sunset." },
        { item: "Pitot heat", flight: "Day VFR, no visible moisture", given: "The KOEL and TCDS don't require it for day VFR. No AD applies.", req: false,
          why: "Not in 91.205 for day VFR. Placard INOP, record it, PIC decides." },
        { item: "Oil temperature gauge", flight: "Day VFR, local", req: true,
          why: "O — oil temperature gauge for an air-cooled engine. No-go." },
        { item: "Magnetic compass", flight: "Day VFR, local", req: true,
          why: "M — magnetic direction indicator. The G1000 heading doesn't replace it. No-go." },
        { item: "Cabin dome light", flight: "Day VFR, local", given: "The KOEL and TCDS don't require it. No AD applies.", req: false,
          why: "Not required by anything. Placard INOP and go." },
      ] },
      { type: "quiz", qs: [
        { q: "An item isn't required by anything. What do you do before flight (91.213(d))?",
          o: ["Remove or deactivate it, placard it \"Inoperative\", record it — and the PIC decides it's safe",
              "Nothing — just don't use it", "Get a special flight permit", "Call the FSDO"],
          why: "Deactivation is maintenance, so it's recorded (43.9); the final say is the PIC's." },
        { q: "Where is the C172S's Kinds of Operations Equipment List?",
          o: ["In the POH", "In the TCDS", "On Needle Nine", "In the AIM"], why: "The KOEL is in the POH; the TCDS is a separate FAA document." },
        { q: "Your school doesn't have an MEL. Which rule do you use?",
          o: ["91.213(d)", "91.205(c)", "91.409", "43.3(g)"], why: "91.213(d) is the no-MEL path for small piston airplanes." },
        { q: "Which of these is required for night VFR but NOT day VFR?",
          o: ["Position lights", "Anticollision lights", "Fuel gauges", "Airspeed indicator"],
          why: "FLAPS adds position lights at night; the anticollision light is already on the day list." },
      ] },
    ],
  },

  /* ======================== PREVENTIVE MAINTENANCE ====================== */
  prevmaint: {
    name: "Preventive maintenance", tag: "A", color: "#ff9f43", sub: "43.3(g) · Part 43 App. A(c)",
    learn: [
      { h: "Who, what, and the paperwork", html: `
        <ul class="s1-list">
          <li><b>Who — 43.3(g):</b> a pilot certificate holder may do preventive maintenance on an aircraft they own or operate, if it isn't used under Part 121/129/135.</li>
          <li><b>What — Part 43 Appendix A, paragraph (c):</b> the list. Simple, small, no complex assembly. Tires, struts, wheel bearings, lubrication, safety wire, bulbs and lenses, spark plugs, batteries, filters, safety belts, side windows, prefabricated fuel lines…</li>
          <li><b>Paperwork — 43.9:</b> a logbook entry with a description of the work, the date it was completed, your name, and your certificate number and type.</li>
        </ul>
        <p class="s1-note">If it isn't on the list, it isn't preventive maintenance — it's a job for a mechanic.</p>` },
    ],
    drill: [
      { type: "sort", title: "Preventive maintenance a pilot may do — or a mechanic's job?", buckets: ["Pilot may do (App. A(c))", "Mechanic only"], items: [
        { t: "Replacing a landing-light bulb", b: 0, why: "Bulbs, reflectors and lenses of position and landing lights are on the list." },
        { t: "Servicing a shock strut with air or oil", b: 0, why: "Listed in App. A(c)." },
        { t: "Repairing a magneto", b: 1, why: "Engine accessory repair isn't on the list." },
        { t: "Cleaning and gapping spark plugs", b: 0, why: "Replacing, cleaning, or setting spark plug clearance is listed." },
        { t: "Re-rigging the aileron cables", b: 1, why: "Flight control rigging is not preventive maintenance." },
        { t: "Replacing a safety belt", b: 0, why: "Listed." },
        { t: "Replacing a tire", b: 0, why: "Removal, installation and repair of landing gear tires is listed." },
        { t: "Installing a new radio", b: 1, why: "That's an alteration, not preventive maintenance." },
        { t: "Replacing the battery", b: 0, why: "Replacing and servicing batteries is listed." },
        { t: "Repairing a cracked wing rib", b: 1, why: "Structural repair — mechanic only." },
      ] },
      { type: "quiz", qs: [
        { q: "Which regulation says who may perform preventive maintenance?", o: ["43.3(g)", "43.9", "91.213", "91.409"],
          why: "43.3(g). The list itself is Part 43 Appendix A, paragraph (c)." },
        { q: "Where's the list of what counts as preventive maintenance?", o: ["Part 43 Appendix A, paragraph (c)", "POH Section 8", "91.205", "AC 43.13"],
          why: "Appendix A(c) — 30-odd specific items." },
        { q: "What goes in the logbook entry?", o: ["Description, date completed, your name, certificate number and type", "Just your signature", "The tach time only", "Nothing — preventive maintenance isn't recorded"],
          why: "43.9 — it's maintenance, so it's recorded." },
      ] },
    ],
  },

  /* ============================ ENVIRONMENT ============================= */
  environment: {
    name: "enVironment", tag: "V", color: "#2ed573", sub: "NWKRAFT",
    learn: [
      { h: "NWKRAFT — 91.103 preflight action, memorize it", html: `
        <table class="s1-table">
          <tr><th>N</th><td><b>NOTAMs</b></td></tr>
          <tr><th>W</th><td><b>Weather</b> reports and forecasts</td></tr>
          <tr><th>K</th><td><b>Known</b> traffic delays (from ATC)</td></tr>
          <tr><th>R</th><td><b>Runway</b> lengths at airports of intended use</td></tr>
          <tr><th>A</th><td><b>Alternatives</b> if the flight can't be completed as planned</td></tr>
          <tr><th>F</th><td><b>Fuel</b> requirements</td></tr>
          <tr><th>T</th><td><b>Takeoff and landing</b> distance data</td></tr>
        </table>
        <p class="s1-note">Every flight needs <b>R</b> and <b>T</b>. The whole list applies to IFR flights and flights not in the vicinity of an airport.
        VFR fuel reserve (91.151): <b>30 minutes</b> day, <b>45 minutes</b> night.</p>` },
    ],
    drill: [
      { type: "acronym", word: "NWKRAFT", items: [
        { l: "N", w: "NOTAMs", alt: ["notam"] },
        { l: "W", w: "Weather", alt: ["wx"] },
        { l: "K", w: "Known ATC delays", alt: ["known", "delay", "atc"] },
        { l: "R", w: "Runway lengths", alt: ["runway"] },
        { l: "A", w: "Alternatives", alt: ["alternat"] },
        { l: "F", w: "Fuel requirements", alt: ["fuel"] },
        { l: "T", w: "Takeoff & landing distances", alt: ["takeoff", "take off", "t/o", "distance"] },
      ] },
      { type: "quiz", qs: [
        { q: "Which NWKRAFT items apply to EVERY flight, even one staying in the pattern?",
          o: ["Runway lengths and takeoff/landing distance data", "NOTAMs and weather", "Fuel and alternatives", "All of them, always"],
          why: "91.103(b). Everything else is required for IFR or flights away from the vicinity of an airport — but do it anyway." },
        { q: "Minimum VFR fuel reserve during the day?", o: ["30 minutes at normal cruise", "45 minutes", "20 minutes", "1 hour"],
          why: "91.151 — 45 minutes at night." },
        { q: "Which regulation is NWKRAFT?", o: ["91.103", "91.205", "91.151", "61.87"], why: "91.103 — preflight action." },
      ] },
    ],
  },

  /* ========================= EXTERNAL PRESSURES ========================= */
  external: {
    name: "External pressures", tag: "E", color: "#e056fd", sub: "Personal minimums",
    learn: [
      { h: "What pushes you to go", html: `
        <p>Anything outside the flight that makes you want to complete it: people waiting, a meeting, the airplane being due back,
        an expensive rental, not wanting to look timid in front of passengers — <b>get-there-itis</b>.</p>
        <ul class="s1-list">
          <li>Set <b>personal minimums</b> ahead of time, on the ground, when nobody's pressuring you.</li>
          <li>Have a <b>backup plan</b> — a hotel, a car, a later day.</li>
          <li>Tell passengers up front that the flight might not happen.</li>
          <li>Leave slack in the schedule.</li>
        </ul>` },
      { h: "Your personal minimums", widget: "minimums", html: `
        <p>Fill it in once (it's saved on this device), then run today's conditions against it.
        Your CFI's AOPA worksheet goes further — copy your numbers here.</p>` },
    ],
    drill: [
      { type: "quiz", qs: [
        { q: "Which of these is an external pressure?",
          o: ["Your friends are waiting at the destination", "A crosswind at your limit", "A cold you're getting over", "An inoperative landing light"],
          why: "The others are the Environment, the Pilot and the Aircraft." },
        { q: "When should you set your personal minimums?",
          o: ["Ahead of time, on the ground, with no flight pending", "During the preflight briefing", "In flight, as conditions change", "After a close call"],
          why: "Decided calmly, before the pressure exists — that's what makes them useful." },
        { q: "The best antidote to get-there-itis?",
          o: ["A backup plan made before you leave", "Leaving earlier", "More fuel", "A better weather app"],
          why: "If not going is already arranged, it's easy to not go." },
      ] },
    ],
  },

  /* ============================== SYSTEMS =============================== */
  systems: {
    name: "Systems", tag: "S", color: "#34ace0", sub: "C172S G1000",
    learn: [{ h: "Pick any system", widget: "systemsBrowser" }],
    drill: [{ type: "systems" }],
  },

  /* ================================ ADM ================================== */
  adm: {
    name: "ADM & risk", tag: "ADM", color: "#ffa502",
    learn: [
      { h: "What is ADM?", html: `
        <p><b>Aeronautical decision-making</b> is a systematic approach to the mental process pilots use to consistently
        determine the best course of action in response to a given set of circumstances (PHAK ch. 2).</p>` },
      { h: "The 3 P's", html: `
        <div class="s1-ppp">
          <div><b>Perceive</b><span>the hazards — use <b>PAVE</b></span></div>
          <div><b>Process</b><span>evaluate the risk — use <b>CARE</b>: Consequences · Alternatives · Reality · External factors</span></div>
          <div><b>Perform</b><span>manage the risk — use <b>TEAM</b>: Transfer · Eliminate · Accept · Mitigate</span></div>
        </div>
        <p class="s1-note">It's a loop: perform, then perceive again. The core is Perceive · Process · Perform; PAVE / CARE / TEAM are the tools inside it.</p>` },
      { h: "Risk assessment matrix", widget: "riskMatrix", html: `
        <p>Rate a hazard on <b>likelihood</b> and <b>severity</b>; where they cross is the risk. Tap a cell.</p>` },
      { h: "FRAT — flight risk assessment tool", widget: "frat", html: `
        <p>A FRAT turns the same idea into a checklist with points. This is an <i>example</i> — use the school's real one.</p>` },
    ],
    drill: [
      { type: "match", title: "Match each P to what it means", pairs: [
        ["Perceive", "Identify the hazards (PAVE)"],
        ["Process", "Evaluate the risk (CARE)"],
        ["Perform", "Mitigate or eliminate the risk (TEAM)"],
      ] },
      { type: "quiz", qs: [
        { q: "Define ADM.",
          o: ["A systematic approach to the mental process of consistently determining the best course of action",
              "The regulations about decision height",
              "A checklist for emergencies",
              "The process of filing a flight plan"],
          why: "PHAK ch. 2. Say \"systematic\" and \"consistently\" — that's what the examiner listens for." },
        { q: "In the 3P model, which tool helps you PERCEIVE hazards?", o: ["PAVE", "CARE", "TEAM", "IMSAFE"],
          why: "PAVE to perceive, CARE to process, TEAM to perform." },
        { q: "A hazard is likely and the outcome could be catastrophic. Where does it land on the matrix?",
          o: ["High — don't go without changing something", "Medium", "Low", "It depends on the weather"],
          why: "High likelihood × high severity is the top corner of every risk matrix." },
        { q: "Your FRAT score comes out in the red. What now?",
          o: ["Mitigate the factors driving it — or don't go — and talk to your CFI", "Go, but fly carefully", "Recompute until it's yellow", "Nothing; FRATs are advisory"],
          why: "The score is a prompt to change the plan." },
      ] },
    ],
  },

  /* ======================== HAZARDOUS ATTITUDES ========================= */
  attitudes: {
    name: "Hazardous attitudes", tag: "ADM", color: "#ffa502",
    learn: [
      { h: "The five, and their antidotes", html: `
        <table class="s1-table wide">
          <tr><td><b>Anti-authority</b><br><i>"Don't tell me."</i></td><td>→ <b>Follow the rules. They are usually right.</b></td></tr>
          <tr><td><b>Impulsivity</b><br><i>"Do it quickly."</i></td><td>→ <b>Not so fast. Think first.</b></td></tr>
          <tr><td><b>Invulnerability</b><br><i>"It won't happen to me."</i></td><td>→ <b>It could happen to me.</b></td></tr>
          <tr><td><b>Macho</b><br><i>"I can do it."</i></td><td>→ <b>Taking chances is foolish.</b></td></tr>
          <tr><td><b>Resignation</b><br><i>"What's the use?"</i></td><td>→ <b>I'm not helpless. I can make a difference.</b></td></tr>
        </table>` },
    ],
    drill: [
      { type: "match", title: "Match each attitude to its antidote", pairs: [
        ["Anti-authority", "Follow the rules. They are usually right."],
        ["Impulsivity", "Not so fast. Think first."],
        ["Invulnerability", "It could happen to me."],
        ["Macho", "Taking chances is foolish."],
        ["Resignation", "I'm not helpless. I can make a difference."],
      ] },
      { type: "quiz", qs: [
        { q: "\"The crosswind's past the demonstrated number, but I'll show them I can land it.\"",
          o: ["Macho", "Impulsivity", "Anti-authority", "Resignation"], why: "Proving yourself — antidote: taking chances is foolish." },
        { q: "\"That TFR is for the big jets, it doesn't apply to me.\"",
          o: ["Anti-authority", "Invulnerability", "Macho", "Impulsivity"], why: "Rules are for other people — antidote: follow the rules." },
        { q: "\"Accidents happen to other pilots.\"",
          o: ["Invulnerability", "Macho", "Resignation", "Anti-authority"], why: "Antidote: it could happen to me." },
        { q: "The engine's running rough. \"Nothing I do will matter now.\"",
          o: ["Resignation", "Impulsivity", "Invulnerability", "Macho"], why: "Giving up — antidote: I'm not helpless." },
        { q: "The alternator light comes on; you immediately pull breakers without running the checklist.",
          o: ["Impulsivity", "Macho", "Anti-authority", "Resignation"], why: "Acting before thinking — antidote: not so fast, think first." },
      ] },
    ],
  },

  /* ============================ LIFT / STALL ============================ */
  lift: {
    name: "Lift, stalls & spins", tag: "AERO", color: "#706fd3",
    learn: [
      { h: "How a wing makes lift", fig: () => Diagrams.forces(), html: `
        <ul class="s1-list">
          <li><b>Bernoulli:</b> the air over the curved upper surface speeds up, its pressure drops, and the higher pressure underneath pushes the wing up.</li>
          <li><b>Newton's third law:</b> the wing deflects air downward (downwash); the air pushes the wing up.</li>
          <li>Both are the same lift, described two ways. Lift = ½ ρ V² S C<sub>L</sub> — you control it with <b>angle of attack</b> and <b>airspeed</b>.</li>
        </ul>` },
      { h: "Angle of attack lab — drag the slider", widget: "aoaLab", html: `
        <p><b>Angle of attack</b> is the angle between the <b>chord line</b> and the <b>relative wind</b>. Push it past the
        critical AOA and the airflow separates from the top of the wing.</p>` },
      { h: "Stall vs. spin", html: `
        <ul class="s1-list">
          <li><b>Stall:</b> the wing exceeds its <b>critical angle of attack</b> and the smooth airflow separates — lift drops off.
              It can happen at <b>any airspeed, any attitude, any power setting</b>. Recover: <b>reduce the AOA</b> (pitch forward), level the wings with coordinated controls, add power.</li>
          <li><b>Spin:</b> an <b>aggravated stall that results in autorotation</b> — both wings stalled, one deeper than the other, and the airplane yaws and rolls toward it. Needs <b>stall + yaw</b> (uncoordinated flight).</li>
          <li><b>Spin recovery (PARE):</b> <b>P</b>ower idle · <b>A</b>ilerons neutral · <b>R</b>udder full opposite the rotation · <b>E</b>levator briskly forward. Neutralize rudder when the rotation stops, then recover from the dive.</li>
        </ul>` },
    ],
    drill: [
      { type: "quiz", qs: [
        { q: "What causes a stall?", o: ["Exceeding the critical angle of attack", "Flying too slowly", "Pitching too high", "Running out of power"],
          why: "Slow and nose-high are where it usually happens, but the cause is always AOA. You can stall at any airspeed." },
        { q: "Angle of attack is the angle between…", o: ["The chord line and the relative wind", "The wing and the horizon", "The chord line and the fuselage", "The flight path and the horizon"],
          why: "Pitch attitude is not AOA." },
        { q: "What does a spin need that a stall doesn't?", o: ["Yaw — uncoordinated flight at the stall", "More power", "Flaps extended", "A nose-down attitude"],
          why: "A spin is an aggravated stall with autorotation; yaw at the stall makes one wing stall deeper." },
        { q: "Spin recovery — first action?", o: ["Power to idle", "Full forward elevator", "Opposite aileron", "Full power"],
          why: "PARE: Power idle, Ailerons neutral, Rudder opposite, Elevator forward." },
        { q: "During spin recovery, the ailerons should be…", o: ["Neutral", "Full against the spin", "Full with the spin", "Whatever levels the wings"],
          why: "Aileron into or against the spin can deepen it. Neutral." },
        { q: "Two forces that explain lift?", o: ["Bernoulli (pressure difference) and Newton's third law (downwash)", "Thrust and drag", "Torque and P-factor", "Weight and centrifugal force"],
          why: "Two descriptions of the same lift." },
        { q: "You increase the angle of attack, still below critical. What happens to lift?", o: ["It increases", "It decreases", "It stays the same", "The wing stalls"],
          why: "CL climbs with AOA until the critical angle — then it falls off.", fig: () => Diagrams.clCurve(10) },
      ] },
    ],
  },

  /* ========================= TURNING TENDENCIES ========================= */
  tendencies: {
    name: "Turning tendencies", tag: "AERO", color: "#706fd3",
    learn: [
      { h: "The four left-turning tendencies", widget: "tendencies", html: `
        <p>The C172's propeller turns <b>clockwise as seen from the cockpit</b>. All four push the nose <b>left</b> —
        most at <b>high power, low airspeed, high AOA</b> (takeoff and climb). The fix is always <b>right rudder</b>.</p>` },
      { h: "Overshooting the turn to final — with a parallel runway", fig: () => Diagrams.overshoot(), html: `
        <ul class="s1-list">
          <li><b>Don't</b> steepen the bank or use rudder to tighten the turn: a skidding, cross-controlled turn at low speed is the classic <b>stall/spin</b> setup — too low to recover.</li>
          <li><b>Don't</b> drift across the extended centerline of the parallel runway — someone may be on its final.</li>
          <li><b>Go around.</b> Then fix it next time: watch the wind on base (a tailwind on base blows you through) and start the turn earlier.</li>
        </ul>` },
    ],
    drill: [
      { type: "match", title: "Match each tendency to its cause", pairs: [
        ["Torque", "Reaction to the prop turning — rolls the airplane left"],
        ["P-factor", "Descending blade takes a bigger bite at high AOA"],
        ["Spiraling slipstream", "Corkscrewing air hits the left side of the tail"],
        ["Gyroscopic precession", "A force on the spinning prop acts 90° later"],
      ] },
      { type: "quiz", qs: [
        { q: "When are left-turning tendencies strongest?", o: ["High power, low airspeed, high AOA — takeoff and climb", "Cruise", "Idle descent", "High airspeed"],
          why: "Correct with right rudder." },
        { q: "Which tendency is mostly noticed in a tailwheel airplane when the tail is raised?", o: ["Gyroscopic precession", "P-factor", "Torque", "Spiraling slipstream"],
          why: "Raising the tail tilts the spinning prop; the force acts 90° later in rotation.", fig: () => Diagrams.precession() },
        { q: "Which one comes from the descending blade having a higher angle of attack?", o: ["P-factor", "Torque", "Precession", "Slipstream"],
          why: "Asymmetric disc loading.", fig: () => Diagrams.pfactor() },
        { q: "You're about to overshoot final, and the parallel runway has traffic. Best action?",
          o: ["Go around", "Steepen the bank to 45° to make the centerline", "Add bottom rudder to tighten the turn", "Land on the parallel runway"],
          why: "Steep or skidding turns low and slow are the stall/spin trap; the parallel final may be occupied.", fig: () => Diagrams.overshoot() },
        { q: "Why does a skidding turn to final lead to spins?",
          o: ["Too much rudder makes the inside wing slower and stall first — a stall with yaw", "It makes the airplane too fast", "It overloads the engine", "It doesn't — slips cause spins"],
          why: "Skid + stall = the inside wing drops — a spin entry close to the ground." },
      ] },
    ],
  },

  /* ========================= STABILIZED APPROACH ======================== */
  stabilized: {
    name: "Stabilized approach", tag: "APP", color: "#2ed573", sub: "CCLAPS",
    learn: [
      { h: "CCLAPS — memorize it", html: `
        <table class="s1-table">
          <tr><th>C</th><td><b>Checklist</b> complete</td></tr>
          <tr><th>C</th><td><b>Centerline</b> — aligned</td></tr>
          <tr><th>L</th><td><b>Landing configuration</b> — flaps set</td></tr>
          <tr><th>A</th><td><b>Airspeed</b> — target <b>+5 / −0</b></td></tr>
          <tr><th>P</th><td><b>Power</b> set</td></tr>
          <tr><th>S</th><td><b>Sink rate</b> not excessive</td></tr>
        </table>
        <p class="s1-note">If any of them aren't true by your stabilized gate — <b>go around</b>.</p>` },
      { h: "\"How would you correct being ___ and ___ on final?\"", widget: "approachGrid", html: `
        <p>Think <b>energy</b>: altitude and airspeed trade against each other with <b>pitch</b>; <b>power</b> adds or removes energy.
        Tap a box.</p>` },
    ],
    drill: [
      { type: "acronym", word: "CCLAPS", items: [
        { l: "C", w: "Checklist" },
        { l: "C", w: "Centerline" },
        { l: "L", w: "Landing configuration", alt: ["landing", "config", "flaps"] },
        { l: "A", w: "Airspeed (+5/−0)", alt: ["airspeed", "speed"] },
        { l: "P", w: "Power set", alt: ["power"] },
        { l: "S", w: "Sink rate not excessive", alt: ["sink", "descent"] },
      ] },
      { type: "quiz", qs: [
        { q: "High and fast on final. Correction?", fig: () => Diagrams.glidepath("high", "fast"),
          o: ["Reduce power (to idle if needed), pitch to bleed the speed, add flaps if within Vfe — go around if it won't stabilize",
              "Add power and pitch down", "Pitch down to get back on the glidepath", "Hold it and let it sort itself out"],
          why: "Too much energy on both counts — power is the only thing that removes energy." },
        { q: "High and slow on final. Correction?", fig: () => Diagrams.glidepath("high", "slow"),
          o: ["Lower the nose — trade the extra altitude for airspeed — then set power for the glidepath",
              "Add power and raise the nose", "Reduce power and raise the nose", "Add flaps"],
          why: "Altitude converts to airspeed with pitch. Raising the nose when slow heads for a stall." },
        { q: "Low and fast on final. Correction?", fig: () => Diagrams.glidepath("low", "fast"),
          o: ["Raise the nose — trade the extra airspeed for altitude — back to target speed, then set power",
              "Reduce power", "Pitch down", "Add power"],
          why: "Use the excess speed to climb back to the glidepath." },
        { q: "Low and slow on final. Correction?", fig: () => Diagrams.glidepath("low", "slow"),
          o: ["Add power and raise the nose to the glidepath — and go around if it isn't fixed right away",
              "Pitch down for airspeed", "Raise the nose only", "Reduce power"],
          why: "The most dangerous corner: short of energy, close to the ground, close to a stall. Power first." },
        { q: "What's the airspeed tolerance in CCLAPS?", o: ["+5 / −0 knots", "±5 knots", "±10 knots", "+10 / −5 knots"],
          why: "Never slow — slow is the stall side." },
        { q: "PAPI shows four red lights. You are…", o: ["Well below the glidepath", "On the glidepath", "Slightly high", "Well above"],
          why: "\"Red over white, you're all right\" is the VASI; on a PAPI two white / two red is on path, all red is low.", fig: () => Diagrams.glidepath("low", "on") },
      ] },
    ],
  },

  /* ============================== LIGHT GUN ============================= */
  lightgun: {
    name: "Light gun & lost comms", tag: "COMM", color: "#ff6b81",
    learn: [
      { h: "Light gun signals (91.125)", html: `
        <table class="s1-table wide lg-table">
          <tr><th></th><th>On the ground</th><th>In flight</th></tr>
          <tr><td><span class="lg-dot g"></span> Steady green</td><td>Cleared for takeoff</td><td>Cleared to land</td></tr>
          <tr><td><span class="lg-dot g blink"></span> Flashing green</td><td>Cleared to taxi</td><td>Return for landing (then steady green)</td></tr>
          <tr><td><span class="lg-dot r"></span> Steady red</td><td>Stop</td><td>Give way to other aircraft and continue circling</td></tr>
          <tr><td><span class="lg-dot r blink"></span> Flashing red</td><td>Taxi clear of the runway in use</td><td>Airport unsafe — do not land</td></tr>
          <tr><td><span class="lg-dot w blink"></span> Flashing white</td><td>Return to starting point on airport</td><td>N/A</td></tr>
          <tr><td><span class="lg-dot alt"></span> Alternating red/green</td><td>Exercise extreme caution</td><td>Exercise extreme caution</td></tr>
        </table>` },
      { h: "Lost comms — VFR into a towered airport", html: `
        <ol class="s1-list">
          <li><b>Troubleshoot:</b> volume, squelch, frequency, headset jacks, the other radio, circuit breakers, the hand mic.</li>
          <li><b>Squawk 7600.</b></li>
          <li>Stay <b>outside or above Class D</b> until you've worked out the direction and flow of traffic.</li>
          <li><b>Join the pattern</b> and watch the tower for light signals.</li>
          <li><b>Acknowledge:</b> in flight — <b>rock the wings</b> (day), <b>flash the landing or nav lights</b> (night). On the ground — <b>move the ailerons or rudder</b> (day), flash the lights (night).</li>
        </ol>` },
    ],
    drill: [
      { type: "quiz", qs: [
        { q: "What does it mean?", fig: () => Diagrams.lightGun("green", "steady", false),
          o: ["Cleared to land", "Return for landing", "Cleared to taxi", "Give way and circle"], why: "Steady green in flight." },
        { q: "What does it mean?", fig: () => Diagrams.lightGun("green", "flash", false),
          o: ["Return for landing", "Cleared to land", "Airport unsafe", "Exercise extreme caution"], why: "Flashing green in flight — followed by a steady green when it's time." },
        { q: "What does it mean?", fig: () => Diagrams.lightGun("red", "steady", false),
          o: ["Give way to other aircraft and continue circling", "Airport unsafe, do not land", "Stop", "Return for landing"], why: "Steady red in flight." },
        { q: "What does it mean?", fig: () => Diagrams.lightGun("red", "flash", false),
          o: ["Airport unsafe — do not land", "Give way and continue circling", "Taxi clear of the runway", "Exercise extreme caution"], why: "Flashing red in flight." },
        { q: "What does it mean?", fig: () => Diagrams.lightGun("green", "steady", true),
          o: ["Cleared for takeoff", "Cleared to taxi", "Cleared to land", "Return to starting point"], why: "Steady green on the ground." },
        { q: "What does it mean?", fig: () => Diagrams.lightGun("green", "flash", true),
          o: ["Cleared to taxi", "Cleared for takeoff", "Return to starting point", "Stop"], why: "Flashing green on the ground." },
        { q: "What does it mean?", fig: () => Diagrams.lightGun("red", "steady", true),
          o: ["Stop", "Taxi clear of the runway in use", "Return to starting point", "Exercise extreme caution"], why: "Steady red on the ground." },
        { q: "What does it mean?", fig: () => Diagrams.lightGun("red", "flash", true),
          o: ["Taxi clear of the runway in use", "Stop", "Airport unsafe", "Return to starting point"], why: "Flashing red on the ground." },
        { q: "What does it mean?", fig: () => Diagrams.lightGun("white", "flash", true),
          o: ["Return to starting point on airport", "Cleared to taxi", "Exercise extreme caution", "Taxi clear of the runway"], why: "Flashing white — ground only." },
        { q: "What does it mean?", fig: () => Diagrams.lightGun("alt", "steady", false),
          o: ["Exercise extreme caution", "Airport unsafe", "Return for landing", "Give way"], why: "Alternating red and green — same meaning on the ground and in the air." },
        { q: "Lost comms, daytime, in the pattern. How do you acknowledge a light signal?",
          o: ["Rock the wings", "Flash the landing light", "Squawk ident", "Move the rudder"], why: "At night, flash the landing or nav lights." },
        { q: "Which transponder code for lost comms?", o: ["7600", "7700", "7500", "1200"], why: "7500 hijack · 7600 radio failure · 7700 emergency." },
        { q: "Lost comms, VFR, inbound to a towered field. Where do you wait while working out the flow of traffic?",
          o: ["Outside or above the Class D", "In the pattern", "Over the runway at pattern altitude", "On the ground at a nearby field"],
          why: "Then join the pattern and watch for the light gun." },
      ] },
    ],
  },

  /* ============================== UNTOWERED ============================= */
  untowered: {
    name: "Untowered airports", tag: "COMM", color: "#ff6b81",
    learn: [
      { h: "Flying the pattern without a tower", fig: () => Diagrams.untowered(), html: `
        <ul class="s1-list">
          <li><b>CTAF</b> — the common traffic advisory frequency (often the UNICOM). Self-announce: who you're talking to, who you are, where you are, what you're doing, and the airport name again.</li>
          <li>Calls about <b>10 miles out</b>, entering, downwind, base, final, and clear of the runway.</li>
          <li><b>Left traffic</b> unless the chart supplement or a segmented circle says otherwise.</li>
          <li>Enter on a <b>45° to midfield downwind</b> at pattern altitude (typically <b>1,000 ft AGL</b>).</li>
          <li>Depart straight out, or with a 45° turn in the direction of traffic after reaching pattern altitude.</li>
        </ul>` },
      { h: "Segmented circle", fig: () => Diagrams.segmentedCircle(), html: `
        <p>Shows the wind direction (cone/tee/tetrahedron), the landing runways, and <b>traffic pattern indicators</b> —
        L-shaped markers that show which way the pattern turns when it isn't standard left traffic.</p>` },
    ],
    drill: [
      { type: "quiz", qs: [
        { q: "Standard traffic pattern direction at an untowered airport?", o: ["Left turns, unless marked otherwise", "Right turns", "Pilot's choice", "Whatever the last aircraft did"],
          why: "AIM 4-3-3. Check the Chart Supplement and the segmented circle." },
        { q: "Recommended pattern entry?", o: ["45° to the downwind leg, abeam midfield, at pattern altitude", "Straight-in to final", "Crosswind leg at pattern altitude", "Overhead the runway, then descend"],
          why: "Straight-ins are legal but not recommended." },
        { q: "Typical pattern altitude for a light airplane?", o: ["1,000 ft AGL", "500 ft AGL", "1,500 ft AGL", "2,000 ft MSL"], why: "Unless the airport publishes something else." },
        { q: "Where do you make your first self-announce call inbound?", o: ["About 10 miles out", "On downwind", "On final", "When you see the airport"], why: "AC 90-66 recommends ~10 miles." },
        { q: "What do the L-shaped markers at a segmented circle show?", o: ["The direction of turns in the pattern", "Where to hold short", "The wind direction", "The fuel pumps"],
          why: "Traffic pattern indicators — used when traffic isn't standard left.", fig: () => Diagrams.segmentedCircle() },
      ] },
    ],
  },

  /* ========================== SIGNS & MARKINGS ========================== */
  signs: {
    name: "Signs & markings", tag: "COMM", color: "#ff6b81",
    learn: [
      { h: "Signs (AIM 2-3)", html: `
        <div class="s1-signs">
          <figure>${Diagrams.sign([sgn("mandatory", "9-27")])}<figcaption><b>Mandatory</b> — red, white letters. Runway holding position. Don't cross without a clearance.</figcaption></figure>
          <figure>${Diagrams.sign([sgn("noentry", "")])}<figcaption><b>No entry</b> — mandatory.</figcaption></figure>
          <figure>${Diagrams.sign([sgn("location", "B")])}<figcaption><b>Location</b> — black, yellow letters and border. <i>Where you are.</i></figcaption></figure>
          <figure>${Diagrams.sign([sgn("location", "B"), sgn("direction", "← A")])}<figcaption><b>Direction</b> — yellow, black letters, arrow. <i>Where the taxiways go.</i></figcaption></figure>
          <figure>${Diagrams.sign([sgn("destination", "RAMP →")])}<figcaption><b>Destination</b> — yellow, black letters, arrow. <i>How to get to a place.</i></figcaption></figure>
          <figure>${Diagrams.sign([sgn("distance", "4")])}<figcaption><b>Runway distance remaining</b> — black, white number (thousands of feet).</figcaption></figure>
          <figure>${Diagrams.sign([sgn("rwyBoundary", "")])}<figcaption><b>Runway boundary</b> — faces you as you exit. Past it, you're clear.</figcaption></figure>
          <figure>${Diagrams.sign([sgn("ilsBoundary", "")])}<figcaption><b>ILS critical area boundary.</b></figcaption></figure>
        </div>` },
      { h: "Hold-short markings", fig: () => Diagrams.holdShort(), html: `
        <p>Four yellow lines — two solid, two dashed. <b>Solid side: you stop.</b> Dashed side: you may cross (it's how you exit a runway).</p>` },
      { h: "Runway markings", fig: () => Diagrams.runway(), html: `<p>White on runways, yellow on taxiways. Threshold bars · runway number · touchdown zone · aiming point · centerline.</p>` },
      { h: "Displaced threshold", fig: () => Diagrams.displaced(), html: `<p>Arrows lead to the landing threshold. You may <b>taxi, take off and roll out</b> on the displaced area — <b>don't land</b> on it.</p>` },
      { h: "Closed runway", fig: () => Diagrams.closedRunway(), html: `<p>Yellow X — closed. Don't land, take off or taxi on it. (Chevrons on a blast pad / stopway: no taxi, takeoff or landing either.)</p>` },
    ],
    drill: [
      { type: "quiz", qs: [
        { q: "What kind of sign?", fig: () => Diagrams.sign([sgn("mandatory", "9-27")]),
          o: ["Runway holding position (mandatory)", "Runway location", "Direction to runway 9-27", "Runway distance remaining"], why: "Red with white letters = mandatory instruction." },
        { q: "What kind of sign?", fig: () => Diagrams.sign([sgn("location", "B")]),
          o: ["Location — you're on taxiway B", "Direction to taxiway B", "Destination B", "Hold short of B"], why: "Black with yellow letters and border = you are here." },
        { q: "What does it tell you?", fig: () => Diagrams.sign([sgn("location", "A"), sgn("direction", "← C")]),
          o: ["You're on A; taxiway C is to the left", "You're on C; A is to the left", "Turn left onto A", "Hold short of C"], why: "Location on the left of the array, direction sign next to it." },
        { q: "What kind of sign?", fig: () => Diagrams.sign([sgn("noentry", "")]),
          o: ["No entry", "Hold short", "Closed runway", "ILS critical area"], why: "Mandatory sign — aircraft entry prohibited." },
        { q: "What does it tell you?", fig: () => Diagrams.sign([sgn("distance", "3")]),
          o: ["3,000 ft of runway remaining", "Taxiway 3", "Runway 3", "Exit in 3 seconds"], why: "Black with a white number, along the runway edge." },
        { q: "When you pass this sign while exiting the runway, you are…", fig: () => Diagrams.sign([sgn("rwyBoundary", "")]),
          o: ["Clear of the runway", "Entering the ILS critical area", "Required to hold", "On the runway"], why: "Runway boundary sign — it faces the runway side." },
        { q: "Approaching these lines from the TAXIWAY, you see the solid lines first. You must…", fig: () => Diagrams.holdShort(),
          o: ["Stop — hold short unless cleared onto or across the runway", "Continue — you may cross", "Stop only at night", "Stop only at towered airports"],
          why: "Solid lines on your side = hold." },
        { q: "What may you do on a displaced threshold area?", fig: () => Diagrams.displaced(),
          o: ["Taxi, take off and roll out — but not land", "Land only", "Nothing at all", "Park"], why: "Arrows lead to the landing threshold." },
        { q: "Yellow X on a runway means…", fig: () => Diagrams.closedRunway(),
          o: ["Closed", "Displaced threshold", "Helipad", "Stopway"], why: "Closed runway or taxiway." },
        { q: "What kind of sign?", fig: () => Diagrams.sign([sgn("destination", "RAMP →")]),
          o: ["Destination — the ramp is to the right", "Location — you're on the ramp", "Direction to taxiway R", "Information"], why: "Yellow with black letters and an arrow, naming a place rather than a taxiway." },
      ] },
    ],
  },
};

/* ------------------------------- systems -------------------------------- */
const STAGE1_SYSTEMS = [
  { id: "engine", name: "Engine", points: [
      "Lycoming IO-360-L2A",
      "180 hp at 2,700 RPM",
      "Four cylinders, horizontally opposed",
      "Air-cooled, fuel-injected, normally aspirated, direct drive",
    ],
    qs: [
      { q: "The C172S engine is…", o: ["Lycoming IO-360, 180 hp, 4-cyl horizontally opposed, air-cooled, fuel-injected", "Continental O-300, 145 hp, carbureted", "Lycoming O-320, 160 hp, carbureted", "Lycoming IO-540, 300 hp, turbocharged"], why: "IO = injected, opposed; 360 cubic inches." },
      { q: "Why doesn't the 172S have carb heat?", o: ["It's fuel-injected — there's no carburetor venturi to ice", "Its engine runs too hot", "It has an alternate static source instead", "It's turbocharged"], why: "Injected engines can still get induction icing — there's an alternate air door — but no carb ice." },
    ] },
  { id: "prop", name: "Propeller", points: [
      "McCauley, two-blade, all-metal",
      "Fixed pitch — a compromise between climb and cruise",
      "RPM is set with the throttle, read on the tach",
    ],
    qs: [
      { q: "What controls RPM in the 172S?", o: ["The throttle — the prop is fixed pitch", "A prop control knob", "The mixture", "A governor"], why: "No constant-speed prop, so no blue knob." },
    ] },
  { id: "fuel", name: "Fuel", fig: () => Diagrams.fuelSystem(), points: [
      "Two wing tanks — 56 gal total, 53 usable; vented",
      "Gravity-fed through the selector (LEFT · BOTH · RIGHT) to a reservoir tank",
      "Electric auxiliary fuel pump for priming and as backup",
      "Fuel shutoff valve (red push-pull knob), then the strainer",
      "Engine-driven pump → fuel/air control unit (servo) → distribution valve → injector nozzles",
      "100LL — blue. Sump the drains on every preflight",
    ],
    qs: [
      { q: "Usable fuel in the C172S?", o: ["53 gallons", "56 gallons", "40 gallons", "48 gallons"], why: "56 total, 3 unusable." },
      { q: "Color of 100LL avgas?", o: ["Blue", "Green", "Red", "Clear/straw"], why: "Jet-A is clear/straw — and would destroy this engine." },
      { q: "What's the electric auxiliary fuel pump for?", o: ["Priming for the start, and a backup if the engine-driven pump fails", "It runs all the time in cruise", "Transferring fuel between tanks", "Cooling the fuel"], why: "On for the start, then per the checklist." },
      { q: "Fuel path from the selector to the cylinders?", o: ["Selector → reservoir → aux pump → shutoff valve → strainer → engine pump → servo → distribution valve → nozzles", "Strainer → selector → tanks → nozzles", "Aux pump → tanks → selector → nozzles", "Servo → selector → reservoir → nozzles"],
        why: "Gravity to the reservoir, pumps from there.", fig: () => Diagrams.fuelSystem() },
    ] },
  { id: "oil", name: "Oil", points: [
      "Wet sump, 8-quart capacity",
      "Oil cools, lubricates, cleans and seals",
      "Check on every preflight — know the POH minimum and the school's fleet minimum",
      "Oil cooler; oil pressure and temperature on the EIS",
    ],
    qs: [
      { q: "Four jobs of engine oil?", o: ["Cool, lubricate, clean, seal", "Lubricate only", "Cool and heat the cabin", "Lubricate and power the flaps"], why: "Cooling matters — this is an air-cooled engine." },
      { q: "Oil sump capacity of the C172S?", o: ["8 quarts", "6 quarts", "12 quarts", "4 quarts"], why: "Check the POH and school minimums for the go/no-go number." },
    ] },
  { id: "ignition", name: "Ignition", points: [
      "Two engine-driven magnetos (left and right)",
      "Two spark plugs per cylinder, each fed by a different mag",
      "Independent of the electrical system — the engine runs with the master off",
      "Redundancy plus more complete combustion",
      "A broken P-lead means a \"hot\" mag — the prop is always live",
    ],
    qs: [
      { q: "Does the engine stop if the MASTER is turned off?", o: ["No — the magnetos are self-powered", "Yes, immediately", "Only after a few minutes", "Only if the alternator is off too"], why: "Mags don't need the battery." },
      { q: "Why two magnetos?", o: ["Redundancy and more complete combustion", "One for each tank", "One for start, one for cruise", "One powers the avionics"], why: "Two plugs per cylinder burn the mixture more completely." },
      { q: "What does a broken P-lead mean?", o: ["The mag can't be grounded — it's hot even with the key OFF", "The engine won't start", "The mag check will show no drop", "Nothing important"], why: "Treat every prop as live." },
    ] },
  { id: "electrical", name: "Electrical", fig: () => Diagrams.electrical(), points: [
      "28-volt DC system",
      "24 V main battery; 28 V, 60 A alternator",
      "Split MASTER switch (BAT | ALT); avionics bus switches",
      "Essential bus feeds the PFD; standby battery takes over if main voltage drops (≥30 min per training material — the POH just says \"a limited time\")",
      "Circuit breakers; volts and amps on the EIS",
    ],
    qs: [
      { q: "System voltage of the C172S?", o: ["28 V", "14 V", "12 V", "24 V"], why: "24 V battery, 28 V alternator — the alternator has to out-volt the battery to charge it." },
      { q: "Alternator rating?", o: ["60 amps", "30 amps", "100 amps", "40 amps"], why: "28 V, 60 A." },
      { q: "What keeps the PFD alive after a total main electrical failure?", o: ["The standby battery feeding the essential bus", "The magnetos", "The alternator", "Nothing — it goes dark"], why: "For a limited time; the standby instruments don't need power at all." },
    ] },
  { id: "pitot", name: "Pitot-static & instruments", points: [
      "Pitot tube on the left wing (heated); static port on the left side of the fuselage",
      "Alternate static source inside the cabin — airspeed and altitude read slightly high",
      "Air data computer (ADC) feeds the G1000; AHRS gives attitude and heading",
      "Standby airspeed, altimeter and attitude indicator don't need electrical power",
      "Pitot blocked: ASI acts like an altimeter. Static blocked: altimeter freezes, ASI is wrong",
    ],
    qs: [
      { q: "Pitot tube blocked (drain hole too), static open. The ASI…", o: ["Acts like an altimeter — reads higher as you climb", "Reads zero", "Freezes", "Reads normally"], why: "Trapped pitot pressure vs. falling static pressure." },
      { q: "Using the alternate static source, airspeed and altitude read…", o: ["Slightly high", "Slightly low", "Exactly the same", "Zero"], why: "Cabin pressure is a bit lower than outside." },
      { q: "Which instruments use the static port?", o: ["Altimeter, airspeed, VSI", "Altimeter only", "Airspeed only", "Attitude indicator"], why: "The airspeed uses both pitot and static." },
    ] },
  { id: "controls", name: "Flight controls & flaps", points: [
      "Conventional ailerons, elevator, rudder — cable driven",
      "Manual elevator trim tab (trim wheel)",
      "Electric single-slot flaps, 0° to 30°",
      "Vfe: 110 KIAS for 10°, 85 KIAS for 10°–30°",
    ],
    qs: [
      { q: "Max flap-extended speed beyond 10°?", o: ["85 KIAS", "110 KIAS", "100 KIAS", "70 KIAS"], why: "110 KIAS with 10°." },
      { q: "How are the C172S flaps actuated?", o: ["Electric motor", "Hydraulic", "Manual lever", "Vacuum"], why: "Electric — which matters after an electrical failure." },
    ] },
  { id: "gear", name: "Landing gear & brakes", points: [
      "Fixed tricycle gear",
      "Tubular spring-steel main gear; nose gear with an air/oil (oleo) strut and a shimmy damper",
      "Nosewheel steered through the rudder pedals",
      "Hydraulic disc brakes on the main wheels, toe-operated; parking brake",
    ],
    qs: [
      { q: "How are the C172S brakes operated?", o: ["Hydraulic disc brakes, toe brakes on the rudder pedals", "Hand lever", "Cable drum brakes", "Electric"], why: "Each pedal has its own master cylinder." },
      { q: "What absorbs shock on the nose gear?", o: ["An air/oil (oleo) strut", "Spring steel", "Rubber bungees", "Nothing"], why: "The mains are spring steel." },
    ] },
  { id: "environ", name: "Cabin heat & stall warning", points: [
      "Cabin heat: outside air warmed around the exhaust muffler shroud",
      "A cracked muffler can put carbon monoxide in the cabin — heat off, air on",
      "Stall warning: pneumatic reed horn, inlet in the left wing leading edge — no electrical power",
      "Sounds a few knots above the stall",
    ],
    qs: [
      { q: "Where does cabin heat come from?", o: ["A shroud around the exhaust muffler", "An electric heater", "Engine oil", "A combustion heater"], why: "Which is why CO is the risk." },
      { q: "Suspected carbon monoxide. Action?", o: ["Cabin heat OFF, cabin air and vents OPEN, land", "Cabin heat ON", "Climb", "Turn off the master"], why: "Ventilate and get down." },
      { q: "How does the stall warning work?", o: ["Pneumatic — suction through an inlet on the left wing sounds a reed horn", "An electric vane switch", "From the G1000 AOA computer", "A pitot-static switch"], why: "Works with the master off." },
    ] },
];
