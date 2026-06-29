/* ============================================================================
   cockpit.js  —  Builds a stylized Cessna 172 instrument panel in SVG.

   Every interactive element is a <g> with a data-id matching the `targets`
   used in sequence.js. The panel exposes a small API on window.Cockpit:

     render(container)              draw the panel
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
    const readout = el("text", { y: r * 0.55, class: "readout" }, g);
    const unitTxt = el("text", { y: r * 0.72, class: "unit" }, g);
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
      el("text", { x: Math.sin(rad) * (r - 22), y: -Math.cos(rad) * (r - 22) + 4, class: "compass" }, card)
        .textContent = t;
    });
    // runway-heading bug (140°) rides on the card
    el("polygon", { points: "-5,0 5,0 0,8", class: "hdg-bug", transform: `rotate(140) translate(0 ${-(r - 3)})` }, card);
    // fixed lubber line + airplane symbol + digital readout
    el("polygon", { points: `0,${-r - 1} -5,${-r + 9} 5,${-r + 9}`, class: "hdg-lubber" }, g);
    el("path", { d: "M0,-13 L0,12 M-11,0 L11,0 M-7,9 L7,9", class: "plane-glyph-hi" }, g);
    const readout = el("text", { y: r * 0.48, class: "hdg-readout" }, g);
    el("text", { y: r * 0.68, class: "gauge-title" }, g).textContent = "HEADING";
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
          x: Math.sin(a) * (r - 16), y: -Math.cos(a) * (r - 16) + 5, class: "compass",
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

  function rudder(parent, { x, y }) {
    const g = el("g", { class: "control", "data-id": "rudder", transform: `translate(${x} ${y})` }, parent);
    el("rect", { x: -38, y: 0, width: 28, height: 44, rx: 5, class: "pedal" }, g);
    el("rect", { x: 10, y: 0, width: 28, height: 44, rx: 5, class: "pedal" }, g);
    el("text", { x: 0, y: 64, class: "control-caption" }, g).textContent = "RUDDER";
    g.addEventListener("click", () => clickCb("rudder"));
    groups.rudder = { g };
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

  /* ------------------------------ render -------------------------------- */
  function render(container) {
    svg = el("svg", { viewBox: "0 0 1000 600", class: "panel", preserveAspectRatio: "xMidYMid meet" });
    // glare shield / panel body
    el("rect", { x: 0, y: 0, width: 1000, height: 600, class: "panel-bg" }, svg);
    el("rect", { x: 30, y: 70, width: 600, height: 360, rx: 18, class: "panel-metal" }, svg);
    el("rect", { x: 660, y: 70, width: 310, height: 360, rx: 18, class: "panel-metal" }, svg);
    el("text", { x: 500, y: 40, class: "panel-title" }, svg).textContent = "CESSNA 172 — TRAFFIC PATTERN TRAINER";

    // six-pack
    // C172S markings: white 40–85 (Vs0–Vfe full), green 48–129 (Vs1–Vno),
    // yellow 129–163, redline 163. White arc = flap operating range.
    gauge(svg, { id: "asi", cx: 150, cy: 175, r: 66, title: "AIRSPEED", unit: "KIAS",
      scale: (v) => map.ias(v), redline: 163, arcs: [
        { from: 48, to: 129, cls: "arc-green",  rr: 62 },
        { from: 129, to: 163, cls: "arc-yellow", rr: 62 },
        { from: 40, to: 85,  cls: "arc-white",  rr: 54 },
      ] });
    attitude(svg, { cx: 330, cy: 175, r: 66 });
    gauge(svg, { id: "alt", cx: 510, cy: 175, r: 66, title: "ALTIMETER", unit: "FT" });
    symbolDial(svg, { id: "ti", cx: 150, cy: 335, r: 66, title: "TURN COORD" });
    headingIndicator(svg, { cx: 330, cy: 335, r: 66 });
    gauge(svg, { id: "vsi", cx: 510, cy: 335, r: 66, title: "VERT SPEED", unit: "FPM" });

    // tachometer (right cluster)
    gauge(svg, { id: "tach", cx: 815, cy: 175, r: 76, title: "TACHOMETER", unit: "RPM" });

    // switch / knob cluster (right panel)
    el("text", { x: 815, y: 290, class: "panel-title", "font-size": "11" }, svg).textContent = "PEDESTAL & SWITCHES";
    switchCtl(svg, { id: "fuel",      x: 718, y: 330, label: "FUEL SEL" });
    switchCtl(svg, { id: "mixture",   x: 815, y: 330, label: "MIXTURE" });
    switchCtl(svg, { id: "autopilot", x: 912, y: 330, label: "AUTOPILOT" });
    switchCtl(svg, { id: "seatbelt",  x: 718, y: 392, label: "SEATBELTS" });
    switchCtl(svg, { id: "call",      x: 863, y: 392, label: "RADIO / CALL" });

    // controls along the lower pedestal
    yoke(svg, { x: 130, y: 500 });
    rudder(svg, { x: 300, y: 480 });
    throttle(svg, { x: 470, y: 470 });
    flaps(svg, { x: 620, y: 470 });

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

  return { render, onClick, setValues, highlight, clearHighlight, markDone, flash, setControlLabel, _state: state };
})();

window.Cockpit = Cockpit;
