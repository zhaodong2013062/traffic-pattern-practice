/* ============================================================================
   sysdiag-a.js  —  fuel, electrical, ignition and oil labs.

   Registered on SysDiagrams (see sysdiag-core.js). Every def is pure: init()
   → state, model(state) → flat derived keys + a one-line `msg`, draw(state,
   opts) → SVG string. In-SVG hardware (selector handle, key, split master
   rocker …) is a `<g class="sx-ctl" data-ctl data-val>` kept OUTSIDE the part
   <g>s, so a click on the hardware operates it while a click on the housing
   selects the part. Toggle controls emit data-val="true"/"false".

   Pilot's left = left: every view is from behind the airplane.
   Schematics are illustrative, not to scale.
   ========================================================================== */
(() => {
  if (typeof SysDiagrams === "undefined") return;
  const { C, svg, text, uid, part, mk, flow, reduced, esc } = SysDiagrams.kit;

  const PANEL = "#232a34", DARK = "#161b22";
  const OIL = "#e0a030";
  const L_MAG = C.SKY, R_MAG = C.WARN;   // left mag blue, right mag amber
  const T = (x, y, s, o) => text(x, y, s, o);
  const small = (x, y, s, o = {}) => text(x, y, s, { size: 10, fill: C.MUTED, ...o });
  const note = (x, y, s, o = {}) => text(x, y, s, { size: 11, fill: C.MUTED, lbl: false, ...o });
  const R = (x, y, w, h, o = {}) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 7}" fill="${o.fill || PANEL}" ` +
    `stroke="${o.stroke || C.LINE}" stroke-width="${o.sw || 1.5}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;
  const line = (d, color, w = 3, o = {}) =>
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;
  const wrap = (body, w, h, labels) => svg(w, h, body, labels === false ? "sx-nolabels" : "");
  // In-SVG control pill. `ctl` & `val` are the data-ctl/data-val pair.
  const pill = (ctl, val, x, y, w, h, label, on, o = {}) =>
    `<g class="sx-ctl" data-ctl="${ctl}" data-val="${esc(val)}" tabindex="0" role="button" aria-label="${esc(o.aria || label)}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${on ? (o.onFill || C.SKY) : DARK}" ` +
    `stroke="${on ? (o.onFill || C.SKY) : (o.stroke || C.LINE)}" stroke-width="1.5"/>` +
    T(x + w / 2, y + h / 2 + 4, label, { size: o.size || 11, weight: 700, fill: on ? "#0b1218" : (o.ink || C.INK), lbl: false }) +
    `<rect x="${x}" y="${y - Math.max(0, (28 - h) / 2)}" width="${w}" height="${Math.max(h, 28)}" fill="transparent"/></g>`;
  const P = (opts) => (id, label, inner, hit, dead) => part(id, label, inner, { ...mk(opts, id), hit, dead });
  const gaugeArc = (cx, cy, r, a0, a1, color, w = 5) => {
    const p = (a) => [cx + r * Math.sin(a * Math.PI / 180), cy - r * Math.cos(a * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
  };
  const needle = (cx, cy, r, a, color = C.INK, anim = "") =>
    `<g transform="translate(${cx},${cy}) rotate(${a})"><line x1="0" y1="0" x2="0" y2="${-r}" stroke="${color}" stroke-width="3" stroke-linecap="round">${anim}</line><circle r="4" fill="${color}"/></g>`;

  /* ============================== FUEL ============================== */
  const FCHAIN = ["selector", "reservoir", "auxPump", "shutoff", "strainer", "enginePump", "servo", "divider", "nozzles"];
  const FCY = { selector: 150, reservoir: 202, auxPump: 240, shutoff: 278, strainer: 316, enginePump: 354, servo: 392, divider: 430, nozzles: 462 };

  function fuelModel(s) {
    const feeding = s.sel === "LEFT" ? ["L"] : s.sel === "RIGHT" ? ["R"] : ["L", "R"];
    let reach = "selector";
    const walk = ["reservoir", "auxPump", "shutoff", "strainer", "enginePump", "servo", "divider", "nozzles"];
    for (const p of walk) {
      reach = p;
      if (p === "shutoff" && s.shutoff === "off") break;
      if (p === "enginePump" && s.epump === "fail" && !s.aux) break;
    }
    const fed = reach === "nozzles";
    const pressure = !fed ? "none" : s.epump === "fail" ? "aux" : "engine";
    const tanks = s.sel === "BOTH" ? "BOTH tanks" : s.sel === "LEFT" ? "the LEFT tank only" : "the RIGHT tank only";
    let msg;
    if (s.shutoff === "off") msg = "Fuel shutoff pulled — fuel stops at the shutoff valve and nothing reaches the engine. It is the last thing in the cabin that can cut the fuel.";
    else if (!fed) msg = "Engine-driven pump failed and the aux pump is off — fuel stops at the pump, so the engine starves. Turn the electric aux pump ON.";
    else if (pressure === "aux") msg = `Feeding from ${tanks} — the electric aux pump is supplying all the pressure (engine-driven pump failed).`;
    else msg = `Feeding from ${tanks} — engine-driven pump supplying pressure${s.aux ? "; aux pump boosting too" : ""}.`;
    return { feeding, reach, fed, pressure, msg };
  }

  function fuelDraw(s, opts = {}) {
    const m = fuelModel(s), p = P(opts);
    const tr = opts.trace && opts.trace.length ? opts.trace : null;
    const reachIdx = tr ? Math.max(-1, ...tr.map((x) => FCHAIN.indexOf(x))) : FCHAIN.indexOf(m.reach);
    const liveL = tr ? tr.includes("tankL") || (tr.includes("selector") && m.feeding.includes("L")) : m.feeding.includes("L");
    const liveR = tr ? tr.includes("tankR") || (tr.includes("selector") && m.feeding.includes("R")) : m.feeding.includes("R");
    const pumpedFrom = tr ? 5 : s.aux ? 2 : 5;
    let b = "";

    // pipes first, so the boxes sit on top
    const lvl = { L: 0.55, R: 0.7 };
    b += flow("M175,92 V150 H276", C.SKY, 1.4, liveL) + flow("M385,92 V150 H324", C.SKY, 1.4, liveR);
    for (let i = 0; i < 7; i++) {
      const live = reachIdx >= i + 1, pumped = i >= pumpedFrom;
      b += flow(`M300,${FCY[FCHAIN[i]]} V${FCY[FCHAIN[i + 1]]}`, pumped ? C.YEL : C.SKY, pumped ? 0.8 : 1.4, live, pumped ? 5 : 4);
    }
    const nozLive = reachIdx >= 8;
    [255, 285, 315, 345].forEach((x) => { b += flow(`M300,442 V448 H${x} V458`, C.YEL, 0.8, nozLive, 3); });

    // vent line + underwing vent
    b += line("M140,30 V18 H420 V30", C.MUTED, 2, { dash: "3 4" });
    b += p("vent", "Fuel vents", small(280, 13, "vent line · crossover") +
      `<path d="M30,92 l-6,10 h12 z" fill="${C.MUTED}"/>` + small(30, 116, "vent", { anchor: "middle" }) +
      `<rect class="sx-hit" x="16" y="92" width="28" height="28" fill="transparent"/>`, [150, 2, 260, 28]);

    // tanks
    const tank = (id, x, name, side) => {
      const feeding = m.feeding.includes(side);
      return p(id, name, R(x, 30, 170, 62, { fill: "#123048", stroke: feeding ? C.SKY : C.LINE, sw: feeding ? 2.5 : 1.5 }) +
        T(x + 85, 48, name.toUpperCase(), { size: 12, weight: 700 }) +
        `<rect x="${x + 12}" y="58" width="146" height="14" rx="4" fill="${DARK}" stroke="${C.LINE}"/>` +
        `<rect x="${x + 12}" y="58" width="${(146 * lvl[side]).toFixed(0)}" height="14" rx="4" fill="${C.SKY}" fill-opacity=".55"/>` +
        `<circle cx="${side === "L" ? x + 40 : x + 130}" cy="30" r="6" fill="${PANEL}" stroke="${C.MUTED}" stroke-width="1.5"/>` +
        (feeding ? T(x + 85, 85, "FEEDING", { size: 9, fill: C.SKY, weight: 700, lbl: false }) : ""), [x, 30, 170, 62]);
    };
    b += tank("tankL", 20, "Left tank", "L") + tank("tankR", 370, "Right tank", "R");

    // drains (sumps under each tank — the "drain" icons)
    const drop = (x) => `<path d="M${x},96 q-6,8 0,12 q6,-4 0,-12 z" fill="${C.SKY}" stroke="${C.INK}" stroke-width="1"/>`;
    b += p("drains", "Fuel drains", drop(120) + drop(450) + small(120, 122, "drain") + small(450, 122, "drain") +
      `<rect class="sx-hit" x="436" y="94" width="28" height="30" fill="transparent"/>`, [106, 94, 28, 30]);

    // selector dial (housing = part; handle buttons = ctl)
    const ang = s.sel === "LEFT" ? 60 : s.sel === "RIGHT" ? -60 : 0;
    b += p("selector", "Fuel selector", `<circle cx="300" cy="150" r="24" fill="${PANEL}" stroke="${C.INK}" stroke-width="2"/>` +
      `<g transform="translate(300,150) rotate(${ang})"><line x1="0" y1="0" x2="0" y2="19" stroke="${C.INK}" stroke-width="6" stroke-linecap="round"/></g>` +
      `<circle cx="300" cy="150" r="5" fill="${C.BAD}"/>` + T(300, 118, "FUEL SELECTOR", { size: 10, weight: 700 }), [276, 126, 48, 48]);
    b += [["LEFT", 16, "LEFT"], ["BOTH", 66, "BOTH"], ["RIGHT", 116, "RIGHT"]].map(([v, x, l]) => pill("sel", v, x, 126, 46, 28, l, s.sel === v)).join("");

    // chain boxes
    const cb = (id, name, sub, o = {}) => {
      const i = FCHAIN.indexOf(id), cy = FCY[id], dead = !tr && i > reachIdx;
      const stroke = o.bad ? C.BAD : o.stroke || C.LINE;
      return p(id, name, R(225, cy - 12, 150, 24, { rx: 6, fill: o.fill || PANEL, stroke, sw: o.bad ? 2.5 : 1.5 }) +
        T(300, cy + 4, name, { size: 11, weight: 700 }) + small(384, cy + 4, sub, { anchor: "start" }), [225, cy - 14, 150, 28], dead);
    };
    b += cb("reservoir", "Reservoir tank", "gravity-fed");
    b += cb("auxPump", "Electric aux pump", "priming / backup", { stroke: s.aux ? C.OK : C.LINE });
    b += cb("shutoff", "Fuel shutoff valve", "red pull knob", { fill: "#2a1a1e", bad: s.shutoff === "off" });
    b += cb("strainer", "Fuel strainer", "drain it");
    b += cb("enginePump", "Engine-driven pump", "", { bad: s.epump === "fail" });
    b += cb("servo", "Fuel / air control unit", "throttle + mixture");
    b += cb("divider", "Flow divider", "");
    // nozzles
    b += p("nozzles", "Injector nozzles", [255, 285, 315, 345].map((x) =>
      `<path d="M${x - 6},458 h12 l-3,12 h-6 z" fill="${PANEL}" stroke="${nozLive ? C.YEL : C.LINE}" stroke-width="1.5"/>` +
      (nozLive ? `<path d="M${x},472 v8 M${x - 4},472 l-3,7 M${x + 4},472 l3,7" stroke="${C.YEL}" stroke-width="1.5" stroke-linecap="round"/>` : "")).join("") +
      T(300, 496, "4 injector nozzles", { size: 10, fill: C.MUTED }), [245, 454, 110, 28], !tr && !nozLive);

    // gravity / pumped brackets
    b += `<path d="M212,128 V214" stroke="${C.SKY}" stroke-width="2"/><path d="M212,228 V440" stroke="${C.YEL}" stroke-width="2"/>`;
    b += `<text class="sx-lbl" transform="translate(204,171) rotate(-90)" text-anchor="middle" font-size="10" fill="${C.SKY}" font-family="Segoe UI, Roboto, sans-serif">gravity</text>`;
    b += `<text class="sx-lbl" transform="translate(204,334) rotate(-90)" text-anchor="middle" font-size="10" fill="${C.YEL}" font-family="Segoe UI, Roboto, sans-serif">pumped</text>`;

    // hardware: aux switch, shutoff knob, pump failure
    b += pill("aux", s.aux ? "false" : "true", 482, 226, 58, 28, s.aux ? "AUX ON" : "AUX OFF", s.aux, { onFill: C.OK, aria: "Aux fuel pump switch" });
    const kx = s.shutoff === "off" ? 524 : 498;
    b += `<g class="sx-ctl" data-ctl="shutoff" data-val="${s.shutoff === "off" ? "on" : "off"}" tabindex="0" role="button" aria-label="Fuel shutoff knob">` +
      `<line x1="486" y1="278" x2="${kx}" y2="278" stroke="${C.MUTED}" stroke-width="4" stroke-linecap="round"/>` +
      `<circle cx="${kx}" cy="278" r="11" fill="${C.BAD}" stroke="#7a1d24" stroke-width="2"/>` +
      T(512, 300, s.shutoff === "off" ? "PULLED · OFF" : "IN · ON", { size: 9, fill: s.shutoff === "off" ? C.BAD : C.MUTED, lbl: false }) +
      `<rect x="482" y="262" width="58" height="32" fill="transparent"/></g>`;
    b += pill("epump", s.epump === "fail" ? "ok" : "fail", 482, 340, 58, 28, s.epump === "fail" ? "PUMP FAIL" : "PUMP OK", s.epump === "fail", { onFill: C.BAD, aria: "Engine-driven fuel pump failure", size: 10 });

    // fuel gauges
    const bar = (x, f, l) => `<rect x="${x}" y="206" width="26" height="46" rx="4" fill="${DARK}" stroke="${C.LINE}"/>` +
      `<rect x="${x}" y="${(206 + 46 * (1 - f)).toFixed(1)}" width="26" height="${(46 * f).toFixed(1)}" rx="4" fill="${C.SKY}" fill-opacity=".6"/>` +
      T(x + 13, 266, l, { size: 10, fill: C.MUTED, lbl: false });
    b += p("gauges", "Fuel quantity gauges", R(20, 172, 146, 104) + T(93, 190, "FUEL QTY", { size: 10, weight: 700 }) +
      bar(46, lvl.L, "L") + bar(94, lvl.R, "R"), [20, 172, 146, 104]);

    b += note(20, 304, "56 gal total · 53 usable", { anchor: "start" });
    b += note(20, 320, "100LL avgas — dyed blue", { anchor: "start" });
    b += note(20, 340, "gauges are illustrative", { anchor: "start" });
    b += `<line x1="20" y1="368" x2="44" y2="368" stroke="${C.SKY}" stroke-width="4"/>` + note(50, 372, "gravity feed", { anchor: "start" });
    b += `<line x1="20" y1="388" x2="44" y2="388" stroke="${C.YEL}" stroke-width="4"/>` + note(50, 392, "under pump pressure", { anchor: "start" });
    return wrap(b, 560, 504, opts.labels);
  }

  SysDiagrams.register("fuel", {
    init: () => ({ sel: "BOTH", shutoff: "on", aux: false, epump: "ok" }),
    controls: [
      { key: "sel", label: "Fuel selector", type: "seg", opts: [["LEFT", "Left"], ["BOTH", "Both"], ["RIGHT", "Right"]] },
      { key: "shutoff", label: "Shutoff knob", type: "seg", opts: [["on", "In (on)"], ["off", "Pulled (off)"]] },
      { key: "aux", label: "Aux fuel pump", type: "toggle" },
      { key: "epump", label: "Engine-driven pump", type: "seg", opts: [["ok", "Working"], ["fail", "Failed"]] },
    ],
    parts: ["tankL", "tankR", "vent", "drains", "selector", "reservoir", "auxPump", "shutoff", "strainer", "enginePump", "servo", "divider", "nozzles", "gauges"],
    model: fuelModel,
    draw: fuelDraw,
  });

  /* ============================ ELECTRICAL ============================ */
  function elecModel(s) {
    const altOnline = !!(s.bat && s.alt && !s.altFail);
    const elecBus = !!(s.bat && (altOnline || s.mainBatt === "ok"));
    const essBus = elecBus || s.stby === "arm";
    const essSrc = elecBus ? "main" : s.stby === "arm" ? "stby" : "none";
    const avBus = elecBus && !!s.av;
    const src = altOnline ? "alt" : elecBus ? "batt" : essBus ? "stby" : "none";
    const annun = s.bat && !altOnline && elecBus ? ["LOW VOLTS"] : [];
    let msg;
    if (altOnline) msg = "Alternator carries the electrical load and charges the battery. Both buses are live; the engine strip shows charging.";
    else if (elecBus) msg = `${s.alt && !s.altFail ? "" : "Alternator is out — "}the battery alone feeds the buses: LOW VOLTS comes on and the clock is ticking. Shed load.`;
    else if (essBus) msg = "Main buses are dead. The standby battery is carrying the essential bus — the PFD and engine data stay up for a limited time. The engine keeps running.";
    else msg = "Everything electrical is dead (standby battery off too). The engine still runs — the magnetos need no electricity.";
    return { altOnline, elecBus, avBus, essBus, essSrc, src, charging: altOnline, annun, engineRuns: true, msg };
  }

  function elecDraw(s, opts = {}) {
    const m = elecModel(s), p = P(opts);
    const tr = opts.trace && opts.trace.length ? opts.trace : null;
    const T_ = (id) => tr && tr.includes(id);
    const mainCol = m.altOnline ? C.OK : C.WARN;
    // in trace mode, a wire is lit when the part it feeds is in the trace
    const L = (id, normal) => (tr ? T_(id) : normal);
    let b = "";
    const batLive = L("battery", !!(s.bat && (s.mainBatt === "ok" || m.altOnline)));
    const altLive = L("alternator", m.altOnline);
    b += flow(m.altOnline ? "M152,100 V90 H105 V76" : "M105,76 V90 H152 V100", C.WARN, 1.2, batLive);
    b += flow("M270,76 V90 H228 V100", C.OK, 1.0, altLive);
    b += flow("M190,156 V184", mainCol, 1.0, L("master", m.elecBus) || (tr && T_("elecBus")));
    b += flow("M95,226 V240", mainCol, 1.0, L("avSw", m.elecBus)) + flow("M95,288 V306", mainCol, 1.0, L("avBus", m.avBus)) + flow("M95,346 V366", mainCol, 1.0, L("loadAv", m.avBus));
    b += flow("M255,226 V240", mainCol, 1.0, L("breakers", m.elecBus)) + flow("M255,274 V292", mainCol, 1.0, L("loadMain", m.elecBus));
    b += flow("M330,205 H360 V248 H390", mainCol, 1.0, L("essBus", m.elecBus));
    const stbyLive = L("stbyBatt", s.stby === "arm" && !m.elecBus && !opts.mask);
    b += flow("M465,118 V248", C.BAD, 1.0, stbyLive);
    b += flow("M465,248 V310", m.essSrc === "stby" ? C.BAD : mainCol, 1.0, L("loadEss", m.essBus));

    // alternator / battery / mags
    const chip = (ctl, val, x, y, w, label, on, col) => pill(ctl, val, x, y, w, 20, label, on, { onFill: col, size: 9, stroke: C.LINE, aria: label });
    b += p("battery", "Main battery", R(30, 24, 150, 52, { fill: "#2e2410", stroke: C.WARN }) + T(105, 42, "Main battery", { size: 12, weight: 700 }) +
      T(48, 66, s.mainBatt === "flat" && !opts.mask ? "FLAT" : "24 V", { size: 10, fill: s.mainBatt === "flat" && !opts.mask ? C.BAD : C.MUTED, anchor: "start", weight: s.mainBatt === "flat" && !opts.mask ? 800 : 400 }), [30, 24, 150, 52], !s.bat);
    b += chip("mainBatt", s.mainBatt === "flat" ? "ok" : "flat", 116, 50, 56, s.mainBatt === "flat" && !opts.mask ? "RECHARGE" : "RUN FLAT", s.mainBatt === "flat" && !opts.mask, C.BAD);
    b += p("alternator", "Alternator", R(195, 24, 150, 52, { fill: "#10281a", stroke: C.OK }) + T(270, 42, "Alternator", { size: 12, weight: 700 }) +
      T(213, 66, s.altFail && !opts.mask ? "FAILED" : "28 V · 60 A", { size: 10, fill: s.altFail && !opts.mask ? C.BAD : C.MUTED, anchor: "start", weight: s.altFail && !opts.mask ? 800 : 400 }), [195, 24, 150, 52], !m.altOnline);
    b += chip("altFail", s.altFail ? "false" : "true", 285, 50, 52, s.altFail && !opts.mask ? "RESTORE" : "FAIL IT", !!s.altFail && !opts.mask, C.BAD);
    b += p("mags", "Magnetos", R(390, 24, 150, 52, { fill: DARK, stroke: C.MUTED, dash: "5 4" }) + T(465, 42, "Magnetos", { size: 12, weight: 700 }) +
      small(465, 58, "NOT on the bus —", { fill: C.WARN }) + small(465, 70, "engine runs without it", { fill: C.WARN }), [390, 24, 150, 52]);

    // master split rocker
    b += p("master", "Master switch", R(115, 100, 150, 56) + T(190, 114, "MASTER", { size: 10, weight: 700, fill: C.MUTED }), [115, 100, 150, 56]);
    const half = (ctl, val, x, label, on, col) => `<g class="sx-ctl" data-ctl="${ctl}" data-val="${val}" tabindex="0" role="button" aria-label="Master ${label} half">` +
      `<rect x="${x}" y="122" width="68" height="28" rx="5" fill="${on ? col : DARK}" stroke="${on ? col : C.LINE}" stroke-width="1.5"/>` +
      T(x + 34, 140, label + (on ? " ON" : " off"), { size: 11, weight: 700, fill: on ? "#0b1218" : C.MUTED, lbl: false }) + `</g>`;
    b += half("bat", s.bat ? "false" : "true", 118, "BAT", !!s.bat, C.WARN) + half("alt", s.alt ? "false" : "true", 194, "ALT", !!s.alt, C.OK);

    // buses and switches
    const bus = (id, name, sub, x, y, w, h, live, col) => p(id, name, R(x, y, w, h, { stroke: live ? col : C.LINE, sw: live ? 2 : 1.5 }) + T(x + w / 2, y + 17, name, { size: 12, weight: 700 }) + small(x + w / 2, y + 32, sub, { size: 9 }), [x, y, w, h], !live && !tr);
    b += bus("elecBus", "Electrical buses 1 & 2", "main buses — fed by master", 30, 184, 300, 42, m.elecBus, mainCol);
    b += p("avSw", "Avionics switch", R(30, 240, 130, 48) + T(95, 254, "AVIONICS", { size: 10, weight: 700, fill: C.MUTED }), [30, 240, 130, 48]);
    b += pill("av", s.av ? "false" : "true", 62, 258, 66, 28, s.av ? "ON" : "OFF", !!s.av, { onFill: C.SKY, aria: "Avionics switch" });
    b += bus("avBus", "Avionics bus", "buses 1 & 2", 30, 306, 130, 40, m.avBus, mainCol);
    b += bus("loadAv", "Avionics loads", "radios · MFD", 30, 366, 130, 40, m.avBus, mainCol);
    const brk = [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${196 + i * 22}" y="${262 - 0}" width="12" height="6" rx="2" fill="${m.elecBus ? C.INK : C.LINE}"/>`).join("");
    b += p("breakers", "Circuit breakers", R(180, 240, 150, 34) + T(255, 253, "Circuit breakers", { size: 11, weight: 700 }) + brk, [180, 240, 150, 34], !m.elecBus && !tr);
    b += bus("loadMain", "Main loads", "lights · pitot heat · flaps", 180, 292, 150, 40, m.elecBus, mainCol);

    // essential path
    b += p("stbyBatt", "Standby battery", R(390, 98, 150, 40, { fill: "#2a1418", stroke: C.BAD }) + T(465, 114, "Standby battery", { size: 12, weight: 700 }) + small(465, 130, s.stby === "arm" ? "armed — waiting" : "switched off"), [390, 98, 150, 40], s.stby !== "arm");
    b += p("stbySw", "Standby battery switch", R(390, 158, 150, 52) + T(465, 172, "STBY BATT", { size: 10, weight: 700, fill: C.MUTED }), [390, 158, 150, 52]);
    b += pill("stby", "arm", 398, 180, 64, 28, "ARM", s.stby === "arm", { onFill: C.OK }) + pill("stby", "off", 468, 180, 64, 28, "OFF", s.stby === "off", { onFill: C.MUTED });
    b += bus("essBus", "Essential bus", opts.mask ? "" : m.essSrc === "stby" ? "on standby battery" : m.essSrc === "main" ? "fed by the main buses" : "no power", 390, 226, 150, 44, m.essBus, m.essSrc === "stby" && !opts.mask ? C.BAD : mainCol);
    b += bus("loadEss", "Essential loads", "PFD · AHRS · ADC · engine data", 390, 290, 150, 40, m.essBus, m.essSrc === "stby" && !opts.mask ? C.BAD : mainCol);
    b += note(465, 356, "green = alternator", { fill: C.OK });
    b += note(465, 372, "amber = main battery", { fill: C.WARN });
    b += note(465, 388, "red = standby battery", { fill: C.BAD });

    // engine information strip
    const bv = m.altOnline ? 0.85 : m.elecBus ? 0.45 : 0, bcol = m.altOnline ? C.OK : C.WARN;
    const lv = m.annun.includes("LOW VOLTS");
    b += p("eis", "Engine information strip", R(30, 426, 510, 76) + T(60, 444, "EIS", { size: 11, weight: 800, anchor: "start" }) +
      small(60, 458, "essential bus", { anchor: "start" }) +
      small(150, 444, "M BUS VOLTS", { anchor: "start" }) +
      `<rect x="150" y="450" width="150" height="12" rx="4" fill="${DARK}" stroke="${C.LINE}"/><rect x="150" y="450" width="${(150 * bv).toFixed(0)}" height="12" rx="4" fill="${bcol}"/>` +
      small(150, 480, m.altOnline ? "alternator voltage" : m.elecBus ? "battery voltage — sagging" : "no bus power", { anchor: "start" }) +
      small(330, 444, "M BATT AMPS", { anchor: "start" }) +
      T(330, 466, m.charging ? "+ charging" : m.src === "batt" ? "− discharging" : "—", { size: 14, weight: 800, anchor: "start", fill: m.charging ? C.OK : m.src === "batt" ? C.WARN : C.MUTED, lbl: false }) +
      R(430, 452, 94, 26, { rx: 5, fill: lv ? "#3a2a08" : DARK, stroke: lv ? C.WARN : C.LINE }) +
      T(477, 469, "LOW VOLTS", { size: 11, weight: 800, fill: lv ? C.WARN : C.LINE, lbl: false }), [30, 426, 510, 76], !m.essBus && !tr);
    return wrap(b, 560, 510, opts.labels);
  }

  SysDiagrams.register("electrical", {
    init: () => ({ bat: true, alt: true, altFail: false, av: true, stby: "arm", mainBatt: "ok" }),
    controls: [
      { key: "bat", label: "MASTER — BAT", type: "toggle" },
      { key: "alt", label: "MASTER — ALT", type: "toggle" },
      { key: "av", label: "AVIONICS switch", type: "toggle" },
      { key: "stby", label: "STBY BATT", type: "seg", opts: [["arm", "Arm"], ["off", "Off"]] },
      { key: "altFail", label: "Alternator failure", type: "toggle" },
      { key: "mainBatt", label: "Main battery", type: "seg", opts: [["ok", "Charged"], ["flat", "Run flat"]] },
    ],
    parts: ["alternator", "battery", "master", "elecBus", "avSw", "avBus", "essBus", "stbyBatt", "stbySw", "breakers", "eis", "loadMain", "loadAv", "loadEss", "mags"],
    // rocker interlock: ALT on ⇒ BAT on; BAT off ⇒ ALT off
    set(s, key, val) {
      s[key] = val;
      if (key === "alt" && val) s.bat = true;
      if (key === "bat" && !val) s.alt = false;
      return s;
    },
    model: elecModel,
    draw: elecDraw,
  });

  /* ============================== IGNITION ============================== */
  function ignModel(s) {
    const sel = s.key;
    const selL = sel === "L" || sel === "BOTH" || sel === "START";
    const selR = sel === "R" || sel === "BOTH" || sel === "START";
    const liveL = selL || s.pleadL === "broken", liveR = selR || s.pleadR === "broken";
    const running = liveL || liveR;
    const hot = sel === "OFF" && running;
    let rpm;
    if (!running) rpm = "stopped";
    else if (liveL && liveR) rpm = (sel === "L" || sel === "R") ? "nodrop" : "normal";
    else rpm = (liveL ? s.foul === "L" : s.foul === "R") ? "rough" : "drop";
    const side = liveL && !liveR ? "LEFT" : "RIGHT";
    let msg;
    if (hot) msg = "KEY OFF — but the engine keeps firing: a broken P-lead leaves a magneto ungrounded and live. Treat the prop as live.";
    else if (!running) msg = "Both mags are grounded through the key: no spark, the engine stops. Key OFF is the only way to shut it down — the master has nothing to do with it.";
    else if (rpm === "nodrop") msg = `Key on ${sel} should kill the other mag, but a broken P-lead leaves it live — both mags still fire, so there is NO RPM drop. That's how the mag check catches a bad ground.`;
    else if (rpm === "rough") msg = `Running on the ${side} mag alone with fouled plugs — a bigger drop and a rough engine.`;
    else if (rpm === "drop") msg = `Running on the ${side} mag alone — one plug per cylinder, so a small RPM drop is normal.`;
    else msg = "Both mags firing, two plugs per cylinder — normal RPM. The magnetos make their own spark; no battery needed.";
    return { liveL, liveR, running, rpm, hot, msg };
  }

  function ignDraw(s, opts = {}) {
    const m = ignModel(s), p = P(opts);
    const tr = opts.trace && opts.trace.length ? opts.trace : null;
    let b = "";
    const fireL = m.running && m.liveL, fireR = m.running && m.liveR;
    const kx = 80, ky = 80;
    const ANG = { OFF: -100, R: -50, L: 0, BOTH: 50, START: 100 };

    if (m.hot && !opts.mask) b += R(170, 14, 360, 30, { fill: "#3a1218", stroke: C.BAD, sw: 2 }) + T(350, 34, "PROP IS LIVE — key OFF, a mag is still hot", { size: 13, weight: 800, fill: C.BAD, lbl: false });

    // harness (beneath plugs)
    const busY = { L: 261, R: 299 }, cxs = [185, 315];
    b += flow("M400,261 H163", L_MAG, 0.8, fireL, 3) + flow("M400,299 H207", R_MAG, 0.8, fireR, 3);
    const tapCol = (c, live) => (live ? c : C.LINE);
    cxs.forEach((cx) => {
      b += line(`M${cx - 22},261 V236 M${cx - 22},261 V324`, tapCol(L_MAG, fireL), 2.5);
      b += line(`M${cx + 22},299 V236 M${cx + 22},299 V324`, tapCol(R_MAG, fireR), 2.5);
    });
    b += `<path d="M345,299 H400" stroke="${tapCol(R_MAG, fireR)}" stroke-width="3" fill="none"/>`;
    b += p("harness", "Ignition harness", small(250, 283, "ignition harness", { size: 9 }), [350, 264, 46, 34]);

    // cylinders: top bank and bottom bank
    const cyl = (cx, y) => R(cx - 55, y, 110, 76, { rx: 8, fill: "#262e38" }) +
      [0, 1, 2, 3].map((i) => `<line x1="${cx - 45 + i * 14}" y1="${y + 14}" x2="${cx - 45 + i * 14}" y2="${y + 62}" stroke="#313a46" stroke-width="3"/>`).join("") +
      T(cx, y + 40, "Cylinder", { size: 11, fill: C.MUTED, weight: 700 });
    cxs.forEach((cx) => { b += cyl(cx, 160) + cyl(cx, 324); });
    b += `<rect x="120" y="236" width="260" height="88" rx="4" fill="none" stroke="${C.LINE}" stroke-dasharray="4 3"/>`;
    b += small(250, 251, "crankcase");
    b += `<line x1="120" y1="280" x2="92" y2="280" stroke="${C.MUTED}" stroke-width="6"/>` + small(92, 296, "crank → prop", { anchor: "middle" });
    // plugs
    const plug = (x, y, c, fired, fouled, k) => {
      const spark = fired && !fouled
        ? `<path d="M${x - 5},${y - 9} l4,6 -3,0 4,7 -6,-8 3,0 z" fill="${C.YEL}">${reduced ? "" : `<animate attributeName="opacity" values="1;0;0;1" dur="0.5s" begin="${(k * 0.13).toFixed(2)}s" repeatCount="indefinite"/>`}</path>` : "";
      return `<circle cx="${x}" cy="${y}" r="6.5" fill="${fouled ? "#3a2a1a" : c}" stroke="${fouled ? C.BAD : C.INK}" stroke-width="${fouled ? 2 : 1}"/>${spark}`;
    };
    let pl = "", k = 0;
    cxs.forEach((cx) => [236, 324].forEach((y) => {
      pl += plug(cx - 22, y, L_MAG, fireL, s.foul === "L", k++) + plug(cx + 22, y, R_MAG, fireR, s.foul === "R", k++);
    }));
    pl += `<rect class="sx-hit" x="149" y="222" width="106" height="28" fill="transparent"/><rect class="sx-hit" x="279" y="222" width="106" height="28" fill="transparent"/>` +
      `<rect class="sx-hit" x="149" y="310" width="106" height="28" fill="transparent"/><rect class="sx-hit" x="279" y="310" width="106" height="28" fill="transparent"/>` +
      "";
    b += p("plugs", "Spark plugs", pl, [149, 222, 106, 28]);
    b += T(250, 160, "two spark plugs in every cylinder: blue = left mag, amber = right mag", { size: 10, fill: C.MUTED, lbl: false });

    // magnetos
    const mag = (id, name, y, col, live, side) => p(id, name, R(400, y, 90, 30, { fill: "#1b2430", stroke: live ? col : C.LINE, sw: live ? 2.5 : 1.5 }) +
      `<g transform="translate(418,${y + 15})"><circle r="9" fill="${DARK}" stroke="${col}" stroke-width="1.5"/><path d="M0,-9 A9,9 0 0 1 0,9 z" fill="${col}"/>` +
      (live && m.running && !reduced ? `<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.9s" repeatCount="indefinite" additive="sum"/>` : "") + `</g>` +
      T(459, y + 19, name, { size: 10, weight: 700, fill: live ? col : C.MUTED }), [400, y, 90, 30], !live && !tr);
    b += mag("magL", "LEFT MAG", 246, L_MAG, m.liveL) + mag("magR", "RIGHT MAG", 284, R_MAG, m.liveR);

    // P-leads: grounded by the key unless that mag is selected; a broken lead can't ground
    const grounded = (side) => !((side === "L" ? s.pleadL : s.pleadR) === "broken") && !(side === "L" ? ["L", "BOTH", "START"] : ["R", "BOTH", "START"]).includes(s.key);
    const lead = (id, name, d, side, col, bx, by, hy) => {
      const broken = (side === "L" ? s.pleadL : s.pleadR) === "broken", gr = grounded(side);
      const lc = broken ? col : gr ? C.MUTED : col;
      const zig = broken && !opts.mask ? `<path d="M${bx - 8},${by - 8} l8,5 -8,6 8,6 -8,5" fill="none" stroke="${C.BAD}" stroke-width="2.5"/>` : "";
      return p(id, name, line(d, lc, 3, { dash: gr ? "" : "" }) + zig +
        small(side === "L" ? bx + 8 : bx - 8, side === "L" ? 180 : 228, side === "L" ? "left P-lead" : "right P-lead", { anchor: side === "L" ? "start" : "end" }), [bx - 14, hy, 28, 60]);
    };
    b += lead("pleadL", "Left P-lead", "M72,106 V120 H445 V246", "L", L_MAG, 445, 190, 160);
    b += lead("pleadR", "Right P-lead", "M88,106 V136 H520 V299 H490", "R", R_MAG, 520, 200, 170);
    // ground glyphs where the key shorts a grounded lead to ground
    const gnd = (x, y, dir) => `<path d="M${x},${y} v${dir * 8} M${x - 7},${y + dir * 8} h14 M${x - 4.5},${y + dir * 11} h9 M${x - 2},${y + dir * 14} h4" stroke="${C.BAD}" stroke-width="2" fill="none"/>`;
    if (!opts.mask && grounded("L")) b += gnd(200, 120, -1) + small(214, 106, "grounded", { anchor: "start", fill: C.BAD });
    if (!opts.mask && grounded("R")) b += gnd(200, 136, 1) + small(214, 144, "grounded", { anchor: "start", fill: C.BAD });

    // key switch
    b += p("key", "Ignition key switch", `<circle cx="${kx}" cy="${ky}" r="27" fill="${PANEL}" stroke="${C.INK}" stroke-width="2"/>` +
      `<g transform="translate(${kx},${ky}) rotate(${ANG[s.key]})"><rect x="-5" y="-24" width="10" height="26" rx="3" fill="${C.INK}"/><circle r="7" fill="${C.YEL}" stroke="#0b1218"/></g>` +
      "", [kx - 26, ky - 26, 52, 52]);
    b += ["OFF", "R", "L", "BOTH", "START"].map((v) => {
      const a = ANG[v] * Math.PI / 180, x = kx + 52 * Math.sin(a), y = ky - 52 * Math.cos(a);
      return pill("key", v, Math.round(x - 18), Math.round(y - 13), 36, 26, v, s.key === v, { onFill: v === "OFF" ? C.MUTED : v === "START" ? C.WARN : C.SKY, size: 10 });
    }).join("");

    // battery -> master -> starter (the only battery load here)
    const cranking = s.key === "START" && s.master;
    b += flow("M140,453 H250", C.WARN, 0.8, cranking, 3);
    b += p("battery", "Battery", R(30, 430, 110, 46, { fill: "#2e2410", stroke: C.WARN }) + T(85, 450, "Battery", { size: 12, weight: 700 }) + small(85, 466, "feeds the starter only"), [30, 430, 110, 46], false);
    b += pill("master", s.master ? "false" : "true", 160, 439, 70, 28, s.master ? "MASTER ON" : "MASTER OFF", !!s.master, { onFill: C.OK, size: 9 });
    b += p("starter", "Starter", R(250, 430, 110, 46, { stroke: cranking ? C.WARN : C.LINE, sw: cranking ? 2.5 : 1.5 }) + T(305, 450, "Starter", { size: 12, weight: 700 }) +
      small(305, 466, cranking ? "cranking" : "needs key START + master"), [250, 430, 110, 46], !cranking && !tr);

    // tach
    const tcx = 480, tcy = 450, ang = { normal: 40, drop: 28, rough: 34, nodrop: 40, stopped: -110 }[m.rpm];
    const jit = m.rpm === "rough" && !reduced ? `<animateTransform attributeName="transform" type="rotate" values="-5;5;-5" dur="0.18s" repeatCount="indefinite" additive="sum"/>` : "";
    b += p("tach", "Tachometer", `<circle cx="${tcx}" cy="${tcy}" r="42" fill="${DARK}" stroke="${C.INK}" stroke-width="2"/>` +
      gaugeArc(tcx, tcy, 32, -110, 110, C.LINE, 4) + gaugeArc(tcx, tcy, 32, 20, 50, C.OK, 4) +
      needle(tcx, tcy, 30, ang, m.rpm === "stopped" ? C.BAD : C.INK, jit) + T(tcx, tcy + 26, "TACH", { size: 9, fill: C.MUTED }) +
      T(tcx, 504, { normal: "normal RPM", drop: "RPM drop", rough: "drop + rough", nodrop: "NO drop", stopped: "stopped" }[m.rpm], { size: 11, weight: 700, fill: m.rpm === "stopped" ? C.BAD : m.rpm === "nodrop" || m.rpm === "rough" ? C.WARN : C.INK, lbl: false }), [tcx - 42, tcy - 42, 84, 84]);
    return wrap(b, 560, 512, opts.labels);
  }

  SysDiagrams.register("ignition", {
    init: () => ({ key: "BOTH", pleadL: "ok", pleadR: "ok", foul: "none", master: true }),
    controls: [
      { key: "key", label: "Ignition key", type: "seg", opts: [["OFF", "OFF"], ["R", "R"], ["L", "L"], ["BOTH", "BOTH"], ["START", "START"]] },
      { key: "pleadL", label: "Left P-lead", type: "seg", opts: [["ok", "Intact"], ["broken", "Broken"]] },
      { key: "pleadR", label: "Right P-lead", type: "seg", opts: [["ok", "Intact"], ["broken", "Broken"]] },
      { key: "foul", label: "Fouled plugs", type: "seg", opts: [["none", "None"], ["L", "Left-mag plugs"], ["R", "Right-mag plugs"]] },
      { key: "master", label: "MASTER", type: "toggle" },
    ],
    parts: ["key", "magL", "magR", "pleadL", "pleadR", "plugs", "harness", "tach", "starter", "battery"],
    model: ignModel,
    draw: ignDraw,
  });

  /* ================================ OIL ================================ */
  function oilModel(s) {
    const low = s.fault !== "none", hot = s.fault === "lowP-hotT";
    const pressure = low ? "low" : "normal", temp = hot ? "high" : "normal";
    const msg = !low ? "Oil circulates sump → pump → filter → cooler → engine → back to the sump. It cools, lubricates, cleans and seals."
      : !hot ? "Oil pressure is low — the pump isn't pushing enough oil round the loop, so lubrication and sealing suffer first. Treat it as the start of an engine failure."
        : "Low pressure AND rising oil temperature — less oil is flowing, so it can't carry heat away either. The engine is being damaged; expect it to quit.";
    return { pressure, temp, lube: !low, clean: !low, seal: !low, cool: !low && !hot, msg };
  }

  function oilDraw(s, opts = {}) {
    const m = oilModel(s), p = P(opts);
    const tr = opts.trace && opts.trace.length ? opts.trace : null;
    const low = m.pressure === "low", hot = m.temp === "high";
    const col = hot ? C.BAD : low ? C.WARN : OIL, spd = hot ? 2.6 : low ? 2.0 : 1.0;
    const tl = (id) => (tr ? tr.includes(id) : true);
    let b = "";
    b += flow("M190,356 H95 V344", OIL, 1.0, tl("pump"), 5);
    b += flow("M95,300 V240", col, spd, tl("filter"), 5);
    b += flow("M95,196 V134", col, spd, tl("cooler"), 5);
    b += flow("M150,112 H240", col, spd, tl("cooler") && tl("filter") || !tr, 5);
    b += flow("M350,190 V330", col, spd, !tr || tr.includes("sump"), 5) + flow("M430,190 V356 H390", col, spd, !tr || tr.includes("sump"), 5);
    b += `<text class="sx-lbl" x="358" y="258" font-size="10" fill="${C.MUTED}" font-family="Segoe UI, Roboto, sans-serif">gravity return</text>`;

    const badge = (x, y, w, label, on, bad) => `<rect x="${x}" y="${y}" width="${w}" height="20" rx="10" fill="${on ? "#1e3a24" : bad ? "#3a1218" : DARK}" stroke="${on ? C.OK : bad ? C.BAD : C.LINE}" stroke-width="1.5"/>` +
      T(x + w / 2, y + 14, label, { size: 10, weight: 700, fill: on ? C.OK : bad ? C.BAD : C.MUTED, lbl: false });

    // engine block (decorative, not a part)
    b += R(240, 60, 220, 130, { fill: "#262e38" }) + T(350, 80, "ENGINE", { size: 11, weight: 700, fill: C.MUTED });
    b += `<rect x="338" y="92" width="24" height="16" rx="2" fill="${C.LINE}"/><line x1="350" y1="108" x2="350" y2="126" stroke="${C.MUTED}" stroke-width="4"/><circle cx="350" cy="134" r="13" fill="none" stroke="${C.MUTED}" stroke-width="3"/>`;
    b += badge(252, 160, 96, "LUBRICATE", m.lube, low) + badge(356, 160, 96, "SEAL", m.seal, low);
    b += badge(158, 208, 56, "CLEAN", m.clean, low) + badge(158, 88, 56, "COOL", m.cool, low || hot);

    b += p("sump", "Oil sump", R(190, 330, 200, 52) + T(290, 352, "Oil sump", { size: 12, weight: 700 }) + small(290, 370, "wet sump · 8 qt"), [190, 330, 200, 52]);
    b += p("pump", "Oil pump", R(40, 300, 110, 44, { stroke: low ? C.WARN : C.LINE }) + T(95, 326, "Oil pump", { size: 12, weight: 700 }), [40, 300, 110, 44]);
    b += p("filter", "Oil filter", R(40, 196, 110, 44) + T(95, 214, "Oil filter", { size: 12, weight: 700 }) + small(95, 230, "catches debris"), [40, 196, 110, 44]);
    b += p("cooler", "Oil cooler", R(40, 90, 110, 44, { stroke: hot ? C.BAD : C.LINE, sw: hot ? 2.5 : 1.5, fill: hot ? "#3a1218" : PANEL }) + T(95, 108, "Oil cooler", { size: 12, weight: 700 }) + small(95, 124, hot ? "can't shed the heat" : "sheds heat"), [40, 90, 110, 44]);
    b += p("dipstick", "Dipstick", `<line x1="225" y1="236" x2="225" y2="330" stroke="${C.INK}" stroke-width="4" stroke-linecap="round"/><circle cx="225" cy="228" r="8" fill="none" stroke="${C.INK}" stroke-width="3"/>` +
      small(225, 258, "dipstick", { anchor: "end" }).replace('x="225"', 'x="216"'), [205, 218, 40, 112]);

    // gauges
    const pa = low ? -55 : 10, ta = hot ? 60 : -5;
    const mini = (cy, label, a, bad) => gaugeArc(510, cy, 20, -70, 70, C.LINE, 5) + gaugeArc(510, cy, 20, -20, 40, C.OK, 5) + needle(510, cy, 17, a, bad ? C.BAD : C.INK) + T(510, cy + 24, label, { size: 9, fill: bad ? C.BAD : C.MUTED, weight: 700 });
    b += p("gauges", "Oil pressure and temperature gauges", R(470, 196, 80, 128, { fill: DARK }) + mini(226, "PRESS", pa, low) + mini(290, "TEMP", ta, hot), [470, 196, 80, 128]);
    b += note(20, 410, "gauge needles are illustrative — no ranges shown", { anchor: "start" });
    return wrap(b, 560, 420, opts.labels);
  }

  SysDiagrams.register("oil", {
    init: () => ({ fault: "none" }),
    controls: [
      { key: "fault", label: "Oil condition", type: "seg", opts: [["none", "Normal"], ["lowP", "Low pressure"], ["lowP-hotT", "Low pressure + hot"]] },
    ],
    parts: ["sump", "dipstick", "pump", "filter", "cooler", "gauges"],
    model: oilModel,
    draw: oilDraw,
  });
})();
