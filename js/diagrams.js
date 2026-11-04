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
     overshoot() · glidepath(vert, speed)
     lightGun(color, mode, onGround)
     sign(parts) · holdShort() · runway() · displaced() · closedRunway()
     segmentedCircle() · untowered()
     fuelSystem() · electrical()
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
        let tail = x > 0 ? (x / 230) * aoa * (above ? 1.1 : 0.9) : 0;
        if (stalled && above && x > -20) tail = -(aoa - CRIT) * 1.5 * (x + 20) / 250;  // flow leaves the surface
        d += (x === -230 ? "M" : "L") + (230 + x) + "," + (140 + y0 + bump + tail).toFixed(1);
      }
      body += `<path d="${d}" fill="none" stroke="${SKY}" stroke-opacity=".45" stroke-width="1.5"/>`;
    });
    // wing, rotated nose-up by AOA about mid-chord
    body += `<g transform="translate(230,140) rotate(${-aoa})">
      <path d="M-100,0 C-100,-16 -62,-27 -12,-26 C40,-24 80,-9 104,1 C70,4 28,8 -12,8 C-62,8 -100,6 -100,0 Z"
        fill="#59636f" stroke="${INK}" stroke-width="1.5"/>
      <line x1="-115" y1="0" x2="120" y2="0" stroke="${MUTED}" stroke-dasharray="4 4"/>
      ${text(128, 4, "chord", { size: 10, fill: MUTED, anchor: "start" })}
    </g>`;
    // turbulent eddies over the aft upper surface once stalled
    if (stalled) {
      for (let k = 0; k < 5; k++) {
        const cx = 250 + k * 34, cy = 108 - k * 6 - (aoa - CRIT) * 1.2, r = 7 + k * 2;
        body += `<path d="M${cx + r},${cy} A${r},${r} 0 1 1 ${cx},${cy - r}" fill="none" stroke="${BAD}" stroke-width="1.6" class="eddy"/>`;
      }
    }
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
      ${planeTop(160, 112, 1.05)}
      <line x1="146" y1="66" x2="146" y2="44" stroke="${OK}" stroke-width="3" marker-end="url(#${a})"/>
      <line x1="174" y1="66" x2="174" y2="16" stroke="${OK}" stroke-width="5" marker-end="url(#${a})"/>
      ${text(140, 40, "ascending blade", { size: 10, fill: MUTED, anchor: "end" })}
      ${text(140, 53, "less thrust", { size: 10, fill: MUTED, anchor: "end" })}
      ${text(182, 24, "descending blade (right)", { size: 10, fill: OK, anchor: "start" })}
      ${text(182, 37, "bigger bite → more thrust", { size: 10, fill: OK, anchor: "start" })}
      <path d="M128,92 Q108,70 118,50" fill="none" stroke="${BAD}" stroke-width="3" marker-end="url(#${y})"/>
      ${text(240, 120, "top view, climbing", { size: 10, fill: MUTED })}
      ${text(240, 134, "(high AOA)", { size: 10, fill: MUTED })}
      ${text(160, 190, "more thrust on the right → yaw LEFT", { fill: BAD, size: 12, weight: 700 })}`);
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
      <path d="M52,70 Q14,86 24,132" fill="none" stroke="${BAD}" stroke-width="3" marker-end="url(#${a})"/>
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

  function runway() {
    const thr = Array.from({ length: 8 }, (_, k) => `<rect x="${40 + k * 12}" y="22" width="6" height="56" fill="#fff"/>`).join("");
    const tdz = [205, 325, 385].map((x, k) =>
      `<rect x="${x}" y="24" width="30" height="${6 - k}" fill="#fff"/><rect x="${x}" y="${70 + k}" width="30" height="${6 - k}" fill="#fff"/>`).join("");
    return svg(470, 100, `
      <rect x="20" y="10" width="440" height="80" fill="#3b4350"/>
      ${thr}
      <text x="160" y="62" fill="#fff" font-size="30" font-weight="800" font-family="Arial" transform="rotate(90,160,50)" text-anchor="middle">27</text>
      ${tdz}
      <rect x="250" y="20" width="50" height="12" fill="#fff"/><rect x="250" y="68" width="50" height="12" fill="#fff"/>
      <line x1="190" y1="50" x2="460" y2="50" stroke="#fff" stroke-width="3" stroke-dasharray="24 16"/>
      ${text(70, 8, "threshold", { size: 9, fill: MUTED })}
      ${text(275, 98, "aiming point", { size: 9, fill: MUTED })}
    `);
  }

  function displaced() {
    const arrows = [60, 120].map((x) => `<path d="M${x},50 L${x + 34},50 M${x + 24},42 L${x + 34},50 L${x + 24},58" stroke="#fff" stroke-width="3" fill="none"/>`).join("");
    return svg(470, 100, `
      <rect x="20" y="10" width="440" height="80" fill="#3b4350"/>
      <line x1="30" y1="50" x2="180" y2="50" stroke="#fff" stroke-width="2" stroke-dasharray="12 10"/>
      ${arrows}
      <rect x="196" y="12" width="7" height="76" fill="#fff"/>
      ${[0, 1, 2, 3].map((k) => `<path d="M206,${20 + k * 18} L216,${26 + k * 18} L206,${32 + k * 18}" fill="#fff"/>`).join("")}
      ${Array.from({ length: 6 }, (_, k) => `<rect x="${226 + k * 10}" y="22" width="5" height="56" fill="#fff"/>`).join("")}
      ${text(110, 8, "displaced area", { size: 9, fill: MUTED })}
      ${text(330, 8, "landing threshold", { size: 9, fill: MUTED })}
    `);
  }

  function closedRunway() {
    const x = (cx) => `<path d="M${cx - 22},26 L${cx + 22},74 M${cx + 22},26 L${cx - 22},74" stroke="${YEL}" stroke-width="9"/>`;
    return svg(470, 100, `<rect x="20" y="10" width="440" height="80" fill="#3b4350"/>${x(90)}${x(380)}
      ${text(240, 56, "runway", { size: 12, fill: MUTED })}`);
  }

  /* ------------------------- untowered airport -------------------------- */
  function segmentedCircle() {
    const segs = Array.from({ length: 12 }, (_, k) => {
      const a0 = (k * 30) * Math.PI / 180, a1 = (k * 30 + 18) * Math.PI / 180;
      return `<path d="M${120 + 70 * Math.cos(a0)},${120 + 70 * Math.sin(a0)} A70,70 0 0 1 ${120 + 70 * Math.cos(a1)},${120 + 70 * Math.sin(a1)}" stroke="#fff" stroke-width="9" fill="none"/>`;
    }).join("");
    // wind cone seen from above: the mouth sits at the mast and faces the wind
    const sock = [0, 1, 2, 3].map((k) => {
      const x0 = 122 + k * 12, h0 = 12 - k * 2, h1 = 10 - k * 2;
      return `<path d="M${x0},${120 - h0} L${x0 + 12},${120 - h1} L${x0 + 12},${120 + h1} L${x0},${120 + h0} Z" fill="${k % 2 ? "#fff" : WARN}"/>`;
    }).join("");
    const a = id("sc");
    return svg(480, 240, `<defs>${arrowDefs(a, SKY)}</defs><rect width="240" height="240" rx="8" fill="#203124"/>${segs}
      ${sock}<circle cx="120" cy="120" r="4" fill="#ccc"/>
      <line x1="40" y1="120" x2="86" y2="120" stroke="${SKY}" stroke-width="2.5" marker-end="url(#${a})"/>
      ${text(60, 112, "wind", { size: 10, fill: SKY })}
      ${text(120, 230, "seen from above", { size: 10, fill: MUTED })}
      ${text(256, 40, "Segmented circle", { size: 14, weight: 700, anchor: "start" })}
      ${text(256, 66, "• wind indicator in the middle —", { size: 11, fill: MUTED, anchor: "start" })}
      ${text(266, 81, "cone, tee or tetrahedron", { size: 11, fill: MUTED, anchor: "start" })}
      ${text(256, 104, "• the cone's open end faces INTO the", { size: 11, fill: MUTED, anchor: "start" })}
      ${text(266, 119, "wind: this one shows wind from the west", { size: 11, fill: MUTED, anchor: "start" })}
      ${text(256, 142, "• landing strip indicators outside the", { size: 11, fill: MUTED, anchor: "start" })}
      ${text(266, 157, "circle show the runway alignment", { size: 11, fill: MUTED, anchor: "start" })}
      ${text(256, 180, "• L-shaped traffic pattern indicators show", { size: 11, fill: MUTED, anchor: "start" })}
      ${text(266, 195, "the turn direction when it isn't left traffic", { size: 11, fill: MUTED, anchor: "start" })}`);
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
      <path d="M260,90 L250,90 M60,135 L60,140 M300,180 L310,180 M420,135 L420,130" stroke="${SKY}" stroke-width="2.5" marker-end="url(#${m})"/>
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

  return {
    CRIT, airfoil, clCurve, forces, torque, pfactor, slipstream, precession,
    overshoot, glidepath, lightGun, sign, holdShort, runway, displaced, closedRunway,
    segmentedCircle, untowered, fuelSystem, electrical,
  };
})();

window.Diagrams = Diagrams;
