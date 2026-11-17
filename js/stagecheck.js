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
   STAGE1_SYSTEMS    the systems the examiner picks three of. Each is
     { id, name, core?, points, qs, fig?, intro, parts, labs, tasks }
     core   the five the examiner leans on (fuel, electrical, pitot, ignition, engine)
     parts  { partId: { n, d, tip? } } — Explore cards; ids are the SysDiagrams def's part ids
     labs   [{ h, start?: statePatch, steps: [{ do, when, see }] }] — a step ticks when the
            student's own manipulation makes {...state, ...model(state)} match `when`
     tasks  graded drill tasks on the live diagram, `start`/`apply`/`goal`/`when` are
            state or model keys of the system's SysDiagrams def:
              { t:"find", q, part | parts:[..], blind?, start?, why }  click a part / a set
              { t:"order", q, seq:[partId..], start?, why }            click parts in sequence
              { t:"set", q, start?, goal, why }                        operate controls to meet goal
              { t:"predict", q, o:[correct, ..], start?, apply?, mask?, why }  first option correct
              { t:"locate", q, id:"sys.part", why }                    pick it on the 3D/3-view airplane
     Misses-deck key for a task is "x:" + sysId + "|" + q (so don't reword q casually).
     qs are the quiz questions (first option correct); the mock oral pools them.

   Sources: 14 CFR 91.103 / 91.17 / 91.125 / 91.171 / 91.203 / 91.205 /
   91.207 / 91.213 / 91.409 / 91.411 / 91.413 / 43.3 / 43.9 / Part 43 App. A;
   AIM 4-3-3, 4-3-13, 2-3; PHAK (FAA-H-8083-25) ch. 2, 5, 14; AFH
   (FAA-H-8083-3C) ch. 5, 9; C172S POH sections 2, 6, 7. Systems numbers come
   from the POH as quoted in training material — the school's POH governs.
   Systems lab facts verified against the C172S NAV III POH (via secondary
   quotes): STBY BATT switch ARM / OFF / TEST; 28 gal per tank (56 / 53
   usable); LOW VOLTS at or below 24.5 V (main or essential bus); mag check
   1,800 RPM, 150 RPM max drop, 50 RPM max difference (printed in the 172R
   POH; same figures used here). Left out on purpose, unverified: fuel drain
   count, nose steering angles, battery location, sump positions, firing order.
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
          o: ["Student pilot certificate, medical and photo ID — with a current solo endorsement (the logbook itself only has to come on a solo cross-country)",
              "Just the student pilot certificate",
              "Medical and photo ID only",
              "Pilot certificate and the aircraft's registration"],
          why: "61.3 for the certificate, medical and ID; 61.87(n) for the endorsement. 61.51(i) requires carrying the logbook only on solo cross-countries — most schools want it every solo." },
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
          <tr><th>I</th><td><b>Inspection — 100 hr</b></td><td>Required when the airplane carries anyone <b>for hire</b>, or is used for <b>flight instruction for hire</b> in an airplane the instructor provides — the school's airplanes (91.409(b)). Rental alone doesn't trigger it. May be overflown by up to <b>10 hours</b> only to reach a place it can be done; the overflight counts against the next 100.</td></tr>
          <tr><th>A</th><td><b>Altimeter / pitot-static</b></td><td><b>24 calendar months</b> (91.411) — for IFR in controlled airspace.</td></tr>
          <tr><th>T</th><td><b>Transponder</b></td><td><b>24 calendar months</b> (91.413).</td></tr>
          <tr><th>E</th><td><b>ELT</b></td><td>Inspect every <b>12 calendar months</b>; replace the battery after <b>1 hour</b> of cumulative use or <b>half its useful life</b> (91.207).</td></tr>
          <tr><th>S</th><td><b>Squawks</b></td><td>Discrepancies — check the open squawks on <b>Needle Nine</b> before every flight.</td></tr>
        </table>`, fig: () => Diagrams.inspections() },
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
          o: ["It's used for flight instruction for hire, in an airplane the school provides", "Every airplane needs one",
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
        </table>`, fig: () => Diagrams.pohMap() },
    ],
    drill: [
      { type: "acronym", word: "ARROW", items: [
        { l: "A", w: "Airworthiness certificate", alt: ["airworth"] },
        { l: "R", w: "Registration" },
        { l: "R", w: "Radio station license", alt: ["radio"] },
        { l: "O", w: "Operating limitations", alt: ["operating", "poh", "limit"] },
        { l: "W", w: "Weight & balance", alt: ["weight", "w&b"] },
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
        <p class="s1-note">Night adds <b>FLAPS</b> (91.205(c)): Fuses (spares, if no breakers) · Landing light (if for hire) · Anticollision · Position lights · Source of electrical power.</p>`,
        fig: () => Diagrams.panel205() },
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
          why: "A landing light is only required at night when flying for hire (FLAPS). Deactivate or remove and placard INOP (a 43.9 entry if that took maintenance) — your call as PIC." },
        { item: "Landing light", flight: "Night, flight instruction for hire", req: true,
          why: "91.205(c)(4): at night, for hire, the landing light is required. No-go." },
        { item: "Anticollision (strobe) lights", flight: "Day VFR, local", req: true,
          why: "A — 91.205(b)(11): an anticollision light system on airplanes certificated after March 11, 1996. No-go (a failure in flight lets you continue to where it can be fixed)." },
        { item: "Position (nav) lights", flight: "Day VFR, back well before sunset", given: "The KOEL and TCDS don't require them for day VFR. No AD applies.", req: false,
          why: "Position lights are in FLAPS — night only. Placard and go, and be on the ground before sunset." },
        { item: "Pitot heat", flight: "Day VFR, no visible moisture", given: "The KOEL and TCDS don't require it for day VFR. No AD applies.", req: false,
          why: "Not in 91.205 for day VFR. Placard INOP (record per 43.9 if deactivating it took maintenance), PIC decides." },
        { item: "Oil temperature gauge", flight: "Day VFR, local", req: true,
          why: "O — oil temperature gauge for an air-cooled engine. No-go." },
        { item: "Magnetic compass", flight: "Day VFR, local", req: true,
          why: "M — magnetic direction indicator. The G1000 heading doesn't replace it. No-go." },
        { item: "Cabin dome light", flight: "Day VFR, local", given: "The KOEL and TCDS don't require it. No AD applies.", req: false,
          why: "Not required by anything. Placard INOP and go." },
      ] },
      { type: "quiz", qs: [
        { q: "An item isn't required by anything. What do you do before flight (91.213(d))?",
          o: ["Remove or deactivate it and placard it \"Inoperative\" (recorded per 43.9 if it took maintenance) — and the PIC decides it's safe",
              "Nothing — just don't use it", "Get a special flight permit", "Call the FSDO"],
          why: "91.213(d)(3): removal is recorded per 43.9; deactivation is recorded too if it involves maintenance. The final say is the PIC's." },
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
          <li><b>Paperwork — 43.9:</b> a logbook entry with a description of the work, the date it was completed, your name, and — to return it to service — your signature, certificate number and kind of certificate.</li>
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
        { q: "What goes in the logbook entry?", o: ["Description, date completed, your name, signature, certificate number and kind", "Just your signature", "The tach time only", "Nothing — preventive maintenance isn't recorded"],
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
    learn: [{ h: "Systems lab", widget: "systemsLab" }],
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
      { h: "How a wing makes lift", fig: () => Diagrams.liftFlow(), html: `
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
        </ul>`, fig: () => Diagrams.spin() },
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
        { q: "Straight-and-level, unaccelerated flight. How do the four forces compare?", fig: () => Diagrams.forces(),
          o: ["Lift equals weight and thrust equals drag", "Lift is greater than weight", "Thrust is greater than drag", "All four are equal to each other"],
          why: "PHAK ch. 5: in steady flight the opposing forces are in equilibrium." },
        { q: "Level turn at 60° of bank. What's the load factor?", fig: () => Diagrams.loadFactor(60, true),
          o: ["2 G", "1.4 G", "1.15 G", "3 G"],
          why: "n = 1 / cos(bank): 1.15 G at 30°, 1.41 G at 45°, 2 G at 60° (PHAK ch. 5)." },
        { q: "In that 60° level turn, the stall speed is…", fig: () => Diagrams.loadFactor(60, true),
          o: ["About 41% higher — it rises with the square root of the load factor", "Unchanged — stall speed is a fixed number", "Twice as high", "Lower, because the turn adds lift"],
          why: "√2 ≈ 1.41. The same wing stalls at a higher speed when it has to carry twice the weight — why steep turns low and slow bite." },
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
        <p class="s1-note">If any of them aren't true by your stabilized gate — <b>go around</b>.</p>`, fig: () => Diagrams.gate() },
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
          why: "Too much energy on both counts. Reducing power stops adding energy; drag — flaps, a slip — takes it away." },
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
        { q: "Per the school's CCLAPS, what's the airspeed tolerance on final?", o: ["+5 / −0 knots", "±5 knots", "±10 knots", "+15 / −0 knots"],
          why: "Never slow — slow is the stall side. (The ACS allows +10/−5 on a normal approach; the school's gate is tighter.)" },
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
        </ol>`, fig: () => Diagrams.acknowledge() },
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
          o: ["Rock the wings", "Flash the landing light", "Squawk ident", "Move the rudder"], why: "AIM 4-2-13. At night, flash the landing or nav lights; on the ground by day, move the ailerons or rudder (AIM 4-3-13)." },
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
          <figure>${Diagrams.sign([sgn("direction", "← A"), sgn("location", "B")])}<figcaption><b>Direction</b> — yellow, black letters, arrow. <i>Where the taxiways go</i> — left turns sit left of the location sign, right turns right.</figcaption></figure>
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
        { q: "What does it tell you?", fig: () => Diagrams.sign([sgn("direction", "← C"), sgn("location", "A")]),
          o: ["You're on A; taxiway C is to the left", "You're on C; A is to the left", "Turn left onto A", "Hold short of C"],
          why: "The black location sign says where you are. Direction signs for left turns go to its left, right turns to its right (AIM 2-3-10)." },
        { q: "What kind of sign?", fig: () => Diagrams.sign([sgn("noentry", "")]),
          o: ["No entry", "Hold short", "Closed runway", "ILS critical area"], why: "Mandatory sign — aircraft entry prohibited." },
        { q: "What does it tell you?", fig: () => Diagrams.sign([sgn("distance", "3")]),
          o: ["3,000 ft of runway remaining", "Taxiway 3", "Runway 3", "Exit in 3 seconds"], why: "Black with a white number, along the runway edge." },
        { q: "When you pass this sign while exiting the runway, you are…", fig: () => Diagrams.sign([sgn("rwyBoundary", "")]),
          o: ["Clear of the runway", "Entering the ILS critical area", "Required to hold", "On the runway"], why: "Runway boundary sign — it faces the runway side." },
        { q: "At a towered airport, approaching these lines from the TAXIWAY, you see the solid lines first. You must…", fig: () => Diagrams.holdShort(),
          o: ["Stop — hold short unless cleared onto or across the runway", "Continue — you may cross", "Stop only at night", "Stop only if traffic is on final"],
          why: "Solid lines on your side = hold." },
        { q: "What may you do on a displaced threshold area?", fig: () => Diagrams.displaced(),
          o: ["Taxi, take off and roll out — but not land", "Land only", "Nothing at all", "Park"], why: "Arrows lead to the landing threshold." },
        { q: "Yellow X on a runway means…", fig: () => Diagrams.closedRunway(),
          o: ["Closed", "Displaced threshold", "Helipad", "Stopway"], why: "Closed runway or taxiway." },
        { q: "Dashed yellow lines appear on both sides of the taxiway centerline. They warn you…", fig: () => Diagrams.marking("enhanced"),
          o: ["A runway holding position marking is just ahead", "You're entering an ILS critical area", "The taxiway is closed", "The taxiway edge is unusable"],
          why: "Enhanced taxiway centerline — up to 150 ft before a runway holding position marking (AIM 2-3-4)." },
        { q: "What is the ladder-shaped marking?", fig: () => Diagrams.marking("ilsHold"),
          o: ["ILS critical area holding position — hold here when ATC says \"hold short of the ILS critical area\"", "Runway holding position marking", "Taxiway edge marking", "Non-movement area boundary"],
          why: "Two solid lines joined by pairs of short bars (AIM 2-3-5). It's farther from the runway than the hold-short line." },
        { q: "Side B of this taxiway has DASHED double yellow edge lines. What's beyond them?", fig: () => Diagrams.marking("edge"),
          o: ["Pavement aircraft may use — an apron, for example", "Pavement not meant for aircraft — don't cross", "A runway", "A closed taxiway"],
          why: "AIM 2-3-4: continuous double lines = the pavement beyond isn't for aircraft; dashed = it is." },
        { q: "What kind of sign?", fig: () => Diagrams.sign([sgn("destination", "RAMP →")]),
          o: ["Destination — the ramp is to the right", "Location — you're on the ramp", "Direction to taxiway R", "Information"], why: "Yellow with black letters and an arrow, naming a place rather than a taxiway." },
      ] },
    ],
  },
};

/* ------------------------------- systems -------------------------------- */
/* Per system: points/qs/fig (static text), plus the lab content —
     core   five systems the examiner leans on (fuel, electrical, pitot, ignition, engine)
     intro  one sentence under the chip
     parts  { partId: { n, d, tip? } }  Explore cards; keys are the part ids the diagram draws
     labs   guided scenarios; a step ticks when the student's own manipulation makes state+model match `when`
     tasks  graded drill tasks (find / order / set / predict / locate), see the header.
   Part ids, state keys and model keys follow the diagram defs (sysdiag-a/b).
   Facts checked against the C172S NAV III POH as quoted by secondary sources: STBY BATT is ARM / OFF / TEST;
   28 gal per tank; LOW VOLTS at or below 24.5 V on the main or essential bus; mag check 1,800 RPM,
   150 RPM max drop, 50 RPM max difference (the 172R printed figures — the school's POH governs). */
const STAGE1_SYSTEMS = [
  { id: "engine", name: "Engine", core: true, points: [
      "Lycoming IO-360-L2A",
      "180 hp at 2,700 RPM",
      "Four cylinders, horizontally opposed",
      "Air-cooled, fuel-injected, normally aspirated, direct drive",
    ],
    intro: "Four opposed cylinders turning the prop directly — injected, air-cooled, no carburetor to ice.",
    parts: {
      cylinder:    { n: "Cylinder", d: "Where the four strokes happen: intake, compression, power, exhaust. Two of the four cylinders sit on each side of the crankcase.", tip: "\"Walk me through the four strokes.\"" },
      piston:      { n: "Piston", d: "Moves up and down in the cylinder; the connecting rod turns that into crankshaft rotation. Power stroke is the only one that pushes the crank." },
      valves:      { n: "Intake and exhaust valves", d: "Intake lets the air-fuel charge in, exhaust lets the burnt gas out. Both are closed during compression and power." },
      plug:        { n: "Spark plug", d: "Lights the compressed mixture just before the piston tops out. Each cylinder has two plugs, fed by different magnetos.", tip: "Why two? Redundancy and a more complete burn." },
      injector:    { n: "Injector nozzle", d: "Sprays fuel into the intake port — this is where fuel meets air. A continuous-flow nozzle at each cylinder, not a carburetor.", tip: "\"Where does the fuel meet the air?\"" },
      crank:       { n: "Crankshaft", d: "Turns the pistons' up-and-down into rotation. Direct drive: the prop bolts to it, so engine RPM is prop RPM." },
      airFilter:   { n: "Induction air filter", d: "Cleans the air before it reaches the fuel/air control unit. Check it on the preflight.", tip: "What happens if it blocks or ices over?" },
      altAir:      { n: "Alternate air door", d: "A door in the airbox that gives the engine a path around a blocked filter. Alternate air is unfiltered.", tip: "No carb heat — this is the induction-icing answer." },
      servo:       { n: "Fuel/air control unit", d: "The \"servo\": the throttle sets the air, the mixture sets the fuel, and the unit meters both before the fuel goes on to the divider." },
      manifold:    { n: "Intake manifold", d: "Carries the metered air to each cylinder's intake port." },
      exhaust:     { n: "Exhaust system", d: "Collects the burnt gas from the cylinders and sends it overboard through the muffler." },
      muffler:     { n: "Muffler and heat shroud", d: "Quiets the exhaust; the shroud around it is where cabin heat comes from.", tip: "A cracked muffler can leak carbon monoxide into the heat." },
      cooling:     { n: "Cooling fins and baffles", d: "Air-cooled: fins on the cylinders and baffles that force cowl air across them. No radiator, no coolant.", tip: "Why does a long ground run overheat the engine?" },
      designation: { n: "IO-360-L2A", d: "I = fuel-injected, O = horizontally opposed, 360 = cubic inches. 180 hp at 2,700 RPM." },
    },
    labs: [
      { h: "Four strokes", start: { view: "cycle", stroke: 0, play: false }, steps: [
        { do: "Step to Compression.", when: { stroke: 1 }, see: "Both valves closed; the piston squeezes the charge." },
        { do: "Step to Power.", when: { stroke: 2 }, see: "Spark lights the charge and the piston is driven down — the only stroke that gives power." },
        { do: "Step to Exhaust.", when: { stroke: 3 }, see: "Exhaust valve open; the piston pushes the burnt gas out. Then back to intake." },
      ] },
      { h: "Blocked air filter", start: { view: "layout", filter: "clear" }, steps: [
        { do: "Block the air filter.", when: { filter: "blocked", airVia: "altAir" }, see: "The engine pulls air through the alternate air door instead — unfiltered, but still running." },
        { do: "Clear it again.", when: { filter: "clear", airVia: "filter" }, see: "Back through the filter." },
      ] },
    ],
    tasks: [
      { t: "order", q: "Trace the induction air from outside to the exhaust.", start: { view: "layout" },
        seq: ["airFilter", "servo", "manifold", "cylinder", "exhaust", "muffler"],
        why: "Filter → fuel/air control unit → manifold → cylinders → exhaust → muffler." },
      { t: "find", q: "Where does the fuel meet the air in a fuel-injected engine?", start: { view: "cycle" }, part: "injector",
        why: "A nozzle at each cylinder's intake port sprays fuel into the air. No carburetor." },
      { t: "find", q: "The tag \"IO-360-L2A\" tells you the engine is injected and opposed. Find it.", start: { view: "layout" }, part: "designation",
        why: "I = injected, O = opposed. No carburetor, so no carb heat." },
      { t: "set", q: "Show the stroke that makes the power.", start: { view: "cycle", stroke: 0 }, goal: { stroke: 2 },
        why: "Spark lights the compressed charge and the piston is driven down: the power stroke." },
      { t: "predict", q: "In which strokes are BOTH valves closed?", start: { view: "cycle", stroke: 0 },
        o: ["Compression and power", "Intake and exhaust", "Intake and compression", "Power and exhaust"], apply: { stroke: 2 },
        why: "Intake opens the intake valve, exhaust opens the exhaust valve. The charge is squeezed and burned with everything shut." },
      { t: "predict", q: "The induction filter is blocked solid. What does the engine breathe?", start: { view: "layout", filter: "clear" },
        o: ["Unfiltered air through the alternate air door", "Nothing — the engine quits", "Air from the cabin vents", "Exhaust-heated carburetor air"],
        apply: { filter: "blocked" },
        why: "Not carb heat — there is no carburetor — but the alternate air door gives the engine a bypass around the filter." },
      { t: "locate", q: "Click the induction air filter.", id: "engine.airFilter", why: "Low in the engine compartment, behind the cowl inlet." },
      { t: "locate", q: "Click the exhaust muffler and its heat shroud.", id: "environ.shroud", why: "Cabin heat is air warmed around this shroud." },
    ],
    qs: [
      { q: "The C172S engine is…", o: ["Lycoming IO-360, 180 hp, 4-cyl horizontally opposed, air-cooled, fuel-injected", "Continental O-300, 145 hp, carbureted", "Lycoming O-320, 160 hp, carbureted", "Lycoming IO-540, 300 hp, turbocharged"], why: "IO = injected, opposed; 360 cubic inches." },
      { q: "Why doesn't the 172S have carb heat?", o: ["It's fuel-injected — there's no carburetor venturi to ice", "Its engine runs too hot", "It has an alternate static source instead", "It's turbocharged"], why: "Injected engines can still get induction icing — there's an alternate air door — but no carb ice." },
      { q: "Four strokes of the cycle, in order?", o: ["Intake, compression, power, exhaust", "Compression, intake, exhaust, power", "Intake, power, compression, exhaust", "Power, intake, exhaust, compression"], why: "Suck, squeeze, bang, blow." },
      { q: "What do the letters \"IO\" in IO-360 mean?", o: ["Fuel-injected, horizontally opposed", "Inline, overhead valve", "Ignition-only, no carburetor", "Intercooled, turbocharged"], why: "I = injected, O = opposed; 360 is the displacement in cubic inches." },
      { q: "Air path through the 172S induction system?", o: ["Filter → fuel/air control unit → manifold → cylinders", "Manifold → filter → cylinders → control unit", "Cylinders → filter → control unit → manifold", "Control unit → cylinders → manifold → filter"], why: "The alternate air door is the bypass around the filter." },
    ] },
  { id: "prop", name: "Propeller", points: [
      "McCauley, two-blade, all-metal",
      "Fixed pitch — a compromise between climb and cruise",
      "RPM is set with the throttle, read on the tach",
    ],
    intro: "A fixed-pitch prop is an airfoil on a spinning hub: the blade angle never changes, so RPM follows throttle and airspeed.",
    parts: {
      blade:   { n: "Prop blade", d: "A twisted airfoil. Its angle of attack falls as airspeed rises, so for a given throttle the RPM climbs in a dive and sags in a climb.", tip: "\"Why does RPM rise in a dive?\"" },
      hub:     { n: "Hub", d: "Bolts the two blades to the crankshaft flange. Fixed pitch: the blade angle is set at manufacture and can't be changed in flight." },
      spinner: { n: "Spinner", d: "Streamlines the hub and directs air into the cowl openings." },
      tach:    { n: "Tachometer", d: "Reads engine (= prop) RPM. The throttle sets it — there is no prop control.", tip: "Which control changes RPM in the 172S?" },
    },
    labs: [
      { h: "Dive at fixed throttle", start: { ias: 90 }, steps: [
        { do: "Set the airspeed slider to 120 KIAS and watch the blade AOA and the tach.", when: { ias: 120 }, see: "Blade AOA falls as airspeed rises; with the throttle unchanged RPM builds." },
        { do: "Now slow to 70 KIAS.", when: { ias: 70 }, see: "Bigger blade AOA, more load on the prop: RPM sags." },
      ] },
    ],
    tasks: [
      { t: "find", q: "Which part is the airfoil that makes the thrust?", part: "blade", why: "The blade is a twisted airfoil; thrust is its lift, pointed forward." },
      { t: "find", q: "Which instrument shows you what the throttle is doing?", part: "tach", why: "RPM is set with the throttle and read on the tach." },
      { t: "predict", q: "Fixed-pitch prop, throttle left alone. You pitch down and the airspeed rises. RPM…", start: { ias: 90 },
        o: ["Increases", "Decreases", "Stays the same", "Drops to idle"], apply: { ias: 120 },
        why: "Higher airspeed cuts the blade's angle of attack, so it's easier to turn and RPM builds." },
      { t: "predict", q: "Full throttle in a steep climb at a low airspeed, compared with level flight. RPM is…", start: { ias: 110 },
        o: ["Lower", "Higher", "The same", "Fixed by the governor"], apply: { ias: 70 },
        why: "Slow means a bigger blade angle of attack, more drag on the prop and less RPM." },
    ],
    qs: [
      { q: "What controls RPM in the 172S?", o: ["The throttle — the prop is fixed pitch", "A prop control knob", "The mixture", "A governor"], why: "No constant-speed prop, so no blue knob." },
    ] },
  { id: "fuel", name: "Fuel", core: true, fig: () => Diagrams.fuelSystem(), points: [
      "Two wing tanks — 56 gal total, 53 usable; vented",
      "Gravity-fed through the selector (LEFT · BOTH · RIGHT) to a reservoir tank",
      "Electric auxiliary fuel pump for priming and as backup",
      "Fuel shutoff valve (red push-pull knob), then the strainer",
      "Engine-driven pump → fuel/air control unit (servo) → distribution valve → injector nozzles",
      "100LL — blue. Sump the drains on every preflight",
    ],
    intro: "Gravity feeds the reservoir; from there pumps push fuel through a metering unit to four nozzles.",
    parts: {
      tankL:     { n: "Left wing tank", d: "28 gal each side, 56 total, 53 usable. Fuel runs downhill to the selector.", tip: "How much can you actually burn?" },
      tankR:     { n: "Right wing tank", d: "28 gal each side, 56 total, 53 usable. Same plumbing as the left." },
      vent:      { n: "Tank vent", d: "Lets outside air replace the fuel as it's used. An overboard vent line exits under the left wing and the tanks are tied together; the caps are vented too.", tip: "A blocked vent eventually starves the engine — look at it on the walk-around." },
      drains:    { n: "Fuel drains (sumps)", d: "Low points where water and sediment settle. Drain a sample into a clear cup on every preflight and check colour, clarity and smell.", tip: "What are you looking for in the sample?" },
      selector:  { n: "Fuel selector", d: "LEFT · BOTH · RIGHT chooses which tank feeds. BOTH for takeoff, climb and landing. There is no OFF here — the red shutoff knob is the cut-off." },
      reservoir: { n: "Reservoir tank", d: "Gravity-fed from the tanks; the pumps draw from here." },
      auxPump:   { n: "Auxiliary fuel pump", d: "Electric. ON to prime for the start and as backup if the engine-driven pump fails. It pushes fuel toward the engine — it does not move fuel between tanks.", tip: "When do you use it?" },
      shutoff:   { n: "Fuel shutoff valve", d: "Red push-pull knob on the panel. Pulled out, no fuel passes downstream — the last place you can cut fuel from the cabin.", tip: "Used in the engine-fire checklist." },
      strainer:  { n: "Fuel strainer", d: "Catches debris and water; it has its own drain." },
      enginePump:{ n: "Engine-driven fuel pump", d: "Mechanical pump on the engine; supplies the pressure in normal operation." },
      servo:     { n: "Fuel/air control unit", d: "Meters fuel according to air flow (throttle) and the mixture setting." },
      divider:   { n: "Fuel distribution valve", d: "Splits the metered fuel into four lines, one per cylinder." },
      nozzles:   { n: "Injector nozzles", d: "One per cylinder, spraying into the intake port." },
      gauges:    { n: "Fuel quantity gauges", d: "Left and right tank quantity on the EIS.", tip: "A cross-check — not a substitute for visually checking the tanks." },
    },
    labs: [
      { h: "Follow a drop of fuel", start: { sel: "BOTH", shutoff: "on", aux: false, epump: "ok" }, steps: [
        { do: "Select the LEFT tank only.", when: { sel: "LEFT", feeding: ["L"] }, see: "Only the left tank's flow lights up; everything downstream is unchanged." },
        { do: "Pull the red shutoff knob.", when: { shutoff: "off", fed: false }, see: "Fuel stops at the shutoff valve; everything downstream of it goes dry." },
        { do: "Push the shutoff back in.", when: { shutoff: "on", fed: true }, see: "Flow restored all the way to the nozzles." },
      ] },
      { h: "Pump failure", start: { epump: "fail", aux: false, sel: "BOTH", shutoff: "on" }, steps: [
        { do: "The engine-driven pump has failed. Turn the aux pump ON.", when: { aux: true, fed: true }, see: "The electric pump takes over and pressure is back." },
        { do: "Turn the aux pump OFF again.", when: { aux: false, fed: false }, see: "With neither pump working, fuel stops at the engine pump." },
      ] },
      { h: "Balance the tanks", start: { sel: "BOTH", shutoff: "on" }, steps: [
        { do: "Feed from the RIGHT tank only.", when: { sel: "RIGHT", feeding: ["R"] }, see: "Only the right tank is flowing. LEFT or RIGHT is for level cruise, to manage balance." },
        { do: "Back to BOTH.", when: { sel: "BOTH", feeding: ["L", "R"] }, see: "BOTH for takeoff, climb and landing." },
      ] },
    ],
    tasks: [
      { t: "order", q: "Trace the fuel from the selector to the cylinders.",
        seq: ["selector", "reservoir", "auxPump", "shutoff", "strainer", "enginePump", "servo", "divider", "nozzles"],
        why: "Gravity to the reservoir, then the pumps, shutoff valve, strainer, engine pump, control unit, distribution valve and nozzles." },
      { t: "find", q: "Click the strainer.", blind: true, part: "strainer", why: "After the shutoff valve, before the engine-driven pump." },
      { t: "find", q: "Click the reservoir tank.", blind: true, part: "reservoir", why: "Between the selector and the pumps." },
      { t: "find", q: "What is the last place you can shut fuel off from the cabin?", part: "shutoff", why: "The red shutoff knob — the selector only chooses tanks." },
      { t: "set", q: "The right tank is heavier. Feed the engine from it only.", start: { sel: "BOTH", shutoff: "on" }, goal: { feeding: ["R"] },
        why: "Selector to RIGHT; BOTH for takeoff and landing." },
      { t: "set", q: "The engine-driven pump has failed. Get fuel to the engine.", start: { epump: "fail", aux: false, sel: "BOTH", shutoff: "on" }, goal: { fed: true },
        why: "Aux fuel pump ON." },
      { t: "predict", q: "The shutoff knob is pulled with everything else normal. Where does the flow stop?", start: { shutoff: "on", sel: "BOTH" },
        o: ["At the shutoff valve — everything after it goes dry", "At the selector", "At the tanks", "Nowhere — the aux pump keeps it going"], apply: { shutoff: "off" },
        why: "The valve is downstream of the pumps' inlet; the aux pump can't push through a closed valve." },
      { t: "predict", q: "Does the aux fuel pump move fuel from one tank to the other?", start: { sel: "LEFT", aux: true },
        o: ["No — it pushes fuel from the reservoir toward the engine", "Yes — that's how you balance the tanks", "Yes, but only with the selector on BOTH", "Only when the engine-driven pump has failed"],
        why: "Fuel never moves between tanks; you balance by choosing which tank feeds the engine." },
      { t: "locate", q: "Click the tank vent.", id: "fuel.vent", why: "Under the left wing." },
      { t: "locate", q: "Click the right fuel tank.", id: "fuel.tankR", why: "Wing tank — the caps are on the wing top." },
    ],
    qs: [
      { q: "Usable fuel in the C172S?", o: ["53 gallons", "56 gallons", "40 gallons", "48 gallons"], why: "56 total, 3 unusable." },
      { q: "Color of 100LL avgas?", o: ["Blue", "Green", "Red", "Clear/straw"], why: "Jet-A is clear/straw — and would destroy this engine." },
      { q: "What's the electric auxiliary fuel pump for?", o: ["Priming for the start, and a backup if the engine-driven pump fails", "It runs all the time in cruise", "Transferring fuel between tanks", "Cooling the fuel"], why: "On for the start, then per the checklist." },
      { q: "Fuel path from the selector to the cylinders?", o: ["Selector → reservoir → aux pump → shutoff valve → strainer → engine pump → servo → distribution valve → nozzles", "Strainer → selector → tanks → nozzles", "Aux pump → tanks → selector → nozzles", "Servo → selector → reservoir → nozzles"],
        why: "Gravity to the reservoir, pumps from there." },
      { q: "Which selector position for takeoff and landing?", o: ["BOTH", "LEFT", "RIGHT", "Whichever tank is fuller"], why: "Both tanks feed at once; LEFT or RIGHT is for level cruise to manage balance." },
      { q: "How do you shut the fuel off from the cabin?", o: ["Pull the red fuel shutoff knob", "Select OFF on the fuel selector", "Turn the aux pump off", "Pull the mixture to idle cutoff"], why: "The selector only chooses tanks — the shutoff valve is the cut-off." },
      { q: "The engine-driven fuel pump fails. What do you do?", o: ["Turn the electric aux fuel pump ON", "Switch tanks", "Lean the mixture", "Pull the shutoff knob"], why: "The aux pump is the backup." },
    ] },
  { id: "oil", name: "Oil", points: [
      "Wet sump, 8-quart capacity",
      "Oil cools, lubricates, cleans and seals",
      "Check on every preflight — know the POH minimum and the school's fleet minimum",
      "Oil cooler; oil pressure and temperature on the EIS",
    ],
    intro: "A wet-sump system: the oil lives in the engine's own sump and is pumped through a filter and a cooler.",
    parts: {
      sump:     { n: "Oil sump", d: "Wet sump: the 8-quart reservoir is the bottom of the engine itself.", tip: "What is the minimum you'll fly with?" },
      dipstick: { n: "Dipstick", d: "Where you read the quantity on the preflight. Know the POH minimum and the school's fleet minimum." },
      pump:     { n: "Oil pump", d: "Engine-driven; draws from the sump and pressurises the system." },
      filter:   { n: "Oil filter", d: "Catches metal and carbon before the oil reaches the bearings: the \"clean\" job." },
      cooler:   { n: "Oil cooler", d: "An air-cooled engine relies on oil to carry heat away; the cooler gives some of it to the airstream." },
      gauges:   { n: "Oil pressure and temperature", d: "On the EIS. Pressure shows the oil is circulating; temperature shows it is carrying the heat." },
    },
    labs: [
      { h: "Oil trouble", start: { fault: "none" }, steps: [
        { do: "Drop the oil pressure.", when: { fault: "lowP" }, see: "Low pressure alone — cross-check the temperature and the gauge before deciding anything." },
        { do: "Now the temperature climbs as well.", when: { fault: "lowP-hotT" }, see: "Low pressure with rising temperature together means the oil is not doing its job — treat it as a real problem and plan a landing." },
      ] },
    ],
    tasks: [
      { t: "order", q: "Trace the oil around the system from the sump.", seq: ["sump", "pump", "filter", "cooler"], why: "Sump → pump → filter → cooler → engine, and back to the sump." },
      { t: "find", q: "Which part gets the heat out of the oil?", part: "cooler", why: "The oil cooler — an air-cooled engine relies on its oil to carry heat." },
      { t: "predict", q: "Oil pressure falls and oil temperature climbs at the same time. Most likely…", start: { fault: "none" },
        o: ["The oil is being lost — land as soon as possible and be ready for a power-off landing", "A gauge glitch — continue and watch it", "Normal on a hot day", "Carburetor ice"], apply: { fault: "lowP-hotT" },
        why: "Both going wrong together points at real oil loss and an engine that may be about to fail." },
      { t: "locate", q: "Click the oil dipstick.", id: "oil.dipstick", why: "Accessed through the engine cowling door on the walkaround." },
    ],
    qs: [
      { q: "Four jobs of engine oil?", o: ["Cool, lubricate, clean, seal", "Lubricate only", "Cool and heat the cabin", "Lubricate and power the flaps"], why: "Cooling matters — this is an air-cooled engine." },
      { q: "Oil sump capacity of the C172S?", o: ["8 quarts", "6 quarts", "12 quarts", "4 quarts"], why: "Check the POH and school minimums for the go/no-go number." },
    ] },
  { id: "ignition", name: "Ignition", core: true, points: [
      "Two engine-driven magnetos (left and right)",
      "Two spark plugs per cylinder, each fed by a different mag",
      "Independent of the electrical system — the engine runs with the master off",
      "Redundancy plus more complete combustion",
      "A broken P-lead means a \"hot\" mag — the prop is always live",
    ],
    intro: "Two self-powered magnetos, two plugs per cylinder — the engine doesn't need the battery to run.",
    parts: {
      key:     { n: "Ignition key switch", d: "OFF · R · L · BOTH · START. It doesn't switch anything on — it grounds a magneto to stop its spark. OFF grounds both; R grounds the left; L grounds the right." },
      magL:    { n: "Left magneto", d: "A self-contained generator driven by the engine: no battery or alternator needed. Sits on the accessory case at the back of the engine." },
      magR:    { n: "Right magneto", d: "Same, independent of the left. Each cylinder's two plugs are fed by one mag each." },
      pleadL:  { n: "Left P-lead", d: "The wire from the key switch that grounds the left mag. Broken or disconnected, the mag can't be switched off: it is hot." },
      pleadR:  { n: "Right P-lead", d: "Same for the right mag.", tip: "What does the mag check show with a broken P-lead? No drop." },
      plugs:   { n: "Spark plugs", d: "Two per cylinder, each fired by a different mag. Redundancy plus a more complete burn." },
      harness: { n: "Ignition harness", d: "Carries each mag's high-voltage pulse to its plugs." },
      tach:    { n: "Tachometer", d: "Shows what the engine is doing: a small drop on one mag, a bigger drop or roughness if a mag or plug is faulty." },
      starter: { n: "Starter", d: "Cranks the engine. The only thing here that needs the battery." },
      battery: { n: "Battery", d: "Feeds the starter (and the rest of the electrical system) — but not the ignition." },
    },
    labs: [
      { h: "The mag check", start: { key: "BOTH", pleadL: "ok", pleadR: "ok", foul: "none", master: true }, steps: [
        { do: "Turn the key to L.", when: { key: "L", rpm: "drop" }, see: "Only the left mag is firing: a small RPM drop is normal." },
        { do: "Back to BOTH.", when: { key: "BOTH", rpm: "normal" }, see: "RPM recovers. In the run-up: 1,800 RPM, max 150 drop on either mag, max 50 difference between them." },
      ] },
      { h: "Broken P-lead on the right mag", start: { key: "BOTH", pleadR: "broken" }, steps: [
        { do: "Turn the key to L.", when: { key: "L", rpm: "nodrop" }, see: "No drop at all — the right mag was never grounded, so both are still firing. That's how you detect it." },
        { do: "Now try R.", when: { key: "R", rpm: "drop" }, see: "The right mag is selected, the left is grounded: a normal drop." },
      ] },
      { h: "Hot mag", start: { key: "BOTH", pleadL: "broken" }, steps: [
        { do: "Turn the key to OFF.", when: { key: "OFF", hot: true }, see: "The left mag is still live with the key OFF: treat the propeller as live." },
      ] },
      { h: "No electricity needed", start: { key: "BOTH", master: true }, steps: [
        { do: "Turn the MASTER off.", when: { master: false, running: true }, see: "The engine keeps running — the magnetos make their own spark. The master only matters for START." },
      ] },
    ],
    tasks: [
      { t: "predict", q: "The right P-lead is broken. You select L on the mag check. What does the tach do?", start: { key: "BOTH", pleadR: "broken" },
        o: ["No drop — the right mag keeps firing", "A normal drop", "The engine quits", "A very large drop"], apply: { key: "L" },
        why: "The right mag can't be grounded, so on L both are still firing. No drop is the clue." },
      { t: "set", q: "Run the engine on the right magneto only.", start: { key: "BOTH" }, goal: { liveL: false, liveR: true },
        why: "Key to R grounds the left mag." },
      { t: "predict", q: "You turn the key OFF but the engine keeps running. What's wrong?", start: { key: "OFF", pleadL: "broken" }, mask: true,
        o: ["A broken P-lead has left a mag ungrounded — it's hot", "The master switch is still on", "The alternator is keeping it running", "The aux fuel pump is on"],
        why: "A mag that can't be grounded keeps firing. Shut the engine down with the mixture to idle cutoff and treat the prop as live." },
      { t: "find", q: "Click the wires that ground the magnetos when the key is OFF.", parts: ["pleadL", "pleadR"],
        why: "The P-leads — break one and that mag is hot." },
      { t: "predict", q: "Cruising, you turn the MASTER off. The engine…", start: { master: true },
        o: ["Keeps running — the magnetos don't need power", "Quits immediately", "Quits after a few minutes", "Runs on one magneto"], apply: { master: false },
        why: "The magnetos are self-powered." },
      { t: "find", q: "Click the only thing here that needs the battery.", part: "starter", why: "Cranking the engine. The magnetos make their own spark." },
      { t: "locate", q: "Click the left magneto.", id: "ignition.magL", why: "On the accessory case at the rear of the engine." },
      { t: "locate", q: "Click the right magneto.", id: "ignition.magR", why: "On the accessory case at the rear of the engine." },
    ],
    qs: [
      { q: "Does the engine stop if the MASTER is turned off?", o: ["No — the magnetos are self-powered", "Yes, immediately", "Only after a few minutes", "Only if the alternator is off too"], why: "Mags don't need the battery." },
      { q: "Why two magnetos?", o: ["Redundancy and more complete combustion", "One for each tank", "One for start, one for cruise", "One powers the avionics"], why: "Two plugs per cylinder burn the mixture more completely." },
      { q: "What does a broken P-lead mean?", o: ["The mag can't be grounded — it's hot even with the key OFF", "The engine won't start", "The engine will run rough in cruise", "Nothing important"], why: "Treat every prop as live." },
      { q: "Mag check at the run-up. What are you looking for?", o: ["At 1,800 RPM, a drop within 150 RPM on either mag and within 50 RPM between them", "No RPM drop at all on either mag", "RPM rising on each single mag", "The engine quitting on one mag"],
        why: "Printed 172 figures; know the school's POH numbers. No drop at all is suspicious: a broken P-lead." },
      { q: "On L the RPM doesn't drop at all. The likely cause?", o: ["The other mag isn't being grounded — a broken P-lead", "Both mags are perfect", "The alternator is helping", "The fuel selector is on BOTH"], why: "Both mags are still firing; treat the prop as live." },
      { q: "What in the ignition system needs the battery?", o: ["Only the starter", "The magnetos", "The spark plugs", "The ignition harness"], why: "The mags generate their own spark." },
    ] },
  { id: "electrical", name: "Electrical", core: true, fig: () => Diagrams.electrical(), points: [
      "28-volt DC system",
      "24 V main battery; 28 V, 60 A alternator",
      "Split MASTER switch (BAT | ALT); avionics bus switches",
      "Essential bus feeds the PFD; standby battery takes over if main voltage drops (≥30 min per training material — the POH just says \"a limited time\")",
      "Circuit breakers; volts and amps on the EIS",
    ],
    intro: "An alternator carries the loads and charges the battery; if both go, the standby battery keeps the essential bus alive.",
    parts: {
      alternator: { n: "Alternator", d: "28 V, 60 A. Carries the electrical loads and charges the battery — it has to out-volt the 24 V battery. Belt-driven off the front of the engine.", tip: "\"What charges the battery?\"" },
      battery:    { n: "Main battery", d: "24 V. Starts the engine and backs up the alternator. Works with the alternator through the split MASTER." },
      master:     { n: "MASTER switch", d: "A split rocker: BAT on the left half, ALT on the right. ALT can't be on without BAT, so BAT off takes the alternator with it.", tip: "What does turning it off in flight do?" },
      elecBus:    { n: "Electrical buses", d: "The main buses (1 and 2) that feed the loads through the circuit breakers." },
      avSw:       { n: "Avionics switches", d: "Connect the avionics bus to the main bus. Off for engine start so the starter's voltage dip doesn't hurt the electronics." },
      avBus:      { n: "Avionics bus", d: "Feeds the avionics (radios, the G1000 units) when the avionics switch is on." },
      essBus:     { n: "Essential bus", d: "Fed from the main buses normally and from the standby battery if the main bus drops. Keeps the PFD alive.", tip: "What's on it?" },
      stbyBatt:   { n: "Standby battery", d: "A small battery that carries the essential bus after a total main failure. The POH says \"a limited time\"; training material quotes at least 30 minutes." },
      stbySw:     { n: "STBY BATT switch", d: "ARM · OFF · TEST. ARM for flight, so it can take over automatically; TEST checks it on the ground.", tip: "Which position for flight? ARM." },
      breakers:   { n: "Circuit breakers", d: "Protect each circuit. A popped breaker gets one reset only if it's safe." },
      eis:        { n: "EIS volts and amps", d: "M BUS volts, M BATT amps and the annunciators. LOW VOLTS shows at or below 24.5 V on the main or essential bus; M BATT AMPS goes negative when the battery carries the load.", tip: "First indication of an alternator failure?" },
      loadMain:   { n: "Main loads", d: "Lights, pitot heat, the aux fuel pump, flaps and the rest of the main-bus loads." },
      loadAv:     { n: "Avionics loads", d: "Radios and displays on the avionics bus." },
      loadEss:    { n: "Essential loads", d: "The PFD stays alive on the essential bus when the main bus is lost." },
      mags:       { n: "Magnetos", d: "Drawn apart on purpose: not connected to this system. The engine runs with the whole electrical system dead." },
    },
    labs: [
      { h: "Alternator failure start to finish", start: { bat: true, alt: true, altFail: false, av: true, stby: "arm", mainBatt: "ok" }, steps: [
        { do: "Fail the alternator.", when: { altFail: true, src: "batt" }, see: "The main battery is carrying everything. LOW VOLTS comes up and M BATT AMPS reads negative." },
        { do: "Run the main battery flat.", when: { mainBatt: "flat", essSrc: "stby", elecBus: false }, see: "The main buses go dark. The standby battery is now carrying the essential bus and the PFD." },
      ] },
      { h: "What the standby battery buys you", start: { bat: true, alt: true, altFail: true, mainBatt: "flat", stby: "arm" }, steps: [
        { do: "Switch the STBY BATT switch OFF.", when: { stby: "off", essBus: false }, see: "The essential bus goes dark too — that's the PFD." },
        { do: "Back to ARM.", when: { stby: "arm", essBus: true }, see: "Essential bus alive again from the standby battery." },
      ] },
      { h: "Master off: what still works", start: { bat: true, alt: true, altFail: false, stby: "arm", mainBatt: "ok" }, steps: [
        { do: "Turn the MASTER off.", when: { bat: false, alt: false, engineRuns: true }, see: "The engine keeps running — the magnetos don't need the electrical system. Electric flaps and the main loads are gone." },
        { do: "Switch the standby battery OFF as well.", when: { stby: "off", essBus: false }, see: "Now only the standby instruments and the stall horn work — none needs electrical power." },
      ] },
    ],
    tasks: [
      { t: "predict", q: "The alternator fails in cruise. What's the first indication?", start: { bat: true, alt: true, altFail: false },
        o: ["LOW VOLTS annunciation and negative M BATT amps", "The engine runs rough", "Both displays go dark at once", "The magnetos shut down"], apply: { altFail: true },
        why: "The battery is carrying the load. Shed load and plan to land; the standby battery is the last resort." },
      { t: "find", q: "The alternator and main battery are both gone, the standby is armed. Click everything still powered.",
        start: { altFail: true, mainBatt: "flat", stby: "arm" }, parts: ["stbyBatt", "essBus", "loadEss"],
        why: "The standby battery through the essential bus to the essential loads (the PFD)." },
      { t: "set", q: "Keep only the PFD alive.", start: { bat: true, alt: true, altFail: false, stby: "arm", mainBatt: "ok" }, goal: { elecBus: false, essBus: true },
        why: "MASTER off drops the main buses; the armed standby battery keeps the essential bus." },
      { t: "predict", q: "You turn the MASTER off in flight. The engine…", start: { bat: true, alt: true },
        o: ["Keeps running — the magnetos are self-powered", "Quits at once", "Runs for a few minutes on the battery", "Runs on one magneto"], apply: { bat: false, alt: false },
        why: "Ignition doesn't depend on the electrical system." },
      { t: "find", q: "What charges the battery?", part: "alternator", why: "The 28 V alternator out-volts the 24 V battery." },
      { t: "predict", q: "The flaps won't extend, but the PFD is alive. What is carrying the PFD?", start: { altFail: true, mainBatt: "flat", stby: "arm" }, mask: true,
        o: ["The standby battery, through the essential bus", "The alternator", "The main battery", "The magnetos"],
        why: "Electric flaps are on the main buses. The standby battery only carries the essential bus." },
      { t: "order", q: "Follow the power from the alternator to the avionics loads.", seq: ["alternator", "master", "elecBus", "avSw", "avBus"],
        why: "Alternator → MASTER → main buses → avionics switch → avionics bus." },
      { t: "locate", q: "Click the alternator.", id: "electrical.alternator", why: "At the front of the engine, belt-driven." },
    ],
    qs: [
      { q: "System voltage of the C172S?", o: ["28 V", "14 V", "12 V", "24 V"], why: "24 V battery, 28 V alternator — the alternator has to out-volt the battery to charge it." },
      { q: "Alternator rating?", o: ["60 amps", "30 amps", "100 amps", "40 amps"], why: "28 V, 60 A." },
      { q: "What keeps the PFD alive after a total main electrical failure?", o: ["The standby battery feeding the essential bus", "The magnetos", "The alternator", "Nothing — it goes dark"], why: "For a limited time; the standby instruments don't need power at all." },
      { q: "Which bus does the standby battery feed?", o: ["The essential bus", "The avionics bus", "The main buses", "All of them"], why: "That's what keeps the PFD alive." },
      { q: "STBY BATT switch positions?", o: ["ARM, OFF, TEST", "ON, OFF, AUTO", "ARM, ON, OFF", "MAIN, STBY, OFF"], why: "ARM for flight. TEST checks it on the ground." },
      { q: "When does LOW VOLTS annunciate?", o: ["At or below 24.5 volts on the main or essential bus", "Below 28 volts", "Below 12 volts", "When the avionics switch is off"], why: "The alternator isn't supplying all the power required." },
    ] },
  { id: "pitot", name: "Pitot-static & instruments", core: true, points: [
      "Pitot tube on the left wing (heated); static port on the left side of the fuselage",
      "Alternate static source inside the cabin — airspeed and altitude read slightly high",
      "Air data computer (ADC) feeds the G1000; AHRS gives attitude and heading",
      "Standby airspeed, altimeter and attitude indicator don't need electrical power",
      "Pitot blocked: ASI acts like an altimeter. Static blocked: altimeter freezes, ASI is wrong",
    ],
    intro: "Two pressures — ram (pitot) and static — and who uses which decides what a blockage does to each instrument.",
    parts: {
      pitotTube:  { n: "Pitot tube", d: "Under the left wing. The ram hole faces the airflow; it measures impact pressure for the airspeed indicator.", tip: "What's it look like on the walkaround? Covers off, heat tested." },
      drain:      { n: "Pitot drain hole", d: "A small hole that lets moisture out. If the ram hole ices but the drain stays open, the ASI falls to zero; blocked too, it acts like an altimeter." },
      pitotHeat:  { n: "Pitot heat", d: "An electric heater in the tube. ON before flight in visible moisture or possible icing.", tip: "Test it on the preflight — carefully, it gets hot." },
      pitotLine:  { n: "Pitot line", d: "Carries ram pressure to the air data computer and the standby airspeed indicator." },
      staticPort: { n: "Static port", d: "On the left side of the fuselage. Samples the still air outside, for the altimeter, VSI and ASI.", tip: "Left side — is there one on the right? Don't guess." },
      staticLine: { n: "Static line", d: "Carries static pressure to the air data computer and the standby instruments." },
      altStatic:  { n: "Alternate static valve", d: "Inside the cabin. Opens an alternate source of static pressure if the port blocks; airspeed and altitude then read slightly high." },
      adc:        { n: "Air data computer (ADC)", d: "Turns pitot and static pressure into airspeed, altitude and vertical speed for the PFD." },
      asi:        { n: "Airspeed indicator", d: "The only instrument that uses pitot pressure — compared against static." },
      alt:        { n: "Altimeter", d: "Reads static pressure only." },
      vsi:        { n: "Vertical speed indicator", d: "Reads the rate of change of static pressure." },
      standby:    { n: "Standby instruments", d: "A mechanical standby ASI and altimeter on the same pitot and static lines as the PFD, so both are wrong together when a source is blocked." },
      ahrs:       { n: "AHRS", d: "Attitude and heading reference system: gives attitude and heading. Drawn apart on purpose: it is not on the pitot-static lines." },
    },
    labs: [
      { h: "Ice the pitot tube", start: { ram: "open", drain: "open", stat: "open", altStatic: false, heat: false, altFt: 3000, ias: 100 }, steps: [
        { do: "Block the ram hole. Leave the drain open.", when: { ram: "blocked", drain: "open", asiMode: "zero" }, see: "The pressure bleeds out the drain: the ASI falls toward zero." },
        { do: "Now block the drain hole too.", when: { ram: "blocked", drain: "blocked", asiMode: "altimeter" }, see: "The pressure is trapped, and it had already bled off, so the ASI sits near zero and ignores airspeed. Now move the altitude slider up: as the static pressure falls the ASI creeps higher — it acts like an altimeter." },
      ] },
      { h: "Block the static port and climb", start: { ram: "open", drain: "open", stat: "open", altStatic: false, altFt: 3000, ias: 100 }, steps: [
        { do: "Block the static port, then use the sliders to climb or descend.", when: { stat: "blocked", altMode: "frozen", vsiMode: "zero" }, see: "Altimeter frozen at the blocking altitude, VSI zero. The ASI reads low above that altitude and high below it." },
        { do: "Unblock it.", when: { stat: "open", altMode: "ok" }, see: "All three agree again." },
      ] },
      { h: "Alternate static", start: { stat: "blocked", altFt: 3000, ias: 100, altStatic: false }, steps: [
        { do: "Open the alternate static valve.", when: { altStatic: true, altMode: "alt-static" }, see: "Cabin static replaces the blocked port: instruments work again, reading slightly high." },
      ] },
    ],
    tasks: [
      { t: "predict", q: "Climbing, the altimeter stays frozen, the VSI reads zero and the airspeed reads low. What's the cause?",
        start: { altFt: 3000, ias: 100, stat: "blocked", trapAlt: 3000 }, mask: true, apply: { altFt: 5000 },
        o: ["The static port is blocked", "The pitot tube is blocked", "The pitot heat is on", "The alternate static valve is open"],
        why: "Altimeter and VSI use only static; frozen and zero point at the static port." },
      { t: "predict", q: "Pitot ram hole AND drain hole are iced over. You climb. The ASI…",
        start: { altFt: 3000, ias: 100, ram: "blocked", drain: "blocked" }, apply: { altFt: 5000 },
        o: ["Reads higher as you climb — it acts like an altimeter", "Falls to zero", "Freezes", "Reads normally"],
        why: "Pressure is trapped in the pitot line; as the static falls with altitude the ASI reads higher." },
      { t: "predict", q: "Pitot ram hole blocked, drain hole open. The ASI…", start: { ram: "blocked", drain: "open", ias: 100 },
        o: ["Drops toward zero", "Acts like an altimeter", "Freezes at the current reading", "Reads high"],
        why: "The pitot pressure bleeds out the drain, leaving static pressure against static: the ASI reads zero." },
      { t: "find", q: "Click the instruments that use the static port.", parts: ["asi", "alt", "vsi"], why: "The ASI compares pitot against static; the altimeter and VSI use static only." },
      { t: "find", q: "Which instrument is the only one that uses pitot pressure?", part: "asi", why: "Altimeter and VSI use static only." },
      { t: "set", q: "The static port is blocked. Get a working altimeter back.", start: { altFt: 3000, stat: "blocked", trapAlt: 3000 }, goal: { altStatic: true },
        why: "Open the alternate static source; it reads slightly high." },
      { t: "find", q: "Click the pitot drain hole.", blind: true, part: "drain", why: "A small hole in the pitot tube that lets moisture out." },
      { t: "find", q: "Click the alternate static valve.", blind: true, part: "altStatic", why: "Inside the cabin." },
      { t: "locate", q: "Click the pitot tube.", id: "pitot.pitotTube", why: "Under the left wing." },
      { t: "locate", q: "Click the static port.", id: "pitot.staticPort", why: "On the left side of the fuselage." },
    ],
    qs: [
      { q: "Pitot tube blocked (drain hole too), static open. The ASI…", o: ["Acts like an altimeter — reads higher as you climb", "Reads zero", "Freezes", "Reads normally"], why: "Trapped pitot pressure vs. falling static pressure." },
      { q: "Using the alternate static source, airspeed and altitude read…", o: ["Slightly high", "Slightly low", "Exactly the same", "Zero"], why: "Cabin pressure is a bit lower than outside." },
      { q: "Which instruments use the static port?", o: ["Altimeter, airspeed, VSI", "Altimeter only", "Airspeed only", "Attitude indicator"], why: "The airspeed uses both pitot and static." },
      { q: "Static port blocked, you climb. The altimeter…", o: ["Stays at the altitude where it blocked", "Reads high", "Reads zero", "Shows the climb normally"], why: "The static pressure trapped at the blocking altitude never changes." },
      { q: "The PFD and the standby ASI disagree with the airspeed you expect, together. Why do they agree with each other?", o: ["They share one pitot tube and static source", "They are the same computer", "They are fed by the alternator", "The standby copies the PFD"], why: "A blockage makes both wrong together, so they can't cross-check each other." },
    ] },
  { id: "controls", name: "Flight controls & flaps", points: [
      "Conventional ailerons, elevator, rudder — cable driven",
      "Manual elevator trim tab (trim wheel)",
      "Electric single-slot flaps, 0° to 30°",
      "Vfe: 110 KIAS for 10°, 85 KIAS for 10°–30°",
    ],
    intro: "Cables move the three surfaces; the flaps are the one control that needs electrical power.",
    parts: {
      ailerons:  { n: "Ailerons", d: "Roll the airplane. Yoke left: left aileron up, right aileron down." },
      elevator:  { n: "Elevator", d: "Pitches the airplane. Yoke back: nose up." },
      rudder:    { n: "Rudder", d: "Yaws the airplane; the rudder pedals also steer the nosewheel." },
      trimTab:   { n: "Elevator trim tab", d: "A small tab on the elevator, worked from the trim wheel, that holds the elevator where you leave it.", tip: "Which way does the wheel move the nose?" },
      flaps:     { n: "Flaps", d: "Electric, single-slot, 0° to 30°. Add lift and drag so you can fly slower and steeper on approach." },
      flapMotor: { n: "Flap motor", d: "Electric — so no electrical power means no flap movement.", tip: "What happens to the flaps in an electrical failure?" },
      flapLever: { n: "Flap lever", d: "0 · 10 · 20 · FULL. Selects the flap position; an electric motor does the moving." },
      asiArc:    { n: "Airspeed white arc", d: "The flaps-extended range. Vfe is 110 KIAS for 10° and 85 KIAS for 10° to 30°." },
    },
    labs: [
      { h: "Flaps and Vfe", start: { flap: 0, ias: 100, power: true }, steps: [
        { do: "Select 20° flaps at 100 KIAS.", when: { flap: 20, overVfe: true }, see: "100 KIAS is over Vfe for 20° (85 KIAS)." },
        { do: "Retract the flaps.", when: { flap: 0, overVfe: false }, see: "Clean again." },
      ] },
      { h: "Electrical failure", start: { flap: 10, ias: 80, power: true }, steps: [
        { do: "Remove electrical power.", when: { power: false, flapMoves: false }, see: "The flaps can't move: the flap motor is electric." },
      ] },
      { h: "Roll", start: { roll: 0, pitch: 0, pedal: 0 }, steps: [
        { do: "Roll left.", when: { roll: -1 }, see: "Left aileron up, right aileron down." },
      ] },
    ],
    tasks: [
      { t: "set", q: "Roll left. Show the ailerons.", start: { roll: 0 }, goal: { roll: -1 }, why: "Left aileron up, right aileron down." },
      { t: "predict", q: "You select 20° flaps at 100 KIAS. You are…", start: { flap: 0, ias: 100, power: true },
        o: ["Above Vfe (85 KIAS above 10°)", "Within limits", "Within limits only at 10°", "Fine — 110 KIAS is the limit"], apply: { flap: 20 },
        why: "110 KIAS only applies to the first 10°." },
      { t: "predict", q: "The electrical system fails with the flaps at 10°. The flaps…", start: { flap: 10, ias: 80, power: true },
        o: ["Stay where they are — the electric motor can't move them", "Retract on their own", "Extend fully", "Still move normally"], apply: { power: false },
        why: "The flaps are electric; plan a no-flap landing." },
      { t: "find", q: "Click the trim tab.", part: "trimTab", why: "On the elevator, worked from the trim wheel." },
      { t: "find", q: "What moves the flaps?", part: "flapMotor", why: "An electric motor." },
      { t: "locate", q: "Click the elevator trim tab.", id: "controls.trimTab", why: "A small tab on the elevator." },
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
    intro: "Fixed tricycle gear: spring steel under the mains, an oleo strut under the nose, and toe brakes on the pedals.",
    parts: {
      noseStrut: { n: "Nose strut", d: "Air/oil (oleo) strut that absorbs the nose gear's shock; the nosewheel is steered through the rudder pedals." },
      damper:    { n: "Shimmy damper", d: "Damps nosewheel shimmy on the ground.", tip: "Where is it?" },
      mains:     { n: "Main gear", d: "Tubular spring steel. The spring steel itself absorbs the shock." },
      brakes:    { n: "Disc brakes", d: "Hydraulic disc brakes on the main wheels, one per side." },
      pedals:    { n: "Rudder pedals", d: "Rudder, nosewheel steering and — by pushing the tops — the toe brakes." },
      parkBrake: { n: "Parking brake", d: "Hold the pedals, pull the handle and release the pedals." },
    },
    labs: [
      { h: "Differential braking", start: { pedal: 0, brakeL: false, brakeR: false }, steps: [
        { do: "Press the left toe brake with left pedal.", when: { pedal: -1, brakeL: true }, see: "The nosewheel turns left and the left main brakes: the tightest left turn." },
      ] },
    ],
    tasks: [
      { t: "find", q: "Click the shimmy damper.", part: "damper", why: "On the nose gear." },
      { t: "find", q: "What absorbs the shock on the nose gear?", part: "noseStrut", why: "The air/oil (oleo) strut; the mains are spring steel." },
      { t: "set", q: "Make the tightest left turn on the ramp.", start: { pedal: 0, brakeL: false, brakeR: false }, goal: { pedal: -1, brakeL: true },
        why: "Left pedal for the nosewheel and left toe brake." },
      { t: "locate", q: "Where is the shimmy damper on the airplane?", id: "gear.damper", why: "On the nose gear strut." },
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
    intro: "Cabin heat is exhaust-warmed air; stall warning is a reed horn that needs no power.",
    parts: {
      shroud:   { n: "Muffler heat shroud", d: "Outside air flows around the hot muffler and into the cabin. A cracked muffler can let carbon monoxide in with it." },
      heatKnob: { n: "Cabin heat knob", d: "Pull to send the warmed air to the cabin.", tip: "Suspected CO: heat off." },
      airKnob:  { n: "Cabin air knob", d: "Pull for fresh outside air. With the heat off, open air and vents clear the cabin." },
      vents:    { n: "Cabin vents", d: "Direct outside air into the cabin." },
      inlet:    { n: "Stall warning inlet", d: "A small opening in the left wing's leading edge. As the angle of attack climbs, the pressure there changes and pulls air through the horn." },
      horn:     { n: "Stall horn", d: "A reed horn. Pneumatic — no electrical power needed, so it works with the master off.", tip: "Does the master switch affect it? No." },
    },
    labs: [
      { h: "Carbon monoxide", start: { heat: true, air: false, crack: true }, steps: [
        { do: "Heat off, air open.", when: { heat: false, air: true }, see: "The CO dots clear. Then ventilate and land." },
      ] },
    ],
    tasks: [
      { t: "set", q: "Carbon monoxide is suspected. Configure the cabin.", start: { heat: true, air: false, crack: true }, goal: { heat: false, air: true },
        why: "Cabin heat OFF, cabin air and vents OPEN, then land." },
      { t: "predict", q: "The master switch is off and you approach the stall. The stall horn…", start: { master: true, aoa: 10 },
        o: ["Still sounds — it's pneumatic", "Is silent", "Sounds only on battery power", "Sounds from the G1000"], apply: { master: false },
        why: "A reed horn, no electrical power needed." },
      { t: "find", q: "Click the stall warning inlet.", part: "inlet", why: "In the left wing leading edge." },
      { t: "locate", q: "Where is the stall warning inlet on the airplane?", id: "environ.inlet", why: "In the leading edge of the left wing." },
    ],
    qs: [
      { q: "Where does cabin heat come from?", o: ["A shroud around the exhaust muffler", "An electric heater", "Engine oil", "A combustion heater"], why: "Which is why CO is the risk." },
      { q: "Suspected carbon monoxide. Action?", o: ["Cabin heat OFF, cabin air and vents OPEN, land", "Cabin heat ON", "Climb", "Turn off the master"], why: "Ventilate and get down." },
      { q: "How does the stall warning work?", o: ["Pneumatic — suction through an inlet on the left wing sounds a reed horn", "An electric vane switch", "From the G1000 AOA computer", "A pitot-static switch"], why: "Works with the master off." },
    ] },
];
