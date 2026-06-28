/* ============================================================================
   minimap.js  —  Top-down view of a standard left-hand traffic pattern.

   Mirrors the whiteboard: runway lower-centre, departure/upwind up, crosswind
   left, downwind down the left side, base across the bottom, final back up.
   An airplane glyph travels between step positions in semi-real-time.

   API on window.Minimap:
     render(container)
     moveTo({x,y}, dwell, color, onArrive)
     setLegActive(phase)
     placeAt({x,y})            snap without animation (init / reset)
   ========================================================================== */

const Minimap = (() => {
  let svg, plane, legNodes = {}, condEl;
  let cur = { x: 190, y: 258 }, anim = null;

  /* leg polylines keyed by phase name (matches PHASES keys) */
  const LEGS = {
    TAKEOFF:   "190,258 190,210",
    UPWIND:    "190,210 190,95",
    CROSSWIND: "190,95 112,80",
    DOWNWIND:  "112,80 112,288",
    BASE:      "112,288 190,305",
    FINAL:     "190,305 190,250",
    LANDING:   "190,250 190,210",
    GOAROUND:  "190,250 190,110",
  };

  function render(container) {
    svg = el("svg", { viewBox: "0 0 300 340", class: "minimap", preserveAspectRatio: "xMidYMid meet" });
    el("rect", { x: 0, y: 0, width: 300, height: 340, class: "map-bg" }, svg);
    el("text", { x: 150, y: 20, class: "map-title" }, svg).textContent = "PATTERN — LEFT TRAFFIC";

    // faint full pattern outline
    el("polyline", {
      points: "190,250 190,95 112,80 112,288 190,305 190,250",
      class: "pattern-outline",
    }, svg);

    // individual legs (so we can light up the active one)
    for (const phase in LEGS) {
      if (phase === "LANDING" || phase === "GOAROUND") continue;
      legNodes[phase] = el("polyline", { points: LEGS[phase], class: "leg" }, svg);
    }

    // runway
    el("rect", { x: 184, y: 110, width: 12, height: 142, class: "runway" }, svg);
    el("line", { x1: 190, y1: 116, x2: 190, y2: 246, class: "runway-center" }, svg);
    el("text", { x: 190, y: 268, class: "rwy-label" }, svg).textContent = "14R";

    // leg labels
    const lbl = (x, y, t, anchor = "middle") =>
      el("text", { x, y, class: "leg-label", "text-anchor": anchor }, svg).textContent = t;
    lbl(232, 175, "UPWIND", "start");
    lbl(150, 70, "CROSSWIND");
    lbl(95, 185, "DOWNWIND", "end");
    lbl(150, 325, "BASE");
    lbl(205, 290, "FINAL", "start");

    // key reference numbers from the whiteboard
    el("text", { x: 152, y: 165, class: "map-note" }, svg).textContent = "1–1.2 NM";
    el("text", { x: 196, y: 92, class: "map-note", "text-anchor": "start" }, svg).textContent = "700 AGL xwind";
    el("text", { x: 120, y: 116, class: "map-note", "text-anchor": "start" }, svg).textContent = "TPA 1000";

    // abeam tick + 45° base marker
    el("line", { x1: 112, y1: 248, x2: 184, y2: 248, class: "abeam-line" }, svg);
    el("text", { x: 120, y: 242, class: "map-cue" }, svg).textContent = "abeam";
    el("text", { x: 118, y: 300, class: "map-cue" }, svg).textContent = "45°";

    // airplane glyph
    plane = el("g", { class: "map-plane" }, svg);
    el("polygon", { points: "0,-7 5,6 0,3 -5,6", class: "plane-body" }, plane);
    placeAt(cur);

    // condition banner under the map
    condEl = el("text", { x: 150, y: 332, class: "map-condition" }, svg);

    container.appendChild(svg);
  }

  function placeAt(p) {
    cur = { ...p };
    plane.setAttribute("transform", `translate(${p.x} ${p.y})`);
  }

  function setLegActive(phase) {
    for (const k in legNodes) legNodes[k].classList.toggle("active", k === phase);
  }

  function showCondition(text) { if (condEl) condEl.textContent = text || ""; }

  function moveTo(p, dwell, color, onArrive) {
    if (anim) cancelAnimationFrame(anim);
    const from = { ...cur };
    const dx = p.x - from.x, dy = p.y - from.y;
    const dist = Math.hypot(dx, dy);
    const heading = dist > 0.5 ? Math.atan2(dx, -dy) * 180 / Math.PI : null;
    if (color) plane.querySelector(".plane-body").setAttribute("fill", color);
    const start = performance.now();
    const dur = Math.max(300, dwell || 800);

    function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease in/out
      const x = from.x + dx * e, y = from.y + dy * e;
      cur = { x, y };
      const rot = heading === null ? "" : ` rotate(${heading})`;
      plane.setAttribute("transform", `translate(${x} ${y})${rot}`);
      if (t < 1) anim = requestAnimationFrame(frame);
      else if (onArrive) onArrive();
    }
    anim = requestAnimationFrame(frame);
  }

  return { render, moveTo, setLegActive, placeAt, showCondition };
})();

window.Minimap = Minimap;
