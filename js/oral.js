/* ============================================================================
   oral.js  —  Controller for the CHECKRIDE ORAL mode.

   A helper who is not a pilot holds the app and plays examiner: they read each
   question aloud, tick what they hear against a checklist written to be matched
   by ear, and the app grades, picks follow-ups and debriefs. Its own full-width
   page (#checkrideApp) like Stage 1.

     HOME     readiness, setup (helper / solo, length, depth, order, follow-ups,
              areas), resume banner, per-area cards
     BRIEF    six-line helper briefing (first helper session only)
     ASK      the examiner's private screen: say this, listen for, red flags
     STUDENT  full-screen card (METAR, loading table) handed to the student
     REVEAL   grade first, then the model answer; ticks stay editable
     OFFER    a follow-up chosen by the app from the ticks: Ask it / Skip
     DEBRIEF  score, area bars, points to study, reading list, every question
     HISTORY  saved sessions + per-area table

   Data lives in oralbank.js (ORAL_AREAS, ORAL_QUESTIONS). The grading rules
   are the pure functions at the top of this file: a must-have count against
   `need`, a red flag caps a pass at "partly", a satisfactory follow-up that
   answers a miss/unsat prompt lifts its parent one step.

   Keys: 1–9,0 toggle points (Shift = red flags) · Enter/→ next · ← back ·
   S skip follow-up · D "I don't know" · G gloss · V student view · Esc.

   API on window.OralDrill: init() / activate() / deactivate() / start() /
   restart() / showHint()  (the last three are no-ops)
   ========================================================================== */

/* ============================== grading ================================== */
// hit: Set of point keys ticked; flags: Set of indexes into item.no that were ticked
function oralGrade(item, hit, flags) {
  const musts = item.pts.filter((p) => p.must);
  const need = item.need || musts.length;
  const got = musts.filter((p) => hit.has(p.k)).length;
  const bonus = item.pts.filter((p) => !p.must && hit.has(p.k)).length;
  let g = got >= need ? "sat" : got >= Math.ceil(need / 2) ? "part" : "unsat";
  if (flags.size && g === "sat") g = "part";            // a red flag caps the grade
  return { g, got, need, bonus, musts: musts.length, flagged: flags.size > 0 };
}
const ORAL_SCORE = { sat: 1, part: 0.5, unsat: 0 };
const ORAL_LABEL = { sat: "Satisfactory", part: "Partly there", unsat: "Needs work" };

// which follow-ups does this result unlock? res = { g (incl. override), hit: Set }
function oralEligible(q, res) {
  return (q.fu || []).filter((f) =>
    f.when === "always" ||
    (f.when === "sat" && res.g === "sat") ||
    (f.when === "unsat" && res.g !== "sat") ||
    (f.when.startsWith("miss:") && !res.hit.has(f.when.slice(5))));
}
const oralRank = (f) => f.when.startsWith("miss:") ? 0 : f.when === "unsat" ? 1 : f.when === "sat" ? 2 : 3;
const oralIsRecovery = (f) => f.when.startsWith("miss:") || f.when === "unsat";

// the final word on a question: override, then one step up if a recovery follow-up passed
function oralEval(q, res) {
  let g = res.ov || res.g, prompted = false;
  const fus = res.fu || {};
  const asked = (q.fu || []).filter((f) => fus[f.id] && !fus[f.id].skipped);
  const fg = (f) => fus[f.id].ov || fus[f.id].g;
  if (g !== "sat" && asked.some((f) => oralIsRecovery(f) && fg(f) === "sat")) {
    g = g === "unsat" ? "part" : "sat"; prompted = true;
  }
  const extra = asked.filter((f) => !oralIsRecovery(f));
  const score = (ORAL_SCORE[g] + extra.reduce((s, f) => s + ORAL_SCORE[fg(f)] * 0.5, 0)) / (1 + 0.5 * extra.length);
  return { g, prompted, adjusted: !!res.ov, score, asked: asked.length };
}

