/* ============================================================================
   sysdiag-b.js  —  pitot-static, engine, propeller, flight controls, gear and
   cabin-heat / stall-warning labs, registered on SysDiagrams.

   Pure functions only: draw(state, opts) returns an SVG string, model(state)
   says what each instrument / part is doing. No DOM, no timers — motion is SMIL
   (kit.flow dashes, engine "play"). Diagrams are illustrative, not to scale:
   needle maths is a monotonic toy formula, and where a number is drawn it is a
   (R) figure already in the Stage 1 content (Vfe 110/85, 28 V ...). Mind
   handedness: rear view = left is left; gear is a top view with the NOSE UP;
   the prop turns clockwise from the cockpit.
   ========================================================================== */

(() => {
  const SD = SysDiagrams, K = SD.kit, { C, svg, text, part, mk, flow, uid, arrowDefs } = K;
  const FUS = "#222c38", EDGE = "#46556a", STEEL = "#4a5868", STEEL2 = "#6b7a8a", DARK = "#0c1015",
    ICE = "#bfe9ff", STATIC = "#2ed573", HOT = "#ff6b35", PANEL = "#161c24";
  const f = (n) => Math.round(n * 100) / 100;
  const nn = (a, b) => (a !== null && a !== undefined ? a : b);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rad = (d) => d * Math.PI / 180;
  const pol = (cx, cy, r, a) => [f(cx + r * Math.sin(rad(a))), f(cy - r * Math.cos(rad(a)))];
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const CRIT = (typeof Diagrams !== "undefined" && Diagrams.CRIT) || 16;

  // transparent hit box, never under `min` units (min is raised in scaled insets)
  const H = (x, y, w, h, min = 28) => {
    const W = Math.max(w, min), Hh = Math.max(h, min);
    return `<rect class="sx-hit" x="${f(x - (W - w) / 2)}" y="${f(y - (Hh - h) / 2)}" width="${f(W)}" height="${f(Hh)}" fill="transparent"/>`;
  };
  // visible label (hidden with the labels toggle) / always-visible text
  const L = (x, y, s, o = {}) => text(x, y, s, { fill: C.MUTED, ...o, size: Math.max(o.size || 11, 11) });
  const T = (x, y, s, o = {}) => text(x, y, s, { lbl: false, size: 11, fill: C.MUTED, ...o });

  // in-SVG hardware control: clicking sets state[key] = val (string / numeric string).
  const ctl = (key, val, inner, label, hit) =>
    `<g class="sx-ctl" data-ctl="${key}" data-val="${val}" tabindex="0" role="button" aria-label="${K.esc(label)}">${inner}${H(...hit)}</g>`;
  // little rounded button face for ctl
  const pill = (x, y, w, h, s, on, labelled = true) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${on ? "#33290a" : "#1b2530"}" stroke="${on ? C.YEL : C.SKY}" stroke-width="1.5"/>` +
    text(x + w / 2, y + h / 2 + 4, s, { size: 11, fill: on ? C.YEL : C.INK, weight: 600, lbl: !labelled });

  // selection / mark / trace outline drawn inside the part so it is visible even without CSS
  const ringOf = (o, id, r) => {
    if (!r) return "";
    const m = (o && o.marks && o.marks[id]) || "", sel = o && o.sel === id, tr = !!(o && o.trace && o.trace.indexOf(id) >= 0);
    const col = m === "bad" ? C.BAD : m === "ok" || m === "done" ? C.OK : m === "hint" ? C.YEL : sel || tr ? C.SKY : null;
    if (!col) return "";
    const weak = tr && !m && !sel;
    return (Array.isArray(r[0]) ? r : [r]).map(([x, y, w, h]) =>
      `<rect class="sx-ring" x="${f(x - 3)}" y="${f(y - 3)}" width="${f(w + 6)}" height="${f(h + 6)}" rx="8" fill="${col}" fill-opacity="${weak ? 0.14 : 0.08}" ` +
      `stroke="${col}" stroke-width="${weak ? 3 : 2.5}"${m === "hint" ? ' stroke-dasharray="5 4"' : ""} pointer-events="none"/>`).join("");
  };
  // a clickable part: inner SVG (with its own H() hit boxes) + ring around `r`
  const P = (o, id, label, inner, r, x = {}) => {
    const m = mk(o, id), tr = !!(o && o.trace && o.trace.indexOf(id) >= 0);
    return part(id, label, inner + ringOf(o, id, r), { mark: (m.mark || "") + (tr ? " sx-trace" : ""), sel: m.sel, dead: x.dead });
  };
  const wrap = (w, h, body, o) => svg(w, h, body, o && o.labels === false ? "sx-nolabels" : "");

  /* ===========================================================================
     PITOT-STATIC  (id "pitot")
     =========================================================================== */
  const ALT0 = 3000;   // fallback reference altitude when a patch skips the reducer
  const effAlt = (s) => (s.stat === "blocked" && !s.altStatic ? nn(s.trapAlt, s.altFt) : s.altFt);

  function pitotSet(s, key, v) {
    const old = s[key];
    if (key === "altFt") {                       // moving the altitude slider sets the VSI trend
      s.trend = v > old ? 1 : v < old ? -1 : s.trend;
      s.altFt = v;
    } else if (key === "ram") {
      s.ram = v;
      if (v === "blocked" && old !== "blocked") { s.trapRamAlt = effAlt(s); s.trapP = s.drain === "blocked" ? s.ias : 0; }
      else if (v !== "blocked") { s.trapP = null; s.trapRamAlt = null; }
    } else if (key === "drain") {
      s.drain = v;
      if (s.ram === "blocked" && v === "blocked" && old !== "blocked") { s.trapP = 0; s.trapRamAlt = effAlt(s); }   // what leaked out is gone
    } else if (key === "stat") {
      s.stat = v;
      s.trapAlt = v === "blocked" ? (old === "blocked" ? nn(s.trapAlt, s.altFt) : s.altFt) : null;
    } else if (key === "heat") {
      s.heat = !!v;
      if (v) { s.ram = "open"; s.drain = "open"; s.trapP = null; s.trapRamAlt = null; }   // heat melts the ice
    } else s[key] = v;
    return s;
  }

  function pitotModel(s) {
    const sB = s.stat === "blocked", alt = !!s.altStatic, frozen = sB && !alt;
    const tA = nn(s.trapAlt, s.altFt), eff = frozen ? tA : s.altFt;
    const asiMode = s.ram === "blocked" ? (s.drain === "blocked" ? "altimeter" : "zero") : alt ? "alt-static" : sB ? "static-err" : "ok";
    const altMode = frozen ? "frozen" : alt ? "alt-static" : "ok";
    const vsiMode = frozen ? "zero" : alt ? "alt-static" : "ok";
    let asiRead = s.ias;
    if (asiMode === "zero") asiRead = 0;
    else if (asiMode === "altimeter") asiRead = clamp(nn(s.trapP, s.ias) + 0.01 * (eff - nn(s.trapRamAlt, nn(s.trapAlt, ALT0))), 0, 200);
    else if (asiMode === "static-err") asiRead = Math.max(0, s.ias - 0.012 * (s.altFt - tA));
    else if (asiMode === "alt-static") asiRead = s.ias + 3;
    const altRead = altMode === "frozen" ? tA : altMode === "alt-static" ? s.altFt + 50 : s.altFt;
    const vsiRead = vsiMode === "zero" ? 0 : s.trend * 500;
    asiRead = Math.round(asiRead);
    // one-line readout
    const bits = [];
    if (asiMode === "zero") bits.push("<b>Ram hole iced, drain open</b>: the trapped pressure bleeds out the drain, so the ASI falls toward zero.");
    if (asiMode === "altimeter") bits.push("<b>Ram hole and drain both blocked</b>: pressure is trapped in the line, so the ASI ignores airspeed and acts like an altimeter &mdash; higher as you climb, lower as you descend.");
    if (frozen) bits.push(`<b>Static port blocked</b>: the altimeter is frozen at ${fmt(tA)} ft, the VSI reads zero` +
      (s.ram !== "blocked" ? `, and the ASI reads ${s.altFt > tA + 50 ? "low above" : s.altFt < tA - 50 ? "high below" : "correct only at"} the blocked altitude.` : "."));
    if (alt) bits.push("<b>Alternate static open</b>: cabin pressure feeds the system; instruments work again, reading slightly high.");
    if (s.heat && s.ram === "open") bits.push("Pitot heat is on, keeping the tip clear of ice.");
    if (!bits.length) bits.push("All three instruments agree with the real airspeed, altitude and climb rate (the ghost needle sits under the solid one).");
    return { asiMode, altMode, vsiMode, asiRead, altRead: Math.round(altRead), vsiRead, msg: bits.join(" ") };
  }

  // dial helper: ticks + labels + two needles
  function dial(o, id, label, cx, cy, spec) {
    const r = 72, bad = spec.mode !== "ok";
    const col = spec.mode === "ok" ? EDGE : spec.mode === "alt-static" ? C.WARN : C.BAD;
    let b = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#10161d" stroke="${col}" stroke-width="${bad ? 4 : 3}"/>`;
    spec.ticks.forEach((t) => {
      const [x1, y1] = pol(cx, cy, r - 3, t.a), [x2, y2] = pol(cx, cy, r - (t.major ? 13 : 8), t.a);
      b += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.MUTED}" stroke-width="${t.major ? 2 : 1}"/>`;
      if (t.label !== undefined) { const [lx, ly] = pol(cx, cy, r - 25, t.a); b += T(lx, ly + 4, t.label, { size: 11, fill: C.INK }); }
    });
    b += T(cx, cy + 34, spec.unit, { size: 10 });
    const needle = (a, len, stroke, w, op) => {
      const [x, y] = pol(cx, cy, len, a);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-opacity="${op}"/>`;
    };
    b += needle(spec.aAct, 58, C.SKY, 8, 0.4);                              // ghost: what is really happening
    b += needle(spec.aInd, 62, C.INK, 3, 1) + `<circle cx="${cx}" cy="${cy}" r="5" fill="${C.INK}"/>`;   // solid: what the instrument shows
    return P(o, id, label, b + H(cx - r, cy - r, 2 * r, 2 * r), [cx - r, cy - r, 2 * r, 2 * r]);
  }

  function pitotDraw(s, o) {
    o = o || {};
    const m = pitotModel(s);
    const rB = s.ram === "blocked", dB = s.drain === "blocked", sB = s.stat === "blocked", alt = !!s.altStatic;
    const ramLive = !rB, trapped = rB && dB, bled = rB && !dB;
    const staticLive = !sB || alt;
    let b = "";

    // --- left wing + pitot tube -------------------------------------------------
    b += `<rect x="0" y="18" width="196" height="14" rx="3" fill="${FUS}" stroke="${EDGE}"/>`;
    b += L(100, 13, "left wing (viewed from behind)", { size: 10 });
    b += `<rect x="148" y="32" width="10" height="18" fill="${STEEL}"/>`;
    // free-stream air into the ram hole
    b += flow("M2 57 H20", C.SKY, 0.8, ramLive, 3);
    let tube = `<rect x="24" y="50" width="146" height="14" rx="6" fill="${STEEL}" stroke="${EDGE}"/>`;
    tube += rB ? `<circle cx="23" cy="57" r="9" fill="${ICE}" fill-opacity=".92"/><path d="M14 50 l-4 -4 M12 57 h-6 M14 64 l-4 4" stroke="${ICE}" stroke-width="2"/>`
      : `<ellipse cx="25" cy="57" rx="3" ry="5" fill="${DARK}"/>`;
    b += P(o, "pitotTube", "Pitot tube", tube + L(40, 45, "pitot tube", { size: 11 }) + L(14, 84, "ram hole", { anchor: "start" }) + H(14, 42, 58, 34), [14, 42, 58, 34]);
    // heater coil
    let coil = "M78 57";
    for (let i = 0; i < 10; i++) coil += ` l4 ${i % 2 ? 4 : -4}`;
    const heat = `<path d="${coil}" fill="none" stroke="${s.heat ? C.WARN : "#5b6776"}" stroke-width="2.5" ${s.heat ? 'filter="none"' : ""}/>` +
      (s.heat ? `<path d="M80 46 q3 -6 6 0 t6 0 t6 0 t6 0" fill="none" stroke="${C.WARN}" stroke-width="1.6" stroke-opacity=".8"/>` : "") +
      L(100, 45, s.heat ? "heater ON" : "heater", { fill: s.heat ? C.WARN : C.MUTED, size: 11, weight: s.heat ? 700 : 400 });
    b += P(o, "pitotHeat", "Pitot heat", heat + H(78, 34, 44, 28), [78, 34, 44, 28]);
    // drain hole
    let dr = `<circle cx="108" cy="64" r="3.5" fill="${DARK}" stroke="${C.MUTED}"/>`;
    dr += dB ? `<circle cx="108" cy="72" r="7" fill="${ICE}" fill-opacity=".92"/>` : flow("M108 68 V94", C.SKY, 0.9, bled, 2.5);
    b += P(o, "drain", "Pitot drain hole", dr + L(108, 106, "drain hole", { size: 11 }) + H(92, 64, 32, 34), [92, 64, 32, 34]);

    // --- ice / block buttons (in-SVG hardware) -----------------------------------
    b += ctl("ram", rB ? "open" : "blocked", pill(6, 114, 92, 26, rB ? "Clear ram hole" : "Ice ram hole", rB), "Toggle ram hole blockage", [6, 114, 92, 26]);
    b += ctl("drain", dB ? "open" : "blocked", pill(102, 114, 92, 26, dB ? "Clear drain" : "Ice drain", dB), "Toggle drain blockage", [102, 114, 92, 26]);
    b += `<rect x="0" y="150" width="150" height="92" rx="6" fill="${FUS}" stroke="${EDGE}"/>`;
    b += L(75, 163, "left side of fuselage", { size: 10 });
    b += ctl("stat", sB ? "open" : "blocked", pill(66, 208, 84, 26, sB ? "Clear static" : "Block static", sB), "Toggle static port blockage", [66, 208, 84, 26]);

    // --- lines ------------------------------------------------------------------------
    let pl = "";
    if (ramLive) pl = flow("M170 57 H420", C.SKY, 1.1, true, 5) + flow("M270 57 V130 H300", C.SKY, 1.1, true, 5);
    else if (trapped) pl = `<path d="M170 57 H420 M270 57 V130 H300" fill="none" stroke="${C.WARN}" stroke-width="5" stroke-linecap="round" stroke-opacity=".85"/>` +
      L(220, 50, "pressure TRAPPED", { fill: C.WARN, size: 11, weight: 700 });
    else pl = flow("M170 57 H420 M270 57 V130 H300", C.SKY, 1, false, 5) + L(220, 50, "no ram pressure", { fill: C.BAD, size: 11 });
    b += P(o, "pitotLine", "Pitot line", pl + H(180, 40, 70, 34), [190, 44, 60, 26], { dead: bled });

    let sl = "";
    sl += flow("M44 194 H215", STATIC, 1.4, !sB && !alt, 5);                       // port segment (dead when blocked or by-passed)
    sl += flow("M215 194 H300 M285 194 V240 H400 V82 H420", STATIC, 1.4, staticLive, 5);   // shared segment
    b += P(o, "staticLine", "Static line", sl + H(380, 120, 40, 100), [386, 130, 28, 90], { dead: !staticLive });
    // static port + blockage
    let sp = `<circle cx="36" cy="194" r="9" fill="${DARK}" stroke="${C.MUTED}" stroke-width="2"/>`;
    sp += sB ? `<circle cx="36" cy="194" r="11" fill="${ICE}" fill-opacity=".92"/><path d="M26 184 l-5 -5 M46 184 l5 -5" stroke="${ICE}" stroke-width="2"/>` : `<circle cx="36" cy="194" r="3" fill="#2d3947"/>`;
    b += P(o, "staticPort", "Static port", sp + L(36, 224, "static port", { size: 11 }) + H(20, 178, 32, 32), [20, 178, 32, 32]);
    // alternate static valve (cabin)
    let av = `<rect x="198" y="214" width="62" height="24" rx="4" fill="#26323f" stroke="${alt ? C.WARN : EDGE}" stroke-width="${alt ? 2.5 : 1.5}"/>` + L(229, 230, "cabin air", { size: 10, fill: alt ? C.WARN : C.MUTED });
    av += flow("M229 214 V194", C.WARN, 1.2, alt, 3);
    av += `<circle cx="215" cy="194" r="7" fill="${alt ? C.WARN : "#26323f"}" stroke="${alt ? C.WARN : C.MUTED}" stroke-width="1.5"/><path d="M210 194 h10" stroke="${alt ? "#10161d" : C.MUTED}" stroke-width="2"/>`;
    b += P(o, "altStatic", "Alternate static valve", av + L(229, 262 - 14, "alt static valve", { size: 10 }) + H(196, 182, 66, 58), [196, 184, 66, 56]);

    // --- ADC, PFD, standby, AHRS -------------------------------------------------------------------
    const adcDead = !ramLive && !staticLive;
    b += P(o, "adc", "Air data computer", `<rect x="300" y="120" width="72" height="92" rx="6" fill="#26323f" stroke="${C.SKY}" stroke-width="1.5"/>` +
      L(336, 160, "ADC", { size: 13, fill: C.INK, weight: 700 }) + L(336, 176, "air data", { size: 10 }) + L(336, 189, "computer", { size: 10 }) + H(300, 120, 72, 92), [300, 120, 72, 92], { dead: adcDead });
    b += `<path d="M372 150 H420" stroke="${C.MUTED}" stroke-width="2" stroke-dasharray="4 4"/>`;
    b += `<rect x="420" y="112" width="130" height="72" rx="6" fill="#10161d" stroke="${EDGE}" stroke-width="2"/>` + L(485, 132, "PFD (G1000)", { size: 12, fill: C.INK, weight: 700 }) +
      T(485, 152, "shows the three dials", { size: 10 }) + T(485, 166, "below", { size: 10 });
    b += P(o, "standby", "Standby instruments", `<rect x="420" y="36" width="130" height="60" rx="6" fill="#26323f" stroke="${EDGE}" stroke-width="1.5"/>` +
      L(485, 58, "Standby ASI + altimeter", { size: 11, fill: C.INK, weight: 600 }) + L(485, 74, "same pitot and static", { size: 10 }) + L(485, 87, "lines as the PFD", { size: 10 }) + H(420, 36, 130, 60), [420, 36, 130, 60]);
    b += P(o, "ahrs", "AHRS", `<rect x="420" y="204" width="130" height="36" rx="6" fill="#1b2530" stroke="${EDGE}" stroke-dasharray="5 4"/>` +
      L(485, 220, "AHRS", { size: 12, fill: C.INK, weight: 700 }) + L(485, 233, "not on these lines", { size: 10 }) + H(420, 204, 130, 36), [420, 204, 130, 36]);

    // --- dials -----------------------------------------------------------------------------
    b += `<line x1="150" y1="262" x2="172" y2="262" stroke="${C.SKY}" stroke-width="7" stroke-opacity=".4" stroke-linecap="round"/>` + T(178, 266, "actual", { anchor: "start", fill: C.INK });
    b += `<line x1="236" y1="262" x2="258" y2="262" stroke="${C.INK}" stroke-width="3" stroke-linecap="round"/>` + T(264, 266, "indicated (what the PFD shows)", { anchor: "start", fill: C.INK });
    b += T(280, 281, "illustrative — not calibration data", { size: 11 });

    const aspd = (v) => -135 + clamp(v, 0, 160) / 160 * 270;
    const aTicks = []; for (let v = 0; v <= 160; v += 10) aTicks.push({ a: aspd(v), major: v % 20 === 0, label: v % 40 === 0 ? v : undefined });
    const altA = (ft) => ((ft % 1000) + 1000) % 1000 / 1000 * 360;
    const lTicks = []; for (let i = 0; i < 50; i++) lTicks.push({ a: i * 7.2, major: i % 5 === 0, label: i % 5 === 0 ? i / 5 : undefined });
    const vA = (v) => -90 + clamp(v, -2000, 2000) / 2000 * 170;
    const vTicks = []; for (let v = -2000; v <= 2000; v += 500) vTicks.push({ a: vA(v), major: v % 1000 === 0, label: v % 1000 === 0 ? Math.abs(v) / 100 : undefined });

    const tA = nn(s.trapAlt, s.altFt);
    b += L(93, 302, "ASI  airspeed", { size: 12, fill: C.INK, weight: 700 }) + L(280, 302, "ALT  altimeter", { size: 12, fill: C.INK, weight: 700 }) + L(467, 302, "VSI  vertical speed", { size: 12, fill: C.INK, weight: 700 });
    b += dial(o, "asi", "Airspeed indicator", 93, 390, { mode: m.asiMode, ticks: aTicks, unit: "KIAS", aAct: aspd(s.ias), aInd: aspd(m.asiRead) });
    b += dial(o, "alt", "Altimeter", 280, 390, { mode: m.altMode, ticks: lTicks, unit: "ft ×100", aAct: altA(s.altFt), aInd: altA(m.altRead) });
    b += dial(o, "vsi", "Vertical speed indicator", 467, 390, { mode: m.vsiMode, ticks: vTicks, unit: "×100 fpm", aAct: vA(s.trend * 500), aInd: vA(m.vsiRead) });

    const stat = (mode, txt) => ({ c: mode === "ok" ? C.OK : mode === "alt-static" ? C.WARN : C.BAD, t: txt });
    const asiS = stat(m.asiMode, { ok: "agrees", zero: "falls to zero", altimeter: "acts like an altimeter", "static-err": s.altFt > tA + 50 ? "reads LOW (static err)" : s.altFt < tA - 50 ? "reads HIGH (static err)" : "right only at block alt", "alt-static": "reads slightly high" }[m.asiMode]);
    const altS = stat(m.altMode, { ok: "agrees", frozen: "FROZEN at " + fmt(tA) + " ft", "alt-static": "reads slightly high" }[m.altMode]);
    const vsiS = stat(m.vsiMode, { ok: "agrees", zero: "stuck at zero", "alt-static": "reads slightly high" }[m.vsiMode]);
    b += T(93, 482, `shows ${m.asiRead}  ·  actual ${s.ias} kt`, { fill: C.INK }) + T(93, 497, asiS.t, { fill: asiS.c, weight: 700 });
    b += T(280, 482, `shows ${fmt(m.altRead)}  ·  actual ${fmt(s.altFt)} ft`, { fill: C.INK }) + T(280, 497, altS.t, { fill: altS.c, weight: 700 });
    b += T(467, 482, `shows ${m.vsiRead > 0 ? "+" : ""}${m.vsiRead}  ·  actual ${s.trend > 0 ? "+" : ""}${s.trend * 500} fpm`, { fill: C.INK }) + T(467, 497, vsiS.t, { fill: vsiS.c, weight: 700 });
    return wrap(560, 508, b, o);
  }

  SD.register("pitot", {
    init: () => ({ altFt: 3000, ias: 100, ram: "open", drain: "open", stat: "open", altStatic: false, heat: false, trapAlt: null, trapP: null, trapRamAlt: null, trend: 0 }),
    controls: [
      { key: "altFt", label: "Altitude", type: "range", min: 1000, max: 8000, step: 100, unit: " ft" },
      { key: "ias", label: "Airspeed", type: "range", min: 50, max: 120, step: 5, unit: " kt" },
      { key: "trend", label: "Vertical motion", type: "seg", opts: [[-1, "Descending"], [0, "Level"], [1, "Climbing"]] },
      { key: "ram", label: "Pitot ram hole", type: "seg", opts: [["open", "Open"], ["blocked", "Iced over"]] },
      { key: "drain", label: "Pitot drain hole", type: "seg", opts: [["open", "Open"], ["blocked", "Iced over"]] },
      { key: "stat", label: "Static port", type: "seg", opts: [["open", "Open"], ["blocked", "Blocked"]] },
      { key: "altStatic", label: "Alternate static", type: "toggle" },
      { key: "heat", label: "Pitot heat", type: "toggle" },
    ],
    parts: ["pitotTube", "drain", "pitotHeat", "pitotLine", "staticPort", "staticLine", "altStatic", "adc", "asi", "alt", "vsi", "standby", "ahrs"],
    set: pitotSet, model: pitotModel, draw: pitotDraw,
  });

  /* ===========================================================================
     ENGINE  (id "engine") — view "cycle": one cylinder, four strokes;
     view "layout": flat-four top view with the air path. Every part id is
     emitted in BOTH views (the cylinder internals appear in the layout view as
     a small "inside one cylinder" inset), so tasks work in either.
     =========================================================================== */
  const STROKES = ["Intake", "Compression", "Power", "Exhaust"];
  const STROKE_DEG = [90, 270, 90, 270];            // mid-stroke crank angle after TDC
  const CR = 34, CL = 84, CY = 220, TDC = 76;       // crank radius, rod length, crank centre y, crown at TDC (local units)
  const crown = (deg) => CY - CR * Math.cos(rad(deg)) - Math.sqrt(CL * CL - (CR * Math.sin(rad(deg))) ** 2) - 26;
  const CHARGE = [["#f6c90e", 0.3], ["#ffa502", 0.5], ["#ff6b35", 0.75], ["#8795a1", 0.5]];
  const GAS = "#d0d6dc";
  const STROKE_INFO = [
    ["Piston moving DOWN", "Intake valve OPEN", "Fuel-air charge drawn in"],
    ["Piston moving UP", "Both valves CLOSED", "Charge squeezed"],
    ["Spark fires, both valves CLOSED", "Expanding gas drives the", "piston DOWN: the power stroke"],
    ["Piston moving UP", "Exhaust valve OPEN", "Burnt gas pushed out"],
  ];

  function engineModel(s) {
    const st = clamp(s.stroke | 0, 0, 3), blocked = s.filter === "blocked";
    const base = { strokeName: STROKES[st], intakeOpen: st === 0, exhaustOpen: st === 3, spark: st === 2, airVia: blocked ? "altAir" : "filter" };
    let msg;
    if (s.view === "layout") {
      msg = blocked ? "<b>Filter blocked</b>: the engine pulls air through the alternate air door instead &mdash; unfiltered, but still running."
        : "Air goes filter &rarr; fuel/air control unit &rarr; manifold &rarr; cylinders &rarr; exhaust &rarr; muffler. Fuel is added at each cylinder's nozzle.";
    } else if (s.play) msg = "Playing the full 720&deg; cycle: intake, compression, power, exhaust &mdash; two crank turns, one power stroke.";
    else msg = `<b>${base.strokeName}</b>: ` + STROKE_INFO[st].join(" &middot; ").replace("Spark fires, both valves CLOSED &middot; Expanding gas drives the &middot; piston DOWN: the power stroke", "spark fires, both valves closed, expanding gas drives the piston down &mdash; the only stroke that makes power");
    return { ...base, msg };
  }

  // One cylinder, drawn in local units (head top at y=0, bore centre x=0) and placed with translate/scale.
  // emit: which parts to emit (the layout view emits cylinder/crank/cooling itself).
  function cylinder(s, o, cx, y0, k, emit, big) {
    const st = clamp(s.stroke | 0, 0, 3), play = !!s.play && !K.reduced && big;
    const deg = STROKE_DEG[st], cr = crown(deg), min = 28 / k;
    const pinA = [CR * Math.sin(rad(deg)), CY - CR * Math.cos(rad(deg))];
    const iOpen = st === 0, eOpen = st === 3;
    const T_ = 8, N = 48;
    const samp = (fn) => Array.from({ length: N + 1 }, (_, i) => fn(i * 15)).join(";");
    let b = `<g transform="translate(${cx},${y0}) scale(${k})">`;

    // crankcase + chamber + walls + head
    b += `<path d="M-68 196 H68 V282 Q0 306 -68 282 Z" fill="#2a3340" stroke="${EDGE}"/>`;
    b += `<rect x="-50" y="60" width="100" height="136" fill="#10161d"/>`;
    // charge in the chamber
    if (play) {
      b += `<rect x="-50" y="60" width="100" height="${f(cr - 60)}" fill="${CHARGE[0][0]}" fill-opacity=".3">` +
        `<animate attributeName="height" values="${samp((d) => f(crown(d) - 60))}" dur="${T_}s" repeatCount="indefinite"/>` +
        `<animate attributeName="fill" values="${CHARGE.map((c) => c[0]).join(";")}" keyTimes="0;.25;.5;.75" calcMode="discrete" dur="${T_}s" repeatCount="indefinite"/>` +
        `<animate attributeName="fill-opacity" values="${CHARGE.map((c) => c[1]).join(";")}" keyTimes="0;.25;.5;.75" calcMode="discrete" dur="${T_}s" repeatCount="indefinite"/></rect>`;
      b += `<path d="M-34 62 Q-18 90 0 70 Q18 92 34 62 Z" fill="${HOT}" opacity="0"><animate attributeName="opacity" values="0;0;.9;.9;0;0" keyTimes="0;.49;.5;.74;.76;1" dur="${T_}s" repeatCount="indefinite"/></path>`;
    } else {
      b += `<rect x="-50" y="60" width="100" height="${f(cr - 60)}" fill="${CHARGE[st][0]}" fill-opacity="${CHARGE[st][1]}"/>`;
      if (st === 2) b += `<path d="M-34 62 Q-18 90 0 70 Q18 92 34 62 Z" fill="${HOT}" opacity=".9"/>`;
      if (st === 0) for (let i = 0; i < 9; i++) b += `<circle cx="${-36 + (i * 37) % 72}" cy="${70 + (i * 23) % Math.max(10, cr - 76)}" r="2.2" fill="${C.YEL}" opacity=".7"/>`;
    }
    // cylinder (barrel walls + head)
    const cyl = `<rect x="-64" y="60" width="14" height="136" fill="#3a4656"/><rect x="50" y="60" width="14" height="136" fill="#3a4656"/>` +
      `<rect x="-62" y="0" width="124" height="62" rx="5" fill="#334050" stroke="${EDGE}"/>` +
      `<rect x="-100" y="26" width="40" height="16" fill="#26323f" stroke="${EDGE}"/><rect x="60" y="26" width="40" height="16" fill="#26323f" stroke="${EDGE}"/>` +
      `<path d="M-100 34 H-30 V60" fill="none" stroke="#1f3a52" stroke-width="12"/><path d="M30 60 V34 H100" fill="none" stroke="#4a2a22" stroke-width="12"/>`;
    if (emit.cylinder) b += P(o, "cylinder", "Cylinder", cyl + (big ? L(-92, 150, "cylinder", { anchor: "end", size: 12 }) : "") + H(-64, 0, 128, 196, min), [-64, 0, 128, 196]);
    else b += cyl;
    // ports: live air / gas
    b += flow("M-100 34 H-30 V58", s.filter === "blocked" ? C.WARN : C.SKY, 0.8, iOpen && !play, 3) + flow("M30 58 V34 H100", GAS, 0.8, eOpen && !play, 3);
    if (play) {
      b += `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.02;.23;.25;1" dur="${T_}s" repeatCount="indefinite"/>` + flow("M-100 34 H-30 V58", C.SKY, 0.8, true, 3) + `</g>`;
      b += `<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.75;.77;.98;1" dur="${T_}s" repeatCount="indefinite"/>` + flow("M30 58 V34 H100", GAS, 0.8, true, 3) + `</g>`;
    }

    // cooling fins (+ air passing them)
    let fins = "";
    for (let y = 68; y < 190; y += 11) fins += `<rect x="-78" y="${y}" width="14" height="4" fill="${EDGE}"/><rect x="64" y="${y}" width="14" height="4" fill="${EDGE}"/>`;
    fins += flow("M-86 66 V192", C.SKY, 1.6, true, 3) + flow("M86 66 V192", C.SKY, 1.6, true, 3);
    if (emit.cooling) b += P(o, "cooling", "Cooling fins and baffles", fins + (big ? L(-92, 96, "cooling fins", { anchor: "end", size: 12 }) + L(-92, 110, "(air-cooled)", { anchor: "end", size: 10 }) : "") + H(-96, 66, 30, 126, min) + H(66, 66, 30, 126, min), [[-96, 66, 30, 126], [66, 66, 30, 126]]);
    else b += fins;

    // piston + rod
    const rodSvg = play
      ? `<line x1="0" y1="${f(CY - CR)}" x2="0" y2="${TDC + 26}" stroke="#8795a1" stroke-width="9" stroke-linecap="round">` +
        `<animate attributeName="x1" values="${samp((d) => f(CR * Math.sin(rad(d))))}" dur="${T_}s" repeatCount="indefinite"/>` +
        `<animate attributeName="y1" values="${samp((d) => f(CY - CR * Math.cos(rad(d))))}" dur="${T_}s" repeatCount="indefinite"/>` +
        `<animate attributeName="y2" values="${samp((d) => f(crown(d) + 26))}" dur="${T_}s" repeatCount="indefinite"/></line>`
      : `<line x1="${f(pinA[0])}" y1="${f(pinA[1])}" x2="0" y2="${f(cr + 26)}" stroke="#8795a1" stroke-width="9" stroke-linecap="round"/>`;
    b += rodSvg;
    const pc = play ? TDC : cr;
    let pis = `<g>${play ? `<animateTransform attributeName="transform" type="translate" values="${samp((d) => "0 " + f(crown(d) - TDC))}" dur="${T_}s" repeatCount="indefinite"/>` : ""}` +
      `<rect x="-47" y="${pc}" width="94" height="44" rx="4" fill="${STEEL2}" stroke="#8795a1"/>` +
      `<rect x="-47" y="${pc + 8}" width="94" height="3" fill="#2a3340"/><rect x="-47" y="${pc + 15}" width="94" height="3" fill="#2a3340"/>` +
      `<circle cx="0" cy="${pc + 28}" r="6" fill="#2a3340"/>${big ? L(0, pc + 41, "piston", { size: 11, fill: C.INK }) : ""}</g>`;
    if (emit.piston !== false) b += P(o, "piston", "Piston", pis + H(-47, pc, 94, 44, min), [-47, pc, 94, 44]);
    else b += pis;
    if (big && !play) {                         // piston direction
      const down = st === 0 || st === 2;
      b += `<path d="M104 ${down ? 120 : 160} V${down ? 160 : 120}" stroke="${C.OK}" stroke-width="5" stroke-linecap="round"/><path d="${down ? "M96 154 L104 168 L112 154 Z" : "M96 126 L104 112 L112 126 Z"}" fill="${C.OK}"/>`;
    }

    // crank
    let crank = `<g ${play ? "" : `transform="rotate(${deg} 0 ${CY})"`}>${play ? `<animateTransform attributeName="transform" type="rotate" from="0 0 ${CY}" to="720 0 ${CY}" dur="${T_}s" repeatCount="indefinite"/>` : ""}` +
      `<circle cx="0" cy="${CY}" r="40" fill="#33404f" stroke="${EDGE}" stroke-width="2"/>` +
      `<line x1="0" y1="${CY}" x2="0" y2="${CY - CR}" stroke="#52606f" stroke-width="20" stroke-linecap="round"/>` +
      `<circle cx="0" cy="${CY - CR}" r="9" fill="${STEEL2}" stroke="#8795a1"/></g>` +
      `<circle cx="0" cy="${CY}" r="10" fill="${DARK}" stroke="#8795a1" stroke-width="2"/>`;
    if (emit.crank) b += P(o, "crank", "Crankshaft", crank + (big ? L(0, CY + 66, "crankshaft", { size: 12 }) : "") + H(-44, CY - 44, 88, 88, min), [-44, CY - 44, 88, 88]);
    else b += crank;

    // valves
    const valve = (x, open, tint, kt, vals, lbl) =>
      `<g>${play ? `<animateTransform attributeName="transform" type="translate" values="${vals}" keyTimes="${kt}" dur="${T_}s" repeatCount="indefinite"/>` : (open ? 'transform="translate(0 11)"' : "")}` +
      `<rect x="${x - 2.5}" y="18" width="5" height="${42}" fill="#8795a1"/><rect x="${x - 8}" y="14" width="16" height="6" rx="2" fill="${STEEL2}"/>` +
      `<path d="M${x - 14} 56 L${x + 14} 56 L${x + 9} 62 L${x - 9} 62 Z" fill="${open && !play ? tint : "#8795a1"}" stroke="#c8d0d8"/></g>`;
    const vs = valve(-30, iOpen, C.OK, "0;.02;.23;.25;1", "0 0;0 11;0 11;0 0;0 0") + valve(30, eOpen, C.WARN, "0;.75;.77;.98;1", "0 0;0 0;0 11;0 11;0 0");
    const vl = big ? L(-30, 9, "intake", { size: 10, fill: C.INK }) + L(30, 9, "exhaust", { size: 10, fill: C.INK }) : "";
    if (emit.valves !== false) b += P(o, "valves", "Intake and exhaust valves", vs + vl + H(-44, 8, 28, 56, min) + H(16, 8, 28, 56, min), [[-44, 8, 28, 56], [16, 8, 28, 56]]);
    else b += vs;

    // spark plug
    let plug = `<rect x="-5" y="-30" width="10" height="26" fill="#e8edf2"/><rect x="-9" y="-6" width="18" height="10" fill="${STEEL2}"/><rect x="-5" y="4" width="10" height="56" fill="${STEEL2}"/><rect x="-2" y="60" width="4" height="8" fill="#c8d0d8"/>`;
    const bolt = `<path d="M4 62 L-8 78 L0 76 L-6 92 L10 70 L2 72 Z" fill="${C.YEL}" stroke="${C.WARN}"/><circle cx="0" cy="72" r="18" fill="${C.YEL}" fill-opacity=".25"/>`;
    if (play) plug += `<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;.49;.5;.56;.57;1" dur="${T_}s" repeatCount="indefinite"/>${bolt}</g>`;
    else if (st === 2) plug += bolt;
    if (emit.plug !== false) b += P(o, "plug", "Spark plug", plug + (big ? L(0, -38, "spark plug", { size: 12 }) : "") + H(-14, -32, 28, 100, min), [-14, -32, 28, 100]);
    else b += plug;

    // injector nozzle at the intake port — continuous flow, so the spray is always there
    const inj = `<rect x="-78" y="-8" width="12" height="28" rx="2" fill="#9a6b12" stroke="${C.WARN}"/><path d="M-77 20 L-67 20 L-72 30 Z" fill="${C.WARN}"/>` +
      `<path d="M-72 31 L-84 46 M-72 31 L-72 48 M-72 31 L-60 46" stroke="${C.WARN}" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 3"/>`;
    if (emit.injector !== false) b += P(o, "injector", "Injector nozzle", inj + (big ? L(-86, 2, "fuel nozzle", { anchor: "end", size: 12 }) : "") + H(-92, -10, 28, 60, min), [-92, -10, 28, 60]);
    else b += inj;
    // info panel texts are drawn by the caller
    b += `</g>`;
    return b;
  }

  function engineCycle(s, o) {
    const m = engineModel(s), st = clamp(s.stroke | 0, 0, 3), play = !!s.play && !K.reduced;
    const blocked = s.filter === "blocked";
    const CX = 270, Y0 = 72;
    let b = "";
    // induction chain, left of the cylinder
    b += `<rect x="6" y="76" width="44" height="56" rx="5" fill="${blocked ? "#3a2c1c" : "#26323f"}" stroke="${blocked ? C.BAD : EDGE}" stroke-width="2"/>`;
    const filt = `<rect x="6" y="76" width="44" height="56" rx="5" fill="${blocked ? "#4a3520" : "#26323f"}" stroke="${blocked ? C.BAD : EDGE}" stroke-width="2"/>` +
      `<path d="M16 82 V126 M24 82 V126 M32 82 V126 M40 82 V126" stroke="${blocked ? "#8a6a3a" : "#52606f"}" stroke-width="3"/>` +
      (blocked ? `<circle cx="14" cy="100" r="3" fill="#a07a44"/><circle cx="30" cy="114" r="3.4" fill="#a07a44"/><circle cx="40" cy="92" r="3" fill="#a07a44"/>` : "");
    b += flow("M0 104 H6", C.SKY, 0.8, true, 4);
    b += P(o, "airFilter", "Induction air filter", filt + L(28, 148, "air filter", { size: 11 }) + H(6, 84, 44, 48), [6, 76, 44, 56]);
    const door = blocked ? `<path d="M14 68 L40 48" stroke="${C.WARN}" stroke-width="5" stroke-linecap="round"/>` : `<path d="M14 70 H42" stroke="${EDGE}" stroke-width="5" stroke-linecap="round"/>`;
    b += P(o, "altAir", "Alternate air door", door + flow("M40 50 V40 H84 V84", C.WARN, 1, blocked, 3) + L(8, 34, "alt air door", { size: 10, anchor: "start", fill: blocked ? C.WARN : C.MUTED }) + H(10, 46, 36, 30), [10, 46, 36, 30]);
    b += flow("M50 104 H60", C.SKY, 0.8, !blocked, 4);
    b += P(o, "servo", "Fuel/air control unit", `<rect x="60" y="84" width="48" height="40" rx="5" fill="#26323f" stroke="${C.SKY}" stroke-width="1.5"/>` + L(84, 102, "fuel/air", { size: 10, fill: C.INK }) + L(84, 114, "control", { size: 10, fill: C.INK }) + H(60, 84, 48, 40), [60, 84, 48, 40]);
    b += flow("M108 104 H160", C.SKY, 0.8, true, 4);
    b += P(o, "manifold", "Intake manifold", `<rect x="110" y="96" width="50" height="16" rx="3" fill="#26323f" stroke="${EDGE}"/>` + L(135, 130, "manifold", { size: 11 }) + H(110, 92, 50, 26), [110, 92, 50, 26]);
    b += flow("M100 84 V38 H198 V64", C.WARN, 1, true, 3) + L(150, 32, "fuel", { fill: C.WARN, size: 11 });
    // the cylinder
    b += cylinder(s, o, CX, Y0, 1, { cylinder: true, cooling: true, crank: true }, true);
    // exhaust + muffler
    b += flow("M370 106 H424", GAS, 0.9, st === 3 || play, 4);
    b += P(o, "exhaust", "Exhaust system", `<rect x="372" y="98" width="52" height="16" rx="3" fill="#4a2a22" stroke="#7a4a3a"/>` + L(398, 92, "exhaust", { size: 11 }) + H(372, 94, 52, 26), [372, 94, 52, 26]);
    b += P(o, "muffler", "Muffler and heat shroud", `<rect x="424" y="80" width="126" height="52" rx="8" fill="#3a2c28" stroke="#7a4a3a" stroke-width="2"/><rect x="418" y="72" width="138" height="68" rx="12" fill="none" stroke="${C.WARN}" stroke-dasharray="5 4"/>` +
      L(487, 102, "muffler", { size: 12, fill: C.INK }) + L(487, 118, "(heat shroud)", { size: 11 }) + H(418, 72, 138, 68), [418, 72, 138, 68]);
    // designation chip
    b += P(o, "designation", "Engine designation IO-360-L2A", `<rect x="428" y="10" width="124" height="34" rx="8" fill="#1b2530" stroke="${C.SKY}" stroke-width="1.5"/>` + text(490, 33, "IO-360-L2A", { size: 15, weight: 700, fill: C.INK }) + H(428, 10, 124, 34), [428, 10, 124, 34]);
    // what's happening panel
    b += `<rect x="394" y="168" width="158" height="124" rx="8" fill="#10161d" stroke="${EDGE}"/>`;
    const panel = (i) => `<g>` + text(473, 190, STROKES[i].toUpperCase(), { size: 14, weight: 800, fill: [C.OK, C.WARN, HOT, C.MUTED][i], lbl: false }) +
      STROKE_INFO[i].map((ln, j) => text(473, 214 + j * 20, ln, { size: 11, fill: C.INK, lbl: false })).join("") + `</g>`;
    if (play) {
      [0, 1, 2, 3].forEach((i) => { b += `<g opacity="${i ? 0 : 1}"><animate attributeName="opacity" values="${[0, 1, 2, 3].map((j) => (j === i ? 1 : 0)).join(";")}" keyTimes="0;.25;.5;.75" calcMode="discrete" dur="8s" repeatCount="indefinite"/>${panel(i)}</g>`; });
      b += T(473, 280, "720° = 2 crank turns", { size: 10 });
    } else b += panel(st) + T(473, 280, "720° = 2 crank turns", { size: 10 });
    // stroke stepper (in-SVG buttons)
    STROKES.forEach((n, i) => {
      const on = !play && st === i, x = 16 + i * 134;
      b += ctl("stroke", i, `<rect x="${x}" y="388" width="126" height="34" rx="8" fill="${on ? "#12301f" : "#1b2530"}" stroke="${on ? C.OK : EDGE}" stroke-width="${on ? 2.5 : 1.5}"/>` +
        text(x + 63, 410, `${i + 1}  ${n}`, { size: 13, weight: on ? 700 : 500, fill: on ? C.OK : C.INK, lbl: false }), "Show the " + n + " stroke", [x, 388, 126, 34]);
    });
    return wrap(560, 436, b, o);
  }

  function engineLayout(s, o) {
    const m = engineModel(s), blocked = s.filter === "blocked";
    const GASC = "#ff9f6b";
    let b = "";
    b += T(8, 14, "top view, nose to the left", { anchor: "start", size: 10 });
    // intake risers (drawn first: the engine hides their upper ends)
    b += flow("M154 372 V100", C.SKY, 1.4, true, 4) + flow("M258 372 V100", C.SKY, 1.4, true, 4) + flow("M189 372 V312", C.SKY, 1.4, true, 4) + flow("M299 372 V312", C.SKY, 1.4, true, 4);
    // prop + crankshaft
    b += `<path d="M42 118 Q46 108 50 118 L52 200 H40 Z M42 312 Q46 322 50 312 L52 230 H40 Z" fill="#3a4656" stroke="${EDGE}"/>`;
    b += L(46, 100, "prop", { size: 11 });
    b += `<path d="M26 204 Q22 215 26 226 L62 232 V198 Z" fill="${STEEL2}" stroke="#8795a1"/>`;
    b += P(o, "crank", "Crankshaft", `<rect x="62" y="206" width="52" height="18" fill="#8795a1" stroke="#c8d0d8"/>` + L(88, 246, "crankshaft", { size: 11 }) + H(60, 200, 52, 30), [60, 200, 52, 30]);
    // crankcase
    b += `<rect x="112" y="190" width="240" height="50" rx="6" fill="#2a3340" stroke="${EDGE}"/>`;
    b += `<rect x="114" y="208" width="236" height="14" fill="#8795a1" opacity=".55"/>`;
    // cylinders: top bank x112/222, bottom bank x167/277
    const cyls = [[112, 92, 180], [222, 92, 180], [167, 240, 328], [277, 240, 328]];
    let cy = "";
    cyls.forEach(([x, y1, y2], i) => {
      const top = i < 2;
      cy += `<rect x="${x}" y="${y1}" width="44" height="${y2 - y1}" rx="4" fill="#3a4656" stroke="${EDGE}"/>`;
      for (let y = y1 + 8; y < y2 - 6; y += 9) cy += `<rect x="${x - 4}" y="${y}" width="52" height="3" fill="${EDGE}"/>`;
      cy += `<rect x="${x + 2}" y="${top ? y1 : y2 - 18}" width="40" height="18" rx="3" fill="#4a5868"/>`;
    });
    const cylRects = cyls.map(([x, y1, y2]) => [x - 4, y1, 52, y2 - y1]);
    b += P(o, "cylinder", "Cylinder", cy + L(190, 80, "4 cylinders, opposed", { size: 11 }) + cylRects.map((r) => H(...r)).join(""), cylRects);
    // cooling air + baffles
    let cool = "";
    [[78, 124], [78, 160], [120, 262], [120, 296]].forEach(([x, y]) => { cool += flow(`M${x} ${y} H${x + 32}`, C.SKY, 1, true, 3); });
    cool += `<rect x="160" y="92" width="4" height="88" fill="#6b7a8a"/><rect x="270" y="92" width="4" height="88" fill="#6b7a8a"/><rect x="215" y="240" width="4" height="88" fill="#6b7a8a"/><rect x="325" y="240" width="4" height="88" fill="#6b7a8a"/>`;
    b += P(o, "cooling", "Cooling fins and baffles", cool + L(94, 112, "cooling air", { size: 10, anchor: "middle" }) + H(70, 116, 46, 52) + H(112, 254, 52, 52), [[70, 116, 46, 52], [112, 254, 52, 52]]);
    // exhaust headers (over the manifold where they cross)
    const ex = flow("M124 92 V56 H372 V424 M232 92 V56 M175 328 V424 H372 M285 328 V424", GASC, 1.2, true, 4);
    b += P(o, "exhaust", "Exhaust system", ex + L(250, 48, "exhaust", { size: 11 }) + H(180, 42, 100, 28) + H(364, 330, 28, 94) + H(180, 410, 100, 28), [[180, 46, 100, 20], [366, 330, 24, 90]]);
    // muffler + shroud
    b += P(o, "muffler", "Muffler and heat shroud", `<rect x="372" y="190" width="76" height="40" rx="8" fill="#3a2c28" stroke="#7a4a3a" stroke-width="2"/><rect x="366" y="182" width="88" height="56" rx="12" fill="none" stroke="${C.WARN}" stroke-dasharray="5 4"/>` +
      L(410, 214, "muffler", { size: 12, fill: C.INK }) + L(410, 252, "heat shroud", { size: 11 }) + H(366, 182, 88, 56), [366, 182, 88, 56]);
    b += flow("M448 210 H494", GASC, 1, true, 4) + L(498, 232, "overboard", { size: 10, anchor: "middle" });
    // induction: filter -> alt air -> servo -> manifold
    b += flow("M0 385 H20", C.SKY, 0.8, true, 4);
    const filt = `<rect x="22" y="360" width="50" height="50" rx="5" fill="${blocked ? "#4a3520" : "#26323f"}" stroke="${blocked ? C.BAD : EDGE}" stroke-width="2"/>` +
      `<path d="M32 366 V404 M40 366 V404 M48 366 V404 M56 366 V404" stroke="${blocked ? "#8a6a3a" : "#52606f"}" stroke-width="3"/>` +
      (blocked ? `<circle cx="30" cy="378" r="3" fill="#a07a44"/><circle cx="52" cy="394" r="3.4" fill="#a07a44"/>` : "");
    b += P(o, "airFilter", "Induction air filter", filt + L(47, 424, "air filter", { size: 11 }) + H(22, 366, 50, 44), [22, 360, 50, 50]);
    const door = blocked ? `<path d="M30 350 L62 332" stroke="${C.WARN}" stroke-width="5" stroke-linecap="round"/>` : `<path d="M30 352 H66" stroke="${EDGE}" stroke-width="5" stroke-linecap="round"/>`;
    b += flow("M60 332 V318 H100 V378", C.WARN, 1, blocked, 3);
    b += P(o, "altAir", "Alternate air door", door + L(47, 312, "alternate air", { size: 10, fill: blocked ? C.WARN : C.MUTED }) + H(26, 330, 44, 30), [26, 330, 44, 30]);
    b += flow("M72 385 H84", C.SKY, 0.8, !blocked, 4);
    b += P(o, "servo", "Fuel/air control unit", `<rect x="84" y="360" width="62" height="50" rx="5" fill="#26323f" stroke="${C.SKY}" stroke-width="1.5"/>` + L(115, 381, "fuel/air", { size: 10, fill: C.INK }) + L(115, 393, "control unit", { size: 10, fill: C.INK }) + H(84, 360, 62, 50), [84, 360, 62, 50]);
    b += flow("M146 385 H150", C.SKY, 0.8, true, 4);
    b += P(o, "manifold", "Intake manifold", `<rect x="150" y="372" width="204" height="26" rx="5" fill="#26323f" stroke="${EDGE}"/>` + L(252, 389, "intake manifold", { size: 12, fill: C.INK }) + H(150, 372, 204, 26), [150, 372, 204, 26]);
    // designation chips
    const chip = (x, t) => `<rect x="${x}" y="14" width="38" height="30" rx="7" fill="#1b2530" stroke="${C.SKY}" stroke-width="1.5"/>` + text(x + 19, 35, t, { size: 15, weight: 800, fill: C.INK, lbl: false });
    b += P(o, "designation", "Engine designation IO-360-L2A", chip(398, "I") + chip(442, "O") + chip(486, "360") +
      L(474, 62, "I injected · O opposed", { size: 10, fill: C.INK }) + L(474, 75, "360 cu in · 180 hp @ 2,700", { size: 10 }) + H(398, 14, 126, 62), [398, 14, 126, 62]);
    // inset: inside one cylinder
    b += `<rect x="410" y="262" width="140" height="170" rx="8" fill="none" stroke="${EDGE}" stroke-dasharray="4 4"/>`;
    b += L(480, 258, "inside one cylinder", { size: 11 });
    b += cylinder(s, o, 480, 296, 0.46, { cylinder: false, cooling: false, crank: false }, false);
    return wrap(560, 440, b, o);
  }

  SD.register("engine", {
    init: () => ({ view: "cycle", stroke: 0, play: false, filter: "clear" }),
    controls: [
      { key: "view", label: "View", type: "seg", opts: [["cycle", "Four strokes"], ["layout", "Layout & air path"]] },
      { key: "stroke", label: "Stroke", type: "seg", opts: [[0, "Intake"], [1, "Compression"], [2, "Power"], [3, "Exhaust"]] },
      { key: "play", label: "Play the cycle", type: "toggle" },
      { key: "filter", label: "Induction air filter", type: "seg", opts: [["clear", "Clear"], ["blocked", "Blocked"]] },
    ],
    parts: ["cylinder", "piston", "valves", "plug", "injector", "crank", "airFilter", "altAir", "servo", "manifold", "exhaust", "muffler", "cooling", "designation"],
    set: (s, key, v) => { s[key] = v; if (key === "stroke") s.play = false; return s; },
    model: engineModel,
    draw: (s, o) => (s.view === "layout" ? engineLayout(s, o || {}) : engineCycle(s, o || {})),
  });


  /* ===========================================================================
     PROPELLER  (id "prop") — fixed pitch: blade AOA = blade angle - helix angle.
     Numbers are a toy model; none are drawn.
     =========================================================================== */
  const BETA = 34;                                   // fixed blade angle (illustrative)
  function propModel(s) {
    const thr = clamp(s.throttle, 0, 100), ias = s.ias;
    const rpmRel = clamp(0.10 + 0.5 * thr / 100 + 0.4 * (ias - 40) / 120, 0, 1);
    const U = 60 + 190 * rpmRel, phi = Math.atan2(ias, U) * 180 / Math.PI, aoa = BETA - phi;
    const aoaBand = aoa > 12 ? "high" : aoa > 4 ? "moderate" : aoa > 0.5 ? "low" : "none";
    const rpmBand = rpmRel < 0.4 ? "low" : rpmRel < 0.72 ? "mid" : "high";
    const msg = {
      high: "<b>Slow, so the blade AOA is high</b>: lots of thrust, but the blade is loaded and RPM sags for the throttle setting.",
      moderate: "<b>Moderate blade AOA</b>: the blade angle is fixed, so RPM follows the throttle and airspeed.",
      low: "<b>Fast: the relative wind swings toward the rotation plane</b>, so blade AOA falls, the load eases and RPM builds at the same throttle.",
      none: "<b>Blade AOA at or below zero</b>: no thrust, only drag &mdash; the prop is being windmilled by the airflow.",
    }[aoaBand];
    return { aoa: Math.round(aoa * 10) / 10, aoaBand, rpmBand, rpmRel: Math.round(rpmRel * 100) / 100, msg };
  }

  function propDraw(s, o) {
    o = o || {};
    const m = propModel(s), phi = BETA - m.aoa;
    let b = "";
    // ---- front view (from the cockpit): turns clockwise -------------------------------------
    b += `<circle cx="120" cy="116" r="92" fill="none" stroke="${EDGE}" stroke-dasharray="5 6"/>`;
    b += `<path d="M120 36 A80 80 0 0 1 192 76" fill="none" stroke="${C.SKY}" stroke-width="3"/><path d="M186 62 L196 80 L178 80 Z" fill="${C.SKY}" transform="rotate(-6 192 76)"/>`;
    b += L(120, 14, "front view: turns CLOCKWISE from the cockpit", { size: 11, fill: C.SKY });
    const blade = (a) => `<path transform="rotate(${a} 120 116)" d="M112 96 L109 36 Q120 28 131 36 L128 96 Z" fill="#59636f" stroke="#8795a1" stroke-width="1.5"/>`;
    b += P(o, "blade", "Prop blade", blade(25) + blade(205) + (() => { const [x1, y1] = pol(120, 116, 74, 25), [x2, y2] = pol(120, 116, 74, 205); return H(x1 - 16, y1 - 16, 32, 32) + H(x2 - 16, y2 - 16, 32, 32); })() +
      // section view inside the same part (the blade seen from the tip)
      sectionBlade(s, m, phi, o), [[104, 20, 32, 50], [104, 162, 32, 50]]);
    b += P(o, "spinner", "Spinner", `<circle cx="120" cy="116" r="30" fill="#6b7a8a" stroke="#c8d0d8" stroke-width="2"/>` + L(120, 160, "spinner", { size: 11 }) + H(90, 86, 60, 60), [90, 86, 60, 60]);
    b += P(o, "hub", "Hub", `<circle cx="120" cy="116" r="13" fill="#2a3340" stroke="#8795a1" stroke-width="2"/><circle cx="120" cy="116" r="4" fill="#8795a1"/>` + H(106, 102, 28, 28), [106, 102, 28, 28]);
    // ---- tachometer (no numbers) -----------------------------------------------------------
    const tc = [120, 318], tr = 62;
    let tach = `<circle cx="${tc[0]}" cy="${tc[1]}" r="${tr}" fill="#10161d" stroke="${EDGE}" stroke-width="3"/>`;
    for (let i = 0; i <= 12; i++) { const a = -135 + i * 22.5, [x1, y1] = pol(tc[0], tc[1], tr - 3, a), [x2, y2] = pol(tc[0], tc[1], tr - (i % 2 ? 9 : 14), a); tach += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.MUTED}" stroke-width="${i % 2 ? 1 : 2}"/>`; }
    const [nx, ny] = pol(tc[0], tc[1], 50, -135 + m.rpmRel * 270);
    tach += `<line x1="${tc[0]}" y1="${tc[1]}" x2="${nx}" y2="${ny}" stroke="${C.INK}" stroke-width="3" stroke-linecap="round"/><circle cx="${tc[0]}" cy="${tc[1]}" r="5" fill="${C.INK}"/>`;
    tach += T(tc[0], tc[1] + 30, "RPM", { size: 11 });
    b += P(o, "tach", "Tachometer", tach + L(tc[0], tc[1] + tr + 22, "tachometer", { size: 12, fill: C.INK }) + T(tc[0], tc[1] + tr + 38, `RPM ${m.rpmBand}  (throttle sets it)`, { fill: C.INK }) + H(tc[0] - tr, tc[1] - tr, 2 * tr, 2 * tr), [tc[0] - tr, tc[1] - tr, 2 * tr, 2 * tr]);
    // AOA bar
    b += T(400, 410, "blade AOA (illustrative)", { size: 11, fill: C.INK });
    const segs = [["#3b4756", 0, 0.14], [C.OK, 0.14, 0.5], [C.WARN, 0.5, 0.72], [C.BAD, 0.72, 1]];
    segs.forEach(([c, a, z]) => { b += `<rect x="${f(262 + a * 276)}" y="418" width="${f((z - a) * 276)}" height="10" fill="${c}" opacity=".85"/>`; });
    const mx = 262 + clamp((m.aoa + 4) / 24, 0, 1) * 276;
    b += `<path d="M${f(mx - 6)} 440 L${f(mx + 6)} 440 L${f(mx)} 430 Z" fill="${C.INK}"/>`;
    b += T(262, 452, "none", { anchor: "start" }) + T(538, 452, "high", { anchor: "end" });
    return wrap(560, 462, b, o);
  }

  // blade section seen from the tip: nose to the right, the right-hand blade moves DOWN
  function sectionBlade(s, m, phi, o) {
    const O = [398, 196], sc = 0.55;
    const U = 60 + 190 * m.rpmRel, V = s.ias;
    const dirB = [Math.sin(rad(BETA)), Math.cos(rad(BETA))];          // chord LE direction (page coords, y down)
    const dirP = [Math.sin(rad(phi)), Math.cos(rad(phi))];            // blade path
    const at = (v, k) => [f(O[0] + v[0] * k), f(O[1] + v[1] * k)];
    let g = `<rect x="256" y="26" width="296" height="366" rx="10" fill="#10161d" stroke="${EDGE}"/>`;
    g += T(404, 46, "blade section, seen from the tip (right-hand blade)", { size: 11, fill: C.SKY });
    g += T(404, 60, "nose of the airplane to the right", { size: 10 });
    const aid = uid("pr");
    g += `<defs>${arrowDefs(aid + "a", C.OK)}${arrowDefs(aid + "b", C.SKY)}${arrowDefs(aid + "c", C.WARN)}${arrowDefs(aid + "d", C.MUTED)}</defs>`;
    // relative wind: from ahead of the blade path, toward the blade
    const rw = at(dirP, 120);
    g += `<line x1="${rw[0]}" y1="${rw[1]}" x2="${O[0]}" y2="${O[1]}" stroke="${C.WARN}" stroke-width="3" stroke-dasharray="7 5" marker-end="url(#${aid}c)"/>`;
    g += L(rw[0] + 6, rw[1] + 12, "relative wind", { anchor: "start", fill: C.WARN, size: 11 });
    // components
    const down = [O[0], f(O[1] + U * sc)], fwd = [f(O[0] + V * sc), O[1]];
    g += `<line x1="${O[0]}" y1="${O[1]}" x2="${down[0]}" y2="${down[1] - 4}" stroke="${C.MUTED}" stroke-width="3" marker-end="url(#${aid}d)"/>`;
    g += L(O[0] - 8, down[1] - 12, "blade moves down", { anchor: "end", size: 11 }) + L(O[0] - 8, down[1] + 1, "(rotation)", { anchor: "end", size: 10 });
    g += `<line x1="${O[0]}" y1="${O[1]}" x2="${fwd[0] - 4}" y2="${fwd[1]}" stroke="${C.SKY}" stroke-width="3" marker-end="url(#${aid}b)"/>`;
    g += L(fwd[0] + 4, fwd[1] - 8, "forward", { anchor: "middle", fill: C.SKY, size: 11 });
    // path vector
    const pe = [f(O[0] + V * sc), f(O[1] + U * sc)];
    g += `<line x1="${O[0]}" y1="${O[1]}" x2="${pe[0]}" y2="${pe[1]}" stroke="${C.INK}" stroke-opacity=".45" stroke-width="2" stroke-dasharray="3 4"/>`;
    g += `<line x1="${down[0]}" y1="${down[1]}" x2="${pe[0]}" y2="${pe[1]}" stroke="${C.SKY}" stroke-opacity=".5" stroke-dasharray="3 4"/><line x1="${fwd[0]}" y1="${fwd[1]}" x2="${pe[0]}" y2="${pe[1]}" stroke="${C.MUTED}" stroke-opacity=".5" stroke-dasharray="3 4"/>`;
    // the airfoil: chord along dirB, LE at the lower right
    const le = at(dirB, 64), te = at(dirB, -64), nrm = [dirB[1], -dirB[0]];
    const pt = (t, th) => [f(O[0] + dirB[0] * t * 64 + nrm[0] * th), f(O[1] + dirB[1] * t * 64 + nrm[1] * th)];
    const top = [], bot = [];
    for (let i = 0; i <= 10; i++) { const t = 1 - i * 0.2, th = 13 * Math.sqrt(Math.max(0, (1 - t) * (t + 1)) * 0.5) * (t > 0 ? 1 : 0.8) * (1 - 0.25 * (1 - t) / 2); top.push(pt(t, th)); bot.push(pt(t, -th * 0.35)); }
    const shape = top.concat(bot.reverse()).map((p, i) => (i ? "L" : "M") + p.join(" ")).join(" ") + "Z";
    g += `<path d="${shape}" fill="#6b7a8a" stroke="${C.INK}" stroke-width="1.5"/>`;
    g += `<line x1="${te[0]}" y1="${te[1]}" x2="${le[0]}" y2="${le[1]}" stroke="${C.INK}" stroke-opacity=".6" stroke-dasharray="2 3"/>`;
    g += L(te[0] - 6, te[1] - 6, "chord (fixed angle)", { anchor: "end", size: 11, fill: C.INK });
    // AOA arc between path and chord at the LE
    const a0 = Math.min(BETA, phi), a1 = Math.max(BETA, phi), R = 84;
    if (a1 - a0 > 0.5) { const p0 = at([Math.sin(rad(a0)), Math.cos(rad(a0))], R), p1 = at([Math.sin(rad(a1)), Math.cos(rad(a1))], R);
      g += `<path d="M${p0[0]} ${p0[1]} A${R} ${R} 0 0 0 ${p1[0]} ${p1[1]}" fill="none" stroke="${C.OK}" stroke-width="3"/>`; }
    const lp = at([Math.sin(rad((a0 + a1) / 2)), Math.cos(rad((a0 + a1) / 2))], R + 22);
    g += L(lp[0], lp[1], "AOA", { fill: C.OK, size: 12, weight: 700 });
    // thrust
    const tl = 16 + clamp(m.aoa, 0, 18) * 5;
    g += `<line x1="${O[0] + 10}" y1="${O[1] - 36}" x2="${O[0] + 10 + tl}" y2="${O[1] - 36}" stroke="${C.OK}" stroke-width="4" marker-end="url(#${aid}a)"/>` + L(O[0] + 10, O[1] - 44, "thrust (forward)", { anchor: "start", fill: C.OK, size: 11 });
    return g + H(O[0] - 66, O[1] - 36, 132, 76);
  }

  SD.register("prop", {
    init: () => ({ ias: 90, throttle: 70 }),
    controls: [
      { key: "ias", label: "Airspeed", type: "range", min: 40, max: 160, step: 5, unit: " KIAS" },
      { key: "throttle", label: "Throttle", type: "range", min: 0, max: 100, step: 5, unit: " %" },
    ],
    parts: ["blade", "hub", "spinner", "tach"],
    model: propModel, draw: propDraw,
  });

  /* ===========================================================================
     FLIGHT CONTROLS & FLAPS  (id "controls") — rear view, left is left.
     roll -1 = yoke left, pitch +1 = yoke back (pull), pedal -1 = left pedal,
     trim +1 = nose-up trim. flap = lever position; flapAct = where the flaps
     really are (they only follow the lever with electrical power).
     =========================================================================== */
  const vfeFor = (pos) => (pos <= 0 ? null : pos <= 10 ? 110 : 85);
  const DIRS = (v, pos, neg) => (v > 0 ? pos : v < 0 ? neg : "neutral");
  function ctlSet(s, key, v) {
    s[key] = v;
    if (key === "flap" && s.power) s.flapAct = v;
    if (key === "power" && v) s.flapAct = s.flap;
    return s;
  }
  function ctlModel(s) {
    const act = s.flapAct !== undefined && s.flapAct !== null ? s.flapAct : s.flap;
    const vfe = vfeFor(act), over = vfe !== null && s.ias > vfe;
    const out = {
      overVfe: over, flapMoves: !!s.power, flapPos: act, vfe,
      ailL: DIRS(s.roll, "down", "up"), ailR: DIRS(s.roll, "up", "down"),
      elevator: DIRS(s.pitch, "up", "down"), rudderDir: DIRS(s.pedal, "right", "left"),
      trimTab: DIRS(s.trim, "down", "up"),
    };
    const bits = [];
    if (s.roll) { const d = s.roll < 0 ? "left" : "right", o = s.roll < 0 ? "right" : "left"; bits.push(`Yoke ${d}: <b>${d} aileron UP, ${o} aileron DOWN</b> &mdash; the airplane rolls ${d}.`); }
    if (s.pitch) bits.push(s.pitch > 0 ? "Yoke back: elevator trailing edge <b>UP</b>, nose up." : "Yoke forward: elevator trailing edge <b>DOWN</b>, nose down.");
    if (s.pedal) { const d = s.pedal < 0 ? "left" : "right"; bits.push(`${d[0].toUpperCase() + d.slice(1)} pedal: the rudder swings ${d} and the nosewheel steers ${d}.`); }
    if (s.trim) bits.push(s.trim > 0 ? "Nose-up trim: the tab moves <b>down</b>, which pushes the elevator up." : "Nose-down trim: the tab moves <b>up</b>, which pushes the elevator down.");
    if (!s.power && s.flap !== act) bits.push(`<b>No electrical power</b>: the lever says ${s.flap === 0 ? "UP" : s.flap + "&deg;"} but the flaps stay at ${act}&deg; &mdash; the motor is electric.`);
    else if (!s.power) bits.push("<b>No electrical power</b>: the flaps cannot move.");
    else if (act) bits.push(`Flaps ${act}&deg;.`);
    if (over) bits.push(`<b>OVER Vfe</b>: ${s.ias} KIAS with ${act}&deg; flaps &mdash; the limit is ${vfe} KIAS.`);
    if (!bits.length) bits.push("Everything neutral, flaps up. Move the yoke, pedals, trim or flap lever.");
    return { ...out, msg: bits.join(" ") };
  }

  // side section: fixed part + hinged surface (angle: negative = trailing edge UP), nose to the left
  function section(x, y, title, ang, active, extra) {
    const hx = x + 70, hy = y + 70, mv = active ? C.SKY : STEEL2;
    let g = `<rect x="${x}" y="${y}" width="132" height="124" rx="8" fill="#10161d" stroke="${EDGE}"/>`;
    g += L(x + 66, y + 16, title, { size: 11, fill: C.INK });
    g += `<path d="M${x + 6} ${hy} C${x + 6} ${hy - 22} ${x + 36} ${hy - 26} ${hx} ${hy - 12} L${hx} ${hy + 6} C${x + 36} ${hy + 14} ${x + 6} ${hy + 12} ${x + 6} ${hy} Z" fill="#3a4656" stroke="${C.INK}" stroke-opacity=".6"/>`;
    g += `<g transform="rotate(${f(ang)} ${hx} ${hy - 3})"><path d="M${hx} ${hy - 12} L${hx + 46} ${hy - 4} L${hx + 46} ${hy - 1} L${hx} ${hy + 6} Z" fill="${mv}" stroke="${C.INK}" stroke-opacity=".7"/>${extra || ""}</g>`;
    g += `<circle cx="${hx}" cy="${hy - 3}" r="3" fill="${C.INK}"/>`;
    g += T(x + 66, y + 114, ang < -1 ? "trailing edge UP" : ang > 1 ? "trailing edge DOWN" : "neutral", { size: 11, fill: ang ? C.SKY : C.MUTED });
    return g;
  }

  function controlsDraw(s, o) {
    o = o || {};
    const m = ctlModel(s);
    const act = m.flapPos, fl = act / 30;
    let b = "";
    const colr = (on) => (on ? C.SKY : STEEL2);
    const stroke = `stroke="${C.INK}" stroke-opacity=".6"`;
    const state = (x, y, t, anchor) => T(x, y, t, { size: 12, fill: C.SKY, weight: 800, anchor: anchor || "middle" });
    // ---- rear view -------------------------------------------------------------------------------
    b += T(280, 12, "rear view, from behind: the pilot's left is on the LEFT", { size: 11, fill: C.SKY });
    b += `<rect x="30" y="64" width="500" height="14" rx="3" fill="${FUS}" stroke="${EDGE}"/>`;
    b += `<path d="M258 188 L150 80 M302 188 L410 80" stroke="${STEEL}" stroke-width="5"/>`;
    b += `<rect x="250" y="92" width="60" height="112" rx="26" fill="#2a3340" stroke="${EDGE}"/>`;
    b += `<rect x="256" y="104" width="48" height="26" rx="8" fill="#10161d" stroke="${EDGE}"/>`;
    // ailerons + flaps hang under the wing trailing edge; a deflected surface shows as a taller plate
    const up = (dir) => dir === "up";
    const aileron = (x, dir) => { const amt = dir === "neutral" ? 0 : 10; return `<rect x="${x}" y="${up(dir) ? 78 - amt : 78}" width="100" height="${6 + amt}" rx="2" fill="${colr(dir !== "neutral")}" ${stroke}/>`; };
    const aState = (x, dir) => (dir === "neutral" ? "" : up(dir) ? state(x, 56, "UP ▲") : state(x, 112, "DOWN ▼"));
    const ail = aileron(40, m.ailL) + aState(90, m.ailL) + aileron(420, m.ailR) + aState(470, m.ailR) + L(90, 130, "left aileron", { size: 11 }) + L(470, 130, "right aileron", { size: 11 });
    const aL = s.roll ? (s.roll < 0 ? -24 : 24) : 0, aR = s.roll ? (s.roll > 0 ? -24 : 24) : 0;
    b += P(o, "ailerons", "Ailerons", ail + H(40, 74, 100, 26) + H(420, 74, 100, 26) + section(288, 200, "left aileron (section)", aL, !!s.roll) + section(428, 200, "right aileron (section)", aR, !!s.roll) + H(288, 200, 132, 124) + H(428, 200, 132, 124),
      [[40, 74, 100, 26], [420, 74, 100, 26], [288, 200, 132, 124], [428, 200, 132, 124]]);
    const flapP = (x) => `<rect x="${x}" y="78" width="80" height="${f(6 + 10 * fl)}" rx="2" fill="${colr(act > 0)}" ${stroke}/>`;
    const flInner = flapP(164) + flapP(316) + L(204, 130, "flap", { size: 11 }) + L(356, 130, "flap", { size: 11 }) + (act ? state(204, 112, act + "°") + state(356, 112, act + "°") : "");
    b += P(o, "flaps", "Flaps", flInner + H(164, 74, 80, 30) + H(316, 74, 80, 30) + flapSection(s, m) + H(8, 200, 132, 124), [[164, 74, 80, 30], [316, 74, 80, 30], [8, 200, 132, 124]]);
    // tail, drawn over the fuselage because it is nearer to us
    b += `<rect x="274" y="24" width="12" height="128" rx="3" fill="#2f3a48" stroke="${EDGE}"/>`;
    const d = s.pedal * 18, rx = d >= 0 ? 277 : 283 + d, rw = 6 + Math.abs(d);
    b += P(o, "rudder", "Rudder", `<rect x="${rx}" y="28" width="${rw}" height="116" rx="2" fill="${colr(!!s.pedal)}" ${stroke}/>` + L(304, 40, "rudder", { size: 11, anchor: "start" }) +
      (s.pedal ? state(s.pedal < 0 ? 254 : 306, 120, s.pedal < 0 ? "◄ LEFT" : "RIGHT ►", s.pedal < 0 ? "end" : "start") : "") + H(262, 24, 36, 124), [262, 24, 36, 124]);
    b += `<rect x="190" y="148" width="180" height="10" rx="3" fill="#2f3a48" stroke="${EDGE}"/>`;
    const ev = (x) => { const amt = m.elevator === "neutral" ? 0 : 10; return `<rect x="${x}" y="${m.elevator === "up" ? 158 - amt : 158}" width="82" height="${6 + amt}" rx="2" fill="${colr(m.elevator !== "neutral")}" ${stroke}/>`; };
    b += P(o, "elevator", "Elevator", ev(194) + ev(284) + L(186, 173, "elevator", { size: 11, anchor: "end" }) + (m.elevator !== "neutral" ? state(186, 188, m.elevator === "up" ? "UP ▲" : "DOWN ▼", "end") : "") + H(194, 144, 172, 30) + elevSection(s, m) + H(148, 200, 132, 124), [[194, 144, 172, 30], [148, 200, 132, 124]]);
    b += P(o, "trimTab", "Elevator trim tab", `<rect x="326" y="${s.trim > 0 ? 170 : s.trim < 0 ? 158 : 164}" width="26" height="6" rx="1" fill="${s.trim ? C.WARN : STEEL2}" ${stroke}/>` + L(362, 186, "trim tab", { size: 11, anchor: "start" }) + H(322, 156, 36, 30) + H(244, 250, 36, 36), [[322, 156, 36, 30], [248, 252, 32, 32]]);
    // ---- hardware row -----------------------------------------------------------------------------
    b += T(95, 346, "yoke", { size: 12, fill: C.INK }) + T(240, 346, "rudder pedals", { size: 12, fill: C.INK }) + T(338, 346, "trim wheel", { size: 12, fill: C.INK }) + T(412, 346, "flap lever", { size: 12, fill: C.INK }) + T(519, 346, "flap motor", { size: 12, fill: C.INK });
    const ysc = 1 + s.pitch * 0.12;      // seen from behind, pulling the yoke brings it toward us
    b += `<g transform="translate(95 408) scale(${f(ysc)}) rotate(${s.roll * 38})"><circle r="40" fill="none" stroke="#8795a1" stroke-width="9"/><rect x="-6" y="-40" width="12" height="80" fill="#59636f"/><rect x="-40" y="-6" width="80" height="12" fill="#59636f"/><circle r="9" fill="#2a3340" stroke="#8795a1" stroke-width="2"/><circle cx="0" cy="-40" r="5" fill="${C.INK}"/></g>`;
    b += ctl("roll", -1, `<rect x="42" y="362" width="46" height="92" fill="${s.roll < 0 ? C.SKY : "none"}" fill-opacity=".12"/>`, "Yoke left", [42, 362, 46, 92]);
    b += ctl("roll", 1, `<rect x="102" y="362" width="46" height="92" fill="${s.roll > 0 ? C.SKY : "none"}" fill-opacity=".12"/>`, "Yoke right", [102, 362, 46, 92]);
    b += ctl("roll", 0, "", "Yoke level", [80, 394, 30, 28]);
    b += T(95, 470, s.roll < 0 ? "yoke left" : s.roll > 0 ? "yoke right" : "yoke level", { size: 11, fill: s.roll ? C.SKY : C.MUTED });
    [[-1, "Push", 10, 56], [0, "0", 70, 32], [1, "Pull", 106, 56]].forEach(([v, t, x, w]) => {
      const on = s.pitch === v;
      b += ctl("pitch", v, `<rect x="${x}" y="480" width="${w}" height="26" rx="13" fill="${on ? "#12301f" : "#1b2530"}" stroke="${on ? C.OK : EDGE}" stroke-width="1.5"/>` + text(x + w / 2, 497, t, { size: 11, fill: on ? C.OK : C.INK, lbl: false }), "Yoke " + t, [x, 480, w, 26]);
    });
    [[-1, 196, "L"], [1, 252, "R"]].forEach(([v, x, t]) => {
      const dy = s.pedal === v ? -12 : 0;
      b += `<rect x="${x}" y="${392 + dy}" width="44" height="56" rx="6" fill="#3a4656" stroke="${s.pedal === v ? C.SKY : EDGE}" stroke-width="2"/><rect x="${x + 6}" y="${392 + dy + 4}" width="32" height="14" rx="4" fill="#59636f"/>` + T(x + 22, 432 + dy, t, { size: 13, fill: C.INK });
      b += ctl("pedal", v, "", "Push the " + (v < 0 ? "left" : "right") + " rudder pedal", [x, 380, 44, 70]);
    });
    b += ctl("pedal", 0, `<rect x="241" y="412" width="10" height="16" rx="3" fill="#1b2530" stroke="${EDGE}"/>`, "Pedals neutral", [241, 408, 10, 28]);
    b += T(246, 470, s.pedal < 0 ? "left pedal" : s.pedal > 0 ? "right pedal" : "pedals neutral", { size: 11, fill: s.pedal ? C.SKY : C.MUTED });
    // trim wheel: top half = nose up, bottom half = nose down
    b += `<g transform="translate(338 408)"><circle r="26" fill="#2a3340" stroke="#8795a1" stroke-width="4"/>` +
      Array.from({ length: 10 }, (_, i) => { const a = i * 36 - s.trim * 34, [x1, y1] = pol(0, 0, 15, a), [x2, y2] = pol(0, 0, 25, a); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8795a1" stroke-width="3"/>`; }).join("") + `<circle r="6" fill="#10161d"/></g>`;
    b += ctl("trim", 1, `<rect x="306" y="358" width="64" height="48" rx="8" fill="${s.trim > 0 ? C.WARN : "none"}" fill-opacity=".15"/>` + text(338, 372, "nose UP", { size: 10, fill: C.WARN, lbl: false }), "Trim nose up", [306, 358, 64, 48]);
    b += ctl("trim", -1, `<rect x="306" y="412" width="64" height="48" rx="8" fill="${s.trim < 0 ? C.WARN : "none"}" fill-opacity=".15"/>` + text(338, 452, "nose DOWN", { size: 10, fill: C.WARN, lbl: false }), "Trim nose down", [306, 412, 64, 48]);
    b += ctl("trim", 0, "", "Trim neutral", [326, 396, 24, 24]);
    b += T(338, 470, s.trim > 0 ? "tab moves DOWN" : s.trim < 0 ? "tab moves UP" : "trim neutral", { size: 11, fill: s.trim ? C.WARN : C.MUTED });
    // flap lever + motor
    const det = [[0, "UP"], [10, "10°"], [20, "20°"], [30, "FULL"]];
    const ly = (v) => 374 + (v / 30) * 76;
    b += P(o, "flapLever", "Flap lever", `<rect x="408" y="360" width="8" height="106" rx="4" fill="#10161d" stroke="${EDGE}"/><rect x="396" y="${f(ly(s.flap) - 9)}" width="32" height="18" rx="5" fill="${C.WARN}" stroke="#10161d" stroke-width="2"/>` +
      det.map(([v, t]) => L(436, ly(v) + 4, t, { size: 11, fill: s.flap === v ? C.INK : C.MUTED, anchor: "start", weight: s.flap === v ? 700 : 400 })).join("") + H(396, 356, 36, 116), [394, 356, 40, 116]);
    det.forEach(([v, t]) => { b += ctl("flap", v, "", "Flaps " + t, [436, ly(v) - 14, 40, 28]); });
    const pw = !!s.power;
    b += flow("M412 358 V352 H519 V372", C.WARN, 1.2, pw, 3);
    b += P(o, "flapMotor", "Flap motor", `<rect x="488" y="372" width="62" height="52" rx="8" fill="#26323f" stroke="${pw ? C.WARN : EDGE}" stroke-width="${pw ? 2 : 1.5}"/>` +
      `<circle cx="519" cy="394" r="11" fill="none" stroke="${pw ? C.WARN : C.MUTED}" stroke-width="2"/><path d="M515 394 h8 M519 390 v8" stroke="${pw ? C.WARN : C.MUTED}" stroke-width="2"/>` +
      L(519, 416, "electric", { size: 10 }) + H(488, 372, 62, 52), [488, 372, 62, 52], { dead: !pw });
    b += T(519, 442, pw ? "powered" : "NO POWER", { size: 11, fill: pw ? C.MUTED : C.BAD, weight: pw ? 400 : 800 });
    b += T(519, 458, act !== s.flap ? `flaps stuck at ${act}°` : `flaps ${act}°`, { size: 11, fill: act !== s.flap ? C.BAD : C.MUTED });
    // ---- ASI strip -------------------------------------------------------------------------------------------
    const X = (v) => 30 + (clamp(v, 40, 130) - 40) / 90 * 500;
    let st = `<rect x="30" y="532" width="500" height="14" rx="3" fill="#10161d" stroke="${EDGE}"/>`;
    st += `<rect x="30" y="532" width="${f(X(85) - 30)}" height="14" fill="#e8edf2" opacity=".85"/>`;
    st += `<line x1="${X(110)}" y1="526" x2="${X(110)}" y2="552" stroke="${C.WARN}" stroke-width="3"/>`;
    st += T(X(85), 564, "85", { size: 12, fill: C.INK, weight: 700 }) + T(X(110), 564, "110", { size: 12, fill: C.WARN, weight: 700 });
    st += T(30, 564, "40", { size: 11, anchor: "start" }) + T(530, 564, "130", { size: 11, anchor: "end" });
    st += L(30, 580, "white arc: flaps-extended range (to 85)", { size: 11, anchor: "start" }) + L(X(110), 580, "10° only (110)", { size: 11, fill: C.WARN });
    const px = f(X(s.ias));
    st += `<path d="M${px} 529 L${f(px - 7)} 516 L${f(px + 7)} 516 Z" fill="${m.overVfe ? C.BAD : C.INK}"/>` + T(px, 510, s.ias + " KIAS" + (m.overVfe ? " — OVER Vfe" : ""), { size: 12, fill: m.overVfe ? C.BAD : C.INK, weight: 700 });
    b += P(o, "asiArc", "Airspeed white arc", st + H(30, 500, 500, 86), [30, 504, 500, 82]);
    return wrap(560, 590, b, o);
  }

  // flap section: slotted flap hinged below the trailing edge
  function flapSection(s, m) {
    const x = 8, y = 200, act = m.flapPos, hx = x + 76, hy = y + 70;
    let g = `<rect x="${x}" y="${y}" width="132" height="124" rx="8" fill="#10161d" stroke="${EDGE}"/>` + L(x + 66, y + 16, "flap (side section)", { size: 11, fill: C.INK });
    g += `<path d="M${x + 6} ${hy} C${x + 6} ${hy - 22} ${x + 36} ${hy - 26} ${hx} ${hy - 12} L${hx} ${hy + 6} C${x + 36} ${hy + 14} ${x + 6} ${hy + 12} ${x + 6} ${hy} Z" fill="#3a4656" stroke="${C.INK}" stroke-opacity=".6"/>`;
    g += `<g transform="translate(${f(act / 30 * 3)} ${f(act / 30 * 3)}) rotate(${act} ${hx + 4} ${hy + 7})"><path d="M${hx + 1} ${hy - 5} L${hx + 44} ${hy + 4} L${hx + 44} ${hy + 8} L${hx + 1} ${hy + 10} Z" fill="${act ? C.SKY : STEEL2}" stroke="${C.INK}" stroke-opacity=".7"/></g>`;
    if (act) g += flow(`M${hx - 40} ${hy - 20} Q${hx} ${hy - 20} ${hx + 50} ${hy - 4 + act * 0.5}`, C.SKY, 0.8, true, 2) + flow(`M${hx - 30} ${hy + 10} Q${hx + 2} ${hy + 4} ${hx + 24} ${hy + 6 + act * 0.5}`, C.SKY, 0.8, true, 2);
    g += T(x + 66, y + 114, act ? `${act}° · slot open` : "flaps up", { size: 11, fill: act ? C.SKY : C.MUTED });
    return g;
  }
  function elevAngle(s) { return clamp(-s.pitch * 22 - s.trim * 8, -30, 30); }
  function elevSection(s, m) {
    const x = 148, y = 200, hx = x + 76, hy = y + 70, ang = elevAngle(s), tab = s.trim * 26, mv = ang ? C.SKY : STEEL2;
    let g = `<rect x="${x}" y="${y}" width="132" height="124" rx="8" fill="#10161d" stroke="${EDGE}"/>` + L(x + 66, y + 16, "elevator + trim tab", { size: 11, fill: C.INK });
    g += `<path d="M${x + 6} ${hy} C${x + 6} ${hy - 20} ${x + 36} ${hy - 22} ${hx} ${hy - 10} L${hx} ${hy + 4} C${x + 36} ${hy + 12} ${x + 6} ${hy + 10} ${x + 6} ${hy} Z" fill="#3a4656" stroke="${C.INK}" stroke-opacity=".6"/>`;
    g += `<g transform="rotate(${f(ang)} ${hx} ${hy - 3})"><path d="M${hx} ${hy - 10} L${hx + 40} ${hy - 3} L${hx + 40} ${hy} L${hx} ${hy + 4} Z" fill="${mv}" stroke="${C.INK}" stroke-opacity=".7"/>` +
      `<g transform="rotate(${tab} ${hx + 40} ${hy - 1})"><rect x="${hx + 40}" y="${hy - 3}" width="16" height="3" fill="${s.trim ? C.WARN : STEEL2}" stroke="${C.INK}" stroke-opacity=".7"/></g></g>`;
    g += `<circle cx="${hx}" cy="${hy - 3}" r="3" fill="${C.INK}"/>`;
    g += T(x + 66, y + 106, ang < -1 ? "elevator TE UP" : ang > 1 ? "elevator TE DOWN" : "neutral", { size: 11, fill: ang ? C.SKY : C.MUTED }) + T(x + 66, y + 118, s.trim ? (s.trim > 0 ? "tab DOWN" : "tab UP") : "tab neutral", { size: 11, fill: s.trim ? C.WARN : C.MUTED });
    return g;
  }

  SD.register("controls", {
    init: () => ({ roll: 0, pitch: 0, pedal: 0, trim: 0, flap: 0, flapAct: 0, ias: 90, power: true }),
    controls: [
      { key: "roll", label: "Yoke roll", type: "seg", opts: [[-1, "Left"], [0, "Level"], [1, "Right"]] },
      { key: "pitch", label: "Yoke pitch", type: "seg", opts: [[-1, "Push"], [0, "Neutral"], [1, "Pull"]] },
      { key: "pedal", label: "Rudder pedals", type: "seg", opts: [[-1, "Left"], [0, "Neutral"], [1, "Right"]] },
      { key: "trim", label: "Elevator trim", type: "seg", opts: [[-1, "Nose down"], [0, "Neutral"], [1, "Nose up"]] },
      { key: "flap", label: "Flap lever", type: "seg", opts: [[0, "UP"], [10, "10°"], [20, "20°"], [30, "FULL"]] },
      { key: "ias", label: "Airspeed", type: "range", min: 40, max: 130, step: 5, unit: " KIAS" },
      { key: "power", label: "Electrical power", type: "toggle" },
    ],
    parts: ["ailerons", "elevator", "rudder", "trimTab", "flaps", "flapMotor", "flapLever", "asiArc"],
    set: ctlSet, model: ctlModel, draw: controlsDraw,
  });


  /* ===========================================================================
     LANDING GEAR & BRAKES  (id "gear") — TOP view with the NOSE UP, so the
     pilot's left is on the left. pedal -1 = left pedal; brakeL / brakeR are
     the toe brakes. load: "air" | "static" | "hard" (oleo / spring steel).
     =========================================================================== */
  function gearModel(s) {
    const net = s.pedal + (s.brakeL ? -1 : 0) + (s.brakeR ? 1 : 0);
    const same = s.pedal < 0 ? s.brakeL && !s.brakeR : s.pedal > 0 ? s.brakeR && !s.brakeL : false;
    const turn = net < 0 ? "left" : net > 0 ? "right" : "straight";
    const steer = s.pedal < 0 ? "left" : s.pedal > 0 ? "right" : "straight";
    const braking = s.brakeL && s.brakeR ? "both" : s.brakeL ? "left" : s.brakeR ? "right" : "none";
    const tight = !!(s.pedal && same);
    const bits = [];
    if (tight) bits.push(`<b>${steer === "left" ? "Left" : "Right"} pedal plus ${steer} toe brake</b>: the nosewheel steers ${steer} and the ${steer} main drags &mdash; the tightest ${steer} turn.`);
    else {
      if (s.pedal) bits.push(`${s.pedal < 0 ? "Left" : "Right"} pedal: the rudder pedals steer the nosewheel ${steer}.`);
      if (braking === "both") bits.push("<b>Both toe brakes</b>: both main wheels slow together.");
      else if (braking !== "none") bits.push(`<b>${braking[0].toUpperCase() + braking.slice(1)} brake only</b>: the ${braking} main wheel slows and the airplane pivots ${braking}.`);
    }
    if (s.load === "hard") bits.push("<b>Hard landing</b>: the oleo compresses, oil is forced through the orifice, and the spring-steel legs flex.");
    else if (s.load === "air") bits.push("In the air the oleo strut is fully extended and the spring steel is unloaded.");
    if (!bits.length) bits.push("Pedals neutral, brakes off: the airplane rolls straight. Press a pedal or a toe brake.");
    return { turn, steer, braking, tight, strut: s.load === "air" ? "extended" : s.load === "hard" ? "compressed" : "static", msg: bits.join(" ") };
  }

  function gearDraw(s, o) {
    o = o || {};
    const m = gearModel(s), CX = 185;
    const steerDeg = s.pedal ? s.pedal * (m.tight ? 26 : 13) : 0;
    let b = "";
    // ---- ghosted airframe (top view, nose up) ---------------------------------------------------
    b += `<rect x="12" y="156" width="346" height="80" rx="6" fill="none" stroke="${EDGE}" stroke-dasharray="6 5"/>` + T(70, 170, "wing (high wing, ghosted)", { size: 10 });
    b += `<path d="M160 36 Q160 22 185 22 Q210 22 210 36 V126 H220 V300 L196 440 H174 L150 300 V126 H160 Z" fill="#1a222c" stroke="${EDGE}"/>`;
    b += `<rect x="150" y="126" width="70" height="3" fill="${EDGE}"/>`;
    b += T(185, 14, "▲ nose", { size: 11, fill: C.SKY });
    b += T(14, 108, "pilot's", { size: 10, anchor: "start" }) + T(14, 120, "left", { size: 10, anchor: "start" });
    // ---- path on the ramp ----------------------------------------------------------------------------------
    const pathD = m.turn === "straight" ? "M185 480 V380" : m.turn === "left" ? (m.tight ? "M185 480 Q185 420 120 410" : "M185 480 Q185 410 140 385") : (m.tight ? "M185 480 Q185 420 250 410" : "M185 480 Q185 410 230 385");
    b += flow(pathD, C.OK, 1.2, !!(s.pedal || s.brakeL || s.brakeR), 4) + T(185, 498, m.turn === "straight" ? "rolls straight" : `turns ${m.turn}${m.tight ? " (tight)" : ""}`, { size: 12, fill: C.OK, weight: 700 });
    // ---- steering linkage + hydraulic brake lines --------------------------------------------------------------------
    b += `<path d="M185 150 V104" stroke="${s.pedal ? C.SKY : EDGE}" stroke-width="3" stroke-dasharray="5 4"/>`;
    b += flow("M169 190 V262 Q169 280 104 292", C.BAD, 0.9, !!s.brakeL, 3) + flow("M201 190 V262 Q201 280 266 292", C.BAD, 0.9, !!s.brakeR, 3);
    // ---- nose gear -------------------------------------------------------------------------------------------------------------
    const PV = [CX, 92];
    const nose = `<g transform="rotate(${steerDeg} ${PV[0]} ${PV[1]})"><rect x="${CX - 7}" y="${PV[1] + 8}" width="14" height="42" rx="3" fill="#2a3340" stroke="#8795a1" stroke-width="2"/>` +
      `<path d="M${CX - 6} ${PV[1]} L${CX - 7} ${PV[1] + 22} M${CX + 6} ${PV[1]} L${CX + 7} ${PV[1] + 22}" stroke="#8795a1" stroke-width="3"/>` +
      (s.pedal ? `<path d="M${CX} ${PV[1] - 4} V${PV[1] - 20}" stroke="${C.SKY}" stroke-width="3"/><path d="M${CX - 6} ${PV[1] - 18} L${CX} ${PV[1] - 30} L${CX + 6} ${PV[1] - 18} Z" fill="${C.SKY}"/>` : "") + `</g>`;
    b += P(o, "noseStrut", "Nose strut", `<circle cx="${PV[0]}" cy="${PV[1]}" r="9" fill="#59636f" stroke="${C.INK}" stroke-opacity=".6"/>` + nose + L(CX - 18, PV[1] - 8, "nose strut", { size: 11, anchor: "end" }) + L(CX - 18, PV[1] + 5, "(oleo)", { size: 10, anchor: "end" }) +
      H(CX - 14, PV[1] - 14, 28, 28) + H(CX - 16, PV[1] + 22, 32, 40) + noseOleo(s, m, o) + H(412, 22, 130, 196), [[CX - 14, PV[1] - 14, 28, 28], [CX - 16, PV[1] + 22, 32, 40], [412, 22, 130, 196]]);
    b += P(o, "damper", "Shimmy damper", `<g transform="rotate(${steerDeg} ${PV[0]} ${PV[1]})"><path d="M${CX + 16} ${PV[1] + 4} L${CX + 8} ${PV[1] + 26}" stroke="${C.WARN}" stroke-width="6" stroke-linecap="round"/></g>` + L(CX + 36, PV[1] + 18, "shimmy damper", { size: 11, anchor: "start" }) + H(CX + 10, PV[1] + 2, 28, 34), [CX + 10, PV[1] + 2, 28, 34]);
    // ---- main gear (spring steel) and brakes -------------------------------------------------------------------------------------
    const flex = s.load === "hard" ? 10 : 0;
    const leg = (side) => { const sx = side * 1, x0 = CX + sx * 26, x1 = CX + sx * 100; return `<path d="M${x0} 268 Q${CX + sx * 76} ${258 - flex} ${x1} ${292}" fill="none" stroke="${STEEL2}" stroke-width="10" stroke-linecap="round"/>`; };
    const wheel = (side) => `<rect x="${CX + side * 100 - 8}" y="270" width="16" height="44" rx="4" fill="#10161d" stroke="#8795a1" stroke-width="2"/>`;
    b += P(o, "mains", "Main gear", leg(-1) + leg(1) + wheel(-1) + wheel(1) + L(CX, 334, "main gear: tubular spring steel", { size: 11 }) + H(CX - 92, 254, 62, 40) + H(CX + 30, 254, 62, 40) + H(CX - 114, 270, 28, 46) + H(CX + 86, 270, 28, 46) + mainSide(s, m, o) + H(412, 240, 130, 200),
      [[CX - 92, 254, 62, 40], [CX + 30, 254, 62, 40], [CX - 114, 270, 28, 46], [CX + 86, 270, 28, 46], [412, 240, 130, 200]]);
    const disc = (side, on) => `<rect x="${CX + side * 100 - (side < 0 ? -9 : 17)}" y="282" width="8" height="22" rx="2" fill="${on ? C.BAD : "#8795a1"}" stroke="#c8d0d8"/>${on ? `<circle cx="${CX + side * 100 + (side < 0 ? 13 : -13)}" cy="293" r="14" fill="${C.BAD}" fill-opacity=".3"/>` : ""}`;
    b += P(o, "brakes", "Disc brakes", disc(-1, s.brakeL) + disc(1, s.brakeR) + L(CX - 100, 330, "L brake", { size: 10 }) + L(CX + 100, 330, "R brake", { size: 10 }) + H(CX - 96, 280, 28, 28) + H(CX + 70, 280, 28, 28) + sideBrake(s, o), [[CX - 96, 280, 28, 28], [CX + 70, 280, 28, 28], [470, 380, 60, 56]]);
    // ---- pedals + parking brake ---------------------------------------------------------------------------------------------------------
    const ped = (x, v, on) => `<rect x="${x}" y="${on ? 142 : 150}" width="24" height="38" rx="4" fill="#3a4656" stroke="${on ? C.SKY : EDGE}" stroke-width="2"/><rect x="${x + 2}" y="${on ? 142 : 150}" width="20" height="11" rx="3" fill="${v ? C.BAD : "#59636f"}"/>`;
    b += P(o, "pedals", "Rudder pedals", ped(157, s.brakeL, s.pedal < 0) + ped(189, s.brakeR, s.pedal > 0) + L(CX, 198, "rudder pedals", { size: 10 }) + H(155, 142, 28, 46) + H(187, 142, 28, 46), [[155, 142, 28, 46], [187, 142, 28, 46]]);
    b += P(o, "parkBrake", "Parking brake", `<rect x="164" y="214" width="3" height="12" fill="#8795a1"/><rect x="157" y="210" width="17" height="6" rx="2" fill="${C.WARN}"/>` + L(150, 224, "park brake", { size: 10, anchor: "end" }) + H(152, 206, 28, 28), [152, 206, 28, 28]);
    // ---- pedal chips (in-SVG) ------------------------------------------------------------------------------------------------------
    [[-1, "Left pedal", 352], [0, "Neutral", 384], [1, "Right pedal", 416]].forEach(([v, t, y]) => {
      const on = s.pedal === v;
      b += ctl("pedal", v, `<rect x="8" y="${y}" width="100" height="26" rx="13" fill="${on ? "#10263a" : "#1b2530"}" stroke="${on ? C.SKY : EDGE}" stroke-width="1.5"/>` + text(58, y + 17, t, { size: 11, fill: on ? C.SKY : C.INK, lbl: false }), "Pedals: " + t, [8, y, 100, 26]);
    });
    return wrap(560, 506, b, o);
  }

  // nose oleo cutaway (right column, top)
  function noseOleo(s, m, o) {
    const ext = s.load === "air" ? 46 : s.load === "hard" ? 6 : 26, x = 440;
    const airH = s.load === "air" ? 40 : s.load === "hard" ? 18 : 28, hy = 112 - (46 - ext) * 0.9;
    let g = `<rect x="412" y="22" width="130" height="196" rx="8" fill="#10161d" stroke="${EDGE}"/>` + L(477, 38, "nose strut (cutaway)", { size: 11, fill: C.INK });
    g += `<rect x="${x}" y="50" width="48" height="66" rx="4" fill="#26323f" stroke="#8795a1" stroke-width="2"/>`;
    g += `<rect x="${x + 3}" y="53" width="42" height="${airH}" fill="${C.SKY}" fill-opacity=".35"/><rect x="${x + 3}" y="${53 + airH}" width="42" height="${60 - airH}" fill="${C.WARN}" fill-opacity=".45"/>`;
    g += T(x + 54, 66, "air", { size: 10, fill: C.SKY, anchor: "start" }) + T(x + 54, 53 + airH + 14, "oil", { size: 10, fill: C.WARN, anchor: "start" });
    g += `<rect x="${x + 14}" y="${hy - 6}" width="20" height="${f(112 - hy + ext + 22)}" fill="#6b7a8a" stroke="#c8d0d8"/>`;
    g += `<rect x="${x + 8}" y="${hy - 8}" width="32" height="6" fill="#c8d0d8"/><circle cx="${x + 24}" cy="${hy - 5}" r="2.2" fill="#10161d"/>`;
    if (s.load === "hard") g += flow(`M${x + 24} ${hy - 20} V${hy + 10}`, C.WARN, 0.6, true, 3);
    const fy = 116 + ext + 22;
    g += `<rect x="${x + 4}" y="${fy}" width="40" height="8" rx="2" fill="#59636f"/><rect x="${x + 14}" y="${fy + 8}" width="20" height="34" rx="6" fill="#10161d" stroke="#8795a1" stroke-width="2"/>`;
    g += `<path d="M${x + 44} ${fy - 2} L${x + 54} ${fy + 14}" stroke="${C.WARN}" stroke-width="5" stroke-linecap="round"/>`;
    g += L(x + 62, fy + 8, "damper", { size: 10, anchor: "start" });
    g += T(477, 212, s.load === "air" ? "extended (in the air)" : s.load === "hard" ? "compressed (hard landing)" : "static load", { size: 11 });
    return g;
  }
  // main gear side view (right column, bottom)
  function mainSide(s, m, o) {
    const dy = s.load === "hard" ? -14 : s.load === "air" ? 8 : 0, bend = s.load === "hard" ? 14 : s.load === "air" ? -4 : 4;
    let g = `<rect x="412" y="240" width="130" height="200" rx="8" fill="#10161d" stroke="${EDGE}"/>` + L(477, 256, "main gear (side view)", { size: 11, fill: C.INK });
    g += `<rect x="418" y="270" width="52" height="20" rx="4" fill="#26323f" stroke="${EDGE}"/>` + T(444, 284, "fuselage", { size: 10 });
    g += `<path d="M446 290 Q${470 + bend} ${330 + dy} ${492} ${380 + dy}" fill="none" stroke="${STEEL2}" stroke-width="9" stroke-linecap="round"/>`;
    g += `<circle cx="496" cy="${396 + dy}" r="20" fill="#10161d" stroke="#8795a1" stroke-width="3"/><circle cx="496" cy="${396 + dy}" r="6" fill="#59636f"/>`;
    g += `<line x1="410" y1="${416}" x2="544" y2="${416}" stroke="${EDGE}" stroke-dasharray="4 4"/>` + T(477, 434, s.load === "hard" ? "legs flex, then spring back" : "spring steel is the shock absorber", { size: 10 });
    return g;
  }
  function sideBrake(s, o) {
    const dy = s.load === "hard" ? -14 : s.load === "air" ? 8 : 0, on = s.brakeL || s.brakeR;
    return `<rect x="486" y="${382 + dy}" width="12" height="28" rx="2" fill="${on ? C.BAD : "#8795a1"}" stroke="#c8d0d8"/>` + L(520, 398 + dy, "brake", { size: 10, anchor: "start" });
  }

  SD.register("gear", {
    init: () => ({ brakeL: false, brakeR: false, pedal: 0, load: "static" }),
    controls: [
      { key: "pedal", label: "Rudder pedal", type: "seg", opts: [[-1, "Left"], [0, "Neutral"], [1, "Right"]] },
      { key: "brakeL", label: "Left toe brake", type: "toggle" },
      { key: "brakeR", label: "Right toe brake", type: "toggle" },
      { key: "load", label: "Strut loading", type: "seg", opts: [["air", "In the air"], ["static", "On the ramp"], ["hard", "Hard landing"]] },
    ],
    parts: ["noseStrut", "damper", "mains", "brakes", "pedals", "parkBrake"],
    model: gearModel, draw: gearDraw,
  });

  /* ===========================================================================
     CABIN HEAT & STALL WARNING  (id "environ")
     heat / air = the two knobs pulled; crack = a cracked muffler; master =
     the battery master (changes nothing for the horn); aoa = illustrative
     angle of attack, the horn sounds from HORN_AOA, critical at Diagrams.CRIT.
     =========================================================================== */
  const HORN_AOA = 10;
  function environModel(s) {
    const co = !!(s.heat && s.crack), horn = s.aoa >= HORN_AOA, stalled = s.aoa > CRIT;
    const bits = [];
    if (co) bits.push("<b>Carbon monoxide</b>: the heat is on and the muffler is cracked, so exhaust gas rides the warmed air into the cabin. Heat OFF, air and vents OPEN, then land.");
    else if (s.crack) bits.push("The muffler is cracked, but with the heat off no exhaust reaches the cabin." + (s.air ? "" : " Open the cabin air anyway."));
    else if (s.heat) bits.push("Heat on: outside air is warmed around the muffler shroud and ducted to the cabin.");
    else bits.push(s.air ? "Heat off, fresh outside air to the vents." : "Heat and air both closed: nothing is ventilating the cabin.");
    bits.push(stalled ? "<b>Beyond the critical AOA: stalled</b>" + (horn ? ", and the horn is sounding." : ".") : horn ? "<b>Stall horn sounding</b>: the inlet pressure change pulls air through the reed &mdash; no electrical power involved." : "Stall horn quiet: the angle of attack is still well below the warning.");
    if (!s.master && horn) bits.push("Master is off, and the horn still sounds.");
    return { co, horn, stalled, cabinHeat: !!s.heat, cabinAir: !!s.air, msg: bits.join(" ") };
  }

  // little dots riding a path (SMIL animateMotion; static when motion is reduced)
  function dotsOn(d, n, color, r, dur) {
    let g = "";
    for (let i = 0; i < n; i++) {
      g += `<circle r="${r}" fill="${color}" fill-opacity=".9">` + (K.reduced ? "" : `<animateMotion dur="${dur}s" repeatCount="indefinite" begin="-${f(i * dur / n)}s" path="${d}"/>`) + `</circle>`;
    }
    return g;
  }

  function environDraw(s, o) {
    o = o || {};
    const m = environModel(s);
    let b = "";
    // ---- cabin heat ----------------------------------------------------------------------------------------
    b += T(120, 14, "ENGINE COMPARTMENT", { size: 10 }) + T(408, 14, "CABIN", { size: 10 });
    b += `<rect x="262" y="24" width="288" height="270" rx="14" fill="#141b23" stroke="${EDGE}" stroke-width="2"/>`;
    b += `<rect x="254" y="24" width="8" height="270" fill="#3a4656"/>` + T(258, 308, "firewall", { size: 10 });
    // ram air inlet + the two air paths
    b += flow("M0 112 H14", C.SKY, 0.8, true, 5) + L(34, 104, "ram air", { size: 11, anchor: "start", fill: C.SKY });
    const freshLive = !!s.air, heatLive = !!s.heat;
    b += flow("M14 112 V80 H262 H390", C.SKY, 1.3, freshLive, 4) + flow("M330 80 V96 M390 80 V96", C.SKY, 1.3, freshLive, 4);
    b += flow("M14 112 V182 H46", C.SKY, 1.3, true, 4);
    // muffler + shroud
    let sh = `<rect x="36" y="170" width="170" height="66" rx="10" fill="#2a2018" stroke="${C.WARN}" stroke-width="2" stroke-dasharray="6 4"/>`;
    sh += `<rect x="58" y="192" width="126" height="22" rx="6" fill="#4a2a22" stroke="#9a5a44" stroke-width="2"/>`;
    sh += `<path d="M10 203 H58" stroke="#9a5a44" stroke-width="8"/><path d="M184 203 H214" stroke="#9a5a44" stroke-width="8"/>`;
    sh += flow("M46 182 H196", C.WARN, 1.2, heatLive, 4);
    if (s.crack) sh += `<path d="M118 192 l6 8 l-6 6 l8 8" fill="none" stroke="${C.BAD}" stroke-width="2.5"/>`;
    sh += L(121, 252, "muffler + heat shroud", { size: 11, fill: C.INK }) + L(214, 224, "exhaust", { size: 10, anchor: "start" });
    b += P(o, "shroud", "Muffler heat shroud", sh + H(36, 170, 170, 66), [36, 170, 170, 66]);
    // warm duct through the firewall, heat valve
    b += flow("M196 182 H232 V150 H262 H310 V262", C.WARN, 1.3, heatLive, 4);
    b += `<path d="M254 144 V156" stroke="${heatLive ? C.WARN : C.BAD}" stroke-width="6"/>` + T(238, 136, "heat valve", { size: 10 });
    b += `<path d="M254 74 V86" stroke="${freshLive ? C.SKY : C.BAD}" stroke-width="6"/>` + T(238, 66, "air valve", { size: 10 });
    // vents + floor outlet
    const vent = (x) => `<rect x="${x - 16}" y="96" width="32" height="12" rx="4" fill="#26323f" stroke="${freshLive ? C.SKY : EDGE}" stroke-width="2"/><path d="M${x - 10} 100 H${x + 10} M${x - 10} 104 H${x + 10}" stroke="${EDGE}"/>`;
    b += P(o, "vents", "Cabin vents", vent(330) + vent(390) + L(360, 126, "cabin vents", { size: 11 }) + H(314, 92, 36, 24) + H(374, 92, 36, 24), [[314, 92, 36, 24], [374, 92, 36, 24]]);
    b += `<rect x="298" y="262" width="26" height="8" rx="3" fill="#26323f" stroke="${heatLive ? C.WARN : EDGE}" stroke-width="2"/>` + L(311, 286, "heat outlet", { size: 10 });
    // CO dots: leak at the crack, then along the warm duct into the cabin
    if (m.co) {
      b += dotsOn("M121 198 V182 H232 V150 H310 V262", 5, C.BAD, 3.5, 5);
      let cabin = "";
      [[340, 160], [380, 200], [420, 140], [352, 232], [410, 120], [320, 190]].forEach(([x, y], i) => {
        cabin += `<circle cx="${x}" cy="${y}" r="9" fill="${C.BAD}" fill-opacity=".28" stroke="${C.BAD}" stroke-opacity=".8"/>` +
          text(x, y + 3.5, "CO", { size: 9, fill: C.INK, weight: 700, lbl: false }) +
          (K.reduced ? "" : `<animateTransform attributeName="transform" type="translate" values="0 0;${i % 2 ? 5 : -5} -8;0 0" dur="${3 + i * 0.4}s" repeatCount="indefinite"/>`);
        cabin = `<g>${cabin}</g>`;
      });
      b += cabin.replace(/<\/g><g>/g, "");
      b += `<rect x="290" y="36" width="232" height="22" rx="6" fill="${C.BAD}" fill-opacity=".2" stroke="${C.BAD}"/>` + T(406, 52, "CARBON MONOXIDE IN THE CABIN", { size: 12, fill: C.BAD, weight: 800 });
    }
    // knobs
    const knob = (x, id, label, on, color) => P(o, id, label,
      `<rect x="${x - 3}" y="${on ? 230 : 246}" width="6" height="${on ? 28 : 12}" fill="#8795a1"/><circle cx="${x}" cy="${on ? 222 : 242}" r="13" fill="${on ? color : "#3a4656"}" stroke="${C.INK}" stroke-opacity=".7" stroke-width="2"/>` +
      L(x, 280, id === "heatKnob" ? "cabin heat" : "cabin air", { size: 11 }) + T(x, (on ? 222 : 242) + 4, on ? "ON" : "OFF", { size: 9, fill: on ? "#10161d" : C.INK, weight: 700 }) + H(x - 16, 206, 32, 52), [x - 16, 206, 32, 52]);
    b += `<rect x="410" y="248" width="124" height="38" rx="6" fill="none"/>`;
    b += knob(420, "heatKnob", "Cabin heat knob", !!s.heat, C.WARN) + knob(500, "airKnob", "Cabin air knob", !!s.air, C.SKY);
    // ---- stall warning ---------------------------------------------------------------------------------------
    b += `<line x1="0" y1="316" x2="560" y2="316" stroke="${EDGE}" stroke-dasharray="3 5"/>`;
    // AOA bar
    const X = (a) => 30 + clamp(a, 0, 22) / 22 * 500;
    b += T(280, 338, "angle of attack (illustrative)", { size: 11, fill: C.INK });
    b += `<rect x="30" y="348" width="${f(X(HORN_AOA) - 30)}" height="10" fill="${C.OK}" opacity=".8"/><rect x="${f(X(HORN_AOA))}" y="348" width="${f(X(CRIT) - X(HORN_AOA))}" height="10" fill="${C.WARN}" opacity=".85"/><rect x="${f(X(CRIT))}" y="348" width="${f(X(22) - X(CRIT))}" height="10" fill="${C.BAD}" opacity=".85"/>`;
    b += T(X(HORN_AOA / 2), 392, "no warning", { size: 11 }) + T((X(HORN_AOA) + X(CRIT)) / 2, 392, "horn sounds", { size: 11, fill: C.WARN }) + T((X(CRIT) + X(22)) / 2, 392, "stalled", { size: 11, fill: C.BAD });
    b += `<path d="M${f(X(s.aoa) - 7)} 372 L${f(X(s.aoa) + 7)} 372 L${f(X(s.aoa))} 361 Z" fill="${C.INK}"/>`;
    // wing section, nose to the left, rotated by AOA about the quarter chord
    const WC = [236, 456], rot = (lx, ly) => [f(WC[0] + lx * Math.cos(rad(s.aoa)) - ly * Math.sin(rad(s.aoa))), f(WC[1] + lx * Math.sin(rad(s.aoa)) + ly * Math.cos(rad(s.aoa)))];
    let w = "";
    for (let i = 0; i < 4; i++) { const y = WC[1] - 40 + i * 28; w += flow(`M0 ${y} Q40 ${y} ${WC[0] - 20} ${y - (i < 2 ? 6 + s.aoa * 0.4 : -3)} T${WC[0] + 190} ${y + 4}`, C.SKY, 1.2, true, 2); }
    b += w;
    const stallTint = s.aoa > CRIT ? `<path d="M-60 -14 Q0 -26 80 -8 L95 4 Q10 -6 -60 -14 Z" fill="${C.BAD}" fill-opacity=".35"/>` : "";
    b += `<g transform="rotate(${s.aoa} ${WC[0]} ${WC[1]})"><path d="M${WC[0] - 100} ${WC[1]} C${WC[0] - 100} ${WC[1] - 18} ${WC[0] - 50} ${WC[1] - 26} ${WC[0] + 10} ${WC[1] - 22} C${WC[0] + 70} ${WC[1] - 18} ${WC[0] + 96} ${WC[1] - 4} ${WC[0] + 104} ${WC[1] + 2} C${WC[0] + 60} ${WC[1] + 6} ${WC[0] - 10} ${WC[1] + 9} ${WC[0] - 100} ${WC[1]} Z" fill="#3a4656" stroke="${C.INK}" stroke-opacity=".7" stroke-width="1.5"/>` +
      `<g transform="translate(${WC[0]} ${WC[1]})">${stallTint}</g>` +
      `<path d="M${WC[0] - 92} ${WC[1] + 4} Q${WC[0] - 40} ${WC[1] + 14} ${WC[0] + 30} ${WC[1] + 4}" fill="none" stroke="${m.horn ? C.WARN : EDGE}" stroke-width="3" stroke-dasharray="${m.horn ? "6 4" : "2 4"}"/></g>`;
    // stagnation point slides back along the underside as AOA climbs; the inlet sits on the leading edge
    const inl = rot(-92, 5), sp = rot(-100 + s.aoa * 1.6, 4 + s.aoa * 0.4);
    const inletG = `<circle cx="${inl[0]}" cy="${inl[1]}" r="6" fill="${m.horn ? C.WARN : DARK}" stroke="${m.horn ? C.WARN : C.INK}" stroke-width="2"/>` + (m.horn ? flow(`M${inl[0] + 4} ${inl[1] + 12} V${inl[1] + 2}`, C.WARN, 0.6, true, 3) : "");
    b += P(o, "inlet", "Stall warning inlet", inletG + L(inl[0] - 14, inl[1] + 4, "stall inlet", { anchor: "end" }) + L(inl[0] - 14, inl[1] + 17, "left wing LE", { anchor: "end" }) + H(inl[0] - 14, inl[1] - 14, 28, 28), [inl[0] - 14, inl[1] - 14, 28, 28]);
    b += `<circle cx="${sp[0]}" cy="${sp[1]}" r="3.5" fill="${C.INK}"/>` + T(16, 496, "● white dot: stagnation point, where the airflow splits", { size: 10, anchor: "start" });
    // pipe to the horn and the horn
    const hx = 370, hy = 440;
    const ex = rot(40, 6);
    b += `<path d="M${inl[0]} ${inl[1]} Q${inl[0] + 40} ${inl[1] + 10} ${ex[0]} ${ex[1]} L${hx} ${hy + 22}" fill="none" stroke="${m.horn ? C.WARN : "#52606f"}" stroke-width="3" stroke-dasharray="${m.horn ? "6 4" : "none"}"/>`;
    let horn = `<rect x="${hx}" y="${hy}" width="86" height="44" rx="8" fill="#26323f" stroke="${m.horn ? C.WARN : EDGE}" stroke-width="${m.horn ? 3 : 1.5}"/><path d="M${hx + 14} ${hy + 22} H${hx + 36} L${hx + 52} ${hy + 10} V${hy + 34} L${hx + 36} ${hy + 22}" fill="${m.horn ? C.WARN : "#59636f"}"/>`;
    if (m.horn) horn += [0, 1, 2].map((i) => `<path d="M${hx + 58 + i * 8} ${hy + 12 - i * 3} Q${hx + 66 + i * 8} ${hy + 22} ${hx + 58 + i * 8} ${hy + 32 + i * 3}" fill="none" stroke="${C.WARN}" stroke-width="2.5"/>`).join("");
    horn += L(hx + 43, hy + 58, "stall horn (reed)", { size: 11 });
    b += P(o, "horn", "Stall horn", horn + H(hx, hy, 86, 44), [hx, hy, 86, 44]);
    b += T(hx + 43, hy - 8, m.horn ? "SOUNDING" : "quiet", { size: 12, fill: m.horn ? C.WARN : C.MUTED, weight: 800 });
    // master switch with no connection
    const mx = 486;
    b += `<rect x="${mx}" y="440" width="64" height="44" rx="6" fill="#26323f" stroke="${EDGE}"/>` + L(mx + 32, 456, "MASTER", { size: 10 }) + `<rect x="${mx + 17}" y="462" width="30" height="14" rx="3" fill="${s.master ? C.OK : "#3a4656"}"/>` + T(mx + 32, 473, s.master ? "ON" : "OFF", { size: 10, fill: "#10161d", weight: 800 });
    b += `<path d="M${mx} 462 H${hx + 86}" stroke="${EDGE}" stroke-dasharray="3 4"/>` + T((mx + hx + 86) / 2, 456, "✕", { size: 14, fill: C.BAD, weight: 800 }) + T(mx + 32, 500, "no electrical link", { size: 11 });
    return wrap(560, 508, b, o);
  }

  SD.register("environ", {
    init: () => ({ heat: false, air: true, crack: false, master: true, aoa: 4 }),
    controls: [
      { key: "heat", label: "Cabin heat", type: "toggle" },
      { key: "air", label: "Cabin air", type: "toggle" },
      { key: "crack", label: "Muffler cracked", type: "toggle" },
      { key: "master", label: "Master switch", type: "toggle" },
      { key: "aoa", label: "Angle of attack", type: "range", min: 0, max: 22, step: 1, unit: "°" },
    ],
    parts: ["shroud", "heatKnob", "airKnob", "vents", "inlet", "horn"],
    model: environModel, draw: environDraw,
  });

})();
