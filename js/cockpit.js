/* ============================================================================
   cockpit.js  —  Builds a stylized Cessna 172 instrument panel in SVG.

   Every interactive element is a <g> with a data-id matching the `targets`
   used in sequence.js. The panel exposes a small API on window.Cockpit:

     render(container, mode)        draw the panel ("pattern" | "emergency")
     onClick(fn)                    fn(id) fired when a control is actuated
     setValues(values, animate)     drive needles / readouts to target values
     highlight(ids)                 glow the next-action element(s)
     clearHighlight()
     flash(id, ok)                  green pulse (ok) or red shake (!ok)
   ========================================================================== */

const SVGNS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVGNS, tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(node);
  return node;
}

// SVG arc path (degrees, 0 = straight up, clockwise) at radius R
function arcPath(R, a1, a2) {
  const pt = (deg) => { const t = deg * Math.PI / 180; return [R * Math.sin(t), -R * Math.cos(t)]; };
  const [x1, y1] = pt(a1), [x2, y2] = pt(a2);
  const large = Math.abs(a2 - a1) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/* Display names for every clickable id, shared by both drills. */
const CONTROL_NAMES = {
  throttle: "THROTTLE", flaps: "FLAP SELECTOR", yoke: "YOKE", rudder: "RUDDER PEDALS",
  asi: "AIRSPEED INDICATOR", ai: "ATTITUDE INDICATOR", alt: "ALTIMETER",
  ti: "TURN COORDINATOR", hi: "HEADING INDICATOR", vsi: "VERTICAL SPEED", tach: "TACHOMETER",
  fuel: "FUEL SELECTOR", mixture: "MIXTURE", autopilot: "AUTOPILOT",
  seatbelt: "SEATS / BELTS", call: "RADIO / CALL",
  // emergency panel
  magnetos: "MAGNETOS", master: "MASTER SWITCH", stbybatt: "STANDBY BATTERY",
  avionics: "AVIONICS BUS 1 / 2", allswitches: "ELECTRICAL SWITCHES",
  breakers: "CIRCUIT BREAKERS", fuelshutoff: "FUEL SHUTOFF VALVE", fuelpump: "FUEL PUMP",
  extinguisher: "FIRE EXTINGUISHER", elt: "ELT", pitotheat: "PITOT HEAT",
  altstatic: "ALTERNATE STATIC AIR", lights: "LIGHTS", vents: "CABIN VENTS / AIR",
  cabinheat: "CABIN HEAT / AIR", defroster: "DEFROSTER OUTLETS", doors: "CABIN DOORS",
  brakes: "TOE BRAKES", action: "PILOT ACTION", outside: "OUTSIDE / WINDSCREEN",
};

const Cockpit = (() => {
  let svg, clickCb = () => {};
  const groups = {};            // id -> { g, setNeedle?, setReadout? }
  const state = { rpm: 1000, ias: 0, alt: 0, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 140 };
  const PITCH_PX = 1.6;          // attitude-indicator pixels per degree of pitch

  /* ---- a round instrument with bezel, tick label, needle + readout ----- */
  function gauge(parent, { id, cx, cy, r, title, unit, scale, arcs, redline }) {
    const g = el("g", { class: "instrument", "data-id": id, transform: `translate(${cx} ${cy})` }, parent);
    el("circle", { r: r + 8, class: "bezel" }, g);
    el("circle", { r: r, class: "face" }, g);
    // color arcs (e.g. airspeed white/green/yellow flap & operating ranges)
    if (arcs && scale) {
      arcs.forEach((a) => el("path", {
        d: arcPath(a.rr, scale(a.from), scale(a.to)), class: "gauge-arc " + a.cls, fill: "none",
      }, g));
    }
    if (redline != null && scale) {
      const t = scale(redline) * Math.PI / 180;
      el("line", { x1: Math.sin(t) * (r - 1), y1: -Math.cos(t) * (r - 1),
        x2: Math.sin(t) * (r - 12), y2: -Math.cos(t) * (r - 12), class: "arc-red" }, g);
    }
    // tick marks
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x1 = Math.sin(a) * (r - 4), y1 = -Math.cos(a) * (r - 4);
      const x2 = Math.sin(a) * (r - 12), y2 = -Math.cos(a) * (r - 12);
      el("line", { x1, y1, x2, y2, class: "tick" }, g);
    }
    el("text", { y: -r * 0.42, class: "gauge-title" }, g).textContent = title;
    const needle = el("line", { x1: 0, y1: 8, x2: 0, y2: -r + 16, class: "needle" }, g);
    el("circle", { r: 5, class: "hub" }, g);
    const readout = el("text", { y: r * 0.55, class: "readout", "font-size": (r * 0.24).toFixed(1) }, g);
    const unitTxt = el("text", { y: r * 0.74, class: "unit", "font-size": (r * 0.12).toFixed(1) }, g);
    unitTxt.textContent = unit || "";

    groups[id] = {
      g,
      setNeedle: (deg) => needle.setAttribute("transform", `rotate(${deg})`),
      setReadout: (v) => { readout.textContent = v; },
    };
    g.addEventListener("click", () => clickCb(id));
    return groups[id];
  }

  /* ---------- needle mappings (value -> degrees, 0 = straight up) -------- */
  const map = {
    ias: (v) => -135 + (Math.min(v, 160) / 160) * 270,
    alt: (v) => ((v % 1000) / 1000) * 360,
    vsi: (v) => Math.max(-110, Math.min(110, (v / 1000) * 100)) - 90, // 0 -> 9 o'clock
    rpm: (v) => -135 + (Math.min(v, 3000) / 3000) * 270,
  };

  function applyValues(animate) {
    const set = (id, deg, readout) => {
      const grp = groups[id];
      if (!grp) return;
      grp.g.classList.toggle("animating", !!animate);
      if (grp.setNeedle) grp.setNeedle(deg);
      if (grp.setReadout) grp.setReadout(readout);
    };
    set("asi", map.ias(state.ias), Math.round(state.ias));
    set("alt", map.alt(state.alt), Math.round(state.alt));
    set("vsi", map.vsi(state.vsi), (state.vsi > 0 ? "+" : "") + Math.round(state.vsi));
    set("tach", map.rpm(state.rpm), Math.round(state.rpm));

    // Attitude indicator: pitch (translate) within the bank (rotate) frame.
    if (groups.ai) {
      groups.ai.roll.setAttribute("transform", `rotate(${state.bank})`);
      groups.ai.horizon.setAttribute("transform", `translate(0 ${state.pitch * PITCH_PX})`);
    }
    // Heading indicator: rotate the card so the current heading is under the lubber.
    if (groups.hi && groups.hi.setHeading) groups.hi.setHeading(state.hdg);
    // Flap indicator bar.
    if (groups.flaps && groups.flaps.setFlap) groups.flaps.setFlap(state.flaps);
    // Throttle knob travel reflects RPM.
    if (groups.throttle && groups.throttle.setTravel)
      groups.throttle.setTravel(Math.min(1, state.rpm / 2700));
  }

  /* ----- attitude indicator: pitching horizon + bank scale ------------- */
  function attitude(parent, { cx, cy, r }) {
    const g = el("g", { class: "instrument", "data-id": "ai", transform: `translate(${cx} ${cy})` }, parent);
    el("circle", { r: r + 8, class: "bezel" }, g);
    const cp = el("clipPath", { id: "aiClip" }, g);
    el("circle", { r: r }, cp);
    const inner = el("g", { "clip-path": `url(#aiClip)` }, g);

    // roll group (rotates for bank) -> horizon group (translates for pitch)
    const roll = el("g", { class: "ai-roll" }, inner);
    const horizon = el("g", { class: "ai-horizon" }, roll);
    el("rect", { x: -r * 2, y: -r * 3, width: r * 4, height: r * 3, class: "ai-sky" }, horizon);
    el("rect", { x: -r * 2, y: 0, width: r * 4, height: r * 3, class: "ai-ground" }, horizon);
    el("line", { x1: -r, y1: 0, x2: r, y2: 0, class: "ai-horizon-line" }, horizon);
    // pitch ladder (±10, ±20)
    [-20, -10, 10, 20].forEach((p) => {
      const y = -p * PITCH_PX;
      el("line", { x1: -15, y1: y, x2: 15, y2: y, class: "ai-pitch" }, horizon);
      el("text", { x: 20, y: y + 3, class: "ai-pitch-num" }, horizon).textContent = Math.abs(p);
      el("text", { x: -20, y: y + 3, class: "ai-pitch-num" }, horizon).textContent = Math.abs(p);
    });
    // roll pointer — rides on the roll group, points up to the fixed scale
    el("polygon", { points: `0,${-r + 2} -5,${-r + 11} 5,${-r + 11}`, class: "ai-roll-ptr" }, roll);

    // fixed bank scale on the case
    [0, 10, 20, 30, 45, 60, -10, -20, -30, -45, -60].forEach((b) => {
      const rad = b * Math.PI / 180, major = Math.abs(b) % 30 === 0;
      const o = r, i = major ? r - 9 : r - 5;
      el("line", { x1: Math.sin(rad) * o, y1: -Math.cos(rad) * o,
        x2: Math.sin(rad) * i, y2: -Math.cos(rad) * i, class: "ai-bank-tick" }, inner);
    });
    // fixed miniature airplane
    el("path", { d: "M-24 0 L-9 0 M9 0 L24 0", class: "ai-symbol" }, inner);
    el("circle", { r: 2.5, class: "ai-symbol-dot" }, inner);

    el("text", { y: r * 0.72, class: "gauge-title" }, g).textContent = "ATTITUDE";
    g.addEventListener("click", () => clickCb("ai"));
    groups.ai = { g, roll, horizon };
  }

  /* ----- heading indicator: rotating card, runway-heading bug ----------- */
  function headingIndicator(parent, { cx, cy, r }) {
    const g = el("g", { class: "instrument", "data-id": "hi", transform: `translate(${cx} ${cy})` }, parent);
    el("circle", { r: r + 8, class: "bezel" }, g);
    el("circle", { r: r, class: "face" }, g);
    const card = el("g", { class: "hdg-card" }, g);   // rotates by -hdg
    const labels = { 0: "N", 90: "E", 180: "S", 270: "W",
      30: "3", 60: "6", 120: "12", 150: "15", 210: "21", 240: "24", 300: "30", 330: "33" };
    for (let d = 0; d < 360; d += 10) {
      const rad = d * Math.PI / 180, o = r - 3, i = (d % 30 === 0) ? r - 12 : r - 7;
      el("line", { x1: Math.sin(rad) * o, y1: -Math.cos(rad) * o,
        x2: Math.sin(rad) * i, y2: -Math.cos(rad) * i, class: "hdg-tick" }, card);
    }
    Object.entries(labels).forEach(([d, t]) => {
      const rad = +d * Math.PI / 180;
      el("text", { x: Math.sin(rad) * r * 0.62, y: -Math.cos(rad) * r * 0.62 + 4,
        class: "compass", "font-size": (r * 0.15).toFixed(1) }, card).textContent = t;
    });
    // runway-heading bug (140°) rides on the card
    el("polygon", { points: "-5,0 5,0 0,8", class: "hdg-bug", transform: `rotate(140) translate(0 ${-(r - 3)})` }, card);
    // fixed lubber line + airplane symbol + digital readout
    el("polygon", { points: `0,${-r - 1} -5,${-r + 9} 5,${-r + 9}`, class: "hdg-lubber" }, g);
    el("path", { d: "M0,-13 L0,12 M-11,0 L11,0 M-7,9 L7,9", class: "plane-glyph-hi" }, g);
    const readout = el("text", { y: r * 0.40, class: "hdg-readout", "font-size": (r * 0.2).toFixed(1) }, g);
    el("text", { y: r * 0.92, class: "gauge-title" }, g).textContent = "HEADING";
    g.addEventListener("click", () => clickCb("hi"));
    groups.hi = { g, card, setHeading: (h) => {
      const hh = ((Math.round(h) % 360) + 360) % 360;
      card.setAttribute("transform", `rotate(${-h})`);
      readout.textContent = String(hh).padStart(3, "0") + "°";
    } };
  }

  /* ---- a symbolic dial (heading / turn coordinator) that just spins ---- */
  function symbolDial(parent, { id, cx, cy, r, title, glyph }) {
    const g = el("g", { class: "instrument", "data-id": id, transform: `translate(${cx} ${cy})` }, parent);
    el("circle", { r: r + 8, class: "bezel" }, g);
    el("circle", { r: r, class: "face" }, g);
    const card = el("g", {}, g);
    if (glyph === "heading") {
      ["N", "E", "S", "W"].forEach((c, i) => {
        const a = (i / 4) * Math.PI * 2;
        el("text", {
          x: Math.sin(a) * r * 0.75, y: -Math.cos(a) * r * 0.75 + 5, class: "compass",
          "font-size": (r * 0.15).toFixed(1),
        }, card).textContent = c;
      });
      el("polygon", { points: "0,-6 -7,8 7,8", class: "plane-glyph" }, g);
    } else { // turn coordinator
      el("path", { d: `M${-r + 10} 0 L${r - 10} 0`, class: "tc-wing" }, card);
      el("circle", { r: 6, class: "hub" }, g);
    }
    el("text", { y: r * 0.62, class: "gauge-title" }, g).textContent = title;
    g.addEventListener("click", () => clickCb(id));
    groups[id] = { g, card, spin: (deg) => card.setAttribute("transform", `rotate(${deg})`) };
  }

  /* --------------------------- throttle lever --------------------------- */
  function throttle(parent, { x, y }) {
    const g = el("g", { class: "control", "data-id": "throttle", transform: `translate(${x} ${y})` }, parent);
    el("rect", { x: -10, y: 0, width: 20, height: 120, rx: 6, class: "lever-track" }, g);
    const knob = el("g", {}, g);
    el("rect", { x: -22, y: -14, width: 44, height: 28, rx: 8, class: "lever-knob throttle-knob" }, knob);
    el("text", { y: 5, class: "lever-label" }, knob).textContent = "THROT";
    el("text", { x: 0, y: 140, class: "control-caption" }, g).textContent = "THROTTLE";
    g.addEventListener("click", () => clickCb("throttle"));
    groups.throttle = {
      g,
      setTravel: (t) => knob.setAttribute("transform", `translate(0 ${100 - t * 96})`),
    };
  }

  /* ------------------------- flap selector ------------------------------ */
  function flaps(parent, { x, y }) {
    const g = el("g", { class: "control", "data-id": "flaps", transform: `translate(${x} ${y})` }, parent);
    el("rect", { x: -16, y: 0, width: 32, height: 120, rx: 6, class: "lever-track" }, g);
    const detents = [0, 10, 20, 30];
    detents.forEach((d, i) => {
      el("text", { x: 30, y: 10 + i * 36, class: "detent-label" }, g).textContent = d + "°";
      el("line", { x1: -16, y1: 6 + i * 36, x2: 16, y2: 6 + i * 36, class: "detent" }, g);
    });
    const handle = el("rect", { x: -16, y: -8, width: 32, height: 16, rx: 4, class: "flap-handle" }, g);
    el("text", { x: 0, y: 150, class: "control-caption" }, g).textContent = "FLAPS";
    g.addEventListener("click", () => clickCb("flaps"));
    groups.flaps = {
      g,
      setFlap: (deg) => {
        const i = detents.indexOf(deg);
        handle.setAttribute("y", (i < 0 ? 0 : i * 36) - 8 + 6);
      },
    };
  }

  /* --------------------- yoke & rudder (symbolic) ----------------------- */
  function yoke(parent, { x, y }) {
    const g = el("g", { class: "control", "data-id": "yoke", transform: `translate(${x} ${y})` }, parent);
    el("path", { d: "M-50 0 a50 30 0 0 1 100 0", class: "yoke-arc" }, g);
    el("rect", { x: -54, y: -6, width: 24, height: 16, rx: 4, class: "yoke-grip" }, g);
    el("rect", { x: 30, y: -6, width: 24, height: 16, rx: 4, class: "yoke-grip" }, g);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 26, class: "yoke-col" }, g);
    el("text", { x: 0, y: 48, class: "control-caption" }, g).textContent = "YOKE";
    g.addEventListener("click", () => clickCb("yoke"));
    groups.yoke = { g };
  }

  // Rudder pedals; with `toeBrakes` the upper pad of each pedal is its own
  // target, because that is where the brakes actually are.
  function rudder(parent, { x, y, toeBrakes }) {
    const g = el("g", { class: "control", "data-id": "rudder", transform: `translate(${x} ${y})` }, parent);
    el("rect", { x: -38, y: 0, width: 28, height: 44, rx: 5, class: "pedal" }, g);
    el("rect", { x: 10, y: 0, width: 28, height: 44, rx: 5, class: "pedal" }, g);
    el("text", { x: 0, y: 64, class: "control-caption" }, g).textContent = "RUDDER";
    g.addEventListener("click", () => clickCb("rudder"));
    groups.rudder = { g };

    if (!toeBrakes) return;
    const b = el("g", { class: "control", "data-id": "brakes" }, parent);
    b.setAttribute("transform", `translate(${x} ${y})`);
    [-24, 24].forEach((dx) => {
      el("rect", { x: dx - 14, y: -19, width: 28, height: 19, rx: 4, class: "toe-brake" }, b);
      el("line", { x1: dx - 9, y1: -13, x2: dx + 9, y2: -13, class: "toe-brake-grip" }, b);
      el("line", { x1: dx - 9, y1: -7, x2: dx + 9, y2: -7, class: "toe-brake-grip" }, b);
    });
    el("text", { x: 0, y: -26, class: "control-caption" }, b).textContent = "TOE BRAKES";
    const v = el("text", { x: 0, y: 30, class: "ctl-value" }, b);
    v.textContent = "";
    b.addEventListener("click", () => clickCb("brakes"));
    groups.brakes = { g: b, setLabel: (t) => { v.textContent = t === "—" ? "" : t; } };
  }

  /* ---- switch / knob / button controls (fuel, mixture, A/P, belts, radio) -- */
  function switchCtl(parent, { id, x, y, label }) {
    const g = el("g", { class: "control", "data-id": id, transform: `translate(${x} ${y})` }, parent);
    el("rect", { x: -46, y: -24, width: 92, height: 48, rx: 8, class: "switch-box" }, g);
    el("text", { y: -6, class: "switch-label" }, g).textContent = label;
    const val = el("text", { y: 14, class: "switch-val" }, g);
    val.textContent = "—";
    g.addEventListener("click", () => clickCb(id));
    groups[id] = { g, setLabel: (t) => { val.textContent = t; } };
  }

  /* --------------------- shared panel sub-assemblies -------------------- */
  function sixPack(svg, { cx = [150, 330, 510], cy = [175, 335], r = 66 } = {}) {
    // C172S markings: white 40-85 (Vs0-Vfe full), green 48-129 (Vs1-Vno),
    // yellow 129-163, redline 163. White arc = flap operating range.
    gauge(svg, { id: "asi", cx: cx[0], cy: cy[0], r, title: "AIRSPEED", unit: "KIAS",
      scale: (v) => map.ias(v), redline: 163, arcs: [
        { from: 48, to: 129, cls: "arc-green",  rr: r * 0.94 },
        { from: 129, to: 163, cls: "arc-yellow", rr: r * 0.94 },
        { from: 40, to: 85,  cls: "arc-white",  rr: r * 0.82 },
      ] });
    attitude(svg, { cx: cx[1], cy: cy[0], r });
    gauge(svg, { id: "alt", cx: cx[2], cy: cy[0], r, title: "ALTIMETER", unit: "FT" });
    symbolDial(svg, { id: "ti", cx: cx[0], cy: cy[1], r, title: "TURN COORD" });
    headingIndicator(svg, { cx: cx[1], cy: cy[1], r });
    gauge(svg, { id: "vsi", cx: cx[2], cy: cy[1], r, title: "VERT SPEED", unit: "FPM" });
  }

  function lowerControls(svg) {
    yoke(svg, { x: 130, y: 500 });
    rudder(svg, { x: 300, y: 480 });
    throttle(svg, { x: 470, y: 470 });
    flaps(svg, { x: 620, y: 470 });
  }

  /* ------------------------ pattern-mode panel -------------------------- */
  function renderPattern(svg) {
    el("rect", { x: 30, y: 70, width: 600, height: 360, rx: 18, class: "panel-metal" }, svg);
    el("rect", { x: 660, y: 70, width: 310, height: 360, rx: 18, class: "panel-metal" }, svg);
    el("text", { x: 500, y: 40, class: "panel-title" }, svg).textContent =
      "CESSNA 172 — TRAFFIC PATTERN TRAINER";

    sixPack(svg);
    gauge(svg, { id: "tach", cx: 815, cy: 175, r: 76, title: "TACHOMETER", unit: "RPM" });

    el("text", { x: 815, y: 290, class: "panel-title", "font-size": "11" }, svg).textContent =
      "PEDESTAL & SWITCHES";
    switchCtl(svg, { id: "fuel",      x: 718, y: 330, label: "FUEL SEL" });
    switchCtl(svg, { id: "mixture",   x: 815, y: 330, label: "MIXTURE" });
    switchCtl(svg, { id: "autopilot", x: 912, y: 330, label: "AUTOPILOT" });
    switchCtl(svg, { id: "seatbelt",  x: 718, y: 392, label: "SEATBELTS" });
    switchCtl(svg, { id: "call",      x: 863, y: 392, label: "RADIO / CALL" });

    lowerControls(svg);
  }

  /* ======================= emergency-panel hardware ======================
     The emergency checklists reach controls the pattern never touches. They
     are drawn as the actual hardware — a magneto key switch, the red fuel
     shutoff, a split master rocker, push-pull knobs — rather than a grid of
     identical buttons, so finding the control is part of the drill. Each
     registers a `setLabel` that both prints the chosen value and moves the
     thing (a rocker flips, a knob pulls out, the key rotates).
     ==================================================================== */

  function ctl(parent, id, x, y) {
    const g = el("g", { class: "control", "data-id": id, transform: `translate(${x} ${y})` }, parent);
    g.addEventListener("click", () => clickCb(id));
    return g;
  }
  const cap = (g, text, y) => { el("text", { y, class: "ctl-caption" }, g).textContent = text; };
  function val(g, y) {
    const t = el("text", { y, class: "ctl-value" }, g);
    t.textContent = "—";
    return t;
  }
  const isOn = (t) => /^(ON|ARM|BOTH|START|APPLY|OPEN|RICH|PULL ON|SECURE|USE)/i.test(t);

  /* rocker switch (master, stby batt, avionics, fuel pump, pitot heat, lights) */
  function rocker(parent, { id, x, y, label, w = 34, cls = "" }) {
    const g = ctl(parent, id, x, y);
    el("rect", { x: -w / 2, y: -19, width: w, height: 38, rx: 5, class: "rocker-body " + cls }, g);
    const nub = el("rect", { x: -w / 2 + 4, y: -15, width: w - 8, height: 15, rx: 3, class: "rocker-nub " + cls }, g);
    el("text", { y: -22, class: "ctl-caption" }, g).textContent = label;
    const v = val(g, 32);
    groups[id] = { g, setLabel: (t) => { v.textContent = t; nub.setAttribute("y", isOn(t) ? -15 : 0); } };
  }

  /* split master switch — BAT | ALT under one red bar */
  function masterSwitch(parent, { id, x, y }) {
    const g = ctl(parent, id, x, y);
    el("rect", { x: -36, y: -19, width: 72, height: 38, rx: 5, class: "rocker-body master" }, g);
    const nubs = [-18, 18].map((dx) =>
      el("rect", { x: dx - 14, y: -15, width: 28, height: 15, rx: 3, class: "rocker-nub master" }, g));
    el("text", { x: -18, y: 14, class: "micro-label" }, g).textContent = "BAT";
    el("text", { x: 18, y: 14, class: "micro-label" }, g).textContent = "ALT";
    el("text", { y: -22, class: "ctl-caption" }, g).textContent = "MASTER";
    const v = val(g, 32);
    groups[id] = { g, setLabel: (t) => {
      v.textContent = t;
      nubs.forEach((n) => n.setAttribute("y", isOn(t) ? -15 : 0));
    } };
  }

  /* magneto / ignition key switch — OFF · R · L · BOTH · START */
  function keySwitch(parent, { id, x, y }) {
    const g = ctl(parent, id, x, y);
    const POS = { OFF: -100, R: -50, L: 0, BOTH: 50, START: 100 };
    el("circle", { r: 30, class: "key-face" }, g);
    Object.entries(POS).forEach(([name, deg]) => {
      const rad = deg * Math.PI / 180;
      el("text", { x: Math.sin(rad) * 23, y: -Math.cos(rad) * 23 + 3, class: "key-pos" }, g).textContent = name;
    });
    const key = el("g", { class: "key-barrel" }, g);
    el("rect", { x: -3, y: -16, width: 6, height: 20, rx: 2, class: "key-blade" }, key);
    el("circle", { r: 7, class: "key-hub" }, key);
    el("text", { y: 44, class: "ctl-caption" }, g).textContent = "MAGNETOS";
    const v = val(g, 56);
    groups[id] = { g, setLabel: (t) => {
      v.textContent = t;
      const hit = Object.keys(POS).find((k) => t.toUpperCase().startsWith(k));
      key.setAttribute("transform", `rotate(${POS[hit] != null ? POS[hit] : 0})`);
    } };
  }

  /* push-pull knob (fuel shutoff, alt static, cabin heat/air, defroster) */
  function pullKnob(parent, { id, x, y, label, cls = "", r = 13 }) {
    const g = ctl(parent, id, x, y);
    el("rect", { x: -3, y: -2, width: 6, height: 22, class: "knob-shaft" }, g);
    const head = el("g", {}, g);
    el("circle", { r, class: "knob-head " + cls }, head);
    el("circle", { r: r * 0.45, class: "knob-dot " + cls }, head);
    el("text", { y: -r - 7, class: "ctl-caption" }, g).textContent = label;
    const v = val(g, 34);
    groups[id] = { g, setLabel: (t) => {
      v.textContent = t;
      // "pull off / pull on" comes out of the panel, everything else sits in
      head.setAttribute("transform", `translate(0 ${/PULL|OFF|OPEN/i.test(t) ? -9 : 0})`);
    } };
  }

  /* vernier knob (emergency-panel throttle and mixture) */
  function vernier(parent, { id, x, y, label, cls }) {
    const g = ctl(parent, id, x, y);
    el("rect", { x: -3, y: -4, width: 6, height: 26, class: "knob-shaft" }, g);
    const head = el("g", {}, g);
    el("circle", { r: 15, class: "knob-head " + cls }, head);
    el("circle", { r: 6, class: "knob-centre " + cls }, head);
    el("text", { y: -24, class: "ctl-caption" }, g).textContent = label;
    const v = val(g, 36);
    groups[id] = {
      g,
      setLabel: (t) => { v.textContent = t; },
      // full in = full forward; pulled out = closed
      setTravel: (t) => head.setAttribute("transform", `translate(0 ${(1 - t) * -12})`),
    };
  }

  /* fuel selector valve — BOTH / LEFT / RIGHT / OFF */
  function fuelValve(parent, { id, x, y }) {
    const g = ctl(parent, id, x, y);
    const POS = { BOTH: 0, LEFT: -90, RIGHT: 90, OFF: 180 };
    el("circle", { r: 26, class: "valve-face" }, g);
    el("text", { y: -15, class: "valve-pos" }, g).textContent = "BOTH";
    el("text", { x: -16, y: 3, class: "valve-pos" }, g).textContent = "L";
    el("text", { x: 16, y: 3, class: "valve-pos" }, g).textContent = "R";
    el("text", { y: 21, class: "valve-pos" }, g).textContent = "OFF";
    const ptr = el("polygon", { points: "0,-20 -5,-6 5,-6", class: "valve-ptr" }, g);
    el("circle", { r: 5, class: "hub" }, g);
    el("text", { y: 40, class: "ctl-caption" }, g).textContent = "FUEL SELECTOR";
    const v = val(g, 52);
    groups[id] = { g, setLabel: (t) => {
      v.textContent = t;
      const hit = Object.keys(POS).find((k) => t.toUpperCase().startsWith(k));
      ptr.setAttribute("transform", `rotate(${POS[hit] != null ? POS[hit] : 0})`);
    } };
  }

  /* circuit breaker panel */
  function breakerPanel(parent, { id, x, y }) {
    const g = ctl(parent, id, x, y);
    el("rect", { x: -108, y: -46, width: 216, height: 92, rx: 6, class: "breaker-box" }, g);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) {
        el("circle", { cx: -92 + c * 23, cy: -28 + r * 22, r: 6, class: "breaker" }, g);
      }
    }
    el("text", { y: -54, class: "ctl-caption" }, g).textContent = "CIRCUIT BREAKERS";
    const v = val(g, 60);
    groups[id] = { g, setLabel: (t) => { v.textContent = t; } };
  }

  /* fire extinguisher in its bracket */
  function extinguisher(parent, { id, x, y }) {
    const g = ctl(parent, id, x, y);
    el("rect", { x: -13, y: -26, width: 26, height: 52, rx: 8, class: "ext-body" }, g);
    el("rect", { x: -6, y: -34, width: 12, height: 10, rx: 2, class: "ext-neck" }, g);
    el("path", { d: "M-14 -32 L-22 -38", class: "ext-lever" }, g);
    el("rect", { x: -16, y: -6, width: 32, height: 5, rx: 2, class: "ext-strap" }, g);
    el("text", { y: -42, class: "ctl-caption" }, g).textContent = "FIRE EXT";
    const v = val(g, 42);
    groups[id] = { g, setLabel: (t) => { v.textContent = t; } };
  }

  /* hand mic on its hook */
  function mic(parent, { id, x, y }) {
    const g = ctl(parent, id, x, y);
    el("rect", { x: -11, y: -18, width: 22, height: 34, rx: 5, class: "mic-body" }, g);
    el("rect", { x: -7, y: -13, width: 14, height: 10, rx: 2, class: "mic-grille" }, g);
    el("path", { d: "M11 10 q14 4 10 16", class: "mic-cord" }, g);
    el("text", { y: -24, class: "ctl-caption" }, g).textContent = "RADIO / MIC";
    const v = val(g, 32);
    groups[id] = { g, setLabel: (t) => { v.textContent = t; } };
  }

  /* seat belt buckle */
  function belt(parent, { id, x, y }) {
    const g = ctl(parent, id, x, y);
    el("rect", { x: -26, y: -8, width: 22, height: 16, rx: 3, class: "belt-strap" }, g);
    el("rect", { x: 4, y: -8, width: 22, height: 16, rx: 3, class: "belt-strap" }, g);
    el("rect", { x: -7, y: -11, width: 14, height: 22, rx: 3, class: "belt-buckle" }, g);
    el("text", { y: -19, class: "ctl-caption" }, g).textContent = "SEATS / BELTS";
    const v = val(g, 27);
    groups[id] = { g, setLabel: (t) => { v.textContent = t; } };
  }

  /* cabin door handle */
  function doorHandle(parent, { id, x, y }) {
    const g = ctl(parent, id, x, y);
    el("rect", { x: -22, y: -12, width: 44, height: 24, rx: 4, class: "door-plate" }, g);
    const lever = el("rect", { x: -16, y: -4, width: 30, height: 8, rx: 3, class: "door-lever" }, g);
    el("text", { y: -19, class: "ctl-caption" }, g).textContent = "CABIN DOORS";
    const v = val(g, 27);
    groups[id] = { g, setLabel: (t) => {
      v.textContent = t;
      lever.setAttribute("transform", /UNLATCH/i.test(t) ? "rotate(-28 -1 0)" : "");
    } };
  }

  /* ELT remote head */
  function eltPanel(parent, { id, x, y }) {
    const g = ctl(parent, id, x, y);
    el("rect", { x: -34, y: -14, width: 68, height: 28, rx: 4, class: "elt-box" }, g);
    el("circle", { cx: -25, cy: 0, r: 4.5, class: "elt-lamp" }, g);
    el("text", { x: 7, y: 3, class: "micro-label" }, g).textContent = "ON · ARM · TEST";
    el("text", { y: -20, class: "ctl-caption" }, g).textContent = "ELT";
    const v = val(g, 26);
    groups[id] = { g, setLabel: (t) => { v.textContent = t; } };
  }

  /* a placard, for the items that are not a piece of hardware */
  function placard(parent, { id, x, y, label, w = 118 }) {
    const g = ctl(parent, id, x, y);
    el("rect", { x: -w / 2, y: -17, width: w, height: 34, rx: 4, class: "placard-box" }, g);
    el("text", { y: -4, class: "ctl-caption" }, g).textContent = label;
    const v = el("text", { y: 10, class: "ctl-value" }, g);
    v.textContent = "—";
    groups[id] = { g, setLabel: (t) => { v.textContent = t; } };
  }

  /* ----------------------- emergency-mode panel ------------------------- */
  function renderEmergency(svg) {
    // windscreen strip — the "look outside" items
    const w = el("g", { class: "control windscreen", "data-id": "outside" }, svg);
    el("rect", { x: 30, y: 4, width: 940, height: 42, rx: 10, class: "windscreen-box" }, w);
    el("text", { x: 500, y: 21, class: "switch-label" }, w).textContent = "WINDSCREEN — LOOK OUTSIDE";
    const wv = el("text", { x: 500, y: 38, class: "switch-val" }, w);
    wv.textContent = "—";
    w.addEventListener("click", () => clickCb("outside"));
    groups.outside = { g: w, setLabel: (t) => { wv.textContent = t; } };

    // instrument panel + avionics stack
    el("rect", { x: 30, y: 56, width: 670, height: 244, rx: 14, class: "panel-metal" }, svg);
    sixPack(svg, { cx: [128, 288, 448], cy: [128, 238], r: 48 });
    el("rect", { x: 528, y: 66, width: 158, height: 96, rx: 6, class: "avionics-stack" }, svg);
    el("text", { x: 607, y: 86, class: "ctl-caption" }, svg).textContent = "COM 1 / NAV 1";
    el("text", { x: 607, y: 110, class: "stack-readout" }, svg).textContent = "121.50";
    el("text", { x: 607, y: 140, class: "stack-readout dim" }, svg).textContent = "7700";
    eltPanel(svg, { id: "elt", x: 607, y: 196 });
    mic(svg, { id: "call", x: 607, y: 254 });

    // breaker panel
    el("rect", { x: 715, y: 56, width: 257, height: 244, rx: 14, class: "panel-metal" }, svg);
    breakerPanel(svg, { id: "breakers", x: 843, y: 170 });

    // switch bank
    el("rect", { x: 30, y: 308, width: 670, height: 94, rx: 14, class: "panel-metal" }, svg);
    keySwitch(svg, { id: "magnetos", x: 80, y: 340 });
    masterSwitch(svg, { id: "master", x: 190, y: 348 });
    rocker(svg, { id: "stbybatt", x: 272, y: 348, label: "STBY BATT" });
    rocker(svg, { id: "avionics", x: 344, y: 348, label: "AVIONICS 1/2", w: 40 });
    rocker(svg, { id: "fuelpump", x: 420, y: 348, label: "FUEL PUMP" });
    rocker(svg, { id: "pitotheat", x: 492, y: 348, label: "PITOT HEAT" });
    rocker(svg, { id: "lights", x: 564, y: 348, label: "LIGHTS" });
    rocker(svg, { id: "autopilot", x: 640, y: 348, label: "AUTOPILOT" });

    // the two items that are not a piece of hardware get their own plate
    el("rect", { x: 715, y: 308, width: 257, height: 94, rx: 14, class: "panel-metal" }, svg);
    placard(svg, { id: "allswitches", x: 843, y: 331, label: "ALL SWITCHES (ex mags)", w: 190 });
    placard(svg, { id: "action", x: 843, y: 377, label: "PILOT ACTION", w: 190 });

    // pedestal
    el("rect", { x: 30, y: 410, width: 670, height: 186, rx: 14, class: "panel-metal" }, svg);
    yoke(svg, { x: 108, y: 470 });
    rudder(svg, { x: 252, y: 452, toeBrakes: true });
    vernier(svg, { id: "throttle", x: 344, y: 452, label: "THROTTLE", cls: "throttle" });
    vernier(svg, { id: "mixture", x: 406, y: 452, label: "MIXTURE", cls: "mixture" });
    pullKnob(svg, { id: "fuelshutoff", x: 474, y: 452, label: "FUEL SHUTOFF", cls: "mixture" });
    pullKnob(svg, { id: "altstatic", x: 556, y: 452, label: "ALT STATIC", cls: "" });
    flaps(svg, { x: 640, y: 424 });
    fuelValve(svg, { id: "fuel", x: 360, y: 540 });
    pullKnob(svg, { id: "cabinheat", x: 440, y: 540, label: "CABIN HEAT", cls: "mixture" });
    pullKnob(svg, { id: "vents", x: 502, y: 540, label: "CABIN AIR", cls: "" });
    pullKnob(svg, { id: "defroster", x: 564, y: 540, label: "DEFROST", cls: "" });

    // right-hand cabin items
    el("rect", { x: 715, y: 410, width: 257, height: 186, rx: 14, class: "panel-metal" }, svg);
    extinguisher(svg, { id: "extinguisher", x: 772, y: 500 });
    doorHandle(svg, { id: "doors", x: 892, y: 462 });
    belt(svg, { id: "seatbelt", x: 892, y: 540 });
  }

  /* ------------------------------ render -------------------------------- */
  function render(container, mode = "pattern") {
    for (const k in groups) delete groups[k];
    container.innerHTML = "";
    svg = el("svg", { viewBox: "0 0 1000 600", class: "panel", preserveAspectRatio: "xMidYMid meet" });
    el("rect", { x: 0, y: 0, width: 1000, height: 600, class: "panel-bg" }, svg);

    if (mode === "emergency") renderEmergency(svg); else renderPattern(svg);

    container.appendChild(svg);
    applyValues(false);
  }

  function onClick(fn) { clickCb = fn; }

  function setValues(values, animate = true) {
    Object.assign(state, values);
    applyValues(animate);
  }

  function highlight(ids) {
    clearHighlight();
    ids.forEach((id) => groups[id] && groups[id].g.classList.add("target"));
  }
  function clearHighlight() {
    Object.values(groups).forEach((grp) => grp.g.classList.remove("target", "done-step"));
  }
  function markDone(id) { groups[id] && groups[id].g.classList.add("done-step"); }

  function flash(id, ok) {
    const grp = groups[id];
    if (!grp) return;
    const cls = ok ? "flash-ok" : "flash-bad";
    grp.g.classList.remove(cls);
    void grp.g.getBoundingClientRect(); // reflow to restart animation
    grp.g.classList.add(cls);
    setTimeout(() => grp.g.classList.remove(cls), 600);
  }

  function setControlLabel(id, text) {
    const grp = groups[id];
    if (grp && grp.setLabel) grp.setLabel(text);
  }

  function hasLabel(id) { return !!(groups[id] && groups[id].setLabel); }

  return { render, onClick, setValues, highlight, clearHighlight, markDone, flash,
           setControlLabel, hasLabel, NAMES: CONTROL_NAMES, _state: state };
})();

window.Cockpit = Cockpit;