const OralDrill = (() => {
  const $ = (id) => document.getElementById(id);
  const K_PREFS = "c172-oral-prefs", K_CARDS = "c172-oral-cards", K_HIST = "c172-oral-history", K_SES = "c172-oral-session";
  const DEFAULTS = { scope: "full", solo: false, areas: null, length: 15, depth: 2, order: "examiner", followups: "some", briefed: false, glossOpen: true };
  let root = null;

  function load(key, dflt) {
    try { return JSON.parse(localStorage.getItem(key)) || dflt; } catch (e) { return dflt; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ }
  }
  function drop(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; }
    return a;
  };
  const calm = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mean = (xs) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

  /* ------------------------------ lookups ------------------------------- */
  const AREA = {}; ORAL_AREAS.forEach((a, k) => { AREA[a.id] = Object.assign({ idx: k }, a); });
  const byId = {};   // question id -> { q }, follow-up id -> { f, q }
  ORAL_QUESTIONS.forEach((q) => {
    byId[q.id] = { q };
    (q.fu || []).forEach((f) => {
      byId[f.id] = { f, q };
      if (!f.gloss) f.gloss = q.gloss;     // follow-ups inherit the parent's gloss / ref
      if (!f.ref) f.ref = q.ref;
    });
  });
  const qOf = (id) => byId[id] && byId[id].q;
  const S1 = new Set(typeof ORAL_STAGE1 !== "undefined" ? ORAL_STAGE1 : []);
  const scopeOk = (q, scope) => scope !== "stage1" || S1.has(q.id);
  const inScope = (q) => scopeOk(q, prefs.scope);
  const shortAsk = (q) => { const s = q.ask.replace(/\s+/g, " "); return s.length > 64 ? s.slice(0, 62).replace(/\s\S*$/, "") + "…" : s; };

  /* ------------------------------- state -------------------------------- */
  let prefs = Object.assign({}, DEFAULTS, load(K_PREFS, {}));
  if (!Array.isArray(prefs.areas)) prefs.areas = ORAL_AREAS.map((a) => a.id);
  prefs.areas = prefs.areas.filter((id) => AREA[id]);
  let cards = load(K_CARDS, {});
  let history = load(K_HIST, []);
  let ses = sanitize(load(K_SES, null));      // the live session (survives mode switches / reloads)
  let screen = "home";                        // which screen is drawn
  let viewing = null;                         // debrief entry on screen
  let armed = null;                           // inline "are you sure" state: "discard" | "clear"
  let pending = null;                         // what the briefing's button does next
  let backTo = "home";                        // where the debrief's Back goes
  let studentOpen = false;
  let speaking = false;

  const savePrefs = () => save(K_PREFS, prefs);
  const persist = () => { if (ses) save(K_SES, ses); };

  function sanitize(s) {
    if (!s || !Array.isArray(s.deck) || !s.results) return null;
    const keep = s.deck.filter((id) => qOf(id));
    const before = s.deck.slice(0, s.i || 0).filter((id) => qOf(id)).length;
    const curGone = !s.cur || !qOf(s.cur.qid);
    s.deck = keep; s.i = before;
    Object.keys(s.results).forEach((id) => { if (!qOf(id)) delete s.results[id]; });
    if (s.i >= keep.length) return null;
    if (curGone) { s.cur = { qid: keep[s.i], fuQueue: [], fuIdx: -1 }; s.draft = blank(); s.view = "ask"; }
    s.cur.fuQueue = (s.cur.fuQueue || []).filter((id) => byId[id]);
    if (s.cur.fuIdx >= s.cur.fuQueue.length) s.cur.fuIdx = s.cur.fuQueue.length - 1;
    return s;
  }

  const blank = () => ({ hit: [], flags: [], rev: false });
  const curQ = () => qOf(ses.cur.qid);
  const item = () => ses.cur.fuIdx < 0 ? curQ() : byId[ses.cur.fuQueue[ses.cur.fuIdx]].f;
  const draftGrade = (it, d) => d.idk
    ? { g: "unsat", got: 0, need: it.need || it.pts.filter((p) => p.must).length, bonus: 0, musts: it.pts.filter((p) => p.must).length, flagged: false }
    : oralGrade(it, new Set(d.hit), new Set(d.flags));
  const effOf = (it, d) => d.ov || draftGrade(it, d).g;

  /* ------------------------------ cards / misses ------------------------ */
  const inDeck = (c) => c && c.ever && c.box < 4;
  const dueCards = () => Object.keys(cards)
    .filter((id) => qOf(id) && inScope(qOf(id)) && inDeck(cards[id]) && cards[id].due <= Date.now())
    .sort((a, b) => cards[a].due - cards[b].due);
  const lastScore = (id) => { const c = cards[id]; return c && c.n > 0 && c.last.length ? c.last[c.last.length - 1] : null; };

  function readiness() {
    const xs = ORAL_QUESTIONS.filter(inScope).map((q) => lastScore(q.id)).filter((x) => x != null);
    return xs.length ? { pct: Math.round(mean(xs) * 100), asked: xs.length } : { pct: null, asked: 0 };
  }
  function areaStats(id) {
    const qs = ORAL_QUESTIONS.filter((q) => q.area === id && inScope(q));
    const xs = qs.map((q) => lastScore(q.id)).filter((x) => x != null);
    return { total: qs.length, asked: xs.length, pct: xs.length ? Math.round(mean(xs) * 100) : null,
      misses: qs.filter((q) => inDeck(cards[q.id])).length };
  }
  function setTopbar(text) {
    const r = readiness();
    $("progressText").textContent = text || `Oral readiness ${r.pct == null ? "—" : r.pct + "%"}`;
  }

  function updateCard(q, res) {
    const ev = oralEval(q, res);
    const c = cards[q.id] || { n: 0, last: [], box: 0, due: 0, miss: {}, ever: false };
    c.n++; c.at = Date.now(); c.last = c.last.concat(+ev.score.toFixed(3)).slice(-5);
    const hit = new Set(res.hit);
    q.pts.filter((p) => p.must && !hit.has(p.k)).forEach((p) => { c.miss[p.k] = (c.miss[p.k] || 0) + 1; });
    if (ev.g === "sat") c.box = Math.min(c.box + 1, 4); else { c.box = 0; c.ever = true; }
    c.due = Date.now() + [0, 1, 3, 7, 14][c.box] * 864e5;
    cards[q.id] = c;
    save(K_CARDS, cards);
  }

  /* ------------------------------ deck building ------------------------- */
  function orderDeck(pool, opts) {
    if (opts.order === "shuffled") return shuffle(pool).map((q) => q.id);
    return shuffle(pool).sort((a, b) => AREA[a.area].idx - AREA[b.area].idx).map((q) => q.id);
  }
  function buildDeck(opts) {
    const pool = ORAL_QUESTIONS.filter((q) => opts.areas.includes(q.area) && q.lvl <= opts.depth && scopeOk(q, opts.scope));
    if (opts.length === "all" || opts.length >= pool.length) return orderDeck(pool, opts);
    // within an area: never asked, then due in the misses deck, then the rest — longest since
    // asked first, weaker answers a little sooner — so repeat sittings rotate through the bank
    const key = new Map(), now = Date.now(), FORTNIGHT = 14 * 864e5;
    pool.forEach((q) => {
      const ls = lastScore(q.id), c = cards[q.id];
      const cls = ls == null ? 0 : inDeck(c) && c.due <= now ? 1 : 2;
      const recent = cls === 2 && c.at ? Math.max(0, 1 - (now - c.at) / FORTNIGHT) : 0;
      key.set(q, cls * 10 + (cls === 2 ? recent * 2 + ls : 0) + Math.random() * 0.3);
    });
    // quota per area: spread over the areas that still have unasked questions, in proportion
    // to how many each has left; only once those run out do areas give back old questions
    const groups = {}; pool.forEach((q) => (groups[q.area] = groups[q.area] || []).push(q));
    const ids = shuffle(Object.keys(groups)), quota = {}; let left = opts.length;
    const fresh = {}; ids.forEach((a) => { quota[a] = 0; fresh[a] = groups[a].filter((q) => key.get(q) < 10).length; });
    const fill = (cap, weight) => {
      const tot = ids.reduce((t, a) => t + weight(a), 0);
      if (!tot) return;
      ids.forEach((a) => { if (left > 0 && weight(a) && quota[a] < cap(a)) { quota[a]++; left--; } });  // one each first
      while (left > 0) {
        let best = null, gap = -Infinity;
        ids.forEach((a) => {
          const g = opts.length * weight(a) / tot - quota[a];
          if (weight(a) && quota[a] < cap(a) && g > gap) { gap = g; best = a; }
        });
        if (!best) break;
        quota[best]++; left--;
      }
    };
    fill((a) => fresh[a], (a) => fresh[a]);
    fill((a) => groups[a].length, (a) => groups[a].length);
    const picked = new Set();
    ids.forEach((a) => groups[a].slice().sort((x, y) => key.get(x) - key.get(y)).slice(0, quota[a]).forEach((q) => picked.add(q)));
    // keep core questions in every session: swap the weakest-priority lvl 2/3 pick for an unpicked lvl 1
    const core = () => [...picked].filter((q) => q.lvl === 1).length;
    const swaps = [...picked].filter((q) => q.lvl > 1).sort((x, y) => key.get(y) - key.get(x));
    for (const out of swaps) {
      if (core() >= 0.6 * picked.size) break;
      // only swap in a core question that's at least as fresh, so the swap never brings back repeats
      const cls = (q) => Math.floor(key.get(q) / 10);
      const inn = groups[out.area].filter((q) => q.lvl === 1 && !picked.has(q) && cls(q) <= cls(out)).sort((x, y) => key.get(x) - key.get(y))[0];
      if (inn) { picked.delete(out); picked.add(inn); }
    }
    return orderDeck([...picked], opts);
  }
  const curOpts = () => ({ scope: prefs.scope, areas: prefs.areas.slice(), length: prefs.length, depth: prefs.depth, order: prefs.order, followups: prefs.followups });
  const poolSize = () => ORAL_QUESTIONS.filter((q) => prefs.areas.includes(q.area) && q.lvl <= prefs.depth && inScope(q)).length;

  /* ------------------------------ session flow -------------------------- */
  function begin(deck, optsOver) {
    if (!deck.length) return;
    if (ses) drop(K_SES);
    ses = { id: Date.now(), solo: !!prefs.solo, opts: Object.assign(curOpts(), optsOver || {}), deck, i: 0,
      cur: null, results: {}, draft: null, view: "ask" };
    lock();
    enterQuestion();
  }
  function startSession(deck, optsOver) {
    if (!prefs.solo && !prefs.briefed) { pending = () => begin(deck, optsOver); drawBrief(); return; }
    begin(deck, optsOver);
  }
  function enterQuestion() {
    ses.cur = { qid: ses.deck[ses.i], fuQueue: [], fuIdx: -1 };
    ses.draft = blank(); ses.view = "ask";
    persist(); drawAsk();
  }
  function advanceFu() {
    const cu = ses.cur;
    cu.fuIdx++;
    if (cu.fuIdx < cu.fuQueue.length) { ses.view = "offer"; ses.draft = null; persist(); drawOffer(); }
    else finishQ(true);
  }
  function finishQ(advance) {
    const q = curQ(), res = ses.results[q.id];
    if (res && !res.done) { res.done = true; updateCard(q, res); }
    if (!advance) return;
    ses.i++;
    if (ses.i >= ses.deck.length) finish(); else enterQuestion();
  }
  function nextFromReveal() {
    const q = curQ(), cu = ses.cur, d = ses.draft, it = item();
    const rec = { hit: d.hit.slice(), flags: d.flags.slice(), g: draftGrade(it, d).g };
    if (d.ov) rec.ov = d.ov;
    if (d.idk) rec.idk = true;
    if (d.nudged) rec.nudged = true;
    if (cu.fuIdx < 0) {
      rec.fu = {};
      ses.results[q.id] = rec;
      const cap = ses.opts.followups === "none" ? 0 : ses.opts.followups === "some" ? 2 : Infinity;
      const list = oralEligible(q, { g: rec.ov || rec.g, hit: new Set(rec.hit) })
        .map((f) => ({ f, r: Math.random() })).sort((a, b) => oralRank(a.f) - oralRank(b.f) || a.r - b.r)
        .slice(0, cap).map((x) => x.f.id);
      cu.fuQueue = list; cu.fuIdx = -1;
      if (list.length) advanceFu(); else finishQ(true);
    } else {
      ses.results[q.id].fu[it.id] = rec;
      advanceFu();
    }
  }
  function skipOffer() {
    const q = curQ(), id = ses.cur.fuQueue[ses.cur.fuIdx];
    ses.results[q.id].fu[id] = { skipped: true };
    advanceFu();
  }

  /* ------------------------------ summaries ----------------------------- */
  function summarize(deck, results) {
    const rows = [], areas = {};
    let fuN = 0;
    deck.forEach((id) => {
      const q = qOf(id), r = results[id];
      if (!q || !r) return;
      const ev = oralEval(q, r);
      rows.push({ q, r, ev });
      fuN += ev.asked;
      const a = areas[q.area] || (areas[q.area] = { sum: 0, n: 0, sat: 0 });
      a.sum += ev.score; a.n++; if (ev.g === "sat") a.sat++;
    });
    Object.values(areas).forEach((a) => { a.pct = Math.round(a.sum / a.n * 100); });
    const pct = rows.length ? Math.round(mean(rows.map((x) => x.ev.score)) * 100) : 0;
    const count = (g) => rows.filter((x) => x.ev.g === g).length;
    return { rows, areas, pct, fuN, sat: count("sat"), part: count("part"), unsat: count("unsat") };
  }
  function verdictOf(s) {
    const lows = Object.values(s.areas).some((a) => a.pct < 70);
    return s.pct >= 85 && !lows ? "Looking checkride-ready" : s.pct >= 70 ? "Close — tighten the weak areas" : "More study needed";
  }
  // every missed must-have and ticked red flag (main item and asked follow-ups), grouped by area
  function missedPoints(s) {
    const out = {};
    const scan = (q, it, rec, label) => {
      const hit = new Set(rec.hit);
      const add = (html, text) => (out[q.area] = out[q.area] || []).push({ html, text, ref: it.ref || q.ref });
      it.pts.filter((p) => p.must && !hit.has(p.k)).forEach((p) =>
        add(`<b>${esc(label)}</b> — didn't say: “${esc(p.t)}”`, `${label} - didn't say: "${p.t}"`));
      (rec.flags || []).forEach((n) => { if (it.no && it.no[n]) add(`<b>${esc(label)}</b> — said something wrong: “${esc(it.no[n])}”`, `${label} - said something wrong: "${it.no[n]}"`); });
    };
    s.rows.forEach(({ q, r }) => {
      scan(q, q, r, shortAsk(q));
      (q.fu || []).forEach((f) => { const fr = (r.fu || {})[f.id]; if (fr && !fr.skipped) scan(q, f, fr, shortAsk(q) + " (follow-up)"); });
    });
    return out;
  }
  function readingList(s) {
    const n = {};
    const add = (ref) => String(ref || "").split(";").map((x) => x.trim()).filter(Boolean).forEach((x) => { n[x] = (n[x] || 0) + 1; });
    s.rows.forEach(({ q, r, ev }) => {
      if (ev.g !== "sat") add(q.ref);
      (q.fu || []).forEach((f) => { const fr = (r.fu || {})[f.id]; if (fr && !fr.skipped && (fr.ov || fr.g) !== "sat") add(f.ref); });
    });
    return Object.keys(n).sort((a, b) => n[b] - n[a]);
  }
  function summaryText(e, s) {
    const L = [];
    L.push(`Checkride oral — ${new Date(e.t).toLocaleDateString()}${e.solo ? " (self-graded)" : ""}`);
    L.push(`${s.pct}% — ${verdictOf(s)}`);
    L.push(`${s.rows.length} questions: ${s.sat} satisfactory, ${s.part} partly, ${s.unsat} need work; ${s.fuN} follow-ups`);
    L.push("", "By area:");
    Object.keys(s.areas).sort((a, b) => s.areas[a].pct - s.areas[b].pct).forEach((id) =>
      L.push(`  ${AREA[id].name}: ${s.areas[id].pct}% (${s.areas[id].sat} of ${s.areas[id].n})`));
    const mp = missedPoints(s);
    if (Object.keys(mp).length) {
      L.push("", "Points to study:");
      Object.keys(mp).forEach((id) => { L.push(`  ${AREA[id].name}`); mp[id].forEach((m) => L.push(`    - ${m.text}${m.ref ? " [" + m.ref + "]" : ""}`)); });
    }
    const rl = readingList(s);
    if (rl.length) L.push("", "Reading list: " + rl.join("; "));
    L.push("", "Practice aid. Your POH, the current FARs/AIM and your instructor govern.");
    return L.join("\n");
  }

  function finish() {
    const s = summarize(ses.deck, ses.results);
    const entry = { id: ses.id, t: Date.now(), solo: ses.solo, opts: ses.opts, pct: s.pct,
      areas: Object.fromEntries(Object.entries(s.areas).map(([k, a]) => [k, { pct: a.pct, n: a.n }])),
      deck: ses.deck.filter((id) => ses.results[id]), results: ses.results };
    if (s.rows.length) { history = [entry].concat(history).slice(0, 30); save(K_HIST, history); }
    ses = null; drop(K_SES); unlock(); stopVoice();
    if (!s.rows.length) { drawHome(); return; }
    backTo = "home";
    drawDebrief(entry);
  }
  function endSession() {
    if (ses.cur && ses.results[ses.cur.qid]) finishQ(false);
    if (!Object.keys(ses.results).length) { ses = null; drop(K_SES); unlock(); drawHome(); return; }
    finish();
  }

  /* --------------------------- wake lock / voice ------------------------ */
  let wake = null;
  async function lock() {
    try {
      if (!navigator.wakeLock || wake) return;
      wake = await navigator.wakeLock.request("screen");
      wake.addEventListener("release", () => { wake = null; });
    } catch (e) { wake = null; }
  }
  function unlock() { try { if (wake) wake.release(); } catch (e) { /* ignore */ } wake = null; }
  const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
  function stopVoice() { speaking = false; if (canSpeak) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  function speak(text) {
    if (!canSpeak) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; speechSynthesis.speak(u); } catch (e) { /* ignore */ }
  }

  /* ------------------------------ rendering ----------------------------- */
  function show(html, cls, scr, opts) {
    stopVoice();
    studentOpen = false;
    screen = scr;
    root.innerHTML = html;
    root.className = "checkride " + cls;
    if (!(opts && opts.keep)) window.scrollTo(0, 0);
  }
  const chip = (act, k, v, label, on) =>
    `<button class="cr-chip${on ? " on" : ""}" data-act="${act}" data-k="${k}" data-v="${esc(v)}" aria-pressed="${!!on}">${esc(label)}</button>`;
  const ring = (pct, label) => `<svg class="cr-ring" viewBox="0 0 96 96" role="img" aria-label="${esc(label)}">
    <circle cx="48" cy="48" r="40" fill="none" stroke="var(--line)" stroke-width="9"/>
    <circle cx="48" cy="48" r="40" fill="none" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(2 * Math.PI * 40 * (pct || 0) / 100).toFixed(1)} 999" transform="rotate(-90 48 48)"/>
    <text x="48" y="54" text-anchor="middle" font-size="${label.length > 4 ? 18 : 22}">${esc(label)}</text></svg>`;
  const FOOT = `<p class="cr-foot">Practice aid. Your POH, the current FARs/AIM and your instructor govern.</p>`;
  const gradeChip = (ev) => `<span class="cr-grade ${ev.g}">${ORAL_LABEL[ev.g]}${ev.prompted ? " — with a prompt" : ""}${ev.adjusted ? " (adjusted)" : ""}</span>`;

  /* ------------------------------- HOME --------------------------------- */
  function drawHome(opts) {
    const r = readiness(), due = dueCards().length, n = poolSize();
    const resume = ses ? `<div class="cr-resume"><span>Session in progress — question ${ses.i + 1} of ${ses.deck.length}</span>
        ${armed === "discard"
          ? `<span class="cr-muted">Discard it?</span> <button class="btn small" data-act="discard-yes">Yes, discard</button> <button class="btn small" data-act="discard-no">Keep</button>`
          : `<button class="btn primary small" data-act="resume">Resume</button> <button class="btn small" data-act="discard">Discard</button>`}
      </div>` : "";
    const cards4 = ORAL_AREAS.map((a) => {
      const st = areaStats(a.id), on = prefs.areas.includes(a.id);
      if (!st.total) return "";              // nothing from this area in the Stage 1 scope
      return `<div class="cr-area${on ? "" : " off"}" style="--cr-area:${esc(a.color)}">
        <label class="cr-row"><b style="flex:1 1 auto">${esc(a.name)}</b><span class="cr-muted">${esc(a.acs)}</span>
          <input type="checkbox" data-chg="area" data-id="${a.id}" ${on ? "checked" : ""} aria-label="Include ${esc(a.name)}"></label>
        <p>${esc(a.sub)}</p>
        <div class="cr-area-bar"><i style="width:${st.pct || 0}%"></i></div>
        <p>${st.pct == null ? "—" : st.pct + " %"} · ${st.asked}/${st.total} asked</p>
        <button class="btn small" data-act="drill-area" data-id="${a.id}">Drill this area</button>
      </div>`;
    }).join("");
    show(`<section class="cr-home">
      <div class="cr-hero">
        ${ring(r.pct, r.pct == null ? "—" : r.pct + "%")}
        <div><h2>Checkride Oral${prefs.scope === "stage1" ? " · Stage 1" : ""}</h2>
        <p>${r.pct == null ? "Nothing asked yet" : r.pct + " % ready"} · ${r.asked} of ${ORAL_QUESTIONS.filter(inScope).length} asked<br>One of you is the examiner. No flying knowledge needed.</p>
        <div class="cr-hero-actions">
          <button class="btn primary" data-act="start" ${n ? "" : "disabled"}>${n ? "Start session" : "Pick at least one area"}</button>
          <button class="btn" data-act="review" ${due ? "" : "disabled"}>Review misses (${due})</button>
          <button class="btn" data-act="history">History</button>
        </div></div>
      </div>
      ${resume}
      <div class="cr-setup">
        <div class="cr-row"><span class="cr-label">Scope</span>
          ${chip("opt", "scope", "full", "Full checkride", prefs.scope !== "stage1")}${chip("opt", "scope", "stage1", "Stage 1", prefs.scope === "stage1")}</div>
        <div class="cr-row"><span class="cr-label">Who's holding the app?</span>
          ${chip("opt", "solo", "helper", "A helper", !prefs.solo)}${chip("opt", "solo", "solo", "Just me", prefs.solo)}</div>
        <div class="cr-row"><span class="cr-label">Length</span>
          ${[8, 15, 25, "all"].map((v) => chip("opt", "length", v, v === "all" ? "All" : String(v), prefs.length === v)).join("")}</div>
        <div class="cr-row"><span class="cr-label">Depth</span>
          ${[[1, "Core"], [2, "Standard"], [3, "Everything"]].map(([v, l]) => chip("opt", "depth", v, l, prefs.depth === v)).join("")}</div>
        <div class="cr-row"><span class="cr-label">Order</span>
          ${[["examiner", "Examiner order"], ["shuffled", "Shuffled"]].map(([v, l]) => chip("opt", "order", v, l, prefs.order === v)).join("")}</div>
        <div class="cr-row"><span class="cr-label">Follow-ups</span>
          ${[["none", "None"], ["some", "Some"], ["all", "All"]].map(([v, l]) => chip("opt", "followups", v, l, prefs.followups === v)).join("")}</div>
        <div class="cr-row"><span class="cr-label">Areas</span>
          <button class="cr-chip" data-act="areas" data-v="all">All</button><button class="cr-chip" data-act="areas" data-v="none">None</button>
          <span class="cr-muted">${n} question${n === 1 ? "" : "s"} in the pool</span></div>
        <p><button class="cr-chip" data-act="brief-again">Show the helper briefing again</button></p>
      </div>
      <div class="cr-areas">${cards4}</div>
      ${FOOT}
    </section>`, "cr-home-page", "home", opts);
    setTopbar();
  }

  /* ------------------------------ BRIEF --------------------------------- */
  function drawBrief() {
    show(`<section class="cr-brief">
      <h2>You are the examiner</h2>
      <ol>
        <li>You are the examiner. Read each question aloud exactly as written.</li>
        <li>Keep the screen to yourself — it shows the answers.</li>
        <li>Tick a box when you hear that point, in their words or yours. The grey “also counts” lines are other ways of saying it.</li>
        <li>Numbers must match. If you are unsure, leave it unticked — you can fix it together afterwards.</li>
        <li>You may say “Anything else?” once. Don't give hints.</li>
        <li>Press Grade, then show them the screen.</li>
      </ol>
      <div class="cr-actions"><button class="btn primary" data-act="brief-ok">${pending ? "Got it — start" : "Got it"}</button></div>
    </section>`, "cr-brief-page", "brief");
    setTopbar();
  }

  /* ------------------------------ shared bits --------------------------- */
  function barHTML(q) {
    const a = AREA[q.area], cu = ses.cur, fu = cu.fuIdx >= 0;
    const label = fu ? `Follow-up ${cu.fuIdx + 1} of ${cu.fuQueue.length}` : `Question ${ses.i + 1} of ${ses.deck.length}`;
    const dots = ses.deck.length <= 30 ? `<span class="cr-dots" aria-hidden="true">${ses.deck.map((id, k) => {
      const r = ses.results[id];
      return `<span class="cr-dot${r ? " done " + oralEval(qOf(id), r).g : ""}${k === ses.i ? " cur" : ""}"></span>`;
    }).join("")}</span>` : "";
    return `<div class="cr-bar"><b>${esc(a.name)}</b><span>${esc(a.acs)}</span><span>${label}</span>${dots}
      <button class="btn small" data-act="end">End</button></div>`;
  }
  const areaStyle = (q) => `--cr-area:${esc(AREA[q.area].color)}`;
  const ordered = (it) => it.pts.filter((p) => p.must).concat(it.pts.filter((p) => !p.must));
  const needLine = (it) => {
    const m = it.pts.filter((p) => p.must).length;
    return it.need && it.need < m ? `Needs ${it.need} of these ${m}` : `Needs all ${m}`;
  };
  const hearLine = (p) => p.hear && p.hear.length
    ? `<span class="cr-hear">also counts: ${p.hear.map((h) => "“" + esc(h) + "”").join(" · ")}</span>` : "";
  function ptRow(p, num, on, reveal) {
    return `<label class="cr-pt ${p.must ? "must" : "bonus"}${on ? " on" : ""}">
      <kbd class="cr-key">${num <= 10 ? num % 10 : ""}</kbd>
      <input type="checkbox" data-chg="pt" data-k="${esc(p.k)}" ${on ? "checked" : ""}>
      <span>${esc(p.t)}${hearLine(p)}</span></label>`;
  }
  function flagRow(t, n, on, num, reveal) {
    return `<label class="cr-pt cr-flag${on ? " on" : ""}">
      <kbd class="cr-key">${num <= 9 ? "⇧" + num : ""}</kbd>
      <input type="checkbox" data-chg="flag" data-n="${n}" ${on ? "checked" : ""}>
      <span>${esc(t)}</span></label>`;
  }
  const sayHTML = (it) => it.say && it.say.length
    ? `<div class="cr-saylist"><p class="cr-label">HOW TO SAY IT</p><ul>${it.say.map(([t, s]) => `<li><b>${esc(t)}</b> — ${esc(s)}</li>`).join("")}</ul></div>` : "";

  /* -------------------------------- ASK --------------------------------- */
  function meterHTML(it, d) {
    const musts = it.pts.filter((p) => p.must), need = it.need || musts.length;
    const got = musts.filter((p) => d.hit.includes(p.k)).length;
    return `<span class="cr-meter${got >= need ? " ok" : ""}" id="crMeter">${got} / ${musts.length} must-haves</span>`;
  }
  function drawAsk(opts) {
    const q = curQ(), it = item(), d = ses.draft, solo = ses.solo, fu = ses.cur.fuIdx >= 0;
    const open = solo ? d.rev : true;                   // solo: the checklist is the answer key
    let n = 0;
    const pts = ordered(it);
    const must = pts.filter((p) => p.must), bonus = pts.filter((p) => !p.must);
    const row = (p) => ptRow(p, ++n, d.hit.includes(p.k), false);
    const checklist = open ? `
      <details class="cr-gloss" ${prefs.glossOpen ? "open" : ""}><summary class="cr-label">IN PLAIN ENGLISH</summary><p>${esc(it.gloss || "")}</p></details>
      ${sayHTML(it)}
      <div class="cr-listen"><p class="cr-label">LISTEN FOR</p><p class="cr-need">${needLine(it)}</p>
        <p class="cr-group must">MUST-HAVES</p>${must.map(row).join("")}
        ${bonus.length ? `<p class="cr-group bonus">BONUS (doesn't affect the grade)</p>${bonus.map(row).join("")}` : ""}
      </div>
      ${it.no && it.no.length ? `<div class="cr-flags"><p class="cr-label">${solo ? "Did you say any of these? Be honest." : "IF YOU HEAR THIS, TICK IT — IT'S WRONG"}</p>
        ${it.no.map((t, k) => flagRow(t, k, d.flags.includes(k), k + 1, false)).join("")}</div>` : ""}
      ${solo ? "" : `<div class="cr-nudge"><span>You may say once: “Anything else?”</span>
        <button class="btn small" data-act="nudge" ${d.nudged ? "disabled" : ""}>${d.nudged ? "✔ said" : "I said it"}</button></div>`}` : "";
    const showCard = it.show ? `<div class="cr-showcard"><p class="cr-label">${solo ? "READ THIS" : "SHOW THE STUDENT"}</p>
        <pre class="cr-show">${esc(it.show)}</pre>
        ${solo ? "" : `<button class="btn" data-act="student">Show student</button>`}</div>` : "";
    show(`<section class="cr-ask" style="${areaStyle(q)}">
      ${barHTML(q)}
      ${solo ? `<p class="cr-private">Answer out loud, then check yourself.</p>` : `<p class="cr-private">🔒 Keep this screen to yourself</p>`}
      ${fu ? `<p class="cr-muted">Follow-up to: ${esc(q.ask)}</p>` : ""}
      <div class="cr-say"><p class="cr-label">${solo ? "THE QUESTION" : "SAY THIS"}</p>
        <p>“${esc(it.ask)}”</p>
        ${canSpeak ? `<button class="btn small" data-act="speak" aria-label="Read the question aloud">🔊</button>` : ""}</div>
      ${showCard}
      ${checklist}
      <div class="cr-actions">
        ${open ? meterHTML(it, d) : ""}
        <button class="btn" data-act="idk">They said “I don't know”</button>
        ${open ? `<button class="btn primary" data-act="grade">Grade ▶</button>`
          : `<button class="btn primary" data-act="rev">I've answered — show the checklist</button>`}
      </div>
    </section>`, "cr-ask-page", "ask", opts);
    setTopbar(`Oral · question ${ses.i + 1} of ${ses.deck.length}`);
  }

  /* ------------------------------ STUDENT VIEW -------------------------- */
  function openStudent() {
    const it = item(), q = curQ();
    if (!it.show || studentOpen) return;
    studentOpen = true;
    const div = document.createElement("div");
    div.className = "cr-student";
    div.setAttribute("role", "dialog"); div.setAttribute("aria-label", "Student view");
    div.setAttribute("style", areaStyle(q));
    div.innerHTML = `<pre class="cr-show">${esc(it.show)}</pre><p class="cr-tap">Tap anywhere to hand back</p>`;
    div.addEventListener("click", closeStudent);
    root.appendChild(div);
  }
  function closeStudent() {
    studentOpen = false;
    const s = root.querySelector(".cr-student");
    if (s) s.remove();
  }

  /* ------------------------------ REVEAL -------------------------------- */
  function verdictHTML(it, d) {
    const gr = draftGrade(it, d), g = d.ov || gr.g;
    const icon = g === "sat" ? "✔" : g === "part" ? "◐" : "✘";
    const detail = d.idk ? "They said they didn't know"
      : `${gr.got} of ${gr.musts} must-haves${gr.need < gr.musts ? ` · needs ${gr.need}` : ""}`;
    return `<div class="cr-verdict ${g}" id="crVerdict" role="status" tabindex="-1">
      ${icon} ${ORAL_LABEL[g]}${g === "sat" && gr.bonus && !d.idk ? ` <span class="cr-chip-depth">＋ depth</span>` : ""}
      <small>${detail}${gr.flagged ? " · A red flag was ticked" : ""}${d.ov ? " · adjusted" : ""}</small></div>`;
  }
  function overrideHTML(d) {
    return `<div class="cr-override" id="crOverride"><span class="cr-label">Not what you'd call it?</span>
      ${["sat", "part", "unsat"].map((g) => `<button class="cr-chip ${g}${d.ov === g ? " on" : ""}" data-act="ov" data-v="${g}" aria-pressed="${d.ov === g}">${ORAL_LABEL[g]}</button>`).join("")}</div>`;
  }
  function drawReveal(opts) {
    const q = curQ(), it = item(), d = ses.draft;
    let n = 0;
    const pts = ordered(it);
    show(`<section class="cr-reveal" style="${areaStyle(q)}">
      ${barHTML(q)}
      ${verdictHTML(it, d)}
      <p class="cr-q cr-muted">${esc(it.ask)}</p>
      <div class="cr-points"><p class="cr-label">WHAT WAS HEARD</p>
        ${pts.map((p) => ptRow(p, ++n, d.hit.includes(p.k), true)).join("")}
        ${it.no && it.no.length ? it.no.map((t, k) => flagRow(t, k, d.flags.includes(k), k + 1, true)).join("") : ""}</div>
      ${overrideHTML(d)}
      <div class="cr-model"><p class="cr-label">MODEL ANSWER</p><p>${esc(it.answer)}</p></div>
      <div class="cr-ref"><p class="cr-label">STUDY</p><p>${esc(it.ref || q.ref || "")}</p></div>
      <div class="cr-actions">
        <button class="btn" data-act="back">◀ Back to the question</button>
        <button class="btn primary" data-act="next">Next ▶</button>
      </div>
    </section>`, "cr-reveal-page", "reveal", opts);
    const v = $("crVerdict"); if (v && !(opts && opts.keep)) v.focus({ preventScroll: true });
  }
  // a tick changed: repaint just the live parts so focus and scroll stay put
  function repaint() {
    if (!ses || !ses.draft) return;
    const it = item(), d = ses.draft;
    root.querySelectorAll("[data-chg=pt]").forEach((inp) => {
      const on = d.hit.includes(inp.dataset.k), row = inp.closest(".cr-pt");
      inp.checked = on; row.classList.toggle("on", on);
      if (screen === "reveal") {
      }
    });
    root.querySelectorAll("[data-chg=flag]").forEach((inp) => {
      const on = d.flags.includes(+inp.dataset.n); inp.checked = on; inp.closest(".cr-pt").classList.toggle("on", on);
    });
    if (screen === "ask") { const m = $("crMeter"); if (m) m.outerHTML = meterHTML(it, d); }
    else if (screen === "reveal") { $("crVerdict").outerHTML = verdictHTML(it, d); $("crOverride").outerHTML = overrideHTML(d); }
  }

  /* ------------------------------- OFFER -------------------------------- */
  function drawOffer() {
    const q = curQ(), cu = ses.cur, f = byId[cu.fuQueue[cu.fuIdx]].f, res = ses.results[q.id];
    let why;
    if (f.when.startsWith("miss:")) { const p = q.pts.find((x) => x.k === f.when.slice(5)); why = `They missed: “${p ? p.t : ""}”`; }
    else why = f.when === "unsat" ? "Second chance, from another angle" : f.when === "sat" ? "They nailed it — dig deeper" : "Examiners usually ask this next";
    const more = cu.fuQueue.length - cu.fuIdx - 1;
    show(`<section class="cr-offer" style="${areaStyle(q)}">
      ${barHTML(q)}
      <h3>Suggested follow-up</h3>
      <p class="cr-why">${esc(why)}</p>
      <div class="cr-say"><p>“${esc(f.ask)}”</p></div>
      ${more ? `<p class="cr-muted">${more} more after this</p>` : ""}
      <div class="cr-actions"><button class="btn primary" data-act="ask-fu">Ask it</button><button class="btn" data-act="skip-fu">Skip</button></div>
    </section>`, "cr-offer-page", "offer");
    void res;
  }
  function drawConfirm() {
    const q = curQ();
    show(`<section class="cr-offer" style="${areaStyle(q)}">
      <h3>End the session?</h3>
      <p>You'll get a debrief of the questions so far.</p>
      <div class="cr-actions"><button class="btn primary" data-act="end-yes">End session</button><button class="btn" data-act="end-no">Keep going</button></div>
    </section>`, "cr-offer-page", "confirm");
  }

  /* ------------------------------ DEBRIEF ------------------------------- */
  function drawDebrief(e) {
    viewing = e;
    const s = summarize(e.deck, e.results), mp = missedPoints(s), rl = readingList(s);
    const aIds = Object.keys(s.areas).sort((a, b) => s.areas[a].pct - s.areas[b].pct);
    const canCopy = !!(navigator.clipboard && navigator.clipboard.writeText);
    const nonSat = s.rows.filter((x) => x.ev.g !== "sat").length;
    const itemRows = (q, it, rec, label) => `<ul>${ordered(it).map((p) =>
      `<li class="${new Set(rec.hit).has(p.k) ? "ok" : p.must ? "miss" : ""}">${new Set(rec.hit).has(p.k) ? "✔" : p.must ? "✘" : "·"} ${esc(p.t)}</li>`).join("")}
      ${(rec.flags || []).map((n) => `<li class="miss">✘ said: ${esc(it.no[n])}</li>`).join("")}</ul>
      <div class="cr-model"><p class="cr-label">MODEL ANSWER</p><p>${esc(it.answer)}</p></div>
      <p class="cr-ref">${esc(it.ref || q.ref || "")}</p>`;
    const rows = s.rows.map(({ q, r, ev }) => `<details style="${areaStyle(q)}">
      <summary class="cr-rowhead">${gradeChip(ev)} <span>${esc(q.ask)}</span></summary>
      ${itemRows(q, q, r, "")}
      ${(q.fu || []).filter((f) => r.fu && r.fu[f.id] && !r.fu[f.id].skipped).map((f) => {
        const fr = r.fu[f.id], fg = fr.ov || fr.g;
        return `<div class="cr-item"><p><span class="cr-grade ${fg}">${ORAL_LABEL[fg]}</span> Follow-up: ${esc(f.ask)}</p>${itemRows(q, f, fr, "")}</div>`;
      }).join("")}
      <button class="btn small" data-act="again" data-id="${q.id}">Ask this one again</button>
    </details>`).join("");
    show(`<section class="cr-debrief">
      <div class="cr-score">${ring(s.pct, s.pct + "%")}
        <div><h2>${verdictOf(s)}</h2>
        <p class="cr-muted">${s.rows.length} question${s.rows.length === 1 ? "" : "s"} · ${s.sat} satisfactory · ${s.part} partly · ${s.unsat} need work · ${s.fuN} follow-up${s.fuN === 1 ? "" : "s"}${e.solo ? " · self-graded" : ""}</p></div></div>
      <div class="cr-areabars">${aIds.map((id) => {
        const a = s.areas[id];
        return `<div style="--cr-area:${esc(AREA[id].color)}"><b${a.pct < 70 ? ' class="low"' : ""}>${a.pct < 70 ? "⚠ " : ""}${esc(AREA[id].name)} (${a.sat} of ${a.n})</b><b>${a.pct} %</b><span><i style="width:${a.pct}%"></i></span></div>`;
      }).join("")}</div>
      <div class="cr-missed"><p class="cr-label">POINTS TO STUDY</p>
        ${Object.keys(mp).length ? Object.keys(mp).map((id) => `<h4 style="--cr-area:${esc(AREA[id].color)}">${esc(AREA[id].name)}</h4><ul>${mp[id].map((m) =>
          `<li>${m.html}${m.ref ? `<small>${esc(m.ref)}</small>` : ""}</li>`).join("")}</ul>`).join("") : `<p class="cr-muted">Nothing missed.</p>`}</div>
      ${rl.length ? `<div class="cr-refs"><p class="cr-label">READING LIST</p><ul>${rl.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      <div class="cr-rows"><p class="cr-label">EVERY QUESTION</p>${rows}</div>
      <div class="cr-actions">
        ${nonSat ? `<button class="btn primary" data-act="review-these">Review these misses now</button>` : ""}
        <button class="btn" data-act="start">New session</button>
        ${canCopy ? `<button class="btn" data-act="copy">Copy summary</button>` : ""}
        <button class="btn" data-act="${backTo === "history" ? "history" : "home"}">${backTo === "history" ? "Back to history" : "Home"}</button>
      </div>
      ${FOOT}
    </section>`, "cr-debrief-page", "debrief");
    setTopbar(`Oral debrief ${s.pct}%`);
  }

  /* ------------------------------ HISTORY ------------------------------- */
  function drawHistory() {
    const table = ORAL_AREAS.map((a) => { const st = areaStats(a.id);
      return `<tr style="--cr-area:${esc(a.color)}"><td>${esc(a.name)}</td><td>${st.asked}/${st.total}</td><td>${st.pct == null ? "—" : st.pct + " %"}</td><td>${st.misses}</td></tr>`; }).join("");
    const list = history.map((e) => {
      const ids = Object.keys(e.areas || {}).filter((id) => AREA[id]).sort((a, b) => e.areas[a].pct - e.areas[b].pct);
      return `<button class="cr-rowhead" data-act="hist-open" data-id="${e.id}">
        <span>${new Date(e.t).toLocaleString()}</span><span>${e.solo ? "self-graded" : "helper"}</span>
        <span>${(e.deck || []).length} questions</span><b>${e.pct} %</b>
        <span class="cr-muted">${ids.length ? "weakest: " + esc(AREA[ids[0]].name) : ""}</span></button>`;
    }).join("");
    show(`<section class="cr-history">
      <h2>History</h2>
      <table class="cr-points"><thead><tr><th>Area</th><th>Asked</th><th>Latest</th><th>In misses deck</th></tr></thead><tbody>${table}</tbody></table>
      <div class="cr-rows">${list || `<p class="cr-muted">No finished sessions yet.</p>`}</div>
      <div class="cr-actions"><button class="btn primary" data-act="home">Home</button>
        ${history.length ? (armed === "clear"
          ? `<span class="cr-muted">Clear all saved sessions?</span> <button class="btn" data-act="clear-yes">Yes, clear</button> <button class="btn" data-act="clear-no">Keep</button>`
          : `<button class="btn" data-act="clear">Clear history</button>`) : ""}</div>
      ${FOOT}
    </section>`, "cr-history-page", "history");
    setTopbar();
  }

  /* ------------------------------ events -------------------------------- */
  function onClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled || !root.contains(b)) return;
    act(b.dataset.act, b);
  }
  function act(a, b) {
    const d = ses && ses.draft;
    switch (a) {
      case "opt": {
        const k = b.dataset.k, v = b.dataset.v;
        if (k === "solo") prefs.solo = v === "solo";
        else prefs[k] = isNaN(+v) ? v : +v;
        savePrefs(); drawHome({ keep: true }); break;
      }
      case "areas": prefs.areas = b.dataset.v === "all" ? ORAL_AREAS.map((x) => x.id) : []; savePrefs(); drawHome({ keep: true }); break;
      case "start": if (poolSize() || screen === "debrief") startSession(buildDeck(curOpts())); break;
      case "review": { const ids = dueCards().slice(0, 20); startSession(ids, { length: ids.length }); break; }
      case "drill-area": startSession(buildDeck(Object.assign(curOpts(), { areas: [b.dataset.id], length: "all" })), { areas: [b.dataset.id], length: "all" }); break;
      case "again": startSession([b.dataset.id], { length: 1 }); break;
      case "review-these": {
        const s = summarize(viewing.deck, viewing.results);
        startSession(s.rows.filter((x) => x.ev.g !== "sat").map((x) => x.q.id)); break;
      }
      case "history": armed = null; drawHistory(); break;
      case "hist-open": { const e2 = history.find((x) => String(x.id) === b.dataset.id); if (e2) { backTo = "history"; drawDebrief(e2); } break; }
      case "home": armed = null; drawHome(); break;
      case "brief-again": pending = null; drawBrief(); break;
      case "brief-ok": {
        prefs.briefed = true; savePrefs();
        const p = pending; pending = null;
        if (p) p(); else drawHome();
        break;
      }
      case "resume": resume(); break;
      case "discard": armed = "discard"; drawHome({ keep: true }); break;
      case "discard-no": armed = null; drawHome({ keep: true }); break;
      case "discard-yes": armed = null; ses = null; drop(K_SES); unlock(); drawHome({ keep: true }); break;
      case "clear": armed = "clear"; drawHistory(); break;
      case "clear-no": armed = null; drawHistory(); break;
      case "clear-yes": armed = null; history = []; save(K_HIST, history); drawHistory(); break;
      case "student": openStudent(); break;
      case "speak": speak(item().ask); break;
      case "rev": d.rev = true; persist(); drawAsk({ keep: true }); break;
      case "nudge": d.nudged = true; persist(); b.disabled = true; b.textContent = "✔ said"; break;
      case "idk": d.idk = true; d.hit = []; d.flags = []; delete d.ov; ses.view = "reveal"; persist(); drawReveal(); break;
      case "grade": ses.view = "reveal"; persist(); drawReveal(); break;
      case "back": ses.view = "ask"; persist(); drawAsk(); break;
      case "ov": d.ov = b.dataset.v; persist(); repaint(); break;
      case "next": nextFromReveal(); break;
      case "ask-fu": ses.view = "ask"; ses.draft = blank(); persist(); drawAsk(); break;
      case "skip-fu": skipOffer(); break;
      case "end": ses.view = ses.view || "ask"; drawConfirm(); break;
      case "end-no": drawView(); break;
      case "end-yes": endSession(); break;
      case "copy": {
        const s = summarize(viewing.deck, viewing.results);
        try { navigator.clipboard.writeText(summaryText(viewing, s)).then(() => { b.textContent = "Copied ✔"; }, () => { b.textContent = "Copy failed"; }); }
        catch (err) { b.textContent = "Copy failed"; }
        break;
      }
    }
  }
  function onChange(e) {
    const t = e.target, kind = t.dataset && t.dataset.chg;
    if (!kind) return;
    if (kind === "area") {
      const id = t.dataset.id, has = prefs.areas.includes(id);
      prefs.areas = t.checked ? (has ? prefs.areas : prefs.areas.concat(id)) : prefs.areas.filter((x) => x !== id);
      savePrefs(); drawHome({ keep: true }); return;
    }
    if (!ses || !ses.draft) return;
    const d = ses.draft;
    const flip = (arr, v, on) => { const i = arr.indexOf(v); if (on && i < 0) arr.push(v); if (!on && i >= 0) arr.splice(i, 1); };
    if (kind === "pt") flip(d.hit, t.dataset.k, t.checked); else flip(d.flags, +t.dataset.n, t.checked);
    delete d.ov; delete d.idk;           // changing a tick clears the override
    persist(); repaint();
  }
  function resume() {
    if (!ses) return;
    lock();
    const v = ses.view;
    if (v === "reveal" && ses.draft) drawReveal();
    else if (v === "offer" && ses.cur.fuIdx >= 0) drawOffer();
    else { if (!ses.draft) ses.draft = blank(); drawAsk(); }
  }
  function drawView() {
    if (ses.view === "reveal") drawReveal({ keep: true });
    else if (ses.view === "offer") drawOffer();
    else drawAsk({ keep: true });
  }

  function onKey(e) {
    if (!root || root.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (/^(TEXTAREA|SELECT)$/.test(t.tagName) || t.tagName === "INPUT" && !/^(checkbox|radio)$/.test(t.type)) return;
    const k = e.key, inSes = ses && /^(ask|reveal|offer)$/.test(screen);
    const click = (sel) => { const b = root.querySelector(sel); if (b) { e.preventDefault(); b.click(); return true; } return false; };
    if (k === "Escape") {
      if (studentOpen) { e.preventDefault(); closeStudent(); }
      else if (inSes) { e.preventDefault(); drawConfirm(); }
      else if (screen === "confirm") { e.preventDefault(); drawView(); }
      else if (screen !== "home") { e.preventDefault(); drawHome(); }
      return;
    }
    if (studentOpen) return;
    const dg = /^Digit(\d)$/.exec(e.code || "");
    if (dg && (screen === "ask" || screen === "reveal")) {
      const n = +dg[1] === 0 ? 10 : +dg[1];
      const list = root.querySelectorAll(e.shiftKey ? "[data-chg=flag]" : "[data-chg=pt]");
      const inp = list[n - 1];
      if (inp) { e.preventDefault(); inp.checked = !inp.checked; inp.dispatchEvent(new Event("change", { bubbles: true })); }
      return;
    }
    const nativeBtn = /^(BUTTON|A|SUMMARY)$/.test(t.tagName);
    if (k === "Enter" || k === "ArrowRight") {
      if (k === "Enter" && nativeBtn) return;           // let the focused button do its own thing
      if (screen === "ask") click("[data-act=grade], [data-act=rev]");
      else if (screen === "reveal") click("[data-act=next]");
      else if (screen === "offer") click("[data-act=ask-fu]");
      else if (screen !== "history") click(".cr-actions .btn.primary:not([disabled])");
    } else if (k === "ArrowLeft" || k === "Backspace") {
      if (screen === "reveal") click("[data-act=back]");
    } else if (/^[sS]$/.test(k)) {
      if (screen === "offer") click("[data-act=skip-fu]");
      else if (screen === "ask" && ses.cur.fuIdx >= 0) { e.preventDefault(); skipOffer(); }
    } else if (/^[dD]$/.test(k)) { if (screen === "ask") click("[data-act=idk]"); }
    else if (/^[gG]$/.test(k)) { const g = root.querySelector(".cr-gloss"); if (g && screen === "ask") { e.preventDefault(); g.open = !g.open; } }
    else if (/^[vV]$/.test(k)) { if (screen === "ask") { e.preventDefault(); openStudent(); } }
  }

  /* ----------------------------- activation ----------------------------- */
  function activate() {
    root.hidden = false;
    ["startBtn", "restartBtn", "scenarioBtn"].forEach((x) => { $(x).hidden = true; });
    UI.closePopover();
    armed = null; studentOpen = false;
    drawHome();
  }
  function deactivate() {
    persist(); stopVoice(); unlock();
    root.innerHTML = "";
    root.hidden = true;
    $("progressText").textContent = "";
  }
  function init() {
    root = $("checkrideApp");
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    // remember whether the plain-English note is open (toggle doesn't bubble)
    root.addEventListener("toggle", (e) => { if (e.target.classList && e.target.classList.contains("cr-gloss")) { prefs.glossOpen = e.target.open; savePrefs(); } }, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && ses && !root.hidden) lock(); });
  }

  const noop = () => {};
  return { init, activate, deactivate, start: noop, restart: noop, showHint: noop,
    // pure helpers exposed for the browser pass
    _grade: oralGrade, _eligible: oralEligible, _eval: oralEval };
})();

window.OralDrill = OralDrill;
