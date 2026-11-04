/* ============================================================================
   diagrams.js  —  SVG figures for the Stage 1 check review.

   Every builder returns an SVG string, so the content file can hang a figure
   on any learn block or quiz question (`fig: () => Diagrams.x(...)`) without
   the controller knowing what is drawn. Colours are literal hex — the app is
   dark-only, and SVG text doesn't inherit CSS custom properties reliably.

   Figures are illustrative, not to scale. Where a number is drawn (critical
   AOA, the CL curve) it is labelled as typical, not as C172 data.

   API on window.Diagrams:
     airfoil(aoa) · clCurve(aoa) · forces()
     torque() · pfactor() · slipstream() · precession()
     liftFlow() · spin() · loadFactor(bank, hide)
     overshoot() · glidepath(vert, speed) · gate()
     lightGun(color, mode, onGround) · acknowledge()
     sign(parts) · holdShort() · marking(kind) · runway() · displaced() · closedRunway()
     segmentedCircle() · untowered()
     fuelSystem() · electrical() · panel205() · inspections() · pohMap()
   ========================================================================== */

const Diagrams = (() => {
  const INK = "#e8edf2", MUTED = "#9aa7b4", LINE = "#313a46", SKY = "#34ace0";
  const OK = "#2ed573", BAD = "#ff4757", WARN = "#ffa502", YEL = "#f6c90e";

  const svg = (w, h, body, cls = "") =>
    `<svg class="fig ${cls}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img">${body}</svg>`;
  const text = (x, y, s, o = {}) =>
    `<text x="${x}" y="${y}" fill="${o.fill || INK}" font-size="${o.size || 12}" ` +
    `text-anchor="${o.anchor || "middle"}" font-weight="${o.weight || 400}" ` +
    `font-family="Segoe UI, Roboto, sans-serif">${s}</text>`;
  const arrowDefs = (id, color) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;
  let uid = 0;
  const id = (p) => `${p}${++uid}`;

  /* ---------------------------- aerodynamics ---------------------------- */
  const CRIT = 16;   // illustrative critical AOA, degrees

  // Coefficient of lift: linear to the critical AOA, then it falls away.
  const cl = (a) => a <= CRIT ? 0.25 + 0.075 * a : Math.max(0.5, 1.45 - 0.09 * (a - CRIT));

  const tilt = (x, aoa) => Math.tan(aoa * Math.PI / 180) * x * Math.exp(-((x / 110) ** 2));

  function airfoil(aoa) {
    const stalled = aoa > CRIT;
    const ah = id("ah"), aw = id("aw"), al = id("al"), ab = id("ab");
    let body = `<defs>${arrowDefs(ah, MUTED)}${arrowDefs(aw, SKY)}${arrowDefs(al, OK)}${arrowDefs(ab, BAD)}</defs>`;
    // streamlines: bend over the wing; downwash when attached, a wake of eddies when stalled
    const lines = [-70, -45, -22, 32, 58];
    lines.forEach((y0) => {
      const above = y0 < 0;
      let d = "";
      for (let x = -230; x <= 230; x += 10) {
        const bump = Math.exp(-(((x + 10) / 90) ** 2)) * (above ? -(10 + aoa * 0.9) : 4);
        // near the wing the flow follows the tilted chord (upwash ahead, downwash behind)
        let tail = tilt(x, aoa) + (x > 0 ? (x / 230) * aoa * (above ? 1.1 : 0.9) : 0);
        if (stalled && above && x > -20) tail = tilt(-20, aoa) - (aoa - CRIT) * 1.5 * (x + 20) / 250;  // flow leaves the surface
        d += (x === -230 ? "M" : "L") + (230 + x) + "," + (140 + y0 + bump + tail).toFixed(1);
      }
      body += `<path d="${d}" fill="none" stroke="${SKY}" stroke-opacity=".45" stroke-width="1.5"/>`;
    });
    // wing, rotated nose-up by AOA about mid-chord (leading edge on the left, into the wind)
    const eddies = !stalled ? "" : [[-10, -38, 7], [22, -40, 8], [52, -34, 9], [82, -26, 10], [112, -16, 11]].map(([cx, cy, r]) =>
      `<path d="M${cx + r},${cy} A${r},${r} 0 1 1 ${cx},${cy - r}" fill="none" stroke="${BAD}" stroke-width="1.6" class="eddy"/>`).join("");
    body += `<g transform="translate(230,140) rotate(${aoa})">
      <path d="M-100,0 C-100,-16 -62,-27 -12,-26 C40,-24 80,-9 104,1 C70,4 28,8 -12,8 C-62,8 -100,6 -100,0 Z"
        fill="#59636f" stroke="${INK}" stroke-width="1.5"/>
      <line x1="-115" y1="0" x2="120" y2="0" stroke="${MUTED}" stroke-dasharray="4 4"/>
      ${text(124, 14, "chord", { size: 10, fill: MUTED, anchor: "start" })}
      ${eddies}
    </g>`;
    // relative wind, lift (perpendicular to relative wind)
    body += `<line x1="18" y1="205" x2="110" y2="205" stroke="${MUTED}" stroke-width="2" marker-end="url(#${ah})"/>`;
    body += text(64, 225, "relative wind", { size: 11, fill: MUTED });
    const L = 30 + cl(aoa) * 55;
    body += `<line x1="230" y1="128" x2="230" y2="${128 - L}" stroke="${stalled ? BAD : OK}" stroke-width="4" marker-end="url(#${stalled ? ab : al})"/>`;
    body += text(244, 128 - L + 10, "lift", { size: 12, fill: stalled ? BAD : OK, anchor: "start", weight: 700 });
    // AOA angle arc
    body += text(400, 222, `AOA ${aoa}°`, { size: 16, weight: 800, fill: stalled ? BAD : INK, anchor: "end" });
    if (stalled) body += text(230, 24, "STALL — critical AOA exceeded", { size: 15, weight: 800, fill: BAD });
    return svg(460, 240, body);
  }

  function clCurve(aoa) {
    const X = (a) => 40 + a * 13, Y = (c) => 170 - c * 100;
    let d = "";
    for (let a = 0; a <= 24; a += 0.5) d += (a ? "L" : "M") + X(a) + "," + Y(cl(a)).toFixed(1);
    const stalled = aoa > CRIT;
    return svg(370, 200, `
      <line x1="40" y1="170" x2="360" y2="170" stroke="${LINE}"/><line x1="40" y1="20" x2="40" y2="170" stroke="${LINE}"/>
      <line x1="${X(CRIT)}" y1="20" x2="${X(CRIT)}" y2="170" stroke="${BAD}" stroke-dasharray="4 4"/>
      ${text(X(CRIT), 16, "critical AOA", { size: 10, fill: BAD })}
      <path d="${d}" fill="none" stroke="${SKY}" stroke-width="2.5"/>
      <circle cx="${X(aoa)}" cy="${Y(cl(aoa))}" r="7" fill="${stalled ? BAD : OK}"/>
      ${text(200, 194, "angle of attack →", { size: 11, fill: MUTED })}
      ${text(14, 95, "CL", { size: 11, fill: MUTED })}
    `);
  }

  function forces() {
    const a = id("fa");
    const arr = (x1, y1, x2, y2, c, label, lx, ly) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="4" marker-end="url(#${a}${c.slice(1)})"/>` +
      text(lx, ly, label, { fill: c, weight: 700 });
    const defs = [OK, BAD, SKY, WARN].map((c) => arrowDefs(a + c.slice(1), c)).join("");
    return svg(360, 224, `<defs>${defs}</defs>
      ${plane(180, 112, 1.1)}
      ${arr(185, 88, 185, 18, OK, "LIFT", 218, 30)}
      ${arr(180, 142, 180, 212, BAD, "WEIGHT", 230, 206)}
      ${arr(248, 112, 340, 112, SKY, "THRUST", 312, 98)}
      ${arr(112, 112, 22, 112, WARN, "DRAG", 46, 98)}`);
  }

  // Side view of a high-wing Skyhawk, nose right: strut-braced wing on the cabin
  // roof, swept fin, fixed tricycle gear. Local origin mid-fuselage; wheels
  // touch y = +23, so on the ground pass y = groundY − 23·s.
  function plane(x, y, s = 1) {
    return `<g transform="translate(${x},${y}) scale(${s})">
      <line x1="56" y1="-17" x2="56" y2="17" stroke="${MUTED}" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
      <path d="M2,7 L7,19 M42,7 L42,19" stroke="#8a96a3" stroke-width="2.5"/>
      <circle cx="7" cy="19" r="4" fill="#59636f"/><circle cx="42" cy="19.5" r="3.5" fill="#59636f"/>
      <path d="M-50,-26 L-44,-26 L-34,-8 L-56,-3 Z" fill="#a9b4c0"/>
      <path d="M52,-1 Q52,-7 45,-8 L31,-8 L21,-14 L-8,-14 L-50,-4 L-55,-3 L-55,1 L-10,8 L40,7 Q50,6 52,-1 Z" fill="#cfd8e3"/>
      <path d="M53,-3 Q58,0 53,3 Z" fill="#8a96a3"/>
      <path d="M19,-12 L27,-7 L20,-6 Z M17,-12 L-4,-12 L-4,-6 L17,-6 Z" fill="#203a52"/>
      <rect x="-62" y="-4" width="20" height="3" rx="1.5" fill="#8a96a3"/>
      <path d="M24,-14 Q23,-19 14,-19 L-10,-17.5 L-10,-14 Z" fill="#8a96a3"/>
      <line x1="9" y1="6" x2="5" y2="-14" stroke="#8a96a3" stroke-width="1.6"/>
    </g>`;
  }
  // Top view, nose up (pilot's left is the viewer's left). wl / wr colour each wing.
  function planeTop(x, y, s = 1, wl = "#8a96a3", wr = "#8a96a3") {
    return `<g transform="translate(${x},${y}) scale(${s})">
      <rect x="-14" y="-46" width="28" height="2.5" rx="1" fill="${MUTED}"/>
      <path d="M-5,-38 Q0,-46 5,-38 L6,-10 L2,40 L-2,40 L-6,-10 Z" fill="#cfd8e3"/>
      <rect x="-22" y="32" width="44" height="8" rx="2" fill="#a9b4c0"/>
      <path d="M-4,-15 L-62,-14 L-62,-3 L-4,-3 Z" fill="${wl}"/>
      <path d="M4,-15 L62,-14 L62,-3 L4,-3 Z" fill="${wr}"/>
      <rect x="-4" y="-16" width="8" height="13" fill="#a9b4c0"/>
    </g>`;
  }
  // Front view, facing the nose — the airplane's LEFT wing is the viewer's RIGHT.
  function planeFront(inner = "") {
    return `<path d="M-6,9 L-22,24 M6,9 L22,24" stroke="#8a96a3" stroke-width="2.5"/>
      <circle cx="-22" cy="26" r="4" fill="#59636f"/><circle cx="22" cy="26" r="4" fill="#59636f"/>
      <line x1="0" y1="12" x2="0" y2="24" stroke="#8a96a3" stroke-width="2.5"/><circle cx="0" cy="26" r="3.5" fill="#59636f"/>
      <rect x="-1.5" y="-34" width="3" height="20" fill="#a9b4c0"/>
      <rect x="-26" y="-4" width="52" height="3" rx="1.5" fill="#a9b4c0"/>
      <path d="M-8,8 L-34,-13 M8,8 L34,-13" stroke="#8a96a3" stroke-width="1.6"/>
      <rect x="-72" y="-17" width="144" height="5" rx="2.5" fill="#cfd8e3"/>
      <ellipse cx="0" cy="0" rx="11" ry="13" fill="#cfd8e3"/>
      <rect x="-8" y="-11" width="16" height="6" rx="2" fill="#203a52"/>
      <circle cx="0" cy="3" r="17" fill="none" stroke="${MUTED}" stroke-opacity=".35"/>
      <circle cx="0" cy="3" r="3" fill="#8a96a3"/>${inner}`;
  }

  /* ------------------------- turning tendencies ------------------------- */
  // rear view: pilot's eye, prop turning clockwise
  function rearView(extra) {
    return `<rect x="30" y="96" width="260" height="10" rx="5" fill="#8a96a3"/>
      <circle cx="160" cy="101" r="24" fill="#cfd8e3"/>
      <path d="M160,77 L160,46 L170,46 L166,77 Z" fill="#cfd8e3"/>
      <rect x="120" y="90" width="80" height="6" rx="3" fill="#a9b4c0"/>${extra}`;
  }
  function torque() {
    const a = id("tq"), r = id("tr");
    return svg(320, 200, `<defs>${arrowDefs(a, SKY)}${arrowDefs(r, BAD)}</defs>
      ${rearView("")}
      <path d="M120,60 A50,50 0 0 1 200,60" fill="none" stroke="${SKY}" stroke-width="3" marker-end="url(#${a})"/>
      ${text(160, 30, "prop turns clockwise (pilot's view)", { fill: SKY, size: 11 })}
      <path d="M60,128 A110,40 0 0 0 260,128" fill="none" stroke="${BAD}" stroke-width="3" marker-end="url(#${r})"/>
      ${text(160, 194, "reaction rolls the airplane LEFT", { fill: BAD, size: 12, weight: 700 })}`);
  }
  // top view, nose up: thrust arrows point the way thrust does — forward
  function pfactor() {
    const a = id("pf"), y = id("py");
    return svg(320, 200, `<defs>${arrowDefs(a, OK)}${arrowDefs(y, BAD)}</defs>
      ${planeTop(160, 132, 1)}
      <line x1="150" y1="82" x2="150" y2="58" stroke="${OK}" stroke-width="3" marker-end="url(#${a})"/>
      <line x1="170" y1="82" x2="170" y2="16" stroke="${OK}" stroke-width="3" marker-end="url(#${a})"/>
      ${text(140, 56, "ascending blade", { size: 10, fill: MUTED, anchor: "end" })}
      ${text(140, 69, "less thrust", { size: 10, fill: MUTED, anchor: "end" })}
      ${text(180, 26, "descending blade (right)", { size: 10, fill: OK, anchor: "start" })}
      ${text(180, 39, "bigger bite → more thrust", { size: 10, fill: OK, anchor: "start" })}
      <line x1="140" y1="92" x2="100" y2="92" stroke="${BAD}" stroke-width="3" marker-end="url(#${y})"/>
      ${text(98, 108, "nose yaws", { size: 10, fill: BAD, anchor: "start" })}
      ${text(262, 148, "top view, climbing", { size: 10, fill: MUTED })}
      ${text(262, 162, "(high AOA)", { size: 10, fill: MUTED })}
      ${text(160, 192, "more thrust on the right → yaw LEFT", { fill: BAD, size: 12, weight: 700 })}`);
  }
  function slipstream() {
    const a = id("ss");
    let helix = "M40,100";
    for (let x = 40; x <= 248; x += 4) helix += ` L${x},${(100 + Math.sin((x - 40) / 14) * 22).toFixed(1)}`;
    // top view, nose pointing left: the pilot's left is the BOTTOM of the drawing
    return svg(320, 210, `<defs>${arrowDefs(a, BAD)}</defs>
      <rect x="40" y="90" width="232" height="20" rx="10" fill="#cfd8e3"/>
      <rect x="110" y="22" width="34" height="156" rx="4" fill="#8a96a3"/>
      <rect x="246" y="60" width="24" height="80" rx="3" fill="#a9b4c0"/>
      <rect x="236" y="97" width="42" height="6" rx="2" fill="#59636f"/>
      <rect x="30" y="74" width="5" height="52" fill="${MUTED}"/>
      <path d="${helix}" fill="none" stroke="${SKY}" stroke-width="2.5" stroke-opacity=".8"/>
      <circle cx="256" cy="108" r="6" fill="${BAD}"/>
      ${text(262, 160, "hits the fin's", { fill: BAD, size: 11 })}
      ${text(262, 174, "LEFT side", { fill: BAD, size: 11, weight: 700 })}
      ${text(16, 16, "top view, nose left — pilot's left is down", { fill: MUTED, size: 10, anchor: "start" })}
      <line x1="22" y1="112" x2="22" y2="150" stroke="${BAD}" stroke-width="3" marker-end="url(#${a})"/>
      ${text(30, 166, "nose yaws", { size: 10, fill: BAD, anchor: "start" })}
      ${text(160, 202, "corkscrewing slipstream → nose yaws LEFT", { fill: BAD, size: 12, weight: 700 })}`);
  }
  function precession() {
    const a = id("gp"), b = id("gq"), c = id("gr");
    return svg(320, 210, `<defs>${arrowDefs(a, WARN)}${arrowDefs(b, BAD)}${arrowDefs(c, SKY)}</defs>
      <circle cx="160" cy="105" r="70" fill="none" stroke="${SKY}" stroke-width="2"/>
      <path d="M115,52 A70,70 0 0 1 205,52" fill="none" stroke="${SKY}" stroke-width="2.5" marker-end="url(#${c})"/>
      <circle cx="160" cy="35" r="7" fill="${WARN}"/>
      ${text(160, 20, "force applied at the top", { fill: WARN, size: 11 })}
      <circle cx="230" cy="105" r="7" fill="${BAD}"/>
      <path d="M160,105 L222,105" stroke="${MUTED}" stroke-dasharray="3 3"/>
      ${text(238, 92, "felt 90° later", { fill: BAD, size: 11, anchor: "start" })}
      ${text(238, 124, "in rotation", { fill: BAD, size: 11, anchor: "start" })}
      ${text(160, 196, "tailwheel: raise the tail → nose yaws LEFT", { fill: BAD, size: 12, weight: 700 })}`);
  }

  /* ---------------------- overshooting a parallel ----------------------- */
  function overshoot() {
    const a = id("ov"), g = id("og");
    const rwy = (x, n) => `<rect x="${x - 14}" y="40" width="28" height="160" fill="#3b4350"/>
      <line x1="${x}" y1="50" x2="${x}" y2="164" stroke="#fff" stroke-dasharray="10 8" stroke-width="2"/>
      ${text(x, 186, n, { size: 11, weight: 800 })}
      <line x1="${x}" y1="200" x2="${x}" y2="360" stroke="${MUTED}" stroke-dasharray="3 6"/>`;
    return svg(420, 380, `<defs>${arrowDefs(a, BAD)}${arrowDefs(g, OK)}</defs>
      ${rwy(180, "36L")}${rwy(270, "36R")}
      ${text(270, 30, "parallel traffic", { size: 11, fill: WARN })}
      <path d="M30,320 L120,320" stroke="${INK}" stroke-width="3"/>
      ${text(70, 310, "base", { size: 11, fill: MUTED })}
      <path d="M120,320 Q180,320 180,262" fill="none" stroke="${OK}" stroke-width="3"/>
      ${text(146, 300, "planned", { size: 10, fill: OK, anchor: "end" })}
      <path d="M120,320 Q262,322 285,268 Q292,240 250,226" fill="none" stroke="${BAD}" stroke-width="3" stroke-dasharray="7 5" marker-end="url(#${a})"/>
      ${text(330, 290, "overshoot", { size: 12, fill: BAD, weight: 700 })}
      ${text(330, 306, "across 36R final", { size: 11, fill: BAD })}
      <path d="M250,226 Q228,210 225,150" fill="none" stroke="${OK}" stroke-width="2.5" marker-end="url(#${g})"/>
      ${text(225, 136, "go around", { size: 11, fill: OK })}
      <rect x="20" y="340" width="380" height="30" rx="6" fill="#34151a" stroke="${BAD}"/>
      ${text(210, 360, "Don't steepen the bank or skid with rudder — that's the stall/spin setup", { size: 11, fill: "#ffb3bb" })}`);
  }

  /* ------------------------ stabilized approach ------------------------- */
  // vert: "high" | "on" | "low";  speed: "fast" | "on" | "slow"
  function glidepath(vert = "on", speed = "on") {
    const off = { high: -42, on: 0, low: 38 }[vert];
    const px = 150, py = 40 + (px - 40) * 0.42 + off;
    const papi = { high: "WWWW", on: "WWRR", low: "RRRR" }[vert];
    const ias = { fast: 82, on: 70, slow: 61 }[speed];
    const iasCol = speed === "on" ? OK : speed === "fast" ? WARN : BAD;
    const lights = [...papi].map((c, k) =>
      `<circle cx="${388 + k * 14}" cy="182" r="5.5" fill="${c === "W" ? "#fff" : BAD}"/>`).join("");
    return svg(470, 230, `
      <rect x="0" y="190" width="470" height="40" fill="#203124"/>
      <rect x="340" y="186" width="130" height="8" fill="#3b4350"/>
      <line x1="40" y1="40" x2="380" y2="183" stroke="${OK}" stroke-width="2" stroke-dasharray="8 6"/>
      ${text(70, 32, "glidepath", { size: 11, fill: OK })}
      <g transform="translate(${px},${py}) rotate(23)">${plane(0, 0, 0.42)}</g>
      ${vert !== "on" ? `<line x1="${px}" y1="${py}" x2="${px}" y2="${40 + (px - 40) * 0.42}" stroke="${WARN}" stroke-dasharray="3 3"/>` : ""}
      ${lights}
      ${text(409, 172, "PAPI", { size: 10, fill: MUTED })}
      <rect x="18" y="140" width="96" height="40" rx="6" fill="#141920" stroke="${iasCol}"/>
      ${text(66, 158, "AIRSPEED", { size: 9, fill: MUTED })}
      ${text(66, 175, ias + " KIAS", { size: 15, weight: 800, fill: iasCol })}
      ${text(170, 220, "target 70 KIAS (+5 / −0)", { size: 11, fill: MUTED })}
    `);
  }

  /* ----------------------------- light gun ------------------------------ */
  // color: "green" | "red" | "white" | "alt";  mode: "steady" | "flash"
  function lightGun(color, mode, onGround) {
    const C = { green: "#2ed573", red: "#ff3b4e", white: "#ffffff" };
    const beam = (c, cls) => `<polygon points="98,58 360,${onGround ? 150 : 40} 360,${onGround ? 196 : 104}" fill="${c}" fill-opacity=".28" class="${cls}"/>
      <circle cx="96" cy="60" r="9" fill="${c}" class="${cls}"/>`;
    let beams;
    if (color === "alt") beams = beam(C.red, "lg-alt-a") + beam(C.green, "lg-alt-b");
    else beams = beam(C[color], mode === "flash" ? "lg-flash" : "");
    const craft = onGround
      ? `<rect x="0" y="190" width="460" height="40" fill="#203124"/>${plane(372, 172, 0.78)}`
      : `<rect x="0" y="190" width="460" height="40" fill="#203124"/>${plane(372, 70, 0.78)}`;
    return svg(460, 230, `
      ${craft}
      <rect x="66" y="80" width="30" height="110" fill="#59636f"/>
      <polygon points="54,52 108,52 116,80 46,80" fill="#8a96a3"/>
      <rect x="58" y="56" width="46" height="18" fill="#203a52"/>
      ${beams}
      ${text(81, 210, "TOWER", { size: 10, fill: MUTED })}
      ${text(450, 24, onGround ? "you: ON THE GROUND" : "you: IN FLIGHT", { size: 12, weight: 700, fill: WARN, anchor: "end" })}
    `);
  }

  /* -------------------------- signs & markings -------------------------- */
  // parts: [{k:"mandatory"|"location"|"direction"|"destination"|"info"|"distance"|"noentry"|"rwyBoundary"|"ilsBoundary", t}]
  function sign(parts) {
    const H = 64, pad = 18;
    let x = 6, body = "";
    parts.forEach((p) => {
      const w = p.k === "noentry" ? 70 : p.k.endsWith("Boundary") ? 110 : Math.max(60, p.t.length * 24 + pad * 2);
      const g = (fill, fg, border) =>
        `<rect x="${x}" y="6" width="${w}" height="${H}" fill="${fill}" ${border ? `stroke="${border}" stroke-width="4"` : ""}/>` +
        (p.t ? `<text x="${x + w / 2}" y="${6 + H / 2 + 11}" fill="${fg}" font-size="32" font-weight="800" text-anchor="middle" font-family="Arial, sans-serif">${p.t}</text>` : "");
      switch (p.k) {
        case "mandatory":   body += g("#c8102e", "#fff"); break;
        case "location":    body += `<rect x="${x}" y="6" width="${w}" height="${H}" fill="#111"/>` +
          `<rect x="${x + 5}" y="11" width="${w - 10}" height="${H - 10}" fill="none" stroke="${YEL}" stroke-width="3"/>` +
          `<text x="${x + w / 2}" y="${6 + H / 2 + 11}" fill="${YEL}" font-size="32" font-weight="800" text-anchor="middle" font-family="Arial, sans-serif">${p.t}</text>`; break;
        case "direction":
        case "destination":
        case "info":        body += g(YEL, "#111"); break;
        case "distance":    body += g("#111", "#fff"); break;
        case "noentry":     body += `<rect x="${x}" y="6" width="${w}" height="${H}" fill="#c8102e"/>` +
          `<circle cx="${x + 35}" cy="38" r="21" fill="none" stroke="#fff" stroke-width="5"/>` +
          `<rect x="${x + 20}" y="34" width="30" height="8" fill="#fff"/>`; break;
        case "rwyBoundary": body += `<rect x="${x}" y="6" width="${w}" height="${H}" fill="${YEL}"/>` +
          [16, 26].map((yy) => `<rect x="${x + 8}" y="${yy}" width="${w - 16}" height="5" fill="#111"/>`).join("") +
          [44, 54].map((yy) => Array.from({ length: 6 }, (_, k) =>
            `<rect x="${x + 8 + k * 16}" y="${yy}" width="10" height="5" fill="#111"/>`).join("")).join(""); break;
        case "ilsBoundary": body += `<rect x="${x}" y="6" width="${w}" height="${H}" fill="${YEL}"/>` +
          [18, 52].map((yy) => `<rect x="${x + 8}" y="${yy}" width="${w - 16}" height="4" fill="#111"/>`).join("") +
          Array.from({ length: 6 }, (_, k) => `<rect x="${x + 12 + k * 15}" y="22" width="4" height="30" fill="#111"/>`).join(""); break;
      }
      x += w + 2;
    });
    return svg(x + 4, H + 12, body, "sign-fig");
  }

  // taxiway meeting a runway: solid lines on the HOLD side
  function holdShort() {
    const dash = Array.from({ length: 6 }, (_, k) => `<rect x="${126 + k * 18}" y="0" width="10" height="4" fill="${YEL}"/>`).join("");
    return svg(380, 240, `
      <rect x="0" y="150" width="380" height="90" fill="#3b4350"/>
      <line x1="0" y1="195" x2="380" y2="195" stroke="#fff" stroke-width="3" stroke-dasharray="20 14"/>
      <rect x="120" y="0" width="120" height="150" fill="#2c323b"/>
      <line x1="180" y1="0" x2="180" y2="150" stroke="${YEL}" stroke-width="3"/>
      ${[172, 188].map((x) => `<line x1="${x}" y1="22" x2="${x}" y2="104" stroke="${YEL}" stroke-width="2.5" stroke-dasharray="9 6"/>`).join("")}
      <rect x="126" y="112" width="108" height="4" fill="${YEL}"/>
      <rect x="126" y="120" width="108" height="4" fill="${YEL}"/>
      <g transform="translate(0,128)">${dash}</g><g transform="translate(0,136)">${dash}</g>
      ${text(300, 60, "you hold HERE", { size: 12, fill: OK, weight: 700 })}
      ${text(300, 76, "(solid-line side)", { size: 11, fill: OK })}
      <path d="M250,84 L236,104" stroke="${OK}" stroke-width="2"/>
      ${text(60, 60, "taxiway", { size: 11, fill: MUTED })}
      ${text(60, 106, "enhanced", { size: 10, fill: YEL })}${text(60, 119, "centerline:", { size: 10, fill: YEL })}
      ${text(60, 132, "hold line ahead", { size: 10, fill: YEL })}
      <path d="M100,108 L166,84" stroke="${YEL}" stroke-width="1" stroke-opacity=".6"/>
      ${text(60, 228, "runway", { size: 11, fill: MUTED })}
    `);
  }

  // Landing east on runway 9. Touchdown-zone bars run along the runway in
  // pairs of groups — 3, then the aiming point, then 2, 2, 1 (AIM 2-3-3).
  function runway() {
    const thr = Array.from({ length: 8 }, (_, k) => `<rect x="${40 + k * 12}" y="22" width="6" height="56" fill="#fff"/>`).join("");
    const tdz = [[200, 3], [330, 2], [372, 2], [414, 1]].map(([x, n]) => Array.from({ length: n }, (_, k) =>
      `<rect x="${x}" y="${18 + k * 7}" width="26" height="4" fill="#fff"/><rect x="${x}" y="${78 - k * 7}" width="26" height="4" fill="#fff"/>`).join("")).join("");
    return svg(470, 104, `
      <rect x="20" y="10" width="440" height="80" fill="#3b4350"/>
      ${thr}
      <text x="160" y="61" fill="#fff" font-size="30" font-weight="800" font-family="Arial" transform="rotate(90,160,50)" text-anchor="middle">9</text>
      ${tdz}
      <rect x="250" y="20" width="50" height="12" fill="#fff"/><rect x="250" y="68" width="50" height="12" fill="#fff"/>
      <line x1="190" y1="50" x2="460" y2="50" stroke="#fff" stroke-width="3" stroke-dasharray="24 16"/>
      ${text(84, 8, "threshold", { size: 9, fill: MUTED })}
      ${text(213, 8, "touchdown zone", { size: 9, fill: MUTED })}
      ${text(275, 100, "aiming point", { size: 9, fill: MUTED })}
      ${text(400, 100, "touchdown zone 2 · 2 · 1", { size: 9, fill: MUTED })}
    `);
  }

  // AIM 2-3-3: arrows along the centerline of the displaced area, arrowheads
  // across the runway just prior to the threshold bar, then the threshold.
  function displaced() {
    const arrows = [36, 96].map((x) => `<path d="M${x},50 L${x + 40},50 M${x + 28},41 L${x + 40},50 L${x + 28},59" stroke="#fff" stroke-width="3" fill="none"/>`).join("");
    const heads = [0, 1, 2, 3].map((k) => `<path d="M168,${18 + k * 18} L182,${25 + k * 18} L168,${32 + k * 18} Z" fill="#fff"/>`).join("");
    return svg(470, 100, `
      <rect x="20" y="10" width="440" height="80" fill="#3b4350"/>
      ${arrows}${heads}
      <rect x="188" y="12" width="7" height="76" fill="#fff"/>
      ${Array.from({ length: 6 }, (_, k) => `<rect x="${206 + k * 10}" y="22" width="5" height="56" fill="#fff"/>`).join("")}
      <line x1="290" y1="50" x2="460" y2="50" stroke="#fff" stroke-width="3" stroke-dasharray="24 16"/>
      ${text(100, 8, "displaced area", { size: 9, fill: MUTED })}
      ${text(192, 99, "threshold bar", { size: 9, fill: MUTED })}
      ${text(330, 8, "landing threshold →", { size: 9, fill: MUTED })}
    `);
  }

  function closedRunway() {
    const x = (cx) => `<path d="M${cx - 22},26 L${cx + 22},74 M${cx + 22},26 L${cx - 22},74" stroke="${YEL}" stroke-width="9"/>`;
    return svg(470, 100, `<rect x="20" y="10" width="440" height="80" fill="#3b4350"/>${x(90)}${x(380)}
      ${text(240, 56, "runway", { size: 12, fill: MUTED })}`);
  }

  /* ------------------------- untowered airport -------------------------- */
  // Seen from above, runway 18-36. AIM 4-3-4: "mentally enlarge" the L at the
  // approach end and it is the base and final legs. Both L's turn east here:
  // left traffic for 18, right traffic for 36. Wind from the north → land 18.
  function segmentedCircle() {
    const C = 120, R = 50;
    const segs = Array.from({ length: 12 }, (_, k) => {
      const a0 = (k * 30) * Math.PI / 180, a1 = (k * 30 + 18) * Math.PI / 180;
      return `<path d="M${C + R * Math.cos(a0)},${C + R * Math.sin(a0)} A${R},${R} 0 0 1 ${C + R * Math.cos(a1)},${C + R * Math.sin(a1)}" stroke="#fff" stroke-width="7" fill="none"/>`;
    }).join("");
    // wind cone: the open end sits at the mast and faces the wind (north); the tail streams south
    const sock = [0, 1, 2, 3].map((k) => {
      const y0 = C + 2 + k * 9, w0 = 9 - k * 1.5, w1 = 7.5 - k * 1.5;
      return `<path d="M${C - w0},${y0} L${C - w1},${y0 + 9} L${C + w1},${y0 + 9} L${C + w0},${y0} Z" fill="${k % 2 ? "#fff" : WARN}"/>`;
    }).join("");
    const L = (y1, y2, yEnd) => `<path d="M${C},${y1} L${C},${y2}" stroke="#fff" stroke-width="7"/>
      <path d="M${C - 3.5},${yEnd} L${C + 26},${yEnd}" stroke="${YEL}" stroke-width="7"/>`;
    const a = id("sc"), li = (y, t, o = {}) => text(256, y, t, { size: 11, fill: MUTED, anchor: "start", ...o });
    return svg(480, 240, `<defs>${arrowDefs(a, SKY)}</defs><rect width="240" height="240" rx="8" fill="#203124"/>${segs}
      ${L(62, 22, 25)}${L(178, 218, 215)}
      ${sock}<circle cx="${C}" cy="${C}" r="3.5" fill="#ccc"/>
      <line x1="60" y1="40" x2="60" y2="84" stroke="${SKY}" stroke-width="2.5" marker-end="url(#${a})"/>
      ${text(60, 32, "wind", { size: 10, fill: SKY })}
      ${text(108, 34, "18", { size: 11, weight: 700, anchor: "end" })}${text(108, 214, "36", { size: 11, weight: 700, anchor: "end" })}
      ${text(200, 232, "from above · north up", { size: 9, fill: MUTED })}
      ${text(256, 24, "Segmented circle", { size: 14, weight: 700, anchor: "start" })}
      ${li(46, "• wind cone: open end faces INTO")}
      ${li(60, "  the wind — from the north here")}
      ${li(80, "• white landing strip indicators:")}
      ${li(94, "  the runway runs north–south")}
      ${li(114, "• the L (short leg highlighted) is a")}
      ${li(128, "  traffic pattern indicator. Enlarge")}
      ${li(142, "  yours: it's your base + final")}
      ${li(166, "Landing 18: base on the east side")}
      ${li(180, "→ LEFT traffic", { fill: OK, weight: 700 })}
      ${li(204, "Landing 36: base on the east side")}
      ${li(218, "→ RIGHT traffic", { fill: WARN, weight: 700 })}`);
  }

  // The pattern for runway 9 with a dot flying it, so the turns read as LEFT turns.
  function untowered() {
    const a = id("ut"), m = id("um");
    const call = (x, y, t, ly = y - 10, lx = x, anchor = "middle") =>
      `<circle cx="${x}" cy="${y}" r="5" fill="${WARN}"/>${text(lx, ly, t, { size: 10, fill: WARN, anchor })}`;
    const loop = "M150,180 L350,180 L380,180 Q420,180 420,130 Q420,90 380,90 L100,90 Q60,90 60,120 L60,140 Q60,180 100,180 L150,180";
    return svg(480, 300, `<defs>${arrowDefs(a, SKY)}
        <marker id="${m}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${SKY}"/></marker></defs>
      <rect x="150" y="172" width="200" height="16" fill="#3b4350"/>
      <line x1="160" y1="180" x2="340" y2="180" stroke="#fff" stroke-width="1.5" stroke-dasharray="10 8"/>
      ${text(250, 204, "RWY 9 — landing east", { size: 10, fill: INK })}
      <path d="${loop}" fill="none" stroke="${SKY}" stroke-width="2.5" stroke-dasharray="7 5" stroke-opacity=".8"/>
      ${["M232,90 L222,90", "M60,128 L60,138", "M290,180 L300,180", "M420,138 L420,128"].map((d) =>
        `<path d="${d}" stroke="${SKY}" stroke-width="2.5" marker-end="url(#${m})"/>`).join("")}
      <circle r="6" fill="#fff"><animateMotion dur="9s" repeatCount="indefinite" path="${loop}"/></circle>
      <path d="M330,30 L268,86" stroke="${OK}" stroke-width="3" marker-end="url(#${a})"/>
      ${text(340, 22, "45° entry to midfield downwind", { size: 10, fill: OK })}
      ${call(436, 60, "10 mi out")} ${call(300, 48, "entering")}
      ${call(180, 90, "downwind")} ${call(60, 128, "base", 132, 50, "end")}
      ${call(110, 180, "final", 166)} ${call(390, 180, "clear", 204)}
      ${text(240, 236, "left traffic unless marked · pattern ≈ 1,000 ft AGL", { size: 11, fill: MUTED })}
      ${text(240, 256, "self-announce on CTAF: \"[Airport] traffic, Skyhawk 123, left downwind 9, [Airport]\"", { size: 10, fill: MUTED })}
      ${text(240, 276, "depart straight out or a 45° turn after pattern altitude", { size: 10, fill: MUTED })}
    `);
  }
  /* ------------------------------ systems ------------------------------- */
  function flowBoxes(rows, w = 300) {
    const a = id("fb");
    let body = `<defs>${arrowDefs(a, SKY)}</defs>`, y = 8;
    rows.forEach((r, k) => {
      const h = r.sub ? 40 : 28;
      body += `<rect x="${(w - 230) / 2}" y="${y}" width="230" height="${h}" rx="7" fill="${r.fill || "#232a34"}" stroke="${r.stroke || LINE}"/>`;
      body += text(w / 2, y + 18, r.t, { size: 12, weight: 700, fill: r.ink || INK });
      if (r.sub) body += text(w / 2, y + 33, r.sub, { size: 10, fill: MUTED });
      y += h;
      if (k < rows.length - 1) {
        body += `<line x1="${w / 2}" y1="${y + 1}" x2="${w / 2}" y2="${y + 13}" stroke="${SKY}" stroke-width="2" marker-end="url(#${a})"/>`;
        y += 16;
      }
    });
    return svg(w, y + 8, body);
  }

  function fuelSystem() {
    return flowBoxes([
      { t: "LEFT tank · RIGHT tank", sub: "56 gal total · 53 usable · vented", fill: "#123048", stroke: SKY },
      { t: "Fuel selector", sub: "LEFT · BOTH · RIGHT" },
      { t: "Reservoir tank", sub: "gravity-fed to here · sump drain" },
      { t: "Electric auxiliary pump", sub: "FUEL PUMP switch — priming / backup" },
      { t: "Fuel shutoff valve", sub: "red push-pull knob" },
      { t: "Fuel strainer", sub: "drain on preflight" },
      { t: "Engine-driven fuel pump" },
      { t: "Fuel / air control unit (servo)", sub: "throttle + mixture meter the fuel" },
      { t: "Fuel distribution valve", sub: "\"flow divider\"" },
      { t: "4 injector nozzles", sub: "one per cylinder", fill: "#3a2a10", stroke: WARN },
    ]);
  }

  function electrical() {
    const a = id("el");
    const box = (x, y, w, t, sub, c = LINE) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${sub ? 40 : 28}" rx="7" fill="#232a34" stroke="${c}"/>` +
      text(x + w / 2, y + 18, t, { size: 12, weight: 700 }) + (sub ? text(x + w / 2, y + 33, sub, { size: 10, fill: MUTED }) : "");
    const line = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SKY}" stroke-width="2" marker-end="url(#${a})"/>`;
    return svg(460, 312, `<defs>${arrowDefs(a, SKY)}</defs>
      ${box(10, 10, 140, "Main battery", "24 V", WARN)}
      ${box(310, 10, 140, "Alternator", "28 V · 60 A", OK)}
      ${box(160, 70, 140, "MASTER (BAT | ALT)", "split rocker")}
      ${line(80, 52, 190, 70)}${line(380, 52, 270, 70)}
      ${box(130, 140, 200, "Main bus(es)", "lights · pitot heat · fuel pump …")}
      ${line(230, 112, 230, 138)}
      ${box(10, 210, 140, "Avionics bus", "AVIONICS BUS 1 / 2")}
      ${box(284, 210, 170, "Essential bus", "PFD · AHRS · ADC · engine data")}
      ${line(190, 182, 100, 208)}${line(270, 182, 360, 208)}
      ${box(299, 262, 140, "Standby battery", "STBY BATT", BAD)}
      ${line(369, 262, 369, 252)}
      ${text(80, 280, "Magnetos are NOT on the bus —", { size: 10, fill: WARN })}
      ${text(80, 294, "the engine runs with MASTER off", { size: 10, fill: WARN })}
    `);
  }

  /* ------------------------- lift, stall, spin -------------------------- */
  // Streamlines whose dashes flow — faster over the top (lower pressure) than
  // underneath — ending in downwash behind the wing. Fixed, unstalled AOA.
  function liftFlow() {
    const al = id("lf"), ad = id("ld"), aoa = 6;
    let body = `<defs>${arrowDefs(al, OK)}${arrowDefs(ad, SKY)}</defs>`;
    [-72, -48, -26, 30, 56].forEach((y0) => {
      const above = y0 < 0;
      let d = "";
      for (let x = -230; x <= 230; x += 10) {
        const bump = Math.exp(-(((x + 10) / 90) ** 2)) * (above ? -(10 + aoa * 0.9) : 4);
        const tail = tilt(x, aoa) + (x > 0 ? (x / 230) * aoa * (above ? 1.6 : 1.2) : 0);
        d += (x === -230 ? "M" : "L") + (230 + x) + "," + (120 + y0 + bump + tail).toFixed(1);
      }
      body += `<path d="${d}" fill="none" stroke="${SKY}" stroke-opacity=".75" stroke-width="2" stroke-dasharray="14 10">
        <animate attributeName="stroke-dashoffset" from="24" to="0" dur="${above ? 0.45 : 0.9}s" repeatCount="indefinite"/></path>`;
    });
    body += `<g transform="translate(230,120) rotate(${aoa})">
      <path d="M-100,0 C-100,-16 -62,-27 -12,-26 C40,-24 80,-9 104,1 C70,4 28,8 -12,8 C-62,8 -100,6 -100,0 Z"
        fill="#59636f" stroke="${INK}" stroke-width="1.5"/></g>`;
    body += text(230, 22, "faster air · LOWER pressure on top (Bernoulli)", { size: 12, fill: SKY, weight: 700 });
    body += text(200, 200, "slower air · higher pressure underneath", { size: 12, fill: WARN, weight: 700 });
    body += `<line x1="226" y1="92" x2="226" y2="34" stroke="${OK}" stroke-width="4" marker-end="url(#${al})"/>`;
    body += text(238, 48, "LIFT", { size: 12, fill: OK, weight: 800, anchor: "start" });
    body += `<path d="M352,140 Q392,150 420,176" fill="none" stroke="${SKY}" stroke-width="3" marker-end="url(#${ad})"/>`;
    body += text(444, 200, "downwash", { size: 11, fill: SKY, anchor: "end" });
    body += text(444, 214, "(Newton's 3rd law)", { size: 10, fill: MUTED, anchor: "end" });
    return svg(460, 224, body);
  }

  // Stall vs spin, seen from above. The spin half autorotates to the LEFT —
  // the inside (descending) wing is the more deeply stalled one.
  function spin() {
    const a = id("sp");
    return svg(480, 262, `<defs>${arrowDefs(a, WARN)}</defs>
      <style>.dg-split{stroke:${LINE};stroke-dasharray:4 5}</style>
      <line class="dg-split" x1="220" y1="10" x2="220" y2="250"/>
      ${text(110, 22, "STALL", { size: 15, weight: 800, fill: BAD })}
      ${text(110, 38, "coordinated", { size: 11, fill: MUTED })}
      ${planeTop(110, 124, 1.1, "#c0392b", "#c0392b")}
      ${text(110, 202, "both wings past critical AOA —", { size: 11, fill: INK })}
      ${text(110, 217, "equally. The nose drops; the", { size: 11, fill: INK })}
      ${text(110, 232, "wings stay level.", { size: 11, fill: INK })}
      ${text(350, 22, "SPIN = stall + yaw", { size: 15, weight: 800, fill: WARN })}
      ${text(350, 38, "a left spin, seen from above", { size: 11, fill: MUTED })}
      <path d="M402,86 A66,66 0 1 0 413,146" fill="none" stroke="${WARN}" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#${a})"/>
      <g><animateTransform attributeName="transform" type="rotate" from="0 350 124" to="-360 350 124" dur="3.2s" repeatCount="indefinite"/>
        ${planeTop(350, 124, 0.78, BAD, WARN)}</g>
      <rect x="240" y="196" width="12" height="12" fill="${BAD}"/>
      ${text(258, 206, "inside, descending wing: higher AOA,", { size: 11, anchor: "start" })}
      ${text(258, 220, "more deeply stalled", { size: 11, anchor: "start" })}
      <rect x="240" y="230" width="12" height="12" fill="${WARN}"/>
      ${text(258, 240, "outside, rising wing: less stalled", { size: 11, anchor: "start" })}
    `);
  }

  // Load factor in a level turn: n = 1 / cos(bank); stall speed grows with √n.
  function loadFactor(bank = 60, hide = false) {
    const X = (b) => 50 + b * (250 / 75), Y = (n) => 200 - n * 42;
    const n = (b) => 1 / Math.cos(b * Math.PI / 180);
    let dn = "", dv = "";
    for (let b = 0; b <= 75; b += 1) {
      dn += (b ? "L" : "M") + X(b).toFixed(1) + "," + Y(n(b)).toFixed(1);
      dv += (b ? "L" : "M") + X(b).toFixed(1) + "," + Y(Math.sqrt(n(b))).toFixed(1);
    }
    const grid = [15, 30, 45, 60, 75].map((b) => `<line x1="${X(b)}" y1="200" x2="${X(b)}" y2="204" stroke="${MUTED}"/>` +
      text(X(b), 216, b + "°", { size: 10, fill: MUTED })).join("") +
      [1, 2, 3, 4].map((g) => `<line x1="50" y1="${Y(g)}" x2="300" y2="${Y(g)}" stroke="${LINE}" stroke-dasharray="2 4"/>` +
      text(42, Y(g) + 4, g + "G", { size: 10, fill: MUTED, anchor: "end" })).join("");
    const pt = (b, hidden) => {
      const g = n(b), lab = hidden ? `${b}° → ? G` : `${b}° · ${g.toFixed(2)} G`;
      return `<circle cx="${X(b)}" cy="${Y(g)}" r="5" fill="${hidden ? WARN : OK}"/>` +
        text(X(b) - 8, Y(g) - 6, lab, { size: 11, weight: 700, fill: hidden ? WARN : INK, anchor: "end" }) +
        `<circle cx="${X(b)}" cy="${Y(Math.sqrt(g))}" r="3.5" fill="${SKY}"/>` +
        text(X(b) + 6, Y(Math.sqrt(g)) + 14, hidden ? "×?" : "×" + Math.sqrt(g).toFixed(2), { size: 10, fill: SKY, anchor: "start" });
    };
    const lift = Math.min(70, 34 * n(bank)), ar = id("lfa"), aw = id("lfw");
    return svg(460, 236, `<defs>${arrowDefs(ar, OK)}${arrowDefs(aw, BAD)}</defs>
      <line x1="50" y1="200" x2="304" y2="200" stroke="${MUTED}"/><line x1="50" y1="24" x2="50" y2="200" stroke="${MUTED}"/>
      ${grid}
      <path d="${dn}" fill="none" stroke="${INK}" stroke-width="2.5"/>
      <path d="${dv}" fill="none" stroke="${SKY}" stroke-width="2" stroke-dasharray="6 4"/>
      ${pt(30)}${pt(45)}${pt(bank, hide)}
      ${text(175, 232, "bank angle, level turn", { size: 11, fill: MUTED })}
      <line x1="318" y1="24" x2="338" y2="24" stroke="${INK}" stroke-width="2.5"/>${text(344, 28, "load factor", { size: 10, fill: INK, anchor: "start" })}
      <line x1="318" y1="40" x2="338" y2="40" stroke="${SKY}" stroke-width="2" stroke-dasharray="6 4"/>${text(344, 44, "stall speed ×", { size: 10, fill: SKY, anchor: "start" })}
      <g transform="translate(390,140)">
        <g transform="rotate(${bank})"><g transform="scale(.7)">${planeFront()}</g>
          <line x1="0" y1="-14" x2="0" y2="${-14 - lift}" stroke="${OK}" stroke-width="3.5" marker-end="url(#${ar})"/></g>
        <line x1="0" y1="10" x2="0" y2="48" stroke="${BAD}" stroke-width="3.5" marker-end="url(#${aw})"/>
      </g>
      ${text(390, 214, `${bank}° bank`, { size: 11, weight: 700, fill: WARN })}
      ${text(390, 228, "lift tilts — it has to grow", { size: 10, fill: MUTED })}
    `);
  }

  /* --------------------------- the airplane ---------------------------- */
  const badge = (x, y, l, c = OK) => `<circle cx="${x}" cy="${y}" r="9" fill="${c}"/>` +
    text(x, y + 4, l, { size: 11, weight: 800, fill: "#111" });

  // 91.205(b) mapped onto a 172S: ten letters apply, three belong to other airplanes.
  function panel205() {
    const word = "ATOMATOFLAMES", na = [3, 5, 8];
    const chips = [...word].map((l, k) => {
      const x = 20 + k * 37, off = na.includes(k);
      return `<rect x="${x}" y="12" width="34" height="34" rx="6" fill="${off ? "#232a34" : "#1f6f43"}" stroke="${off ? LINE : OK}"/>` +
        text(x + 17, 36, l, { size: 18, weight: 800, fill: off ? "#5d6774" : INK }) +
        (off ? `<line x1="${x + 6}" y1="40" x2="${x + 28}" y2="18" stroke="#5d6774" stroke-width="2"/>` : "");
    }).join("");
    const eis = [["RPM", "T"], ["OIL PRES", "O"], ["OIL TEMP", "O"], ["FUEL L | R", "F"]].map(([t, l], k) =>
      `<rect x="296" y="${118 + k * 25}" width="72" height="21" rx="3" fill="#1b2129"/>` +
      text(302, 132 + k * 25, t, { size: 9, fill: INK, anchor: "start" }) + badge(386, 128 + k * 25, l)).join("");
    return svg(520, 340, `${chips}
      ${text(260, 66, "10 of the 13 apply to a 172S — the struck-out ones are for other engines and gear", { size: 11, fill: MUTED })}
      <rect x="30" y="96" width="460" height="10" rx="5" fill="#2c323b"/>
      <rect x="248" y="78" width="24" height="18" rx="3" fill="#59636f"/>${text(260, 91, "N", { size: 10, weight: 700 })}
      ${badge(286, 86, "M")}${text(300, 90, "magnetic compass", { size: 10, fill: MUTED, anchor: "start" })}
      <rect x="40" y="112" width="200" height="110" rx="6" fill="#0b0f14" stroke="${LINE}"/>
      <path d="M78,112 L202,112 L202,164 L78,164 Z" fill="#1d4f7a"/><path d="M78,164 L202,164 L202,222 L78,222 Z" fill="#6b4a2b"/>
      <rect x="48" y="122" width="26" height="90" rx="3" fill="#1b2129"/>${text(61, 170, "KT", { size: 9 })}
      <rect x="206" y="122" width="26" height="90" rx="3" fill="#1b2129"/>${text(219, 170, "FT", { size: 9 })}
      ${badge(61, 140, "A")}${badge(219, 140, "A")}
      ${text(140, 238, "PFD — airspeed + altimeter tapes", { size: 10, fill: MUTED })}
      ${text(140, 251, "(the standby gauges back them up)", { size: 10, fill: MUTED })}
      <rect x="288" y="112" width="200" height="110" rx="6" fill="#0b0f14" stroke="${LINE}"/>
      <rect x="292" y="114" width="104" height="106" rx="4" fill="#141920"/>
      ${eis}
      <path d="M410,190 L440,150 L470,175" fill="none" stroke="#3a6b46" stroke-width="2"/>
      ${text(388, 238, "MFD — engine strip (EIS)", { size: 10, fill: MUTED })}
      ${badge(40, 280, "A")}${text(54, 284, "anticollision light system", { size: 11, anchor: "start" })}
      ${badge(258, 280, "E")}${text(272, 284, "ELT", { size: 11, anchor: "start" })}
      ${badge(330, 280, "S")}${text(344, 284, "belts + front shoulder harnesses", { size: 11, anchor: "start" })}
      ${text(260, 322, "M manifold pressure — altitude engines  ·  T coolant temp — liquid-cooled  ·  L gear — retractables", { size: 10, fill: "#7b8794" })}
    `);
  }

  // AAVIATES intervals on one calendar. Calendar months run to the END of the month.
  function inspections() {
    const X = (m) => 150 + m * 13.6, done = 9 / 31;   // signed off 10 Mar 2026
    const row = (y, l, name, end, c, note) =>
      badge(18, y + 8, l, c) + text(32, y + 12, name, { size: 11, anchor: "start" }) +
      `<rect x="${X(done)}" y="${y}" width="${X(end) - X(done)}" height="16" rx="3" fill="${c}" fill-opacity=".85"/>` +
      text(end > 3 ? X(end) - 6 : X(end) + 6, y + 12, note, { size: 10, weight: 700, fill: end > 3 ? "#111" : c, anchor: end > 3 ? "end" : "start" });
    const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24].map((m) =>
      `<line x1="${X(m)}" y1="44" x2="${X(m)}" y2="226" stroke="${LINE}" stroke-dasharray="${m % 12 ? "2 6" : "0"}"/>` +
      (m % 12 ? "" : text(X(m) + 2, 40, ["Mar '26", "Mar '27", "Mar '28"][m / 12], { size: 10, fill: MUTED, anchor: "start" }))).join("");
    return svg(520, 300, `
      ${text(12, 18, "Example: everything signed off 10 Mar 2026", { size: 12, weight: 700, anchor: "start" })}
      ${ticks}
      ${row(56, "V", "VOR check (IFR)", 1 + 9 / 30, SKY, "30 days")}
      ${row(86, "A", "Annual", 13, WARN, "12 cal. mo. → 31 Mar '27")}
      ${row(116, "E", "ELT inspection", 13, WARN, "12 cal. mo. → 31 Mar '27")}
      ${row(146, "A", "Altimeter / pitot-static", 25, "#a29bfe", "24 cal. mo. → 31 Mar '28")}
      ${row(176, "T", "Transponder", 25, "#a29bfe", "24 cal. mo. → 31 Mar '28")}
      ${text(150, 216, "calendar months: due by the END of the month, not the day it was done", { size: 10, fill: MUTED, anchor: "start" })}
      ${badge(18, 252, "I", OK)}${text(32, 256, "100-hour (for hire)", { size: 11, anchor: "start" })}
      <rect x="${X(0)}" y="244" width="300" height="16" rx="3" fill="${OK}" fill-opacity=".85"/>
      <rect x="${X(0) + 300}" y="244" width="30" height="16" rx="3" fill="none" stroke="${OK}" stroke-dasharray="3 3"/>
      ${text(X(0) + 294, 256, "100 hr time in service", { size: 10, weight: 700, fill: "#111", anchor: "end" })}
      ${text(X(0) + 315, 276, "+10 hr only to reach", { size: 10, fill: OK })}
      ${text(X(0) + 315, 289, "the shop", { size: 10, fill: OK })}
      ${text(150, 276, "hours, not months", { size: 10, fill: MUTED, anchor: "start" })}
    `);
  }

  // ARROW: three documents in the airplane, two sections of the POH.
  function pohMap() {
    const a = id("pm");
    const secs = ["General", "Limitations", "Emergency Procedures", "Normal Procedures", "Performance",
      "Weight & Balance / Equipment List", "Airplane & Systems Description", "Handling, Service & Maintenance", "Supplements"];
    const hot = { 1: "O", 5: "W" };
    const rows = secs.map((t, k) => {
      const y = 34 + k * 23, h = hot[k];
      return `<rect x="262" y="${y}" width="206" height="20" rx="3" fill="${h ? "#123048" : "#1b2129"}" stroke="${h ? SKY : "none"}"/>` +
        `<rect x="468" y="${y + 2}" width="8" height="16" rx="2" fill="${h ? SKY : "#59636f"}"/>` +
        text(270, y + 14, `${k + 1}  ${t}`, { size: 10.5, fill: h ? INK : MUTED, anchor: "start", weight: h ? 700 : 400 });
    }).join("");
    const doc = (y, l, t, sub, dim) => `<g opacity="${dim ? 0.55 : 1}">
      <rect x="10" y="${y}" width="200" height="40" rx="5" fill="#232a34" stroke="${LINE}"/>${badge(28, y + 20, l, dim ? MUTED : WARN)}
      ${text(44, y + 17, t, { size: 11, weight: 700, anchor: "start" })}${text(44, y + 31, sub, { size: 10, fill: MUTED, anchor: "start" })}</g>`;
    return svg(480, 252, `<defs>${arrowDefs(a, SKY)}</defs>
      ${text(110, 18, "in the airplane", { size: 11, fill: MUTED })}
      ${doc(28, "A", "Airworthiness cert.", "displayed for passengers")}
      ${doc(76, "R", "Registration", "7 years federal")}
      ${doc(124, "R", "Radio station license", "international flights only", true)}
      ${text(365, 18, "POH / AFM", { size: 11, fill: MUTED })}
      ${rows}
      ${badge(28, 196, "O", SKY)}${text(44, 200, "operating limitations", { size: 11, weight: 700, anchor: "start" })}
      ${badge(28, 228, "W", SKY)}${text(44, 232, "weight & balance", { size: 11, weight: 700, anchor: "start" })}
      <path d="M170,196 Q220,196 220,80 Q220,67 258,67" fill="none" stroke="${SKY}" stroke-width="2" marker-end="url(#${a})"/>
      <path d="M150,228 Q240,228 258,159" fill="none" stroke="${SKY}" stroke-width="2" marker-end="url(#${a})"/>
      ${text(44, 212, "+ placards and instrument markings", { size: 9.5, fill: MUTED, anchor: "start" })}
      ${text(44, 244, "this airplane's empty weight + CG", { size: 9.5, fill: MUTED, anchor: "start" })}
    `);
  }

  /* ------------------------ stabilized-approach gate ------------------------ */
  // The airplane flies down final; each CCLAPS item lights before the gate.
  function gate() {
    const T = 8, gx = 250, gateAt = (gx - 30) / (388 - 30);
    const chips = [..."CCLAPS"].map((l, k) => {
      const t = (0.08 + k * 0.08).toFixed(2), t2 = (+t + 0.01).toFixed(2);
      return `<rect x="${20 + k * 34}" y="150" width="30" height="30" rx="5" fill="#232a34" stroke="${LINE}">
        <animate attributeName="fill" values="#232a34;#232a34;#1f6f43;#1f6f43" keyTimes="0;${t};${t2};1" dur="${T}s" repeatCount="indefinite"/></rect>` +
        text(35 + k * 34, 171, l, { size: 15, weight: 800 });
    }).join("");
    const g = gateAt.toFixed(2), g2 = (gateAt + 0.01).toFixed(2);
    return svg(480, 236, `
      <rect x="0" y="190" width="480" height="46" fill="#203124"/>
      <rect x="378" y="186" width="96" height="8" fill="#3b4350"/>
      <line x1="30" y1="30" x2="388" y2="186" stroke="${OK}" stroke-width="1.5" stroke-dasharray="8 6" stroke-opacity=".7"/>
      <line x1="${gx}" y1="50" x2="${gx}" y2="190" stroke="${WARN}" stroke-width="2" stroke-dasharray="5 4"/>
      ${text(gx + 8, 64, "stabilized gate", { size: 12, weight: 700, fill: WARN, anchor: "start" })}
      ${text(gx + 8, 78, "e.g. 500 ft AGL VFR — your school sets it", { size: 10, fill: MUTED, anchor: "start" })}
      ${text(470, 22, "anything missing at the gate → GO AROUND", { size: 11, weight: 700, fill: BAD, anchor: "end" })}
      <g><animateMotion path="M30,30 L388,184" dur="${T}s" repeatCount="indefinite" rotate="auto"/>${plane(0, -9, 0.36)}</g>
      ${chips}
      <text x="122" y="214" fill="${OK}" font-size="13" font-weight="800" text-anchor="middle" font-family="Segoe UI, Roboto, sans-serif" opacity="0">
        STABILIZED ✓ continue<animate attributeName="opacity" values="0;0;1;1" keyTimes="0;${g};${g2};1" dur="${T}s" repeatCount="indefinite"/></text>
    `);
  }

  /* ------------------------ lost comms: acknowledge ------------------------ */
  // AIM 4-2-13 (in flight: rock the wings by day) and 4-3-13 (on the ground:
  // ailerons or rudder by day); at night, blink the landing or nav lights. Front views —
  // the red nav light is on the airplane's left, so the viewer's RIGHT.
  function acknowledge() {
    const blink = `<animate attributeName="opacity" values="1;0.08;1" dur="1s" calcMode="discrete" repeatCount="indefinite"/>`;
    const lights = `<g>${blink}<circle cx="72" cy="-14" r="5" fill="#ff3b4e"/><circle cx="-72" cy="-14" r="5" fill="#2ed573"/>
      <circle cx="40" cy="-12" r="16" fill="#fff" fill-opacity=".22"/><circle cx="40" cy="-12" r="5" fill="#fff"/></g>`;
    const ail = `<rect x="44" y="-17" width="22" height="5" fill="#a9b4c0">
        <animateTransform attributeName="transform" type="translate" values="0,-5;0,5;0,-5" dur="1.4s" repeatCount="indefinite"/></rect>
      <rect x="-66" y="-17" width="22" height="5" fill="#a9b4c0">
        <animateTransform attributeName="transform" type="translate" values="0,5;0,-5;0,5" dur="1.4s" repeatCount="indefinite"/></rect>`;
    const rock = `<animateTransform attributeName="transform" type="rotate" values="-14;14;-14" dur="1.6s" repeatCount="indefinite"/>`;
    const cell = (x, y, night, ground, inner, cap) => `
      <rect x="${x}" y="${y}" width="210" height="104" rx="8" fill="${night ? "#0a0f1a" : "#17324a"}"/>
      ${ground ? `<rect x="${x}" y="${y + 74}" width="210" height="30" rx="0" fill="${night ? "#0f1a12" : "#203124"}"/>` : ""}
      <g transform="translate(${x + 105},${ground ? y + 58 : y + 44}) scale(.62)">${inner}</g>
      ${text(x + 105, y + 98, cap, { size: 11, weight: 700, fill: night ? YEL : INK })}`;
    return svg(480, 260, `
      ${text(155, 20, "DAY", { size: 12, weight: 800, fill: MUTED })}${text(375, 20, "NIGHT", { size: 12, weight: 800, fill: MUTED })}
      <text transform="translate(26,82) rotate(-90)" fill="${MUTED}" font-size="11" font-weight="800" text-anchor="middle" font-family="Segoe UI, Roboto, sans-serif">IN FLIGHT</text>
      <text transform="translate(26,196) rotate(-90)" fill="${MUTED}" font-size="11" font-weight="800" text-anchor="middle" font-family="Segoe UI, Roboto, sans-serif">ON GROUND</text>
      ${cell(50, 30, false, false, `<g>${rock}${planeFront()}</g>`, "rock the wings")}
      ${cell(270, 30, true, false, planeFront(lights), "flash landing / nav lights")}
      ${cell(50, 144, false, true, planeFront(ail), "move ailerons or rudder")}
      ${cell(270, 144, true, true, planeFront(lights), "flash landing / nav lights")}
    `);
  }

  /* ------------------------- more taxiway markings ------------------------- */
  // kind: "enhanced" (dashes either side of the centerline before a hold line)
  //     | "ilsHold"  (the ladder: ILS critical area holding position)
  //     | "edge"     (continuous vs dashed double yellow edge lines)
  function marking(kind) {
    const y2 = (x, dash) => [0, 7].map((d) => `<line x1="${x + d}" y1="0" x2="${x + d}" y2="220" stroke="${YEL}" stroke-width="3" ${dash ? 'stroke-dasharray="16 10"' : ""}/>`).join("");
    if (kind === "edge") return svg(380, 220, `
      <rect x="0" y="0" width="120" height="220" fill="#262b31"/>
      <rect x="120" y="0" width="140" height="220" fill="#2c323b"/>
      <rect x="260" y="0" width="120" height="220" fill="#353c46"/>
      <line x1="190" y1="0" x2="190" y2="220" stroke="${YEL}" stroke-width="3"/>
      ${y2(122, false)}${y2(251, true)}
      ${text(155, 214, "taxiway", { size: 11, fill: MUTED })}
      ${text(60, 110, "A", { size: 22, weight: 800, fill: MUTED })}${text(320, 110, "B", { size: 22, weight: 800, fill: MUTED })}
      ${text(60, 214, "solid double", { size: 10, fill: MUTED })}${text(320, 214, "dashed double", { size: 10, fill: MUTED })}`);
    const hold = (y) => `<rect x="126" y="${y}" width="108" height="4" fill="${YEL}"/><rect x="126" y="${y + 8}" width="108" height="4" fill="${YEL}"/>` +
      [16, 24].map((d) => Array.from({ length: 6 }, (_, k) => `<rect x="${126 + k * 18}" y="${y + d}" width="10" height="4" fill="${YEL}"/>`).join("")).join("");
    const base = `<rect x="0" y="170" width="380" height="50" fill="#3b4350"/>
      <line x1="0" y1="196" x2="380" y2="196" stroke="#fff" stroke-width="3" stroke-dasharray="20 14"/>
      <rect x="120" y="0" width="120" height="170" fill="#2c323b"/>
      <line x1="180" y1="0" x2="180" y2="${kind === "ilsHold" ? 170 : 132}" stroke="${YEL}" stroke-width="3"/>
      ${text(60, 214, "runway", { size: 11, fill: MUTED })}${text(60, 40, "taxiway", { size: 11, fill: MUTED })}`;
    if (kind === "enhanced") return svg(380, 220, `${base}
      ${[172, 188].map((x) => `<line x1="${x}" y1="30" x2="${x}" y2="126" stroke="${YEL}" stroke-width="2.5" stroke-dasharray="9 6"/>`).join("")}
      ${hold(132)}`);
    // ilsHold: the ladder sits farther from the runway than the runway hold line
    const ladder = `<rect x="126" y="54" width="108" height="4" fill="${YEL}"/><rect x="126" y="72" width="108" height="4" fill="${YEL}"/>` +
      [138, 176, 214].map((x) => `<rect x="${x}" y="58" width="3" height="14" fill="${YEL}"/><rect x="${x + 7}" y="58" width="3" height="14" fill="${YEL}"/>`).join("");
    return svg(380, 220, `${base}${ladder}${hold(132)}
      <path d="M262,64 L240,64" stroke="${WARN}" stroke-width="2"/>${text(268, 68, "this one?", { size: 12, weight: 700, fill: WARN, anchor: "start" })}`);
  }

  return {
    CRIT, airfoil, clCurve, forces, torque, pfactor, slipstream, precession,
    overshoot, glidepath, lightGun, sign, holdShort, runway, displaced, closedRunway,
    segmentedCircle, untowered, fuelSystem, electrical,
    liftFlow, spin, loadFactor, panel205, inspections, pohMap, gate, acknowledge, marking,
  };
})();

window.Diagrams = Diagrams;
