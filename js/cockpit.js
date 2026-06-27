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

const Cockpit = (() => {
  let svg, clickCb = () => {};
  const groups = {};            // id -> { g, setNeedle?, setReadout? }
  const state = { rpm: 1000, ias: 0, alt: 0, flaps: 0, vsi: 0 };

  /* ---- a round instrument with bezel, tick label, needle + readout ----- */
  function gauge(parent, { id, cx, cy, r, title, unit }) {
    const g = el("g", { class: "instrument", "data-id": id, transform: `translate(${cx} ${cy})` }, parent);
    el("circle", { r: r + 8, class: "bezel" }, g);
    el("circle", { r: r, class: "face" }, g);
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

    // Attitude indicator: shift the horizon for climb/descent.
    if (groups.ai && groups.ai.horizon) {
      const pitch = Math.max(-26, Math.min(26, -(state.vsi / 1000) * 18));
      groups.ai.horizon.setAttribute("transform", `translate(0 ${pitch})`);
    }
    // Flap indicator bar.
    if (groups.flaps && groups.flaps.setFlap) groups.flaps.setFlap(state.flaps);
    // Throttle knob travel reflects RPM.
    if (groups.throttle && groups.throttle.setTravel)
      groups.throttle.setTravel(Math.min(1, state.rpm / 2700));
  }

  /* ----- attitude indicator: blue sky / brown ground that pitches ------- */
  function attitude(parent, { cx, cy, r }) {
    const g = el("g", { class: "instrument", "data-id": "ai", transform: `translate(${cx} ${cy})` }, parent);
    el("circle", { r: r + 8, class: "bezel" }, g);
    const clip = "aiClip";
    const cp = el("clipPath", { id: clip }, g);
    el("circle", { r: r }, cp);
    const inner = el("g", { "clip-path": `url(#${clip})` }, g);
    const horizon = el("g", {}, inner);
    el("rect", { x: -r, y: -r * 2, width: r * 2, height: r * 2, class: "ai-sky" }, horizon);
    el("rect", { x: -r, y: 0, width: r * 2, height: r * 2, class: "ai-ground" }, horizon);
    el("line", { x1: -r, y1: 0, x2: r, y2: 0, class: "ai-horizon-line" }, horizon);
    for (let p = -20; p <= 20; p += 10) {
      if (p === 0) continue;
      el("line", { x1: -16, y1: p, x2: 16, y2: p, class: "ai-pitch" }, horizon);
    }
    // fixed miniature airplane
    el("path", { d: `M${-22} 0 L${-7} 0 M7 0 L22 0 M0 -3 L0 3`, class: "ai-symbol" }, inner);
    el("polygon", { points: "0,-2 -6,-12 6,-12", class: "ai-symbol" }, inner);
    el("text", { y: r * 0.7, class: "gauge-title" }, g).textContent = "ATTITUDE";
    g.addEventListener("click", () => clickCb("ai"));
    groups.ai = { g, horizon };
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

  /* ---------------------- comm / radio callout button ------------------- */
  function commButton(parent, { x, y, w, h }) {
    const g = el("g", { class: "control", "data-id": "comm", transform: `translate(${x} ${y})` }, parent);
    el("rect", { x: 0, y: 0, width: w, height: h, rx: 9, class: "comm-rect" }, g);
    el("circle", { cx: 20, cy: h / 2, r: 6, class: "comm-light" }, g);
    el("text", { x: w / 2 + 8, y: h / 2 + 5, class: "comm-label" }, g).textContent = "COMM · CALLOUT";
    g.addEventListener("click", () => clickCb("comm"));
    groups.comm = { g };
  }

  /* ----------------------- rotary knob (fuel / mixture) ----------------- */
  function knob(parent, { id, cx, cy, r, title, accent }) {
    const g = el("g", { class: "control", "data-id": id, transform: `translate(${cx} ${cy})` }, parent);
    el("circle", { r: r + 5, class: "knob-bezel" }, g);
    el("circle", { r: r, class: "knob-face", style: accent ? `fill:${accent}` : "" }, g);
    el("line", { x1: 0, y1: 0, x2: 0, y2: -r + 4, class: "knob-pointer" }, g);
    el("circle", { r: 3, class: "hub" }, g);
    el("text", { y: r + 16, class: "control-caption" }, g).textContent = title;
    g.addEventListener("click", () => clickCb(id));
    groups[id] = { g };
  }

  /* --------------------------- toggle switch ---------------------------- */
  function toggleSwitch(parent, { id, x, y, title }) {
    const g = el("g", { class: "control", "data-id": id, transform: `translate(${x} ${y})` }, parent);
    el("rect", { x: -11, y: 0, width: 22, height: 40, rx: 11, class: "switch-track" }, g);
    el("circle", { cx: 0, cy: 11, r: 8, class: "switch-knob" }, g);
    el("text", { x: 0, y: 56, class: "control-caption" }, g).textContent = title;
    g.addEventListener("click", () => clickCb(id));
    groups[id] = { g };
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

  /* ------------------------------ render -------------------------------- */
  function render(container) {
    svg = el("svg", { viewBox: "0 0 1000 640", class: "panel", preserveAspectRatio: "xMidYMid meet" });
    // glare shield / panel body
    el("rect", { x: 0, y: 0, width: 1000, height: 640, class: "panel-bg" }, svg);
    el("rect", { x: 30, y: 70, width: 600, height: 360, rx: 18, class: "panel-metal" }, svg);
    el("rect", { x: 660, y: 70, width: 310, height: 470, rx: 18, class: "panel-metal" }, svg);
    el("text", { x: 500, y: 40, class: "panel-title" }, svg).textContent = "CESSNA 172 — TRAFFIC PATTERN TRAINER";

    // six-pack
    gauge(svg, { id: "asi", cx: 150, cy: 175, r: 66, title: "AIRSPEED", unit: "KIAS" });
    attitude(svg, { cx: 330, cy: 175, r: 66 });
    gauge(svg, { id: "alt", cx: 510, cy: 175, r: 66, title: "ALTIMETER", unit: "FT" });
    symbolDial(svg, { id: "ti", cx: 150, cy: 335, r: 66, title: "TURN COORD" });
    symbolDial(svg, { id: "hi", cx: 330, cy: 335, r: 66, title: "HEADING", glyph: "heading" });
    gauge(svg, { id: "vsi", cx: 510, cy: 335, r: 66, title: "VERT SPEED", unit: "FPM" });

    // tachometer (right cluster)
    gauge(svg, { id: "tach", cx: 815, cy: 175, r: 76, title: "TACHOMETER", unit: "RPM" });

    // controls along the lower pedestal
    yoke(svg, { x: 130, y: 500 });
    rudder(svg, { x: 300, y: 480 });
    throttle(svg, { x: 470, y: 470 });
    flaps(svg, { x: 620, y: 470 });

    // right cluster: radio + fuel/mixture + switches
    commButton(svg, { x: 688, y: 286, w: 254, h: 44 });
    knob(svg, { id: "fuel", cx: 730, cy: 400, r: 30, title: "FUEL" });
    knob(svg, { id: "mixture", cx: 828, cy: 400, r: 24, title: "MIXTURE", accent: "#b23b3b" });
    toggleSwitch(svg, { id: "seatbelt", x: 900, y: 366, title: "BELTS" });
    toggleSwitch(svg, { id: "autopilot", x: 948, y: 366, title: "A/P" });

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

  return { render, onClick, setValues, highlight, clearHighlight, markDone, flash, _state: state };
})();

window.Cockpit = Cockpit;
