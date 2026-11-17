/* ============================================================================
   sysdiag-core.js  —  registry + drawing kit for the interactive systems labs.

   Each system registers a small simulator: init() → state, a pure
   model(state) that says what is powered / flowing / misreading, and a pure
   draw(state, opts) → SVG string. study.js mounts one controller over any of
   them, so diagram files never touch the DOM and never run timers.

   def = { init, controls:[{key,label,type,opts?,min?,max?,step?,unit?}],
           parts:[id…], set?(state,key,val), model(state), draw(state,opts) }
   opts = { sel?, marks?:{[part]:"ok"|"bad"|"hint"|"done"}, labels?, trace?:[part…] }
   ========================================================================== */

const SysDiagrams = (() => {
  const C = {
    INK: "#e8edf2", MUTED: "#9aa7b4", LINE: "#313a46", SKY: "#34ace0",
    OK: "#2ed573", BAD: "#ff4757", WARN: "#ffa502", YEL: "#f6c90e",
  };
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const svg = (w, h, body, cls = "") =>
    `<svg class="fig sx ${cls}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img">${body}</svg>`;
  const text = (x, y, s, o = {}) =>
    `<text class="${o.lbl === false ? "" : "sx-lbl"}" x="${x}" y="${y}" fill="${o.fill || C.INK}" font-size="${o.size || 12}" ` +
    `text-anchor="${o.anchor || "middle"}" font-weight="${o.weight || 400}" ` +
    `font-family="Segoe UI, Roboto, sans-serif">${s}</text>`;
  const arrowDefs = (id, color) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;
  let n = 0;
  const uid = (p = "sx") => `${p}${++n}`;

  // A clickable component. `hit` = [x, y, w, h] of the transparent hit box
  // (≥28 units so it's tappable); `mark` comes from opts.marks / opts.sel.
  function part(id, label, inner, o = {}) {
    const [x, y, w, h] = o.hit || [0, 0, 0, 0];
    const cls = ["sx-part", o.mark || "", o.dead ? "sx-dead" : "", o.sel ? "sel" : ""].filter(Boolean).join(" ");
    return `<g class="${cls}" data-part="${id}" tabindex="0" role="button" aria-label="${esc(label)}">` +
      inner +
      (o.hit ? `<rect class="sx-hit" x="${x}" y="${y}" width="${Math.max(w, 28)}" height="${Math.max(h, 28)}" fill="transparent"/>` : "") +
      `</g>`;
  }
  // Helper for draw(): the mark/sel props for a part from opts.
  const mk = (opts, id) => ({ mark: (opts && opts.marks && opts.marks[id]) || "", sel: !!(opts && opts.sel === id) });

  // A live line: dashes march along the path while `live`; dim and still when not.
  function flow(d, color, speedSec = 1.2, live = true, width = 4) {
    if (!live) return `<path class="sx-flow sx-dead" d="${d}" fill="none" stroke="${C.LINE}" stroke-width="${width}" stroke-linecap="round"/>`;
    const base = `<path d="${d}" fill="none" stroke="${color}" stroke-opacity=".35" stroke-width="${width}" stroke-linecap="round"/>`;
    const anim = reduced ? "" : `<animate attributeName="stroke-dashoffset" from="20" to="0" dur="${speedSec}s" repeatCount="indefinite"/>`;
    return base + `<path class="sx-flow" d="${d}" fill="none" stroke="${color}" stroke-width="${width - 1}" stroke-linecap="round" stroke-dasharray="6 14">${anim}</path>`;
  }

  const defs = {};
  const register = (id, def) => { defs[id] = def; };
  const get = (id) => defs[id];
  const has = (id) => !!defs[id];

  // Default reducer, used when a def has no set().
  const setState = (def, state, key, val) => def.set ? def.set({ ...state }, key, val) : { ...state, [key]: val };

  // `when` / `goal` matching: every key must equal; arrays compare as sets.
  function match(def, state, pat) {
    if (!pat) return true;
    const all = { ...state, ...def.model(state) };
    return Object.keys(pat).every((k) => {
      const a = all[k], b = pat[k];
      if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
      return a === b;
    });
  }

  return {
    register, get, has, ids: () => Object.keys(defs), setState, match,
    kit: { C, svg, text, arrowDefs, uid, part, mk, flow, reduced, esc },
  };
})();
