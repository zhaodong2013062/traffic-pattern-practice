/* ============================================================================
   sysdiag-air.js  —  the airplane: shared hotspot table + 2D three-view locator.

   SINGLE SOURCE for the walkaround hotspots. systems3d.js reads
   SysDiagrams.hotspots / SysDiagrams.airframe (this file loads first), so the
   3D airplane and this SVG locator emit exactly the same "sys.part" ids.

   Frame: feet, +X forward, +Y up, +Z = pilot's RIGHT, origin at the cabin
   centre. Illustrative shapes — not a drawing of any particular airframe.
     top view  : nose UP, so the pilot's right is the right of the page
     side view : the LEFT side of the airplane, nose to the LEFT
     panel     : the cabin panel as the pilot sees it
     bay       : the engine bay from above (x-ray), nose up
   Positions of the battery, trim tab, sumps and panel items are generic.
   ========================================================================== */
(() => {
  if (typeof SysDiagrams === "undefined") return;
  const { C, svg, text, part, mk, esc } = SysDiagrams.kit;

  /* ------------------------------ airframe ------------------------------ */
  // Fuselage + cowl stations: [x, half-width, top y, bottom y], tail → nose.
  const FUSE = [
    [-13.6, 0.03, 0.40, 0.05], [-12.5, 0.30, 0.55, -0.15], [-10, 0.62, 0.72, -0.52],
    [-7, 1.0, 1.08, -0.98], [-4.5, 1.35, 1.55, -1.22], [-2.8, 1.62, 2.2, -1.32],
    [-1.8, 1.76, 2.58, -1.36], [0.8, 1.82, 2.66, -1.38], [1.6, 1.82, 2.55, -1.38],
    [2.4, 1.8, 1.85, -1.38], [3.0, 1.74, 1.5, -1.38], [3.9, 1.52, 1.4, -1.32],
    [4.9, 1.42, 1.32, -1.26], [5.7, 1.22, 1.15, -1.1], [6.02, 0.78, 0.7, -0.72],
    [6.1, 0.12, 0.1, -0.12],
  ];
  const WING = { le: 2.7, root: 5.3, y: 2.8, dih: 0.03, span: 18, strutZ: 7 };
  const GROUND = -3.6;
  // Fin + rudder outlines in the side plane: [x, y] (shared by the 3D extrudes).
  const FIN = [[-8.4, 0.5], [-11.9, 6.0], [-12.55, 6.0], [-12.35, 0.5]];
  const RUDDER = [[-12.35, 0.5], [-12.55, 6.0], [-13.3, 6.0], [-13.75, 0.5]];
  const ENG = { x: 5, s: 0.7 };   // engine instance: origin + uniform scale in the airplane

  // System colours (3D dots + 2D markers).
  const SYSCOL = {
    fuel: "#4dabf7", electrical: "#ffa502", pitot: "#2ed5d5", ignition: "#ff6b81", oil: "#d6a24b",
    engine: "#b8c4d0", prop: "#e8edf2", controls: "#a29bfe", gear: "#8fa3b5", environ: "#ff7f50",
  };

  // [id, label, p:[x,y,z], r (ft, pick radius), view, extra]
  //   view "top"/"side"/"panel"/"bay" picks which 2D view carries the marker;
  //   lb = label side in 2D (l r u d).
  const H = (id, label, p, r, v, lb) => ({ id, label, p, r, v, lb, sys: id.split(".")[0], part: id.split(".")[1] });
  const E = (lx, ly, lz) => [+(ENG.x + ENG.s * lx).toFixed(3), +(ENG.s * ly).toFixed(3), +(ENG.s * lz).toFixed(3)];
  const hotspots = [
    // fuel
    H("fuel.tankL", "Left tank", [2.2, 2.95, -5.2], 1.2, "top", "l"),
    H("fuel.tankR", "Right tank", [2.2, 2.95, 5.2], 1.2, "top", "r"),
    H("fuel.vent", "Fuel vent", [0.5, 2.4, -6.9], 0.6, "top", "l"),
    H("fuel.drains", "Fuel drains", [2.0, 2.65, -2.4], 0.6, "top", "r"),
    H("fuel.selector", "Fuel selector", [0.6, -1.15, 0], 0.5, "side", "d"),
    H("fuel.shutoff", "Fuel shutoff", [2.7, 0.3, -0.15], 0.25, "panel", "d"),
    H("fuel.gauges", "Fuel qty", [2.7, 1.0, 0.75], 0.3, "panel", "r"),
    // pitot-static
    H("pitot.pitotTube", "Pitot tube", [3.45, 2.5, -8.6], 0.5, "top", "l"),
    H("pitot.staticPort", "Static port", [3.3, -0.2, -1.66], 0.45, "side", "u"),
    H("pitot.asi", "PFD / ASI", [2.7, 1.0, -0.75], 0.3, "panel", "l"),
    H("pitot.standby", "Standby", [2.7, 1.05, 0], 0.3, "panel", "u"),
    // electrical
    H("electrical.alternator", "Alternator", E(1.1, 0.55, -0.62), 0.45, "bay", "l"),
    H("electrical.battery", "Battery", [3.8, -0.75, 1.1], 0.45, "bay", "r"),
    H("electrical.master", "Master", [2.7, 0.7, -1.25], 0.25, "panel", "l"),
    H("electrical.breakers", "Breakers", [2.7, 0.15, -0.75], 0.25, "panel", "d"),
    // ignition
    H("ignition.magL", "Left mag", E(-1.3, 0.15, -0.75), 0.4, "bay", "l"),
    H("ignition.magR", "Right mag", E(-1.3, 0.15, 0.75), 0.4, "bay", "r"),
    H("ignition.key", "Ignition key", [2.7, 0.2, -1.25], 0.25, "panel", "l"),
    // oil, induction, heat
    H("oil.dipstick", "Dipstick", E(-0.95, 0.9, 0), 0.4, "bay", "d"),
    H("engine.airFilter", "Air filter", E(0.9, -1.05, 0), 0.45, "bay", "r"),
    H("environ.shroud", "Muffler shroud", [4.7, -0.35, 0.8], 0.5, "bay", "r"),
    H("environ.inlet", "Stall inlet", [2.72, 2.9, -6.4], 0.4, "top", "l"),
    // propeller
    H("prop.blade", "Propeller", [6.15, 1.7, 0], 0.7, "side", "u"),
    H("prop.spinner", "Spinner", [6.55, 0, 0], 0.5, "side", "d"),
    // flight controls
    H("controls.ailerons", "Ailerons", [-1.5, 3.2, -12.5], 1.0, "top", "l"),
    H("controls.flaps", "Flaps", [-1.5, 3.0, -4.4], 1.0, "top", "l"),
    H("controls.elevator", "Elevator", [-12.9, 0.2, -3.6], 0.8, "top", "l"),
    H("controls.trimTab", "Trim tab", [-13.7, 0.2, 2.6], 0.4, "top", "r"),
    H("controls.rudder", "Rudder", [-13.0, 3.6, 0], 0.8, "side", "u"),
    H("controls.flapLever", "Flap lever", [2.5, -0.5, 0.25], 0.3, "panel", "d"),
    // gear and brakes
    H("gear.noseStrut", "Nose strut", [3.1, -2.1, 0], 0.5, "top", "r"),
    H("gear.damper", "Shimmy damper", [3.05, -2.5, 0.12], 0.3, "side", "d"),
    H("gear.mains", "Main gear", [0.45, -2.2, -2.5], 0.6, "top", "l"),
    H("gear.brakes", "Brakes", [0.25, -2.95, -3.2], 0.45, "side", "d"),
    H("gear.pedals", "Rudder pedals", [2.2, -1.1, -0.5], 0.3, "panel", "d"),
  ];

  SysDiagrams.hotspots = hotspots;
  SysDiagrams.airframe = { FUSE, WING, GROUND, ENG, SYSCOL, FIN, RUDDER };

  /* ------------------------------ 2D drawing ------------------------------ */
  const W = 560, HEIGHT = 850;
  const BODY = "#1d2631", EDGE = "#4a5868", GLASS = "#2a3a4c";
  // top view (nose up): x forward → page up. Wide wing → scale from span.
  const TS = 14.2, TCX = 280, TY0 = 26;           // 6.1 ft maps to TY0
  const tp = (x, z) => [TCX + z * TS, TY0 + (6.1 - x) * TS];
  // side view (left side, nose left)
  const SS = 24, SX0 = 52, SY0 = 372;             // y = 6.1 ft maps to SY0
  const sp = (x, y) => [SX0 + (6.1 - x) * SS, SY0 + (6.1 - y) * SS];
  // panel inset (pilot's view): z → right
  const PX = 20, PY = 654, PW = 250, PH = 176, PS = 54;
  const pp = (z, y) => [PX + PW / 2 + z * PS, PY + 20 + (1.6 - y) * PS];
  // engine-bay inset (top-down x-ray, nose up)
  const BX = 290, BY = 654, BW = 250, BH = 176, BS = 50;
  const bp = (x, z) => [BX + BW / 2 + z * BS, BY + 16 + (6.3 - x) * BS];

  const hsPos = {
    top: (h) => tp(h.p[0], h.p[2]),
    side: (h) => sp(h.p[0], h.p[1]),
    panel: (h) => pp(h.p[2], h.p[1]),
    bay: (h) => bp(h.p[0], h.p[2]),
  };
  const fx = (n) => n.toFixed(1);
  const poly = (pts, fill, stroke = EDGE, extra = "") =>
    `<polygon points="${pts.map((p) => fx(p[0]) + "," + fx(p[1])).join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" ${extra}/>`;
  const ln = (a, b, color = EDGE, w = 1.5, dash = "") =>
    `<line x1="${fx(a[0])}" y1="${fx(a[1])}" x2="${fx(b[0])}" y2="${fx(b[1])}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;

  function wingSec(z) {
    const a = Math.abs(z);
    const le = WING.le - Math.max(0, a - WING.strutZ) * 0.05;
    const ch = a <= 7 ? 5.3 : a <= 17.2 ? 5.3 - (a - 7) * (1.4 / 10.2) : 3.9 - (a - 17.2) * 3.6;
    return { le, te: le - ch, ch };
  }

  function topView() {
    let s = "";
    // wings (left & right)
    for (const sg of [-1, 1]) {
      const zs = [1.4, 7, 17.2, 17.8, 18.0];
      const front = zs.map((z) => tp(wingSec(z).le, sg * z));
      const back = zs.map((z) => tp(wingSec(z).te, sg * z)).reverse();
      s += poly([...front, ...back], BODY);
      // flap / aileron hinge lines
      const hinge = (z0, z1) => ln(tp(wingSec(z0).le - 0.72 * wingSec(z0).ch, sg * z0), tp(wingSec(z1).le - 0.72 * wingSec(z1).ch, sg * z1), EDGE, 1);
      s += hinge(1.6, 7.4) + hinge(7.8, 16.9);
      // wing strut
      s += ln(tp(0.9, sg * 1.3), tp(0.9, sg * 7), "#6a7a8c", 1.2, "3 3");
    }
    // tailplane
    for (const sg of [-1, 1]) {
      const pts = [[-10.6, 0.5], [-11.4, 5.6], [-13.6, 5.6], [-13.6, 0.5]].map(([x, z]) => tp(x, sg * z));
      s += poly(pts, BODY);
      s += ln(tp(-13.6 + 0.58 * 3.0 - 0.0, sg * 0.5), tp(-13.6 + 0.58 * 2.2, sg * 5.5), EDGE, 1);
    }
    // fuselage + cowl
    const right = FUSE.map((r) => tp(r[0], r[1])), left = FUSE.map((r) => tp(r[0], -r[1])).reverse();
    s += poly([...right, ...left], "#222d3a");
    // cabin glass
    s += poly([tp(3.0, 1.1), tp(1.7, 1.2), tp(1.7, -1.2), tp(3.0, -1.1)], GLASS, "#3b5068");
    // propeller disc edge-on
    s += ln(tp(6.2, -3.1), tp(6.2, 3.1), "#8895a3", 3);
    s += `<ellipse cx="${TCX}" cy="${fx(tp(6.45, 0)[1])}" rx="8" ry="10" fill="#34ace0" opacity=".75"/>`;
    // nose gear + mains from above
    s += ln(tp(3.1, 0), tp(3.0, 0), "#8895a3", 5);
    for (const sg of [-1, 1]) s += ln(tp(0.5, sg * 1.2), tp(0.25, sg * 3.3), "#7a8998", 3) + `<rect x="${fx(tp(0.9, sg * 3.3)[0] - 5)}" y="${fx(tp(0.9, 0)[1])}" width="10" height="${fx(1.4 * TS)}" rx="4" fill="#3a4654"/>`;
    s += text(10, 14, "TOP VIEW · nose up", { size: 10, fill: C.MUTED, lbl: false, anchor: "start" });
    return s;
  }

  function sideView() {
    let s = "";
    // far (right) main wheel, behind, faint
    // fin + rudder
    s += poly(FIN.map((p) => sp(p[0], p[1])), BODY);
    s += poly(RUDDER.map((p) => sp(p[0], p[1])), "#26323f");
    // tailplane edge-on
    s += poly([sp(-10.6, 0.3), sp(-13.6, 0.3), sp(-13.6, 0.05), sp(-10.6, 0.1)], "#2a3745");
    // fuselage profile
    const top = FUSE.map((r) => sp(r[0], r[2])), bot = FUSE.map((r) => sp(r[0], r[3])).reverse();
    s += poly([...top, ...bot], "#222d3a");
    // windows
    s += poly([sp(3.0, 1.45), sp(2.4, 1.85), sp(1.7, 2.5), sp(0.2, 2.5), sp(0.2, 0.7), sp(3.0, 0.7)], GLASS, "#3b5068");
    s += poly([sp(-0.2, 2.5), sp(-1.8, 2.45), sp(-2.7, 2.1), sp(-2.4, 0.9), sp(-0.2, 0.9)], GLASS, "#3b5068");
    // wing edge-on + strut
    s += poly([sp(2.7, 3.05), sp(2.7, 2.7), sp(-2.6, 2.75), sp(-2.6, 3.0)], "#2d3947");
    s += ln(sp(0.9, -1.3), sp(0.9, 2.7), "#6a7a8c", 2.5);
    // main gear (left): leg, wheel, pant
    s += ln(sp(0.6, -1.4), sp(0.25, -2.9), "#8895a3", 5);
    s += `<ellipse cx="${fx(sp(0.2, -3.0)[0])}" cy="${fx(sp(0.2, -3.0)[1])}" rx="${fx(1.5 * SS)}" ry="${fx(0.85 * SS)}" fill="#26323f" stroke="${EDGE}" stroke-width="1.5"/>`;
    s += `<circle cx="${fx(sp(0.2, -2.9)[0])}" cy="${fx(sp(0.2, -2.9)[1])}" r="${fx(0.7 * SS)}" fill="#11161c" stroke="#556374" stroke-width="2"/>`;
    // nose gear
    s += ln(sp(3.2, -1.3), sp(3.0, -3.05), "#8895a3", 5);
    s += `<circle cx="${fx(sp(3.0, -3.05)[0])}" cy="${fx(sp(3.0, -3.05)[1])}" r="${fx(0.55 * SS)}" fill="#11161c" stroke="#556374" stroke-width="2"/>`;
    // ground
    s += ln([10, sp(0, GROUND)[1]], [W - 10, sp(0, GROUND)[1]], "#313a46", 1, "6 5");
    // prop + spinner
    s += ln(sp(6.15, -3.1), sp(6.15, 3.1), "#8895a3", 4);
    s += `<ellipse cx="${fx(sp(6.55, 0)[0])}" cy="${fx(sp(6.55, 0)[1])}" rx="${fx(0.45 * SS)}" ry="${fx(0.45 * SS)}" fill="#34ace0" opacity=".8"/>`;
    s += text(W / 2, 340, "LEFT SIDE · nose left", { size: 10, fill: C.MUTED, lbl: false });
    return s;
  }

  function insets() {
    let s = "";
    // cabin panel
    s += `<rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="8" fill="#161d26" stroke="${EDGE}" stroke-width="1.2"/>`;
    s += text(PX + PW / 2, PY + 13, "CABIN PANEL · pilot's view", { size: 10, fill: C.MUTED, lbl: false });
    const [a, b] = [pp(-1.5, 1.35), pp(1.5, -0.2)];
    s += `<rect x="${fx(a[0])}" y="${fx(a[1])}" width="${fx(b[0] - a[0])}" height="${fx(b[1] - a[1])}" rx="5" fill="#0f141a" stroke="#3a4654"/>`;
    s += `<rect x="${fx(pp(-1.15, 1.2)[0])}" y="${fx(pp(-1.15, 1.2)[1])}" width="${fx(0.95 * PS * 1.2)}" height="${fx(PS * 0.8)}" rx="3" fill="#13283a" stroke="#34ace0" stroke-width=".8"/>`;
    s += `<rect x="${fx(pp(0.15, 1.2)[0])}" y="${fx(pp(0.15, 1.2)[1])}" width="${fx(PS * 1.7)}" height="${fx(PS * 0.8)}" rx="3" fill="#13283a" stroke="#34ace0" stroke-width=".8"/>`;
    // engine bay
    s += `<rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="8" fill="#161d26" stroke="${EDGE}" stroke-width="1.2"/>`;
    s += text(BX + BW / 2, BY + 13, "ENGINE BAY · x-ray, from above", { size: 10, fill: C.MUTED, lbl: false });
    const e0 = bp(5.9, -1.35), e1 = bp(3.95, 1.35);
    s += `<rect x="${fx(e0[0])}" y="${fx(e0[1])}" width="${fx(e1[0] - e0[0])}" height="${fx(e1[1] - e0[1])}" rx="12" fill="#10161d" stroke="#3a4654" stroke-dasharray="4 3"/>`;
    // four opposed cylinders, crankcase, prop flange (schematic)
    const cc = bp(4.2, -0.45), cc2 = bp(5.75, 0.45);
    s += `<rect x="${fx(Math.min(cc[0], cc2[0]))}" y="${fx(Math.min(cc[1], cc2[1]))}" width="${fx(Math.abs(cc2[0] - cc[0]))}" height="${fx(Math.abs(cc2[1] - cc[1]))}" rx="4" fill="#26323f" stroke="${EDGE}"/>`;
    for (const sg of [-1, 1]) for (const lx of [0.75, 0.25, -0.25, -0.75]) {
      if ((lx === 0.75 || lx === -0.25) !== (sg > 0)) continue;
      const p0 = bp(ENG.x + ENG.s * lx + 0.14, sg * 0.4), p1 = bp(ENG.x + ENG.s * lx - 0.14, sg * 0.95);
      s += `<rect x="${fx(Math.min(p0[0], p1[0]))}" y="${fx(Math.min(p0[1], p1[1]))}" width="${fx(Math.abs(p1[0] - p0[0]))}" height="${fx(Math.abs(p1[1] - p0[1]))}" rx="3" fill="#2f3b49" stroke="${EDGE}"/>`;
    }
    return s;
  }

  // Label placement: try the preferred side, then the others, skipping any spot
  // that would cover a marker or an already placed label.
  const SIDES = {
    r: [11, 4, "start", 0, -0.5], l: [-11, 4, "end", 1, -0.5], u: [0, -11, "middle", 0.5, -1.3], d: [0, 18, "middle", 0.5, 0],
    ur: [9, -9, "start", 0, -1.2], ul: [-9, -9, "end", 1, -1.2], dr: [9, 19, "start", 0, 0.1], dl: [-9, 19, "end", 1, 0.1],
  };
  function markers(opts) {
    let s = "";
    const items = hotspots.map((h) => { const [x, y] = hsPos[h.v](h); return { h, x, y }; });
    const boxes = items.map((it) => [it.x - 9, it.y - 9, it.x + 9, it.y + 9]);
    const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    items.forEach((it, i) => {
      const w = it.h.label.length * 5.9 + 4;
      let pick = null;
      for (const side of [it.h.lb, "r", "l", "u", "d", "ur", "ul", "dr", "dl"]) {
        const [dx, dy, anc, ax, ay] = SIDES[side];
        const x0 = it.x + dx - ax * w, rect = [x0, it.y + dy + ay * 13 - 10, x0 + w, it.y + dy + ay * 13 + 3];
        const ok = rect[0] > 2 && rect[2] < W - 2 && boxes.every((bx, j) => j === i || !hit(rect, bx));
        if (ok) { pick = { side, rect }; break; }
      }
      if (!pick) { const [dx, dy, , ax, ay] = SIDES[it.h.lb]; const x0 = it.x + dx - ax * w; pick = { side: it.h.lb, rect: [x0, it.y + dy - 10, x0 + w, it.y + dy + 3] }; }
      it.side = pick.side; boxes.push(pick.rect);
    });
    items.forEach(({ h, x, y, side }) => {
      const m = mk(opts, h.id);
      const col = m.mark === "ok" || m.mark === "done" ? C.OK : m.mark === "bad" ? C.BAD : m.mark === "hint" ? C.YEL : SYSCOL[h.sys];
      const [dx, dy, anc] = SIDES[side];
      const inner =
        `<circle cx="${fx(x)}" cy="${fx(y)}" r="${m.sel ? 9 : 6.5}" fill="${col}" fill-opacity="${m.sel ? 0.95 : 0.8}" stroke="${m.sel ? "#fff" : "#0b1218"}" stroke-width="${m.sel ? 2.5 : 1.5}"/>` +
        text(x + dx, y + dy, esc(h.label), { size: 10.5, anchor: anc, fill: m.sel ? "#fff" : C.INK, weight: 600 });
      s += part(h.id, h.label, inner, { ...m, hit: [x - 16, y - 16, 32, 32] });
    });
    return s;
  }

  SysDiagrams.register("airplane", {
    init: () => ({}),
    controls: [],
    parts: hotspots.map((h) => h.id),
    model: () => ({ msg: "Pick a part to see what it is and which system it belongs to. Shapes are illustrative, not to scale." }),
    draw(state, opts = {}) {
      const labels = opts.labels !== false;
      const body = topView() + sideView() + insets() + markers(opts) +
        text(W / 2, HEIGHT - 5, "Illustrative three-view — not to scale. Panel and engine-bay items are placed generically.", { size: 10, fill: C.MUTED, lbl: false });
      return svg(W, HEIGHT, body, labels ? "" : "sx-nolabels");
    },
  });
})();
